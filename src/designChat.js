const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const { AGENT_ERRORS, AgentRuntimeError, assertAgentRuntime, validateBriefPatch } = require("./agent/runtime");
const { validateImageHeader } = require("./providers/codexCli");

const { designReferences, referenceNotes, SPACE_DIRECTION } = require("./lib/designRetrieval");

const SESSION_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const REQUEST_ID = /^[a-zA-Z0-9_-]{8,80}$/;
const MAX_REFERENCE_BYTES = 2 * 1024 * 1024;
const INTERRUPTED = "回复中断，请重新发送";
const STYLE_LABELS = { ming: "明式", newChinese: "新中式", song: "宋韵", zen: "禅意" };

// Pre-generation design chat: one file per conversation, owned by one account.
// The agent runtime keeps the model context; this store keeps what the
// browser shows. Nothing here starts an image generation.
class DesignChat {
  // Guests use a second instance with a shorter leash: one conversation per
  // browser session (`singleConversation`), a cap shared by all guests
  // (`globalPerMinute`) and conversations that expire after `ttlMs`.
  constructor({ runtime, rootDir, enabled = true, perMinute = 6, maxMessages = 20, maxText = 1000, now = Date.now,
    ttlMs = 0, globalPerMinute = 0, singleConversation = false, fullMessage = "这段对话已到上限，请新开一段" }) {
    this.runtime = runtime ? assertAgentRuntime(runtime) : null;
    this.enabled = Boolean(enabled && runtime);
    this.dir = path.join(rootDir, "conversations");
    this.perMinute = perMinute;
    this.maxMessages = maxMessages;
    this.maxText = maxText;
    this.now = now;
    this.activeUsers = new Set();
    this.activeSessions = new Set();
    this.recent = new Map();
    this.dedup = new Map();
    this.latestByOwner = null;
    this.ttlMs = ttlMs;
    this.globalPerMinute = globalPerMinute;
    this.globalRecent = [];
    this.singleConversation = singleConversation;
    this.fullMessage = fullMessage;
  }

  async availability() {
    if (!this.enabled) return { enabled: false, available: false, reason: "disabled", message: AGENT_ERRORS.disabled[1] };
    const { available, reason } = await this.runtime.status();
    return available
      ? { enabled: true, available: true, reason: null, message: "" }
      : { enabled: true, available: false, reason, message: new AgentRuntimeError(reason).publicMessage };
  }

  latest(userId) {
    const id = this.index().get(userId);
    return id ? this.get(id, userId) : null;
  }

  get(id, userId) {
    const record = this.load(id);
    return record && record.ownerId === userId ? this.view(record) : null;
  }

  list(userId) {
    if (!userId) return [];
    let names = [];
    try { names = fs.readdirSync(this.dir); } catch { return []; }
    const items = [];
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const record = this.load(name.slice(0, -5));
      if (!record || record.ownerId !== userId) continue;
      items.push(this.summary(record));
    }
    return items.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  summary(record) {
    const firstUser = record.messages.find(item => item.role === "user");
    const title = record.title || deriveTitle(firstUser?.text);
    const hasBrief = Boolean(record.editedBrief || [...record.messages].reverse().find(item => item.role === "assistant" && item.brief));
    return {
      id: record.id,
      title,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      messageCount: record.messages.length,
      hasBrief,
      pending: this.activeSessions.has(record.id),
      parentContext: record.parentContext || null,
    };
  }

  updateBrief(id, userId, patch = {}) {
    const record = this.load(id);
    if (!record || record.ownerId !== userId) return null;
    if (this.activeSessions.has(record.id)) throw clientError(409, "上一条消息还在回复，请稍后再保存");
    const current = this.currentBrief(record);
    if (!current) throw clientError(400, "当前对话尚未生成整理要求");
    let edits;
    try { edits = validateBriefPatch(patch); }
    catch (error) { throw clientError(400, error.message); }
    const nextBrief = { ...current, ...edits };
    if (!Object.hasOwn(edits, "prompt")) {
      nextBrief.prompt = rebuildPromptWithEdits(current.prompt, current, edits);
    }
    record.briefEdits = { ...(record.briefEdits || {}), ...edits };
    record.editedBrief = nextBrief;
    this.save(record);
    return this.view(record);
  }

