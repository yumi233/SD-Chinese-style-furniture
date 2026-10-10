const path = require("path");

function createCorsMiddleware(options = {}) {
  const allowedOrigins = new Set(options.allowedOrigins || []);
  const methods = "GET,POST,PATCH,DELETE,OPTIONS";

  return (req, res, next) => {
    const origin = String(req.headers.origin || "").trim();
    if (origin && allowedOrigins.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", methods);
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      if (origin && !allowedOrigins.has(origin)) {
        return sendError(res, 403, "跨源请求来源未获允许");
      }
      return res.sendStatus(204);
    }
    return next();
  };
}

function createOriginGuard(options = {}) {
  const allowedOrigins = new Set(options.allowedOrigins || []);
  return (req, res, next) => {
    const origin = String(req.headers.origin || "").trim();
    // Native clients, curl, and same-process tools often omit Origin. They
    // remain valid; a supplied cross-origin browser Origin must be allowlisted.
    if (origin && !allowedOrigins.has(origin)) {
      return sendError(res, 403, "跨源请求来源未获允许");
    }
    return next();
  };
}

function createSessionMiddleware(userStore) {
  return (req, _res, next) => {
    const cookies = parseCookies(req.headers.cookie || "");
    req.authToken = cookies.musheng_session || "";
    try {
      req.user = userStore?.getUserByToken(req.authToken) || null;
    } catch (error) {
      req.user = null;
      req.authError = error;
    }
    next();
  };
}

function requireAuth(req, res, next) {
  if (req.authError) return next(req.authError);
  if (!req.user) {
    return sendError(res, 401, "请先登录");
  }
  return next();
}

function requireAdmin(req, res, next) {
  if (req.authError) return next(req.authError);
  if (!req.user) {
    return sendError(res, 401, "请先登录");
  }
  if (!req.user.isAdmin) {
    return sendError(res, 403, "需要管理员权限");
  }
  return next();
}

function createLoginRateLimiter(options = {}) {
  const windowMs = Number(options.windowMs) || 60_000;
  const maxAttempts = Number(options.maxAttempts) || 10;
  const maxEntries = Math.max(100, Number(options.maxEntries) || 5000);
  const attempts = new Map();

  function keyFor(req, email) {
    if (typeof options.keyFactory === "function") {
      return options.keyFactory(req, email);
    }
    const address = String(req.ip || req.socket?.remoteAddress || "unknown");
    return `${address}:${String(email || "").trim().toLowerCase()}`;
  }

  function prune(now) {
    for (const [key, current] of attempts) {
      if (now - current.startedAt >= windowMs) {
        attempts.delete(key);
      }
    }
    while (attempts.size > maxEntries) {
      const oldest = attempts.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      attempts.delete(oldest);
    }
  }

  function check(req, email) {
    const key = keyFor(req, email);
    const now = Date.now();
    prune(now);
    const current = attempts.get(key);
    if (!current || now - current.startedAt >= windowMs) {
      attempts.set(key, { startedAt: now, count: 0 });
      return { allowed: true, key };
    }
    if (current.count >= maxAttempts) {
      return {
        allowed: false,
        key,
        retryAfter: Math.max(1, Math.ceil((windowMs - (now - current.startedAt)) / 1000)),
      };
    }
    return { allowed: true, key };
  }

  function recordFailure(key) {
    recordAttempt(key);
  }

  function recordAttempt(key) {
    const now = Date.now();
    prune(now);
    const current = attempts.get(key);
    if (!current || now - current.startedAt >= windowMs) {
      attempts.set(key, { startedAt: now, count: 1 });
      return;
    }
    current.count += 1;
  }

  function clear(key) {
    attempts.delete(key);
  }

  return { check, recordAttempt, recordFailure, clear };
}

function setSessionCookie(res, token, options = {}) {
  const maxAge = Number(options.maxAgeSeconds) || 1_209_600;
  const secure = options.secure ? "; Secure" : "";
  const sameSite = options.sameSite || "Lax";
  res.setHeader(
    "Set-Cookie",
    `musheng_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${maxAge}${secure}`,
  );
}

function clearSessionCookie(res, options = {}) {
  const secure = options.secure ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `musheng_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`,
  );
}

function parseCookies(header) {
  return String(header || "")
    .split(";")
    .reduce((cookies, item) => {
      const divider = item.indexOf("=");
      if (divider < 1) {
        return cookies;
      }
      const key = item.slice(0, divider).trim();
      const value = item.slice(divider + 1).trim();
      try {
        cookies[key] = decodeURIComponent(value);
      } catch {
        cookies[key] = value;
      }
      return cookies;
    }, {});
}

function sendError(res, statusCode, message, details = null) {
  return res.status(statusCode).json({
    ok: false,
    message: redactDetails(message),
    ...(details ? { details: redactDetails(details) } : {}),
  });
}

function redactDetails(value) {
  if (typeof value === "string") {
    return value
      .replace(/bearer\s+[a-z0-9._~-]+/gi, "Bearer [redacted]")
      .replace(/(api[_-]?key|authorization|password|secret|token)\s*[:=]\s*[^,\s}]+/gi, "$1=[redacted]");
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactDetails(item));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).reduce((result, [key, item]) => {
      result[key] = /(api.?key|authorization|password|secret|token)/i.test(key)
        ? "[redacted]"
        : redactDetails(item);
      return result;
    }, {});
  }
  return value;
}

function safeStaticPath(rootDir, relativePath) {
  const resolvedRoot = path.resolve(rootDir);
  const target = path.resolve(resolvedRoot, relativePath);
  return target === resolvedRoot || target.startsWith(`${resolvedRoot}${path.sep}`)
    ? target
    : null;
}

module.exports = {
  clearSessionCookie,
  createCorsMiddleware,
  createLoginRateLimiter,
  createOriginGuard,
  createSessionMiddleware,
  parseCookies,
  redactDetails,
  requireAdmin,
  requireAuth,
  safeStaticPath,
  sendError,
  setSessionCookie,
};
