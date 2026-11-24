import { ApiError, apiFetch, apiJson, jsonOptions } from "../modules/api.js";
import { studioCopy, uiCopy } from "../modules/locale.js";
import { openDialog } from "./dialog-focus.js";

// Pre-generation chat. The server keeps the conversation per account; this
// module only renders it and hands a finished brief to the composer.
const UNAVAILABLE = new Set(["disabled", "missing", "unconfigured", "auth", "gateway"]);
const FIELDS = [["use", "用途与空间"], ["size", "尺寸"], ["wood", "木材"], ["structure", "结构"], ["style", "风格"]];
const STYLE_NAMES = { ming: "明式", newChinese: "新中式", song: "宋韵", zen: "禅意" };
const MAX_REF_BYTES = 2 * 1024 * 1024;
const ALLOWED_REF_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const COMPOSER_REF_MENTION = /用工作台(?:那张|的?参考图|里?那张)|使用工作台(?:那张|的?参考图)/;

// A guest (no account) talks through /guest/design-chat with one conversation
// per browser session; an account always uses its own /design-chat.
export function initDesignChat({
  requireLogin,
  onApply,
  onGenerate,
  getSelectedVersion = () => null,
  getComposerReference = () => null,
  toolbar,
  guest = false,
}) {
  const el = id => document.getElementById(id);
  const modal = el("designChatModal"), log = el("designChatLog"), input = el("designChatInput");
  let user = null, enabled = false, session = null, sending = false, pollTimer, epoch = 0, entryAllowed = true;
  let draft = null, streamingText = "", editingBrief = false, savingBrief = false;
  let pendingRef = null, refCleared = false, conversations = [], historyOpen = false;
  const base = () => user ? "/design-chat" : "/guest/design-chat";
  const active = () => Boolean(user) || guest;

  const call = (path, body, method = body === undefined ? "GET" : "POST") => {
    const signal = AbortSignal.timeout(body === undefined ? 15000 : 150000);
    return apiJson(path, body === undefined ? { method, signal } : jsonOptions(body, { method, signal }));
  };

  function alert(message, direct = false) {
    el("designChatAlert").hidden = !message;
    el("designChatAlertText").textContent = message || "";
    el("designChatDirect").hidden = !direct;
  }

  function syncViewport() {
    const vv = window.visualViewport;
    if (!modal.open || !vv || window.innerWidth > 720) {
      modal.style.removeProperty("--chat-vvh");
      return;
    }
    modal.style.setProperty("--chat-vvh", `${Math.round(vv.height)}px`);
    log.scrollTop = log.scrollHeight;
  }

  function item(role, text, extra = {}) {
    const li = document.createElement("li");
    li.className = "design-chat-message";
    li.dataset.role = role;
    if (extra.status) li.dataset.status = extra.status;
    const body = document.createElement("p");
    body.textContent = text;
    if (extra.copy) body.dataset.uiCopy = "";
    li.append(body);
    if (extra.status === "incomplete") {
      const note = document.createElement("p");
      note.className = "design-chat-incomplete";
      const tag = document.createElement("span");
      tag.className = "yui-badge";
      tag.dataset.tone = "warning";
      tag.dataset.uiCopy = "";
      tag.textContent = uiCopy("未完成");
      note.append(tag);
      if (extra.error) {
        const reason = document.createElement("span");
        reason.dataset.uiCopy = "";
        reason.textContent = uiCopy(extra.error);
        note.append(" ", reason);
      }
      li.append(note);
    } else if (extra.error) {
      const note = document.createElement("p");
      note.className = "design-chat-error";
      note.dataset.uiCopy = "";
      note.textContent = extra.error;
      li.append(note);
    }
    if (extra.pending) li.setAttribute("aria-busy", "true");
    return li;
  }

  function renderContextBadge() {
    const badge = el("designChatContext");
    const selected = getSelectedVersion?.() || session?.parentContext || null;
    if (!selected) {
      badge.hidden = true;
      badge.textContent = "";
      return;
    }
    const label = selected.version ? `v${selected.version}` : "";
    const title = selected.title ? ` · ${selected.title}` : "";
    badge.textContent = `${uiCopy("基于")} ${label}${title}`.trim();
    badge.hidden = false;
  }

  function renderReferenceBar() {
    const composerRef = getComposerReference?.();
    const hasServerRef = Boolean(session?.reference && !refCleared);
    const hasPendingRef = Boolean(pendingRef);
    const hasAnyRef = hasPendingRef || hasServerRef;
    const preview = el("designChatRefPreview");
    const useBtn = el("designChatUseComposerRef");
    if (hasAnyRef) {
      const thumb = el("designChatRefThumb");
      const name = el("designChatRefName");
      if (hasPendingRef) {
        thumb.src = pendingRef.previewSrc || pendingRef.dataUrl || "";
        name.textContent = pendingRef.name || uiCopy("参考图");
      } else {
        thumb.src = `/api/v1${base()}/${encodeURIComponent(session.id)}/reference`;
        name.textContent = session.reference.name || uiCopy("参考图");
      }
      preview.hidden = false;
    } else {
      el("designChatRefThumb").removeAttribute("src");
      el("designChatRefName").textContent = "";
      preview.hidden = true;
    }
    useBtn.hidden = !composerRef || hasAnyRef;
    el("designChatRefBar").hidden = preview.hidden && useBtn.hidden;
  }

  function renderHistoryList() {
    const btn = el("designChatHistoryBtn");
    const panel = el("designChatHistory");
    const list = el("designChatHistoryList");
    const empty = el("designChatHistoryEmpty");
    const canList = Boolean(user);
    btn.hidden = !canList;
    btn.setAttribute("aria-expanded", String(historyOpen && canList));
    panel.hidden = !canList || !historyOpen;
    if (!canList || !historyOpen) return;
    empty.hidden = conversations.length > 0;
    list.replaceChildren(...conversations.map(conv => {
      const li = document.createElement("li");
      li.className = "design-chat-history__item";
      if (conv.id === session?.id) li.setAttribute("aria-current", "true");
      const openBtn = document.createElement("button");
      openBtn.type = "button";
      openBtn.className = "design-chat-history__open";
      openBtn.dataset.chatOpen = conv.id;
      const titleSpan = document.createElement("span");
      titleSpan.className = "design-chat-history__title";
      titleSpan.textContent = conv.title || uiCopy("新对话");
      const metaSpan = document.createElement("span");
      metaSpan.className = "design-chat-history__meta";
      metaSpan.textContent = `${conv.messageCount || 0}`;
      openBtn.append(titleSpan, metaSpan);
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "yui-button design-chat-history__delete";
      delBtn.dataset.variant = "ghost";
      delBtn.dataset.size = "sm";
      delBtn.dataset.chatDelete = conv.id;
      delBtn.dataset.uiCopy = "";
      delBtn.textContent = uiCopy("删除");
      li.append(openBtn, delBtn);
      return li;
    }));
  }

  function render() {
    const messages = session?.messages || [];
    const items = messages.map(message => item(message.role, message.text, {
      status: message.status,
      error: message.status === "failed" || message.status === "incomplete" ? message.error : "",
    }));
    if (draft) items.push(item("user", draft));
    if (sending || session?.pending) {
      const waiting = streamingText
        ? item("assistant", streamingText, { pending: true })
        : item("assistant", "回复中…", { copy: true, pending: true });
      if (!streamingText) waiting.prepend(Object.assign(document.createElement("span"), { className: "yui-spinner" }));
      items.push(waiting);
    }
    if (!items.length) items.push(item("assistant", "想做一件什么家具？说说用途和放在哪里。", { copy: true }));
    log.replaceChildren(...items);
    log.scrollTop = log.scrollHeight;
    requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });

    const brief = session?.brief;
    el("designChatBrief").hidden = !brief;
    if (brief) {
      el("designChatBriefPrompt").textContent = brief.prompt;
      const rows = FIELDS.filter(([key]) => brief[key]).map(([key, label]) => [label, key === "style" ? STYLE_NAMES[brief.style] : brief[key], key === "style"]);
      if (brief.constraints.length) rows.push(["要点", brief.constraints.join("；"), false]);
      el("designChatBriefFields").replaceChildren(...rows.flatMap(([label, text, productCopy]) => {
        const term = Object.assign(document.createElement("dt"), { textContent: label });
        term.dataset.uiCopy = "";
        const value = Object.assign(document.createElement("dd"), { textContent: text });
        if (productCopy) value.dataset.uiCopy = "";
        return [term, value];
      }));
      el("designChatBriefFields").hidden = editingBrief;
      el("designChatBriefPrompt").hidden = editingBrief;
      el("designChatBriefEditor").hidden = !editingBrief;
      el("designChatEditBrief").hidden = editingBrief || !session?.id;
      el("designChatSaveBrief").disabled = savingBrief;
    } else {
      editingBrief = false;
      el("designChatBriefEditor").hidden = true;
    }
    const busy = sending || Boolean(session?.pending);
    const full = session?.remaining === 0;
    input.disabled = busy || full || !enabled;
    el("designChatAttachRef").disabled = busy || !enabled;
    el("designChatRemoveRef").disabled = busy;
    el("designChatUseComposerRef").disabled = busy;
    el("designChatApply").hidden = !brief || busy || editingBrief;
    el("designChatGenerate").hidden = !brief || busy || editingBrief;
    el("designChatSend").dataset.variant = brief && !busy ? "secondary" : "primary";
    el("designChatSend").textContent = uiCopy(busy && session?.id ? "停止" : "发送");
    el("designChatSend").dataset.busy = String(busy);
    el("designChatSend").disabled = !enabled || (busy && !session?.id) || (!busy && full);
    el("designChatNew").disabled = busy || !session;
    el("designChatNew").hidden = !user;
    if (full && !busy) alert("这段对话已到上限，请新开一段");
    renderContextBadge();
    renderReferenceBar();
    renderHistoryList();
  }

  function updateEntry() {
    el("designChatButton").hidden = !enabled || !entryAllowed;
  }

  function adopt(next) {
    session = next || null;
    editingBrief = false;
    clearTimeout(pollTimer);
    if (session?.pending) pollTimer = setTimeout(() => void refresh(epoch), 2000);
    render();
  }

  async function refreshConversations(stamp = epoch) {
    if (!user || !enabled) return;
    try {
      const result = await call(`${base()}/conversations`);
      if (stamp !== epoch) return;
      conversations = Array.isArray(result.conversations) ? result.conversations : [];
      renderHistoryList();
    } catch { /* keep existing list */ }
  }

  async function refresh(stamp) {
    if (!session?.id) return;
    try {
      const result = await call(`${base()}/${encodeURIComponent(session.id)}`);
      if (stamp === epoch) adopt(result.session);
    } catch {
      if (stamp === epoch) pollTimer = setTimeout(() => void refresh(stamp), 4000);
    }
  }

  async function load(stamp) {
    try {
      const result = await call(base());
      if (stamp !== epoch) return;
      enabled = Boolean(result.enabled);
      conversations = Array.isArray(result.conversations) ? result.conversations : [];
      alert(result.enabled && !result.available ? result.message : "", true);
      adopt(result.session);
    } catch {
      if (stamp !== epoch) return;
      enabled = false;
    }
    updateEntry();
  }

  async function sendStream(payload, stamp) {
    const signal = AbortSignal.timeout(150000);
    const response = await apiFetch(`${base()}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(payload),
      signal,
    });
    const contentType = String(response.headers.get("content-type") || "");
    if (!contentType.includes("text/event-stream")) {
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) {
        throw new ApiError(data.message || `请求失败（${response.status}）`, response.status, data);
      }
      return data.session;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let finalSession = null;
    const processFrame = frame => {
      if (!frame.trim()) return;
      let eventName = "message";
      const dataLines = [];
      for (const line of frame.split(/\r?\n/)) {
        if (line.startsWith("event:")) eventName = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      if (!dataLines.length) return;
      let data;
      try { data = JSON.parse(dataLines.join("\n")); } catch { return; }
      if (stamp !== epoch) return;
      if (eventName === "session" && data.session) {
        session = { ...(session || {}), ...data.session, messages: session?.messages || [] };
        el("designChatSend").textContent = uiCopy("停止");
        el("designChatSend").disabled = false;
      } else if (eventName === "delta" && typeof data.text === "string") {
        streamingText = data.text;
        const live = log.querySelector('.design-chat-message[aria-busy="true"]');
        if (live) {
          live.querySelector(".yui-spinner")?.remove();
          const p = live.querySelector("p");
          if (p) p.textContent = streamingText;
          log.scrollTop = log.scrollHeight;
        } else {
          render();
        }
      } else if (eventName === "done") {
        finalSession = data.session;
      } else if (eventName === "error") {
        throw new ApiError(data.message || "对话失败", data.statusCode || 500, data);
      }
    };
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        processFrame(frame);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) processFrame(buffer);
    if (!finalSession) throw new ApiError("回复中断，请重新发送", 502, {});
    return finalSession;
  }

  function buildSendPayload(text) {
    const payload = { text, requestId: crypto.randomUUID(), ...(session?.id ? { sessionId: session.id } : {}) };
    const selected = getSelectedVersion?.();
    if (selected?.parentId) {
      payload.parentId = selected.parentId;
      payload.parentImageIndex = selected.parentImageIndex ?? 0;
      if (selected.version) payload.parentVersion = selected.version;
    }
    let refToSend = pendingRef;
    if (!refToSend && !session?.reference && COMPOSER_REF_MENTION.test(text)) {
      const composerRef = getComposerReference?.();
      if (composerRef) {
        refToSend = { ...composerRef, source: "composer" };
        pendingRef = refToSend;
      }
    }
    if (refCleared) {
      payload.clearReference = true;
    } else if (refToSend) {
      if (refToSend.attachment?.referenceTaskId) {
        payload.referenceTaskId = refToSend.attachment.referenceTaskId;
      } else if (refToSend.attachment?.referenceDataUrl || refToSend.dataUrl) {
        payload.referenceDataUrl = refToSend.attachment?.referenceDataUrl || refToSend.dataUrl;
      }
      payload.referenceName = refToSend.name || "参考图";
      payload.referenceSource = refToSend.source || "chat";
    }
    return payload;
  }

  async function send() {
    const text = input.value.trim();
    if (!text || sending || session?.pending) return;
    const payload = buildSendPayload(text);
    sending = true; draft = text; streamingText = ""; input.value = ""; alert("");
    const stamp = epoch;
    render();
    try {
      const nextSession = await sendStream(payload, stamp);
      if (stamp !== epoch) return;
      draft = null; streamingText = ""; sending = false; pendingRef = null; refCleared = false;
      adopt(nextSession);
      void refreshConversations(stamp);
    } catch (error) {
      if (stamp !== epoch) return;
      sending = false; streamingText = "";
      const failed = error.payload?.session;
      // A request that never reached the model keeps the text for another try.
      if (!failed) input.value = text;
      draft = null;
      if (failed) adopt(failed); else render();
      void refreshConversations(stamp);
      // The server may still be answering after a browser timeout; read its state.
      if (error.name === "TimeoutError") void refresh(stamp);
      alert(error.name === "TimeoutError" ? "对话模型回复超时，请重新发送" : error.message, UNAVAILABLE.has(error.payload?.reason));
      if (UNAVAILABLE.has(error.payload?.reason) || error.status === 429) return;
      input.focus();
    }
  }

  async function stop() {
    if (!session?.id) return;
    try { await call(`${base()}/${encodeURIComponent(session.id)}/cancel`, {}); } catch { /* the reply ends on its own */ }
  }

  async function readRefFile(file) {
    if (!file) return;
    if (!ALLOWED_REF_TYPES.has(file.type) || file.size > MAX_REF_BYTES) {
      alert(studioCopy("brief.invalid"));
      return;
    }
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error());
        reader.readAsDataURL(file);
      });
      const img = new Image();
      img.src = dataUrl;
      await img.decode();
      if (img.naturalWidth * img.naturalHeight > 16000000) throw new Error();
      pendingRef = { dataUrl, previewSrc: dataUrl, name: file.name, source: "chat" };
      refCleared = false;
      alert("");
      render();
    } catch {
      alert(studioCopy("brief.invalid"));
    } finally {
      el("designChatRefFile").value = "";
    }
  }

  function currentChatReferenceForComposer() {
    if (pendingRef?.dataUrl) return { dataUrl: pendingRef.dataUrl, name: pendingRef.name };
    return null;
  }

  async function openBriefEditor() {
    const brief = session?.brief;
    if (!brief || !session?.id) return;
    editingBrief = true;
    el("briefEditUse").value = brief.use || "";
    el("briefEditSize").value = brief.size || "";
    el("briefEditWood").value = brief.wood || "";
    el("briefEditStructure").value = brief.structure || "";
    el("briefEditStyle").value = brief.style || "newChinese";
    el("briefEditStyle").dispatchEvent(new Event("change", { bubbles: true }));
    render();
    el("briefEditUse").focus();
  }

  async function saveBriefEdits() {
    if (!session?.id || savingBrief) return;
    savingBrief = true;
    render();
    try {
      const result = await call(`${base()}/${encodeURIComponent(session.id)}/brief`, {
        use: el("briefEditUse").value,
        size: el("briefEditSize").value,
        wood: el("briefEditWood").value,
        structure: el("briefEditStructure").value,
        style: el("briefEditStyle").value,
      }, "PATCH");
      editingBrief = false;
      alert("");
      adopt(result.session);
    } catch (error) {
      alert(error.message || "保存失败");
    } finally {
      savingBrief = false;
      render();
    }
  }

  el("designChatForm").addEventListener("submit", event => {
    event.preventDefault();
    if (el("designChatSend").dataset.busy === "true") void stop(); else void send();
  });
  input.addEventListener("keydown", event => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); el("designChatForm").requestSubmit(); }
  });
  el("designChatNew").addEventListener("click", () => {
    epoch += 1; clearTimeout(pollTimer); session = null; draft = null; streamingText = ""; pendingRef = null; refCleared = false; editingBrief = false; historyOpen = false; alert(""); render(); input.focus();
  });
  el("designChatEditBrief").addEventListener("click", () => void openBriefEditor());
  el("designChatCancelBrief").addEventListener("click", () => { editingBrief = false; render(); });
  el("designChatSaveBrief").addEventListener("click", () => void saveBriefEdits());
  el("designChatAttachRef").addEventListener("click", () => el("designChatRefFile").click());
  el("designChatRefFile").addEventListener("change", event => void readRefFile(event.target.files?.[0]));
  el("designChatUseComposerRef").addEventListener("click", () => {
    const composerRef = getComposerReference?.();
    if (!composerRef) return;
    pendingRef = { ...composerRef, source: "composer" };
    refCleared = false;
    render();
  });
  el("designChatRemoveRef").addEventListener("click", async () => {
    pendingRef = null;
    if (session?.id && session.reference) {
      try {
        const result = await call(`${base()}/${encodeURIComponent(session.id)}/reference`, undefined, "DELETE");
        refCleared = false;
        adopt(result.session);
        return;
      } catch {
        refCleared = true;
      }
    }
    render();
  });
  el("designChatHistoryBtn").addEventListener("click", () => {
    historyOpen = !historyOpen;
    renderHistoryList();
    if (historyOpen) void refreshConversations(epoch);
  });
  el("designChatHistoryList").addEventListener("click", async event => {
    const delBtn = event.target.closest("[data-chat-delete]");
    if (delBtn) {
      const id = delBtn.dataset.chatDelete;
      try {
        await call(`${base()}/${encodeURIComponent(id)}`, undefined, "DELETE");
        conversations = conversations.filter(item => item.id !== id);
        if (session?.id === id) {
          session = null; pendingRef = null; refCleared = false; editingBrief = false;
          if (conversations.length) {
            const next = await call(`${base()}/${encodeURIComponent(conversations[0].id)}`);
            adopt(next.session);
          } else {
            render();
          }
        } else {
          renderHistoryList();
        }
      } catch (error) {
        alert(error.message || "删除失败");
      }
      return;
    }
    const openBtn = event.target.closest("[data-chat-open]");
    if (openBtn) {
      const id = openBtn.dataset.chatOpen;
      try {
        const result = await call(`${base()}/${encodeURIComponent(id)}`);
        historyOpen = false; pendingRef = null; refCleared = false;
        adopt(result.session);
      } catch (error) {
        alert(error.message || "无法打开该对话");
      }
    }
  });
  // Focus moves to the composer after the dialog has returned focus to its opener.
  function closeInto(brief) {
    const ref = currentChatReferenceForComposer();
    modal.addEventListener("close", () => onApply(brief, { chatReference: ref }), { once: true });
    modal.close();
  }
  el("designChatApply").addEventListener("click", () => { if (session?.brief) closeInto(session.brief); });
  el("designChatGenerate").addEventListener("click", async () => {
    if (!session?.brief || !onGenerate) return;
    const result = await onGenerate(session.brief, { chatReference: currentChatReferenceForComposer() });
    if (!result?.ok) {
      alert(result?.message || "暂时无法生成");
      return;
    }
    modal.addEventListener("close", () => result.start?.(), { once: true });
    modal.close();
  });
  el("designChatDirect").addEventListener("click", () => closeInto(null));
  el("designChatButton").addEventListener("click", event => {
    const opener = toolbar.closeTools(event.currentTarget);
    if (!active()) { requireLogin(); return; }
    render();
    openDialog(modal, opener);
    syncViewport();
    if (user) void refreshConversations(epoch);
    if (!input.disabled) input.focus();
  });
  modal.addEventListener("close", () => { historyOpen = false; modal.style.removeProperty("--chat-vvh"); });
  window.visualViewport?.addEventListener("resize", syncViewport);
  window.addEventListener("musheng:locale-change", () => { if (modal.open) render(); });

  return {
    setUser(next) {
      epoch += 1; clearTimeout(pollTimer);
      user = next; enabled = false; session = null; sending = false; draft = null; streamingText = ""; pendingRef = null; refCleared = false; editingBrief = false; conversations = []; historyOpen = false; input.value = ""; alert("");
      if (modal.open) modal.close();
      updateEntry();
      if (active()) void load(epoch);
    },
    setEntryAllowed(allowed) {
      entryAllowed = allowed;
      updateEntry();
    },
  };
}