  remove(id, userId) {
    const record = this.load(id);
    if (!record || record.ownerId !== userId) return null;
    if (this.activeSessions.has(record.id)) {
      try { this.runtime?.cancel(record.runtimeSessionRef); } catch { /* ignore */ }
      this.activeSessions.delete(record.id);
    }
    fs.rmSync(path.join(this.dir, `${record.id}.json`), { force: true });
    fs.rmSync(path.join(this.dir, `${record.id}.ref`), { force: true });
    this.latestByOwner = null;
    return { deleted: record.id };
  }

  readReference(id, userId) {
    const record = this.load(id);
    if (!record || record.ownerId !== userId || !record.reference?.mimeType) return null;
    try {
      const bytes = fs.readFileSync(path.join(this.dir, `${record.id}.ref`));
      return { bytes, mimeType: record.reference.mimeType, name: record.reference.name || "参考图" };
    } catch {
      return null;
    }
  }

  removeReference(id, userId) {
    const record = this.load(id);
    if (!record || record.ownerId !== userId) return null;
    fs.rmSync(path.join(this.dir, `${record.id}.ref`), { force: true });
    record.reference = null;
    this.save(record);
    return this.view(record);
  }

  async send(user, body = {}, options = {}) {
    if (!this.enabled) throw new AgentRuntimeError("disabled");
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text || text.length > this.maxText) throw clientError(400, `请输入 1–${this.maxText} 字`);
    const requestId = typeof body.requestId === "string" && REQUEST_ID.test(body.requestId) ? body.requestId : "";
    const dedupKey = requestId ? `${user.id}:${requestId}` : "";
    if (dedupKey) {
      this.pruneDedup();
      const hit = this.dedup.get(dedupKey);
      if (hit) return hit.promise ? hit.promise : hit.session;
    }
    let record = null;
    if (body.sessionId !== undefined && body.sessionId !== null && body.sessionId !== "") {
      record = this.load(body.sessionId);
      if (!record || record.ownerId !== user.id) throw clientError(404, "对话不存在");
    } else if (this.singleConversation) {
      const id = this.index().get(user.id);
      record = id ? this.load(id) : null;
    }
    const { parentContext, parentImage } = resolveParentContext(body, user, options.historyStore);
    const incomingRef = resolveIncomingReference(body, user, options.tasks);
    if (this.activeUsers.has(user.id)) throw clientError(429, "上一条消息还在回复，请稍候");
    const now = this.now();
    const recent = (this.recent.get(user.id) || []).filter(at => now - at < 60_000);
    const everyone = this.globalRecent.filter(at => now - at < 60_000);
    if (recent.length >= this.perMinute || (this.globalPerMinute && everyone.length >= this.globalPerMinute)) {
      const error = clientError(429, "发送太频繁，请稍后再试");
      const oldest = recent.length >= this.perMinute ? recent[0] : everyone[0];
      error.retryAfter = Math.max(1, Math.ceil((60_000 - (now - oldest)) / 1000));
      throw error;
    }
    if (record && record.messages.filter(message => message.role === "user").length >= this.maxMessages) {
      throw clientError(409, this.fullMessage);
    }
    const { available, reason } = await this.runtime.status();
    if (!available) throw new AgentRuntimeError(reason);
    // Re-check after the await so two requests cannot both pass the gate.
    if (this.activeUsers.has(user.id)) throw clientError(429, "上一条消息还在回复，请稍候");
    this.activeUsers.add(user.id);
    recent.push(now);
    this.recent.set(user.id, recent);
    everyone.push(now);
    this.globalRecent = everyone;
    const runPromise = (async () => {
      try {
      if (!record) {
        const { runtimeSessionRef } = await this.runtime.startSession();
        const at = new Date(now).toISOString();
        record = { schemaVersion: 1, id: randomUUID(), ownerId: user.id, runtimeSessionRef, title: deriveTitle(text), createdAt: at, updatedAt: at, messages: [] };
      }
      if (!record.title) record.title = deriveTitle(text);
      if (parentContext) record.parentContext = parentContext;
      else if (body.parentId === null) record.parentContext = null;
      if (body.clearReference) {
        fs.rmSync(path.join(this.dir, `${record.id}.ref`), { force: true });
        record.reference = null;
      } else if (incomingRef) {
        fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
        fs.writeFileSync(path.join(this.dir, `${record.id}.ref`), incomingRef.bytes, { mode: 0o600 });
        record.reference = { mimeType: incomingRef.mimeType, name: incomingRef.name, source: incomingRef.source };
      }
      const storedRef = incomingRef || (record.reference ? this.readReference(record.id, user.id) : null);
      const attachments = [];
      if (parentImage) attachments.push(parentImage);
      if (storedRef) attachments.push({ bytes: storedRef.bytes, mimeType: storedRef.mimeType, role: "reference", title: storedRef.name || "参考图" });
      let retrieval = designReferences(text);
      if (!retrieval.matches.length && /^(?:再|改为|保持|换成|收细|沿用|make it|keep it)/i.test(text)) {
        const previous = [...record.messages].reverse().find(item => item.role === "user" && designReferences(item.text).matches.length);
        if (previous) retrieval = designReferences(previous.text + "，" + text);
      }
      const runtimeText = buildRuntimePrompt(text, {
        designNotes: [retrieval.kind === "space" ? SPACE_DIRECTION : "", referenceNotes(retrieval.matches)].filter(Boolean).join("\n"),
        parentContext: parentContext || record.parentContext || null,
        hasParentImage: Boolean(parentImage),
        hasReferenceImage: Boolean(storedRef),
        briefEdits: record.briefEdits || null,
      });
      const message = { id: randomUUID(), role: "user", text, at: new Date(now).toISOString(), status: "pending" };
      record.messages.push(message);
      this.activeSessions.add(record.id);
      this.save(record);
      try { options.onSession?.(this.view(record)); } catch { /* ignore listener errors */ }
      let partialReply = "";
      let streamed = false;
      const emitDelta = chunk => {
        if (typeof chunk !== "string" || chunk.length <= partialReply.length) return;
        partialReply = chunk;
        streamed = true;
        try { options.onDelta?.(chunk); } catch { /* ignore listener errors */ }
      };
      try {
        // A failed reply is recorded and returned; it is never re-sent automatically.
        const payload = { runtimeSessionRef: record.runtimeSessionRef, text: runtimeText };
        if (attachments.length) payload.attachments = attachments;
        if (record.parentContext) payload.context = { parentContext: record.parentContext };
        if (options.onDelta) payload.onDelta = emitDelta;
        const reply = await this.runtime.sendMessage(payload);
        const result = this.runtime.readResult(reply.text);
        if (options.onDelta && !streamed && result.reply) {
          for (const step of progressiveChunks(result.reply)) emitDelta(step);
        }
        const mergedBrief = result.brief && record.briefEdits ? mergeEditedBrief(result.brief, record.briefEdits) : result.brief;
        if (mergedBrief) record.editedBrief = mergedBrief;
        message.status = "sent";
        record.messages.push({ id: randomUUID(), role: "assistant", text: result.reply, at: new Date(this.now()).toISOString(), brief: mergedBrief });
      } catch (error) {
        const failure = error instanceof AgentRuntimeError ? error : new AgentRuntimeError("failed");
        const received = partialReply || (typeof error?.partialText === "string" ? error.partialText.trim() : "");
        if (received && (failure.code === "cancelled" || failure.code === "timeout")) {
          message.status = "sent";
          record.messages.push({
            id: randomUUID(), role: "assistant", text: received, at: new Date(this.now()).toISOString(),
            status: "incomplete", error: failure.code, brief: null,
          });
        } else {
          message.status = "failed";
          message.error = failure.code;
        }
        this.activeSessions.delete(record.id);
        this.save(record);
        failure.session = this.view(record);
        throw failure;
      } finally {
        this.activeSessions.delete(record.id);
      }
      this.save(record);
      return this.view(record);
      } finally {
        this.activeUsers.delete(user.id);
      }
    })();
    if (dedupKey) {
      this.dedup.set(dedupKey, { promise: runPromise, at: now });
      runPromise.then(
        session => { this.dedup.set(dedupKey, { session, at: this.now() }); },
        () => { this.dedup.delete(dedupKey); },
      );
    }
    return runPromise;
  }

  cancel(id, userId) {
    const record = this.load(id);
    if (!record || record.ownerId !== userId) return null;
    return { cancelled: this.activeSessions.has(record.id) && this.runtime.cancel(record.runtimeSessionRef) };
  }

  view(record) {
    const pending = this.activeSessions.has(record.id);
    const messages = record.messages.map(message => {
      const status = message.status === "pending" && !pending ? "failed" : message.status;
      const error = status === "failed"
        ? (message.status === "pending" ? INTERRUPTED : new AgentRuntimeError(message.error).publicMessage)
        : status === "incomplete"
          ? new AgentRuntimeError(message.error || "cancelled").publicMessage
          : undefined;
      return {
        id: message.id, role: message.role, text: message.text, at: message.at,
        ...(status ? { status } : {}), ...(error ? { error } : {}),
        ...(message.role === "assistant" ? { brief: message.brief || null } : {}),
      };
    });
    const firstUser = record.messages.find(item => item.role === "user");
    return {
      id: record.id,
      title: record.title || deriveTitle(firstUser?.text),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      pending,
      messages,
      brief: this.currentBrief(record),
      parentContext: record.parentContext || null,
      reference: record.reference ? { name: record.reference.name, mimeType: record.reference.mimeType, source: record.reference.source } : null,
      remaining: Math.max(0, this.maxMessages - messages.filter(message => message.role === "user").length),
    };
  }

  currentBrief(record) {
    if (record.editedBrief) return record.editedBrief;
    const last = [...record.messages].reverse().find(message => message.role === "assistant" && message.brief);
    return last?.brief || null;
  }

  pruneDedup() {
    const cutoff = this.now() - 60_000;
    for (const [key, entry] of this.dedup) {
      if (!entry.promise && entry.at < cutoff) this.dedup.delete(key);
    }
  }

  load(id) {
    if (!SESSION_ID.test(String(id || ""))) return null;
    try {
      const record = JSON.parse(fs.readFileSync(path.join(this.dir, `${id}.json`), "utf8"));
      if (record?.schemaVersion !== 1 || record.id !== id || !Array.isArray(record.messages)) return null;
      return this.expired(record) ? null : record;
    } catch {
      return null;
    }
  }

  expired(record) {
    return Boolean(this.ttlMs) && this.now() - Date.parse(record.updatedAt) > this.ttlMs;
  }

  // Deletes expired conversations; returns how many were removed.
  sweep() {
    if (!this.ttlMs) return 0;
    let removed = 0, names = [];
    try { names = fs.readdirSync(this.dir); } catch { return 0; }
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const file = path.join(this.dir, name);
      try {
        const record = JSON.parse(fs.readFileSync(file, "utf8"));
        if (this.activeSessions.has(record.id) || !this.expired(record)) continue;
        fs.rmSync(file, { force: true });
        fs.rmSync(path.join(this.dir, `${record.id}.ref`), { force: true });
        removed += 1;
      } catch { /* unreadable files are left for inspection */ }
    }
    if (removed) this.latestByOwner = null;
    this.runtime?.prune?.(this.ttlMs);
    return removed;
  }

  save(record) {
    fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    record.updatedAt = new Date(this.now()).toISOString();
    const destination = path.join(this.dir, `${record.id}.json`);
    const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(record), { mode: 0o600 });
    fs.renameSync(temporary, destination);
    this.index().set(record.ownerId, record.id);
  }

  // Latest conversation per account, rebuilt from the files on first use.
  index() {
    if (this.latestByOwner) return this.latestByOwner;
    const latest = new Map(), stamps = new Map();
    let names = [];
    try { names = fs.readdirSync(this.dir); } catch { /* no conversations yet */ }
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const record = this.load(name.slice(0, -5));
      if (!record) continue;
      if (!stamps.has(record.ownerId) || record.updatedAt > stamps.get(record.ownerId)) {
        stamps.set(record.ownerId, record.updatedAt);
        latest.set(record.ownerId, record.id);
      }
    }
    this.latestByOwner = latest;
    return latest;
  }
}

