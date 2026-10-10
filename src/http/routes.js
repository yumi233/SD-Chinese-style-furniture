const express = require("express");
const { getReferenceCases } = require("../referenceKnowledge");
const {
  clearSessionCookie,
  createLoginRateLimiter,
  requireAdmin,
  requireAuth,
  sendError,
  setSessionCookie,
} = require("./middleware");

function createApiRouter(options = {}) {
  const router = express.Router();
  const {
    gateway,
    historyStore,
    modelConfigStore,
    userStore,
    cookieOptions = {},
    loginRateLimiter = createLoginRateLimiter(),
    registerRateLimiter = createLoginRateLimiter({
      windowMs: 5 * 60_000,
      maxAttempts: 5,
      keyFactory: (req) => String(req.ip || req.socket?.remoteAddress || "unknown"),
    }),
  } = options;
  const listReferenceCases = options.getReferenceCases || getReferenceCases;

  router.post("/auth/register", async (req, res, next) => {
    const attempt = registerRateLimiter.check(req, "register");
    if (!attempt.allowed) {
      res.setHeader("Retry-After", String(attempt.retryAfter));
      return sendError(res, 429, "注册尝试过于频繁，请稍后再试");
    }
    registerRateLimiter.recordAttempt(attempt.key);
    try {
      const result = await userStore.register(req.body || {});
      setSessionCookie(res, result.token, cookieOptions);
      return res.status(201).json({ ok: true, user: result.user });
    } catch (error) {
      error.statusCode = error.statusCode || 400;
      return next(error);
    }
  });

  router.post("/auth/login", async (req, res, next) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const attempt = loginRateLimiter.check(req, email);
    if (!attempt.allowed) {
      res.setHeader("Retry-After", String(attempt.retryAfter));
      return sendError(res, 429, "登录尝试过于频繁，请稍后再试");
    }

    try {
      const result = await userStore.login(req.body || {});
      loginRateLimiter.clear(attempt.key);
      setSessionCookie(res, result.token, cookieOptions);
      return res.json({ ok: true, user: result.user });
    } catch (error) {
      loginRateLimiter.recordFailure(attempt.key);
      error.statusCode = 401;
      return next(error);
    }
  });

  router.post("/auth/logout", (req, res, next) => {
    try {
      userStore.logout(req.authToken);
      clearSessionCookie(res, cookieOptions);
      return res.json({ ok: true, enabled: true });
    } catch (error) {
      return next(error);
    }
  });

  router.get("/auth/me", (req, res) => {
    res.json({ ok: true, enabled: true, user: req.user || null });
  });

  router.patch("/auth/profile", requireAuth, (req, res, next) => {
    try {
      return res.json({ ok: true, user: userStore.updateProfile(req.user.id, req.body || {}) });
    } catch (error) {
      error.statusCode = error.statusCode || 400;
      return next(error);
    }
  });

  router.get("/health", async (_req, res, next) => {
    try {
      return res.json(await gateway.health());
    } catch (error) {
      error.statusCode = error.statusCode || 500;
      return next(error);
    }
  });

  router.get("/live", (_req, res) => res.json({ ok: true }));

  router.get("/engines", (_req, res) => res.json(gateway.listEngines()));

  router.get("/reference-cases", (_req, res) => {
    return res.json({ ok: true, cases: listReferenceCases() });
  });

  router.get("/config", requireAdmin, (_req, res) => {
    return res.json({
      ok: true,
      config: gateway.getConfig(),
      engines: gateway.listEngines().engines,
    });
  });

  router.post("/config", requireAdmin, (req, res, next) => {
    try {
      // gateway.sanitizeConfig preserves an existing secret when its submitted
      // value is empty; non-empty values are accepted only from this admin route.
      const config = gateway.updateConfig(req.body || {});
      modelConfigStore.save(gateway.getRuntimeConfig());
      return res.json({ ok: true, config });
    } catch (error) {
      error.statusCode = error.statusCode || 400;
      return next(error);
    }
  });

  router.post("/generate", requireAuth, async (req, res, next) => {
    try {
      const result = await gateway.generate(req.body || {});
      const saved = await historyStore.saveGeneration(req.body || {}, result, {
        ownerId: req.user.id,
      });
      return res.json({ ok: true, ...saved.result, historyRecord: saved.record });
    } catch (error) {
      return next(toSafeGenerationError(error));
    }
  });

  router.post("/agent/run", requireAuth, async (req, res, next) => {
    try {
      const result = await gateway.runAgent(req.body || {});
      const saved = await historyStore.saveAgent(req.body || {}, result, {
        ownerId: req.user.id,
      });
      return res.json({ ok: true, ...saved.result, historyRecord: saved.record });
    } catch (error) {
      return next(toSafeGenerationError(error));
    }
  });

  router.get("/history", requireAuth, (req, res) => {
    return res.json({
      ok: true,
      records: historyStore.list(req.query.limit, req.user.id, {
        isAdmin: req.user.isAdmin,
      }),
    });
  });

  router.get("/history/assets/:filename", requireAuth, (req, res) => {
    const assetPath = historyStore.resolveAssetForUser(req.params.filename, req.user);
    if (!assetPath) {
      return sendError(res, 404, "history image not found");
    }
    return res.sendFile(assetPath);
  });

  router.get("/history/:id", requireAuth, (req, res) => {
    const record = getVisibleRecord(historyStore, req.params.id, req.user);
    if (!record) {
      return sendError(res, 404, "history record not found");
    }
    return res.json({ ok: true, record });
  });

  router.delete("/history/:id", requireAuth, (req, res) => {
    const record = getVisibleRecord(historyStore, req.params.id, req.user);
    if (!record) {
      return sendError(res, 404, "history record not found");
    }
    return res.json({ ok: true, deletedId: req.params.id, deleted: historyStore.delete(record.id) });
  });

  return router;
}

function getVisibleRecord(historyStore, id, user) {
  const record = historyStore.get(id);
  if (!record) {
    return null;
  }
  if (user.isAdmin || record.ownerId === user.id) {
    return record;
  }
  return null;
}

function toSafeGenerationError(error) {
  const statusCode = Number(error?.statusCode || error?.status);
  const message = String(error?.message || "");
  // Keep request validation actionable, while hiding provider URLs, response
  // bodies, credentials and implementation details from upstream failures.
  if (
    statusCode === 400 &&
    (/prompt is required/i.test(message) ||
      /agent requirement and prompt are required/i.test(message) ||
      /unsupported engine/i.test(message))
  ) {
    return error;
  }
  const safeError = new Error("生成服务不可用，请检查模型连接后重试");
  safeError.statusCode = 502;
  safeError.publicMessage = safeError.message;
  return safeError;
}

module.exports = {
  createApiRouter,
  getVisibleRecord,
  toSafeGenerationError,
};

