const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { normalizeGenerateRequest } = require("./lib/requestNormalizer");
const { parseBrief, resolveConflicts } = require("./design/brief");
const { establishDirection, exploreDirection, nextVariation, proposeDirections, refreshMaterials } = require("./design/direction");
const { parseEdit } = require("./design/edit");
const { CONCEPTS, MATERIAL_CONCEPTS, conceptLabel } = require("./design/concepts");
const ACTIVE = new Set(["queued", "running"]);
const ACTIONS = new Set(["new", "variation", "newDirection", "refine", "views"]);
const VIEWS = [
  { id: "front", label: "正视", instruction: "a straight front elevation view of the same design, concept rendering, not an engineering drawing" },
  { id: "side", label: "侧视", instruction: "a straight side elevation view of the same design, concept rendering, not an engineering drawing" },
  { id: "top", label: "俯视", instruction: "a top-down plan view of the same design, concept rendering, not an engineering drawing" },
];
class GenerationTasks {
  constructor({ rootDir, gateway, historyStore, safeError, designSessions = null, userReferences = null }) {
    Object.assign(this, { gateway, historyStore, safeError, designSessions, userReferences });
    this.rootDir = rootDir;
    this.tasks = new Map();
    this.completions = new Map();
    fs.mkdirSync(rootDir, { recursive: true, mode: 0o700 });
    for (const filename of fs.readdirSync(rootDir).filter(name => /^[a-f0-9-]{36}\.json$/.test(name))) {
      try {
        const task = JSON.parse(fs.readFileSync(path.join(rootDir, filename), "utf8"));
        if (ACTIVE.has(task.status)) {
          task.status = task.result ? "completed" : "failed";
          task.message = "服务曾重启；已完成图片仍保留，请检查结果后再开始新任务。";
          this.persist(task);
        }
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
    const action = body.action || "new";
    if (!["normal", "agent"].includes(mode) || !ACTIONS.has(action) || !/^[a-zA-Z0-9_-]{16,80}$/.test(body.requestId || "")) throw taskError(400, "任务请求无效");
    const existing = [...this.tasks.values()].find(task => task.ownerId === user.id && task.requestId === body.requestId);
    if (existing) return existing;
    if ([...this.tasks.values()].filter(task => task.ownerId === user.id && Date.parse(task.createdAt) > Date.now() - 3600000).length >= 20) throw taskError(429, "本小时生成次数已达上限，请稍后再试");
    if (this.active(user.id).length || [...this.tasks.values()].filter(task => ACTIVE.has(task.status)).length >= 1) throw taskError(429, "已有生成任务正在执行，请查看当前任务");
    if (typeof body.prompt !== "string" || body.prompt.length > 12000) throw taskError(400, "请填写不超过 12000 字的家具设计描述");
    const request = normalizeGenerateRequest(body, this.gateway.listEngines().defaultEngine);
    if (!this.gateway.listEngines().modes.includes(request.engine)) throw taskError(400, "本次生成引擎不可用");
    if (mode === "agent" && !(this.gateway.listEngines().agentEngines || []).includes(request.engine)) throw taskError(400, "此引擎尚未配置智能体评审");
    request.targetScore = Math.max(1, Math.min(100, Number(body.targetScore) || 85));
    request.maxRounds = Math.max(1, Math.min(3, Math.floor(Number(body.maxRounds) || 2)));
    const design = this.prepareDesign(body, request, user, action);
    const task = { id: crypto.randomUUID(), requestId: body.requestId, ownerId: user.id, mode: action === "views" ? "views" : mode, action, request, design, status: "queued", phase: "brief", createdAt: new Date().toISOString(), round: 0, stopRequested: false };
    try { this.persist(task); }
    catch { throw taskError(507, "任务状态未能保存，请管理员检查存储后重试"); }
    this.tasks.set(task.id, task);
    this.prune();
    const completion = new Promise(resolve => setImmediate(() => {
      this.run(task).catch(() => {
        task.status = task.result ? "completed" : "failed";
        task.errorStatus = 507;
        task.message = "任务状态保存中断，请从历史确认已有图片后重试";
      }).finally(resolve);
    }));
    this.completions.set(task.id, completion);
    completion.then(() => this.completions.delete(task.id));
    return task;
  }
  // Locks the brief and direction before the task is queued. A contradiction
  // in a core requirement is returned for clarification instead of being sent
  // to the model; ordinary gaps are filled with stated assumptions.
  prepareDesign(body, request, user, action) {
    const session = body.sessionId ? this.designSessions?.get(body.sessionId, user.id) : null;
    if (body.sessionId && !session) throw taskError(404, "设计方案不存在");
    if (action !== "new" && !session) throw taskError(400, "请先生成一版方案，再继续");
    const options = { style: request.style, stylePack: request.stylePack, modernity: request.modernity };
    let brief = session && action !== "new" ? session.brief : parseBrief(request.originalPrompt || request.prompt, { style: request.style, presetLabel: request.styleLabel });
    let edit = null;
    if (action === "refine") {
      const changeRequest = String(body.changeRequest || "").trim();
      if (!changeRequest || changeRequest.length > 1000) throw taskError(400, "请写下这一版要改什么（不超过 1000 字）");
      edit = parseEdit(changeRequest, { family: session.direction?.family });
      brief = mergeChangeRequest(brief, changeRequest, request.style);
      const banned = new Set(brief.prohibitions.filter((item) => item.strength === "hard").map((item) => conceptLabel(item.concept)));
      edit.labels.keep = edit.labels.keep.filter((label) => !banned.has(label));
    }
    if (body.conflictResolution && typeof body.conflictResolution === "object") brief = resolveConflicts(brief, body.conflictResolution);
    if (brief.needsClarification) {
      const pairs = [...new Set(brief.conflicts.filter((item) => item.blocking).map((item) => `「${item.requiredBy}」与「${item.prohibitedBy}」`))];
      const error = taskError(422, `需求里有互相矛盾的地方，请先确认：${pairs.join("；")}`);
      error.details = { clarification: brief.conflicts };
      throw error;
    }
    let direction;
    if (action === "variation") direction = nextVariation(session.direction);
    else if (action === "newDirection") direction = exploreDirection(brief, session.direction, options);
    else if (action === "refine" || action === "views") direction = { ...refreshMaterials(session.direction, brief), variationHint: "", variation: session.direction.variation || 0 };
    else if (body.directionId) {
      direction = proposeDirections(brief, options).find((candidate) => candidate.id === body.directionId);
      if (!direction) throw taskError(409, "所选设计方向已失效，请重新获取方向");
    } else direction = establishDirection(brief, options);
    const baseVersion = action === "refine" || action === "views" ? session.versions.find((item) => item.version === (Number(body.baseVersion) || session.activeVersion)) : null;
    if ((action === "refine" || action === "views") && !baseVersion?.image?.url) throw taskError(400, "找不到要继续的版本图片");
    const referenceSelections = (Array.isArray(body.references) ? body.references : [])
      .filter((item) => item && typeof item.id === "string")
      .slice(0, 6)
      .map((item) => ({ id: item.id, purposes: Array.isArray(item.purposes) ? item.purposes.map(String).slice(0, 4) : [] }));
    return { brief, direction, edit, sessionId: session?.id || null, baseVersion: baseVersion ? { version: baseVersion.version, imageUrl: baseVersion.image.url } : null, referenceSelections, corrections: [] };
  }
  // The previous image is read from the owner's own history at run time; task
  // files never hold image bytes.
  loadBaseImage(task) {
    const url = task.design?.baseVersion?.imageUrl;
    if (!url) return null;
    const filename = path.basename(String(url).split("/").pop() || "");
    const assetPath = this.historyStore.resolveAssetForUser(filename, { id: task.ownerId, isAdmin: false });
    if (!assetPath) throw taskError(404, "上一版图片已不可用");
    const extension = path.extname(assetPath).toLowerCase();
    const mimeType = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" }[extension] || "image/png";
    return { id: `version-${task.design.baseVersion.version}`, title: "previous version", mimeType, bytes: fs.readFileSync(assetPath) };
  }
  stop(id, ownerId) {
    const task = this.get(id, ownerId);
    if (!task) return null;
    if (ACTIVE.has(task.status) && task.mode === "agent") {
      task.stopRequested = true;
      task.message = "本轮完成后停止后续迭代，已生成图片会保留。";
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
    try {
      task.status = "running";
      this.persist(task);
      const context = {
        onProgress: progress => { Object.assign(task, progress); this.persist(task); },
        shouldStop: () => task.stopRequested,
        onRound: save,
      };
      const baseImage = this.loadBaseImage(task);
      context.design = { ...task.design, baseImage, clarified: true };
      context.ownerId = task.ownerId;
      const result = task.mode === "views"
        ? await this.runViews(task, context)
        : task.mode === "agent" ? await this.gateway.runAgent(task.request, context) : await this.gateway.generate(task.request, context);
      task.phase = "saving";
      this.persist(task);
      await save(result);
      this.recordVersion(task, result);
      task.status = "completed";
      task.phase = "completed";
    } catch (error) {
      task.status = task.result ? "completed" : "failed";
      const safe = this.safeError(error);
      task.errorStatus = safe.statusCode || 502;
      task.message = task.result ? "后续步骤未完成，已完成图片已保留。" : safe.message;
    } finally {
      task.finishedAt = new Date().toISOString();
      try { this.persist(task); }
      catch { task.message = "任务状态未能写入存储；已有图片请从历史确认，避免重复生成"; }
    }
  }
  // Three concept views of the active version, each checked for consistency
  // with it. They are concept renderings, never engineering drawings.
  async runViews(task, context) {
    const images = [];
    const evaluations = [];
    let last;
    for (const [index, view] of VIEWS.entries()) {
      context.onProgress?.({ phase: "generating", round: index + 1, maxRounds: VIEWS.length, view: view.id });
      const edit = { scope: [view.instruction], keep: ["the exact same furniture design", "materials", "colours", "proportions"] };
      last = await this.gateway.generate(task.request, { ...context, design: { ...context.design, edit } });
      const image = { ...last.images[0], view: view.id, label: view.label };
      images.push(image);
      context.onProgress?.({ phase: "reviewing", round: index + 1, maxRounds: VIEWS.length, view: view.id });
      try {
        const baseUrl = `data:${context.design.baseImage.mimeType};base64,${context.design.baseImage.bytes.toString("base64")}`;
        evaluations.push({ view: view.id, ...(await this.gateway.evaluateImage({ engine: task.request.engine, imageUrl: image.url, previousImageUrl: baseUrl, brief: context.design.brief, direction: context.design.direction, edit, targetScore: task.request.targetScore, round: index + 1 })) });
      } catch {
        evaluations.push({ view: view.id, status: "error", evaluationFailed: true, problems: ["一致性评审未完成"] });
      }
    }
    return { ...last, images, views: evaluations, viewsConcept: true };
  }
  recordVersion(task, result) {
    if (!this.designSessions || !task.result) return;
    const design = result.design || {};
    let sessionId = task.design.sessionId;
    if (!sessionId) sessionId = this.designSessions.create(task.ownerId, { brief: task.design.brief, direction: task.design.direction }).id;
    else if (["variation", "newDirection", "refine"].includes(task.action)) this.designSessions.setDirection(sessionId, task.ownerId, task.design.direction, task.design.brief);
    const saved = task.result;
    const image = saved.bestImage || saved.images?.[0] || null;
    const evaluation = saved.bestEvaluation || null;
    const version = this.designSessions.addVersion(sessionId, task.ownerId, {
      kind: task.action,
      parentVersion: task.design.baseVersion?.version || null,
      historyId: saved.historyRecord?.id || null,
      image: image ? { url: image.url } : null,
      images: task.mode === "views" ? (saved.images || []).map((item) => ({ url: item.url, view: item.view, label: item.label })) : undefined,
      prompt: saved.finalPrompt || saved.request?.prompt || "",
      changeRequest: task.design.edit?.request || "",
      edit: task.design.edit ? task.design.edit.labels : null,
      direction: task.design.direction,
      references: design.references || [],
      model: design.model || null,
      evaluation: evaluation ? summarizeEvaluation(evaluation) : null,
      views: saved.views ? saved.views.map((item) => ({ view: item.view, ...summarizeEvaluation(item) })) : undefined,
      stopReason: saved.stopReason || null,
    });
    task.result.session = { id: sessionId, version: version?.version || null };
    this.persist(task);
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
// A refinement request can add or change requirements; the newer explicit
// instruction wins for the concepts it names, and the change is recorded.
function mergeChangeRequest(brief, changeRequest, style) {
  const update = parseBrief(changeRequest, { style });
  const touched = new Set([...update.requirements, ...update.prohibitions].map((item) => item.concept).filter(Boolean));
  const keepRequirement = (item) => !item.concept || !touched.has(item.concept);
  // "这把椅子" names the piece being refined; only an explicit "改成…/换成…"
  // changes the furniture type.
  const changesType = Boolean(update.furniture && brief.furniture && update.furniture.id !== brief.furniture.id && /(改成|换成|变成|改为)[^，,。；;]*$/.test(changeRequest.slice(0, changeRequest.indexOf(update.furniture.label) + update.furniture.label.length)));
  // "全金属" followed by "坐垫换成皮革": the new material is an exception to
  // the earlier "entirely", not a violation of it.
  const added = update.requirements.filter((item) => MATERIAL_CONCEPTS.includes(item.concept));
  const narrowExclusive = (item) => {
    if (!item.exclusive || !added.length || added.some((entry) => entry.concept === item.concept)) return item;
    const except = added.map((entry) => entry.concept);
    return { ...item, exclusive: false, label: `材料：除${except.map(conceptLabel).join("、")}外全${conceptLabel(item.concept)}`, en: `${CONCEPTS[item.concept].enTerm} for every other visible part (the ${except.map((concept) => CONCEPTS[concept].enTerm).join(" and ")} excepted)` };
  };
  const requirements = [
    ...brief.requirements.filter((item) => keepRequirement(item) && !(changesType && item.kind === "furniture")).map(narrowExclusive),
    ...update.requirements.filter((item) => item.kind !== "furniture" || changesType || !brief.furniture),
  ];
  const prohibitions = [...brief.prohibitions.filter(keepRequirement), ...update.prohibitions];
  return { ...brief, requirements, prohibitions, updates: [...(brief.updates || []), { at: new Date().toISOString(), request: changeRequest, concepts: [...touched] }], conflicts: update.conflicts, needsClarification: update.needsClarification };
}
function summarizeEvaluation(evaluation) {
  return { status: evaluation.status || null, score: evaluation.score ?? null, counts: evaluation.counts || null, missing: evaluation.missing || [], problems: (evaluation.problems || []).slice(0, 4) };
}
function taskError(statusCode, message) { const error = new Error(message); error.statusCode = statusCode; return error; }
module.exports = { GenerationTasks };