function clientError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function deriveTitle(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return "新对话";
  return clean.length > 24 ? `${clean.slice(0, 24)}…` : clean;
}

function resolveParentContext(body, user, historyStore) {
  if (body.parentId === undefined || body.parentId === null || body.parentId === "") {
    return { parentContext: null, parentImage: null };
  }
  if (typeof body.parentId !== "string" || body.parentId.length > 80) throw clientError(400, "parentId 无效");
  if (!historyStore) throw clientError(404, "上一版不存在");
  const parent = historyStore.get(body.parentId);
  if (!parent || parent.ownerId !== user.id) throw clientError(404, "上一版不存在");
  const index = body.parentImageIndex == null ? 0 : Number(body.parentImageIndex);
  if (!Number.isSafeInteger(index) || index < 0) throw clientError(400, "上一版图片索引无效");
  const parentImage = historyStore.parentImage(parent, index);
  if (!parentImage) throw clientError(400, "上一版的图片不可用");
  return {
    parentContext: {
      parentId: parent.id,
      parentImageIndex: index,
      version: Number.isFinite(Number(body.parentVersion)) && Number(body.parentVersion) > 0 ? Math.floor(Number(body.parentVersion)) : null,
      title: String(parent.title || parent.workTitle || "").slice(0, 40),
    },
    parentImage,
  };
}

