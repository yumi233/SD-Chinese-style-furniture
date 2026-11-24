const path = require("path");
const { createHash, randomBytes, randomUUID } = require("crypto");
const { GenerationTasks } = require("../generationTasks");
const { createGuestQuota } = require("../generationQuota");
const express = require("express");
const { getReferenceCases } = require("../referenceKnowledge");
const {
  clearSessionCookie,
  createLoginRateLimiter,
  parseCookies,
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
  // Account and guest generation share one running slot on the engine.
  const concurrency = [];
  const tasks = new GenerationTasks({ rootDir: path.join(historyStore.rootDir, "tasks"), gateway, historyStore, safeError: toSafeGenerationError, concurrency });
  router.get("/generation-tasks", requireAuth, (req, res) => {
    const matches = req.query.requestId === undefined ? tasks.active(req.user.id) : tasks.forRequest(req.query.requestId, req.user.id);
    return res.json({ ok: true, tasks: matches });
  });
  router.get("/generation-tasks/:id/reference", requireAuth, (req, res) => {
    if (!tasks.get(req.params.id, req.user.id)?.referenceMimeType) return sendError(res, 404, "参考图不可用");
    const image = tasks.readReference({ referenceTaskId: req.params.id }, req.user.id);
    return res.set("X-Content-Type-Options", "nosniff").type(image.mimeType).send(image.bytes);
  });
  router.post("/generation-tasks", requireAuth, (req, res, next) => {
    try { return res.status(202).json({ ok: true, task: tasks.create(req.body || {}, req.user) }); }
    catch (error) { return next(error); }
  });
  router.get("/generation-tasks/quota", requireAuth, (req, res) => res.json({ ok: true, quota: tasks.quota(req.user.id) }));
  router.get("/generation-tasks/:id", requireAuth, (req, res) => {
    const task = tasks.get(req.params.id, req.user.id);
    return task ? res.json({ ok: true, task }) : sendError(res, 404, "生成任务不存在");
  });
  router.post("/generation-tasks/:id/stop", requireAuth, (req, res) => {
    const task = tasks.stop(req.params.id, req.user.id);
    return task ? res.json({ ok: true, task }) : sendError(res, 404, "生成任务不存在");
  });
  const listReferenceCases = options.getReferenceCases || getReferenceCases;

  // Design chat before generation. Accounts and guests use separate stores;
  // every route is owner-scoped and another owner's conversation is missing.
  mountDesignChat(router, "/design-chat", options.designChat || null, requireAuth, req => req.user.id, { historyStore, tasks });
  // Guests are identified by a browser-session cookie only; nothing here
  // authenticates them for generation, history or any account route.
  const guest = guestOwner(cookieOptions);
  const guestTasks = mountGuestGeneration(router, guest, options.guestGeneration, { gateway, concurrency });
  mountDesignChat(router, "/guest/design-chat", options.guestChat || null, guest, req => req.guestId, { historyStore: options.guestGeneration?.historyStore || null, tasks: guestTasks });

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
      if (error.statusCode === 401) loginRateLimiter.recordFailure(attempt.key);
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

  router.get("/auth/me", (req, res, next) => {
    if (req.authError) return next(req.authError);
    res.json({ ok: true, enabled: true, user: req.user || null });
  });

  router.patch("/auth/profile", requireAuth, (req, res, next) => {
    try {
      return res.json({ ok: true, user: userStore.updateProfile(req.user.id, req.body || {}) });
    } catch (error) {
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

  router.get("/live", (_req, res) => {
    if (process.env.MUSHENG_RELEASE) res.set("X-Musheng-Revision", process.env.MUSHENG_RELEASE);
    return res.json({ ok: true });
  });

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

  const legacyGeneration = mode => async (req, res, next) => {
    try {
      const body = req.body || {};
      const task = tasks.create({ ...body, prompt: body.prompt || body.enhancedPrompt, mode, requestId: body.requestId || randomUUID() }, req.user);
      if (task.request.engine === "codexCli") {
        return res.status(202).json({ ok: true, task });
      }
      const finished = await tasks.waitForCompletion(task.id, req.user.id);
      if (finished.status !== "completed" || !finished.result) {
        return sendError(res, finished.errorStatus || 502, finished.message || "生成未完成，请稍后重试");
      }
      return res.json(finished.result);
    } catch (error) {
      // Task validation errors are already safe; provider failures are sanitized
      // before being persisted by GenerationTasks.
      return next(error);
    }
  };
  router.post("/generate", requireAuth, legacyGeneration("normal"));
  router.post("/agent/run", requireAuth, legacyGeneration("agent"));

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

  router.patch("/history/:id", requireAuth, (req, res) => {
    const record = getVisibleRecord(historyStore, req.params.id, req.user);
    if (!record) return sendError(res, 404, "history record not found");
    const title = req.body?.title;
    if (typeof title !== "string" || title.trim().length > 40) return sendError(res, 400, "作品名最多 40 字");
    return res.json({ ok: true, ids: historyStore.renameWork(record.id, title.trim()) });
  });

  router.delete("/history/:id", requireAuth, (req, res) => {
    const record = getVisibleRecord(historyStore, req.params.id, req.user);
    if (!record) {
      return sendError(res, 404, "history record not found");
    }
    if (tasks.isHistoryActive(record.id)) {
      return sendError(res, 409, "此历史记录的生成任务仍在执行，请等待任务完成后再删除");
    }
    return res.json({ ok: true, deletedId: req.params.id, deleted: historyStore.delete(record.id) });
  });

  return router;
}

function mountDesignChat(router, base, designChat, owner, ownerId, deps = {}) {
  router.get(base, owner, async (req, res, next) => {
    try {
      if (!designChat) return res.json({ ok: true, enabled: false, available: false, reason: "disabled", session: null, conversations: [] });
      const availability = await designChat.availability();
      const id = ownerId(req);
      return res.json({ ok: true, ...availability, session: id ? designChat.latest(id) : null, conversations: id ? designChat.list(id) : [] });
    } catch (error) { return next(error); }
  });
  router.get(`${base}/conversations`, owner, (req, res) => {
    if (!designChat) return res.json({ ok: true, conversations: [] });
    const id = ownerId(req);
    return res.json({ ok: true, conversations: id ? designChat.list(id) : [] });
  });
  router.post(`${base}/messages`, owner, async (req, res, next) => {
    if (!designChat) return res.status(503).json({ ok: false, message: "设计对话未启用", reason: "disabled" });
    const wantsStream = String(req.headers.accept || "").includes("text/event-stream");
    if (wantsStream) {
      res.status(200);
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders?.();
      let closed = false;
      res.on("close", () => { if (!res.writableEnded) closed = true; });
      const writeEvent = (event, data) => {
        if (closed || res.writableEnded) return;
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };
      try {
        const session = await designChat.send({ id: ownerId(req) }, req.body || {}, {
          ...deps,
          onSession: snap => writeEvent("session", { session: snap }),
          onDelta: text => writeEvent("delta", { text }),
        });
        writeEvent("done", { ok: true, session });
        if (!res.writableEnded) res.end();
      } catch (error) {
        writeEvent("error", {
          ok: false,
          statusCode: Number(error.statusCode) || 500,
          message: error.publicMessage || error.message || "对话失败",
          ...(error.code ? { reason: error.code } : {}),
          ...(error.session ? { session: error.session } : {}),
        });
        if (!res.writableEnded) res.end();
      }
      return undefined;
    }
    try {
      return res.json({ ok: true, session: await designChat.send({ id: ownerId(req) }, req.body || {}, deps) });
    } catch (error) {
      if (error.retryAfter) res.setHeader("Retry-After", String(error.retryAfter));
      const statusCode = Number(error.statusCode) || 500;
      if (statusCode === 404) return sendError(res, 404, error.message || "对话不存在");
      if (!error.code && statusCode >= 500) return next(error);
      return res.status(statusCode).json({ ok: false, message: error.publicMessage || error.message, ...(error.code ? { reason: error.code } : {}), ...(error.session ? { session: error.session } : {}) });
    }
  });
  router.patch(`${base}/:sessionId/brief`, owner, (req, res, next) => {
    if (!designChat) return res.status(503).json({ ok: false, message: "设计对话未启用", reason: "disabled" });
    try {
      const id = ownerId(req);
      const session = id ? designChat.updateBrief(req.params.sessionId, id, req.body || {}) : null;
      return session ? res.json({ ok: true, session }) : sendError(res, 404, "对话不存在");
    } catch (error) {
      const statusCode = Number(error.statusCode) || 500;
      if (statusCode >= 500) return next(error);
      return sendError(res, statusCode, error.message);
    }
  });
  router.get(`${base}/:sessionId/reference`, owner, (req, res) => {
    const id = ownerId(req);
    const ref = id ? designChat?.readReference(req.params.sessionId, id) : null;
    if (!ref) return sendError(res, 404, "参考图不可用");
    return res.set("X-Content-Type-Options", "nosniff").type(ref.mimeType).send(ref.bytes);
  });
  router.delete(`${base}/:sessionId/reference`, owner, (req, res) => {
    const id = ownerId(req);
    const session = id ? designChat?.removeReference(req.params.sessionId, id) : null;
    return session ? res.json({ ok: true, session }) : sendError(res, 404, "对话不存在");
  });
  router.get(`${base}/:sessionId`, owner, (req, res) => {
    const id = ownerId(req);
    const session = id ? designChat?.get(req.params.sessionId, id) : null;
    return session ? res.json({ ok: true, session }) : sendError(res, 404, "对话不存在");
  });
  router.delete(`${base}/:sessionId`, owner, (req, res) => {
    const id = ownerId(req);
    const result = id ? designChat?.remove(req.params.sessionId, id) : null;
    return result ? res.json({ ok: true, ...result }) : sendError(res, 404, "对话不存在");
  });
  router.post(`${base}/:sessionId/cancel`, owner, (req, res) => {
    const id = ownerId(req);
    const result = id ? designChat?.cancel(req.params.sessionId, id) : null;
    return result ? res.json({ ok: true, ...result }) : sendError(res, 404, "对话不存在");
  });
}

// Guest generation reuses GenerationTasks with its own task directory, its own
// HistoryStore and a quota that counts saved images only. Guests reach only
// their own tasks and records; every account route still requires login.
function mountGuestGeneration(router, guest, config, { gateway, concurrency }) {
  const historyStore = config?.historyStore;
  const tasks = historyStore ? new GenerationTasks({
    rootDir: path.join(historyStore.rootDir, "tasks"), gateway, historyStore, safeError: toSafeGenerationError, concurrency,
    quota: createGuestQuota({ perSession: config.perSession, perDay: config.perDay }), allowAgent: false,
  }) : null;
  if (tasks && config.ttlMs) {
    const sweep = () => { tasks.sweep(config.ttlMs); historyStore.sweep(config.ttlMs); };
    sweep();
    setInterval(sweep, 3_600_000).unref();
  }
  const user = req => req.guestId ? { id: req.guestId, isAdmin: false } : null;
  // 404, not 5xx: the studio treats 5xx as "maybe submitted" and would retry.
  const off = res => sendError(res, 404, "试用生成未开启");
  router.post("/guest/generation-tasks", guest, (req, res, next) => {
    if (!tasks) return off(res);
    try { return res.status(202).json({ ok: true, task: tasks.create(req.body || {}, user(req)) }); }
    catch (error) { return next(error); }
  });
  router.get("/guest/generation-tasks", guest, (req, res) => {
    const owner = user(req);
    if (!tasks || !owner) return res.json({ ok: true, tasks: [] });
    return res.json({ ok: true, tasks: req.query.requestId === undefined ? tasks.active(owner.id) : tasks.forRequest(req.query.requestId, owner.id) });
  });
  router.get("/guest/generation-tasks/quota", guest, (req, res) => {
    if (!tasks) return off(res);
    return res.json({ ok: true, quota: tasks.quota(user(req)?.id ?? "") });
  });
  router.get("/guest/generation-tasks/:id", guest, (req, res) => {
    const task = user(req) && tasks?.get(req.params.id, user(req).id);
    return task ? res.json({ ok: true, task }) : sendError(res, 404, "生成任务不存在");
  });
  router.get("/guest/generation-tasks/:id/reference", guest, (req, res) => {
    const owner = user(req);
    if (!owner || !tasks?.get(req.params.id, owner.id)?.referenceMimeType) return sendError(res, 404, "参考图不可用");
    const image = tasks.readReference({ referenceTaskId: req.params.id }, owner.id);
    return res.set("X-Content-Type-Options", "nosniff").type(image.mimeType).send(image.bytes);
  });
  router.post("/guest/generation-tasks/:id/stop", guest, (req, res) => {
    const task = user(req) && tasks?.stop(req.params.id, user(req).id);
    return task ? res.json({ ok: true, task }) : sendError(res, 404, "生成任务不存在");
  });
  router.get("/guest/history", guest, (req, res) => {
    const owner = user(req);
    return res.json({ ok: true, records: owner && historyStore ? historyStore.list(req.query.limit, owner.id) : [] });
  });
  router.get("/guest/history/assets/:filename", guest, (req, res) => {
    const assetPath = historyStore?.resolveAssetForUser(req.params.filename, user(req));
    return assetPath ? res.sendFile(assetPath) : sendError(res, 404, "history image not found");
  });
  router.get("/guest/history/:id", guest, (req, res) => {
    const record = historyStore && user(req) ? getVisibleRecord(historyStore, req.params.id, user(req)) : null;
    return record ? res.json({ ok: true, record }) : sendError(res, 404, "history record not found");
  });
  router.patch("/guest/history/:id", guest, (req, res) => {
    const record = historyStore && user(req) ? getVisibleRecord(historyStore, req.params.id, user(req)) : null;
    if (!record) return sendError(res, 404, "history record not found");
    const title = req.body?.title;
    if (typeof title !== "string" || title.trim().length > 40) return sendError(res, 400, "作品名最多 40 字");
    return res.json({ ok: true, ids: historyStore.renameWork(record.id, title.trim()) });
  });
  router.delete("/guest/history/:id", guest, (req, res) => {
    const record = historyStore && user(req) ? getVisibleRecord(historyStore, req.params.id, user(req)) : null;
    if (!record) return sendError(res, 404, "history record not found");
    if (tasks.isHistoryActive(record.id)) return sendError(res, 409, "此历史记录的生成任务仍在执行，请等待任务完成后再删除");
    return res.json({ ok: true, deletedId: req.params.id, deleted: historyStore.delete(record.id) });
  });
  return tasks;
}

// A random token in a session cookie (no Max-Age, so it ends with the browser
// session). Only its hash is used as the owner id. A sending guest without a
// valid cookie gets a new one; reads without one simply find nothing.
const GUEST_COOKIE = "musheng_guest";
function guestOwner(cookieOptions = {}) {
  return (req, res, next) => {
    let token = parseCookies(req.headers.cookie || "")[GUEST_COOKIE] || "";
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
      token = "";
      if (req.method === "POST") {
        token = randomBytes(32).toString("base64url");
        res.append("Set-Cookie", `${GUEST_COOKIE}=${token}; Path=/api; HttpOnly; SameSite=Lax${cookieOptions.secure ? "; Secure" : ""}`);
      }
    }
    req.guestId = token ? `guest-${createHash("sha256").update(token).digest("hex").slice(0, 32)}` : null;
    return next();
  };
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
  if (statusCode === 429 || statusCode === 507) {
    const safeError = new Error(statusCode === 429 ? "已有任务正在生成，请稍后重试" : "图片保存失败，请管理员检查存储后重试");
    safeError.statusCode = statusCode;
    safeError.publicMessage = safeError.message;
    return safeError;
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
