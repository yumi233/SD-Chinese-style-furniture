const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { normalizeGenerateRequest } = require("./lib/requestNormalizer");
const { createUsage, migrateUsage, quotaSnapshot, requireQuota } = require("./generationQuota");
const ACTIVE = new Set(["queued", "running"]);
class GenerationTasks {
  constructor({ rootDir, gateway, historyStore, safeError, references }) {
    Object.assign(this, { gateway, historyStore, safeError });
    this.rootDir = rootDir;
    this.tasks = new Map();
    this.completions = new Map();
    this.controllers = new Map();
    this.parentImages = new Map();   // in memory only: image bytes never go into task files
    fs.mkdirSync(rootDir, { recursive: true, mode: 0o700 });
    for (const filename of fs.readdirSync(rootDir).filter(name => /^[a-f0-9-]{36}\.json$/.test(name))) {
      try {
        const task = JSON.parse(fs.readFileSync(path.join(rootDir, filename), "utf8"));
        let changed = false;
        if (!task.usage) { task.usage = migrateUsage(task); changed = true; }
        if (ACTIVE.has(task.status)) {
          task.status = task.stopRequested ? "cancelled" : task.result ? "completed" : "failed";
          task.message = "服务曾重启；已完成图片仍保留，请检查结果后再开始新任务。";
          changed = true;
        }
        if (!task.usage.settled) { task.usage.settled = true; changed = true; }
        if (changed) this.persist(task);
        this.tasks.set(task.id, task);
      } catch { /* An invalid private task file never grants access or triggers a retry. */ }
    }
    this.prune();
  }
  get(id, ownerId) {
    const task = this.tasks.get(id);
    return task?.ownerId === ownerId ? task : null;
  }
  active(ownerId) {
    return [...this.tasks.values()].filter(task => task.ownerId === ownerId && ACTIVE.has(task.status));
  }
  isHistoryActive(historyId) {
    return [...this.tasks.values()].some(task => ACTIVE.has(task.status) && task.result?.historyRecord?.id === historyId);
  }
  async waitForCompletion(id, ownerId) {
    const task = this.get(id, ownerId);
    if (!task) return null;
    await this.completions.get(id);
    return task;
  }
  create(body, user) {
    if (!user?.id) throw taskError(401, "请先登录");
    const mode = body.mode || "normal";
    if (!["normal", "agent"].includes(mode) || !/^[a-zA-Z0-9_-]{16,80}$/.test(body.requestId || "")) throw taskError(400, "任务请求无效");
    if (body.parentId != null) {
      if (typeof body.parentId !== "string" || !body.parentId.length || body.parentId.length > 80) throw taskError(400, "parentId 必须是长度为 1 到 80 的字符串");
      const parent = this.historyStore.get(body.parentId);
      if (!parent || parent.ownerId !== user.id) throw taskError(400, "parentId 必须是当前用户自己的历史记录");
    }
    if (body.region != null) {
      const region = body.region, keys = ["x", "y", "width", "height"];
      const valid = body.parentId != null && region && typeof region === "object" && keys.every(key => Number.isFinite(region[key]) && region[key] >= 0 && region[key] <= 1)
        && region.width > 0 && region.height > 0 && region.x + region.width <= 1.000001 && region.y + region.height <= 1.000001;
      if (!valid) throw taskError(400, "框选区域无效");
    }
    const existing = [...this.tasks.values()].find(task => task.ownerId === user.id && task.requestId === body.requestId);
    if (existing) return existing;
    const maxRounds = Math.max(1, Math.min(3, Math.floor(Number(body.maxRounds) || 2)));
    const usage = createUsage(mode, maxRounds);
    try { requireQuota([...this.tasks.values()], user.id, usage.reserved, Date.now()); }
    catch (error) { throw taskError(429, error.message); }
    if (this.active(user.id).length || [...this.tasks.values()].filter(task => ACTIVE.has(task.status)).length >= 1) throw taskError(429, "已有生成任务正在执行，请查看当前任务");
    if (typeof body.prompt !== "string" || body.prompt.length > 12000) throw taskError(400, "请填写不超过 12000 字的家具设计描述");
    const request = normalizeGenerateRequest(body, this.gateway.listEngines().defaultEngine);
    request.parentId = body.parentId ?? null;
    if (body.region != null) request.region = Object.fromEntries(["x", "y", "width", "height"].map(key => [key, Math.round(body.region[key] * 10000) / 10000]));
    let parentImage = null;
    if (request.parentId) {
      // Editing means the model sees the previous version; never fall back to a text-only redraw.
      if (!(this.gateway.listEngines().parentEngines || []).includes(request.engine)) throw taskError(400, "此引擎暂不支持基于上一版修改");
      parentImage = this.historyStore.parentImage(this.historyStore.get(request.parentId));
      if (!parentImage) throw taskError(400, "上一版的图片不可用，无法基于它修改");
    }
    if (!this.gateway.listEngines().modes.includes(request.engine)) throw taskError(400, "本次生成引擎不可用");
    if (mode === "agent" && !(this.gateway.listEngines().agentEngines || []).includes(request.engine)) throw taskError(400, "此引擎尚未配置智能体评审");
    request.targetScore = Math.max(1, Math.min(100, Number(body.targetScore) || 85));
    request.maxRounds = maxRounds;
    const task = { id: crypto.randomUUID(), requestId: body.requestId, ownerId: user.id, mode, request, status: "queued", phase: "preparing", createdAt: new Date().toISOString(), round: 0, stopRequested: false, usage };
    try { this.persist(task); }
    catch { throw taskError(507, "任务状态未能保存，请管理员检查存储后重试"); }
    this.tasks.set(task.id, task);
    this.controllers.set(task.id, new AbortController());
    if (parentImage) this.parentImages.set(task.id, parentImage);
    this.prune();
    const completion = new Promise(resolve => setImmediate(() => {
      this.run(task).catch(() => {
        task.status = task.stopRequested ? "cancelled" : task.result ? "completed" : "failed";
        task.errorStatus = 507;
        task.message = "任务状态保存中断，请从历史确认已有图片后重试";
      }).finally(resolve);
    }));
    this.completions.set(task.id, completion);
    completion.then(() => this.completions.delete(task.id));
    return task;
  }
  quota(ownerId) {
    return quotaSnapshot([...this.tasks.values()], ownerId, Date.now());
  }
  stop(id, ownerId) {
    const task = this.get(id, ownerId);
    if (!task) return null;
    if (ACTIVE.has(task.status) && !task.stopRequested) {
      task.stopRequested = true;
      task.message = "正在取消；已发出的请求可能仍计入额度。";
      this.controllers.get(id)?.abort();
      this.persist(task);
    }
    return task;
  }
  async run(task) {
    let historyId;
    const save = async result => {
      const safeResult = { ...result, referenceInputs: task.referenceInputs || [], visualReferenceCount: task.visualReferenceCount || 0,
        errors: (result.errors || []).map(item => ({ engine: item.engine, message: "此引擎未完成，请检查连接。" })),
        ...(result.rounds ? { rounds: result.rounds.map(round => ({ ...round, errors: [] })) } : {}),
        ...(result.promptPipeline ? { promptPipeline: { ...result.promptPipeline, textModel: result.promptPipeline.textModel?.error ? { error: "提示词增强未完成，已使用原始描述。" } : result.promptPipeline.textModel } } : {}),
      };
      const saved = task.mode === "agent"
        ? await this.historyStore.saveAgent(task.request, safeResult, { ownerId: task.ownerId, id: historyId })
        : await this.historyStore.saveGeneration(task.request, safeResult, { ownerId: task.ownerId });
      historyId = saved.record.id;
      const response = { ok: true, ...saved.result, historyRecord: saved.record };
      // Provider diagnostics belong on the server, not in the user's result.
      if (response.errors) response.errors = response.errors.map(item => ({ engine: item.engine, message: "此引擎未完成，请检查连接。" }));
      for (const round of response.rounds || []) round.errors = [];
      if (response.promptPipeline?.textModel?.error) response.promptPipeline.textModel = { error: "提示词增强未完成，已使用原始描述。" };
      task.result = response;
      this.persist(task);
    };
    const signal = this.controllers.get(task.id).signal;
    try {
      signal.throwIfAborted();
      task.status = "running";
      this.persist(task);
      const context = {
        signal,
        referenceImages: this.parentImages.has(task.id) ? [this.parentImages.get(task.id)] : [],
        onProgress: progress => { Object.assign(task, progress); this.persist(task); },
        onCall: kind => { task.usage.calls.push({ kind, at: new Date().toISOString() }); this.persist(task); },
        shouldStop: () => task.stopRequested,
        onRound: save,
      };
      const result = task.mode === "agent" ? await this.gateway.runAgent(task.request, context) : await this.gateway.generate(task.request, context);
      task.phase = "saving";
      this.persist(task);
      await save(result);
      task.status = signal.aborted ? "cancelled" : "completed";
      task.phase = task.status;
    } catch (error) {
      task.status = task.stopRequested ? "cancelled" : task.result ? "completed" : "failed";
      const safe = this.safeError(error);
      task.errorStatus = safe.statusCode || 502;
      task.message = task.result ? "后续步骤未完成，已完成图片已保留。" : safe.message;
    } finally {
      if (signal.aborted) {
        task.status = "cancelled";
        task.phase = "cancelled";
        task.message = "已取消；已发出的请求可能仍计入额度。";
      }
      this.controllers.delete(task.id);
      this.parentImages.delete(task.id);
      task.usage.settled = true;   // unused reservations return to the user
      task.finishedAt = new Date().toISOString();
      try { this.persist(task); }
      catch { task.message = "任务状态未能写入存储；已有图片请从历史确认，避免重复生成"; }
    }
  }
  persist(task) {
    const destination = path.join(this.rootDir, `${task.id}.json`);
    const temporary = `${destination}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(task), { mode: 0o600 });
    fs.renameSync(temporary, destination);
  }
  prune() {
    const finished = [...this.tasks.values()].filter(task => !ACTIVE.has(task.status) && Date.parse(task.createdAt) < Date.now() - 3600000).sort((a,b) => a.createdAt.localeCompare(b.createdAt));
    while (this.tasks.size > 100 && finished.length) {
      const task = finished.shift();
      this.tasks.delete(task.id);
      fs.rmSync(path.join(this.rootDir, `${task.id}.json`), { force: true });
    }
  }
}
function taskError(statusCode, message) { const error = new Error(message); error.statusCode = statusCode; return error; }
module.exports = { GenerationTasks };