function resolveIncomingReference(body, user, tasks) {
  if (body.referenceTaskId != null && body.referenceTaskId !== "") {
    if (!tasks) throw clientError(400, "参考图不可用，请重新选择");
    const loaded = tasks.readReference({ referenceTaskId: body.referenceTaskId }, user.id);
    return { bytes: loaded.bytes, mimeType: loaded.mimeType, name: String(body.referenceName || "工作台参考图").slice(0, 80), source: "composer" };
  }
  if (body.referenceDataUrl == null || body.referenceDataUrl === "") return null;
  const data = body.referenceDataUrl;
  if (typeof data !== "string" || data.length > Math.ceil(MAX_REFERENCE_BYTES / 3) * 4 + 32) throw clientError(400, "参考图最多 2 MB");
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([a-z0-9+/]+={0,2})$/i.exec(data);
  if (!match) throw clientError(400, "请选择 PNG、JPEG 或 WebP 图片");
  const mimeType = match[1].toLowerCase();
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.toString("base64") !== match[2]) throw clientError(400, "参考图编码无效");
  if (bytes.length > MAX_REFERENCE_BYTES || !validateImageHeader(mimeType, bytes, 16_000_000)) {
    throw clientError(400, "参考图无效或超过 1600 万像素");
  }
  return {
    bytes,
    mimeType,
    name: String(body.referenceName || "参考图").slice(0, 80),
    source: body.referenceSource === "composer" ? "composer" : "chat",
  };
}

