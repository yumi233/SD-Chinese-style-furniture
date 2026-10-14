const path = require("path");
const { randomUUID } = require("crypto");
const { GenerationTasks } = require("../generationTasks");
const express = require("express");
const { getReferenceCases } = require("../referenceKnowledge");
const { listStylePacks } = require("../knowledge/stylePacks");
const { normalizeGenerateRequest } = require("../lib/requestNormalizer");
const { parseBrief, resolveConflicts } = require("../design/brief");
const { establishDirection, proposeDirections } = require("../design/direction");
const { listCases } = require("../references/realCases");
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
  const { designSessions = null, userReferences = null, styleReferences = null } = options;
  const tasks = new GenerationTasks({ rootDir: path.join(historyStore.rootDir, "tasks"), gateway, historyStore, safeError: toSafeGenerationError, designSessions, userReferences });
  router.get("/generation-tasks", requireAuth, (req, res) => res.json({ ok: true, tasks: tasks.active(req.user.id) }));
  router.post("/generation-tasks", requireAuth, (req, res, next) => {
    try { return res.status(202).json({ ok: true, task: tasks.create(req.body || {}, req.user) }); }
    catch (error) { return next(error); }
  });
  router.get("/generation-tasks/:id", requireAuth, (req, res) => {
    const task = tasks.get(req.params.id, req.user.id);
    return task ? res.json({ ok: true, task }) : sendError(res, 404, "生成任务不存在");
  });
  router.post("/generation-tasks/:id/stop", requireAuth, (req, res) => {
    const task = tasks.stop(req.params.id, req.user.id);
    return task ? res.json({ ok: true, task }) : sendError(res, 404, "生成任务不存在");
  });
  const listReferenceCases = options.getReferenceCases || getReferenceCases;

  // Preview of the locked brief and direction before anything is generated.
  router.post("/design/brief", requireAuth, (req, res, next) => {
    try {
      const request = normalizeGenerateRequest({ ...req.body, prompt: req.body?.prompt || req.body?.originalPrompt || "" }, gateway.listEngines().defaultEngine);
      let brief = parseBrief(request.originalPrompt || request.prompt, { style: request.style, presetLabel: request.styleLabel });
      const resolution = req.body?.conflictResolution;
      if (resolution && typeof resolution === "object" && !Array.isArray(resolution)) brief = resolveConflicts(brief, resolution);
      const direction = brief.needsClarification ? null : establishDirection(brief, { style: request.style, stylePack: request.stylePack, modernity: request.modernity });
      return res.json({ ok: true, brief: publicBrief(brief), direction });
    } catch (error) { return next(error); }
  });
  // Three clearly different directions for users without a starting idea.
  router.post("/design/directions", requireAuth, (req, res, next) => {
    try {
      const request = normalizeGenerateRequest({ ...req.body, prompt: req.body?.prompt || req.body?.originalPrompt || "" }, gateway.listEngines().defaultEngine);
      let brief = parseBrief(request.originalPrompt || request.prompt, { style: request.style, presetLabel: request.styleLabel });
      const resolution = req.body?.conflictResolution;
      if (resolution && typeof resolution === "object" && !Array.isArray(resolution)) brief = resolveConflicts(brief, resolution);
      if (brief.needsClarification) return res.json({ ok: true, brief: publicBrief(brief), directions: [] });
      const directions = proposeDirections(brief, { style: request.style, stylePack: request.stylePack, modernity: request.modernity }).map((direction) => ({
        ...direction,
        thumbnails: direction.pack && styleReferences ? styleReferences.list().filter((image) => image.pack === direction.pack).slice(0, 2).map((image) => ({ id: image.id, title: image.title, kind: "aiConcept", url: `/api/v1/style-references/${encodeURIComponent(image.id)}/image` })) : [],
        cases: require("../references/realCases").matchCases(brief, direction, { limit: 2 }),
      }));
      return res.json({ ok: true, brief: publicBrief(brief), directions });
    } catch (error) { return next(error); }
  });
  router.get("/capabilities", (_req, res) => res.json({ ok: true, engines: gateway.capabilities() }));
  router.get("/real-cases", (req, res) => res.json({ ok: true, cases: listCases({ category: typeof req.query.category === "string" ? req.query.category : undefined, style: typeof req.query.style === "string" ? req.query.style : undefined }) }));
  // AI concept images of style packs, for direction thumbnails (signed-in users only).
  router.get("/style-references/:id/image", requireAuth, (req, res) => {
    const image = styleReferences?.byId(req.params.id);
    if (!image) return sendError(res, 404, "参考图不存在");
    res.set("Content-Type", image.mimeType);
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Cache-Control", "private, max-age=3600");
    return res.send(image.bytes);
  });

  router.get("/design-sessions", requireAuth, (req, res) => res.json({ ok: true, sessions: designSessions ? designSessions.list(req.user.id) : [] }));
  router.get("/design-sessions/:id", requireAuth, (req, res) => {
    const session = designSessions?.get(req.params.id, req.user.id);
    return session ? res.json({ ok: true, session: publicSession(session) }) : sendError(res, 404, "设计方案不存在");
  });
  router.post("/design-sessions/:id/restore", requireAuth, (req, res, next) => {
    try {
      const session = designSessions?.restore(req.params.id, req.user.id, req.body?.version);
      return session ? res.json({ ok: true, session: publicSession(session) }) : sendError(res, 404, "设计方案不存在");
    } catch (error) { return next(error); }
  });

  // The user's own reference uploads. Private to the account.
  router.get("/references", requireAuth, (req, res) => res.json({ ok: true, references: userReferences ? userReferences.list(req.user.id) : [] }));
  router.post("/references", requireAuth, (req, res, next) => {
    try { return res.status(201).json({ ok: true, reference: userReferences.add(req.user.id, req.body || {}) }); }
    catch (error) { return next(error); }
  });
  router.patch("/references/:id", requireAuth, (req, res, next) => {
    try { return res.json({ ok: true, reference: userReferences.update(req.user.id, req.params.id, req.body || {}) }); }
    catch (error) { return next(error); }
  });
  router.delete("/references/:id", requireAuth, (req, res) => {
    const deleted = userReferences?.remove(req.user.id, req.params.id);
    return deleted ? res.json({ ok: true, deletedId: req.params.id }) : sendError(res, 404, "参考资料不存在");
  });
  router.get("/references/:id/file", requireAuth, (req, res) => {
    const found = userReferences?.filePath(req.user.id, req.params.id);
    if (!found) return sendError(res, 404, "参考资料不存在");
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Cache-Control", "private, no-store");
    // Documents are downloads, never rendered in the page; text is plain text.
    if (found.item.kind === "document") {
      res.set("Content-Type", found.item.mimeType === "application/pdf" ? "application/pdf" : "text/plain; charset=utf-8");
      res.set("Content-Disposition", "attachment");
    } else {
      res.set("Content-Type", found.item.mimeType);
    }
    return res.sendFile(found.file);
  });

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

  // Pack metadata and how many curated references each has; never the images.
  router.get("/style-packs", (_req, res) => {
    const counts = options.styleReferences?.countByPack() || {};
    return res.json({ ok: true, packs: listStylePacks().map((pack) => ({ ...pack, referenceCount: counts[pack.id] || 0 })) });
  });

  router.get("/reference-cases", (req, res) => {
    const style = typeof req.query.style === "string" ? req.query.style : undefined;
    return res.json({ ok: true, cases: listReferenceCases({ style }) });
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

// The brief without internal matching text.
function publicBrief(brief) {
  const { positiveText, ...rest } = brief;
  return rest;
}

function publicSession(session) {
  const { ownerId, ...rest } = session;
  return { ...rest, brief: publicBrief(session.brief) };
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