function buildRuntimePrompt(text, { parentContext, hasParentImage, hasReferenceImage, briefEdits, designNotes }) {
  const notes = designNotes ? [designNotes] : [];
  if (parentContext) {
    const label = parentContext.version ? `v${parentContext.version}` : "选中版本";
    const title = parentContext.title ? `（${parentContext.title}）` : "";
    notes.push(`当前基于工作台选中版本 ${label}${title} 继续修改${hasParentImage ? "，已附带该版本图片" : ""}`);
  }
  if (hasReferenceImage) notes.push("已附带用户提供的参考图，请结合图片造型、比例与材质追问或整理");
  if (briefEdits && Object.keys(briefEdits).length) {
    const parts = Object.entries(briefEdits).filter(([key]) => ["use", "size", "wood", "structure", "style"].includes(key)).map(([key, val]) => {
      const name = { use: "用途", size: "尺寸", wood: "木材", structure: "结构", style: "风格" }[key];
      return `${name}=${key === "style" ? (STYLE_LABELS[val] || val) : val}`;
    });
    if (parts.length) notes.push(`用户已手动修改并确认的要求：${parts.join("；")}，重新整理时请以这些值为准`);
  }
  return notes.length ? `[上下文：${notes.join("。")}。]\n${text}` : text;
}

function rebuildPromptWithEdits(basePrompt, previous, edits) {
  let next = String(basePrompt || "");
  for (const key of ["use", "size", "wood", "structure"]) {
    if (!Object.hasOwn(edits, key) || !edits[key] || edits[key] === previous[key]) continue;
    if (previous[key] && next.includes(previous[key])) next = next.replace(previous[key], edits[key]);
    else if (!next.includes(edits[key])) next = `${next}，${edits[key]}`;
  }
  if (Object.hasOwn(edits, "style") && edits.style !== previous.style) {
    const oldLabel = STYLE_LABELS[previous.style];
    const newLabel = STYLE_LABELS[edits.style];
    if (oldLabel && newLabel && next.includes(oldLabel)) next = next.replace(oldLabel, newLabel);
    else if (newLabel && !next.includes(newLabel)) next = `${next}，${newLabel}风格`;
  }
  return next.slice(0, 1000);
}

function mergeEditedBrief(incoming, edits) {
  const merged = { ...incoming, ...edits };
  if (!Object.hasOwn(edits, "prompt")) {
    merged.prompt = rebuildPromptWithEdits(incoming.prompt, incoming, edits);
  }
  return merged;
}

function progressiveChunks(text) {
  const clean = String(text || "");
  if (clean.length <= 12) return [clean];
  const splitAt = Math.max(8, Math.min(clean.length - 4, Math.ceil(clean.length / 2)));
  return [clean.slice(0, splitAt), clean];
}

module.exports = { DesignChat };
