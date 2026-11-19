import { apiJson, jsonOptions, safeImageUrl } from "./modules/api.js";
import "./modules/dock.js";
import { mountGrowthRings } from "./modules/contours.js";
import { ACTIVE, PHASES, DIMENSIONS, score, escapeHtml, requirementTags, regionDescription, versionNodes, parentVersion, layoutNodes, familyRecords, suggestions, generationPayload } from "./studio/model.js";
import { createCanvas, enableRegion } from "./studio/canvas.js";
import { mountDraft, revealImage, downloadImage, exportPage } from "./studio/media.js";
import { initSession } from "./studio/session.js";
import { createDemo } from "./studio/demo.js";
import { pendingUiCopy, uiCopy } from "./modules/locale.js";
import { openDialog } from "./studio/dialog-focus.js";

const $ = id => document.getElementById(id);
const demo = new URLSearchParams(location.search).get("demo");
// A description handed over from the home page fills the composer once.
let handedPrompt = new URLSearchParams(location.search).get("prompt");
if (handedPrompt) {
  $("promptInput").value = handedPrompt.slice(0, 1000);
  const url = new URL(location.href);
  url.searchParams.delete("prompt");
  history.replaceState(history.state, "", url);
}
const request = demo ? createDemo(demo) : (path, body, method = body === undefined ? "GET" : "POST", signal) => {
  const timeout = AbortSignal.timeout(15000);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  return apiJson(path, body === undefined ? { method, signal: requestSignal } : jsonOptions(body, { method, signal: requestSignal }));
};
let currentUser = null, epoch = 0, abort = new AbortController();
let records = [], nodes = [], positions = new Map(), selectedKey = null, activeRoot = null;
let retryError = null;
let task = null, submitting = false, uncertainRequest = null, pollTimer, toastTimer, pollBusy = false;
let compareSource = null, compareOpener = null;
let mode = "normal", regionTarget = null, regionBox = null, regionCleanup = null;
let memory = [], rings = null, renderSignature = "", pendingId = null, pendingField = null, pendingStarted = 0;
let engineModes = null, historyRevision = 0, quota = null;
const cleanups = [], revealed = new Set();
const canvas = createCanvas($("canvasViewport"), $("canvasWorld"), percentage => {
  $("zoomReset").textContent = `${percentage}%`;
  document.body.dataset.compactActions = String(percentage < 88);
});
// TODO_TEXT:work.untitled
// Default names are placeholders. A stored or typed name is user data.
// TODO_TEXT:work.fallbackTitle
function recordTitle(record) {
  const title = record?.title;
  if (title === "未命名家具方案" && !record.originalPrompt && record.finalPrompt !== title) return "";
  return title || "";
}
function titleMarkup(record) {
  const title = recordTitle(record);
  return title ? escapeHtml(title) : '<span data-ui-copy>家具方案</span>';
}
function versionMarkup(node) {
  return `v${node.version} · ${titleMarkup(node.record)}`;
}
const selected = () => nodes.find(node => node.key === selectedKey);
const alive = stamp => stamp === epoch;
const storeKey = () => `musheng-v3-task:${demo ? `demo-${demo}:` : ""}${currentUser?.id}`;
function readStored() { try { return JSON.parse(localStorage.getItem(storeKey())); } catch { return null; } }
function storeTask(value) { try { if (value) localStorage.setItem(storeKey(), JSON.stringify(value)); else localStorage.removeItem(storeKey()); } catch { /* Server recovery also works without storage. */ } }
function notify(message) {
  clearTimeout(toastTimer); $("toast").textContent = message; $("toast").hidden = !message;
  toastTimer = setTimeout(() => { $("toast").hidden = true; }, 6000);
}
let connectionMessage = "";
function updateConnection() {
  const offline = Boolean(connectionMessage);
  const state = offline ? "连接中断" : engineModes ? "服务已连接" : "模型待连接";
  $("modelStatus").dataset.offline = $("mobileConnection").dataset.offline = String(offline);
  $("modelStatus").textContent = uiCopy(state);
  const detail = uiCopy(connectionMessage || state);
  $("mobileConnectionToggle").setAttribute("aria-label", detail);
  $("mobileConnectionText").textContent = detail;
}
function connection(message = "") {
  connectionMessage = message;
  // On narrow screens the disclosure gives access to the same full status.
  $("connectionBanner").textContent = message; $("connectionBanner").hidden = !message;
  updateConnection();
  if (pendingField) pendingField.pause();
}
function updateMobileLocale() {
  const menu = $("mobileLocale");
  $("mobileLocaleValue").textContent = menu.querySelector('[aria-pressed="true"]')?.textContent || "中";
  if (menu.open) { menu.open = false; $("mobileLocaleToggle").focus(); }
}
window.addEventListener("musheng:locale-change", () => { updateMobileLocale(); updateConnection(); });
updateMobileLocale();
for (const id of ["mobileConnection", "mobileLocale"]) {
  const menu = $(id);
  document.addEventListener("click", event => { if (menu.open && !menu.contains(event.target)) menu.open = false; });
  document.addEventListener("keydown", event => {
    if (menu.open && event.key === "Escape") { menu.open = false; menu.querySelector("summary").focus(); }
  });
}
const session = initSession({ request, notify, onUser: user => {
  epoch += 1; abort.abort(); abort = new AbortController();
  clearTimeout(pollTimer); pollBusy = false; historyRevision += 1;
  retryError = null;
  currentUser = user; records = []; nodes = []; selectedKey = null; activeRoot = null; task = null; submitting = false; uncertainRequest = null;
  memory = []; renderSignature = ""; regionCleanup?.(); regionCleanup = null;
  notify(""); $("historyFilterInput").value = "";
  revealed.clear(); $("compareA").removeAttribute("src"); $("compareB").removeAttribute("src");
  $("workTitle").value = "";
  $("historyGrid").replaceChildren(); $("reviewPrompt").textContent = "";
  for (const dialog of document.querySelectorAll("dialog[open]:not(#profileModal)")) dialog.close();
  render(); renderMemory(); renderHistory(); connection();
  if (user) void restoreWorkspace(epoch);
} });

function updateComposer() {
  const node = selected(); const busy = submitting || ACTIVE.has(task?.status);
  $("selectionContext").hidden = !node;
  $("selectionLabel").textContent = node ? `${uiCopy("基于")} v${node.version} · ${recordTitle(node.record) || uiCopy("家具方案")}` : "";
  $("promptInput").placeholder = uiCopy(node ? `对 v${node.version} 说：扶手再薄一点…` : "描述一件家具，或选一个版本继续修改…");
  $("generateButton").textContent = busy ? uiCopy("停止") : node ? `${uiCopy("修改")} v${node.version}` : uiCopy("生成 ↗");
  $("generateButton").dataset.busy = String(busy);
  const left = quota?.generation, empty = left?.remaining === 0;
  $("quotaHint").hidden = !left || left.remaining > 5;
  $("quotaHint").dataset.empty = String(empty);
  $("quotaHint").textContent = !left ? "" : empty ? `${left.resetAt ? new Date(left.resetAt).toLocaleTimeString(document.documentElement.lang, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : ""} ${uiCopy("恢复")}`.trim() : `${uiCopy("剩")} ${left.remaining}`;
  $("generateButton").disabled = Boolean(uncertainRequest) || submitting || (!busy && empty);
  $("promptInput").required = !busy;
  $("exportButton").disabled = !node?.image?.url;
  $("newWorkButton").disabled = busy;
  $("mobileNewWorkButton").disabled = busy;
  updateCompactActions(node);
}
function updateCompactActions(node) {
  const retry = task?.status === "failed" || task?.status === "cancelled" || (task?.stopRequested && !ACTIVE.has(task.status));
  $("compactActions").hidden = !retry && !node?.image?.url;
  for (const button of $("compactActions").querySelectorAll("button")) {
    button.hidden = button.dataset.action === "retry" ? !retry : !node?.image?.url;
    button.disabled = ["rerun", "retry"].includes(button.dataset.action)
      && (submitting || Boolean(uncertainRequest) || ACTIVE.has(task?.status));
  }
}
window.addEventListener("musheng:locale-change", updateComposer);
function selectNode(key, center = false) {
  selectedKey = key;
  for (const card of $("versionCards").querySelectorAll(".version-card")) {
    card.classList.toggle("selected", card.dataset.key === key);
    card.querySelector('[data-action="select"]')?.setAttribute("aria-pressed", String(card.dataset.key === key));
  }
  updateComposer(); renderReview();
  if (center) canvas.center(positions.get(key));
}
function render() {
  const visible = activeRoot === "new" ? [] : activeRoot ? familyRecords(records, activeRoot) : records;
  nodes = versionNodes(visible); positions = layoutNodes(nodes);
  if (selectedKey && !nodes.some(node => node.key === selectedKey)) selectedKey = nodes.at(-1)?.key || null;
  const signature = JSON.stringify(nodes);
  if (signature !== renderSignature) {
    renderSignature = signature; cleanups.splice(0).forEach(cleanup => cleanup()); regionCleanup?.(); regionCleanup = null;
    const pending = $("versionCards").querySelector("[data-pending]");
    $("versionCards").replaceChildren();
    for (const node of nodes) {
      const card = document.createElement("article"); card.className = "version-card"; card.dataset.key = node.key;
      card.setAttribute("aria-labelledby", `version-name-${node.version}`);
      const position = positions.get(node.key); card.style.left = `${position.x}px`; card.style.top = `${position.y}px`;
      const src = safeImageUrl(node.image?.url, { allowData: true });
      card.innerHTML = `<header><button type="button" class="version-number" data-action="select" aria-describedby="version-name-${node.version}" aria-pressed="false">v${node.version}</button><h2 id="version-name-${node.version}">${titleMarkup(node.record)}</h2><span class="card-score" aria-label="评分" data-ui-attrs="aria-label">${score(node.evaluation?.score) ?? "—"}</span></header><div class="card-media">${src ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(recordTitle(node.record) || "家具设计结果")}" ${recordTitle(node.record) ? "" : 'data-ui-attrs="alt"'} draggable="false" />` : '<p class="card-message" data-ui-copy>图片不可用</p>'}</div><div class="card-actions"><button type="button" data-ui-copy data-action="region">改一处</button><button type="button" data-ui-copy data-action="rerun">再来一版</button><button type="button" data-ui-copy data-action="compare">对比</button><button type="button" data-ui-copy data-action="download">下载</button></div>`;
      const img = card.querySelector("img");
      // TODO_TEXT:work.imageUnavailable
      if (img) {
        img.addEventListener("error", () => { const p = document.createElement("p"); p.className = "card-message"; p.dataset.uiCopy = ""; p.textContent = "图片加载失败，请检查连接后刷新"; img.replaceWith(p); });
        if (!revealed.has(node.key)) { revealed.add(node.key); cleanups.push(revealImage(card.querySelector(".card-media"), img)); }
      }
      $("versionCards").append(card);
    }
    if (pending) $("versionCards").append(pending);
  }
  $("emptyState").hidden = Boolean(nodes.length || task || submitting || uncertainRequest);
  $("canvasTools").hidden = !nodes.length && !task;
  renderPending(); drawEdges(); selectNode(selectedKey); renderHistory();
}
function renderPending() {
  const show = task && (ACTIVE.has(task.status) || task.status === "failed" || task.status === "cancelled" || task.stopRequested);
  if (!show) { $("versionCards").querySelector("[data-pending]")?.remove(); pendingField?.destroy(); pendingField = null; pendingId = null; return; }
  let card = $("versionCards").querySelector("[data-pending]");
  if (!card || pendingId !== task.id) {
    card?.remove(); pendingField?.destroy();
    card = document.createElement("article"); card.className = "version-card"; card.dataset.pending = "true";
    card.innerHTML = '<header><span class="version-number" data-ui-copy>下一版</span><h2>家具方案</h2></header><div class="card-media"><div class="card-tags"></div></div><div class="card-phase" data-ui-copy role="status"></div><p class="card-message" data-ui-copy></p><div class="card-actions"><button type="button" data-ui-copy data-action="retry">再试一次</button></div>';
    const alert = document.createElement("div");
    alert.className = "yui-alert task-failure";
    alert.innerHTML = '<span class="task-failure-reason"></span><p class="task-retry-error" hidden></p>';
    alert.dataset.tone = "danger";
    alert.setAttribute("role", "alert");
    alert.hidden = true;
    card.querySelector(".card-media").before(alert);
    $("versionCards").append(card); pendingId = task.id; pendingStarted = Date.now();
    const parentKey = parentVersion(nodes, task.request)?.key;
    const parentImage = [...$("versionCards").querySelectorAll("[data-key]")].find(item => item.dataset.key === parentKey)?.querySelector("img");
    pendingField = mountDraft(card.querySelector(".card-media"), parentImage?.complete && parentImage.naturalWidth ? parentImage : undefined);
    const tags = requirementTags(task.request?.originalPrompt || task.request?.prompt || "");
    card.querySelector(".card-tags").innerHTML = tags.map((text, i) => `<span style="animation-delay:${i * 140}ms">${escapeHtml(text)}</span>`).join("");
  }
  const own = nodes.filter(node => node.historyId === task.result?.historyRecord?.id);
  const parent = own.at(-1) || parentVersion(nodes, task.request);
  const p = positions.get(parent?.key) || { x: -408, y: 0 };
  const x = p.x + 408, y = p.y;
  card.style.left = `${x}px`; card.style.top = `${y}px`; card.dataset.status = task.status;
  const heading = card.querySelector("h2");
  const title = task.request?.originalPrompt?.slice(0, 30);
  heading.textContent = title || "家具方案";
  heading.toggleAttribute("data-ui-copy", !title);
  const stopped = task.stopRequested && !ACTIVE.has(task.status);
  const phase = task.phase === "generating" && Date.now() - pendingStarted < 2000 ? "起稿" : PHASES[task.phase] || "等待任务";
  const failed = task.status === "failed";
  const status = card.querySelector(".card-phase"), message = card.querySelector(".card-message");
  const alert = card.querySelector(".task-failure");
  alert.hidden = !failed;
  if (failed) {
    const reason = alert.querySelector(".task-failure-reason");
    const text = uiCopy(task.message || "生成未完成，请稍后再试");
    if (reason.textContent !== text) reason.textContent = text;
    const retryStatus = alert.querySelector(".task-retry-error");
    retryStatus.hidden = !retryError;
    const retryText = retryError ? submissionMessage(retryError) : "";
    if (retryStatus.textContent !== retryText) retryStatus.textContent = retryText;
  }
  status.hidden = message.hidden = failed;
  status.textContent = task.status === "cancelled" ? "已取消" : stopped ? "已停止" : `${phase}${task.round ? ` · 第 ${task.round} 轮` : ""}${task.stopRequested && !stopped ? " · 正在取消" : ""}`;
  message.textContent = task.message || (ACTIVE.has(task.status) ? "刷新后可继续查看任务。" : "已有结果已保留。");
  card.querySelector('[data-action="retry"]').disabled = submitting || Boolean(uncertainRequest);
  const actions = card.querySelector(".card-actions");
  const anchor = failed ? alert : message;
  if (anchor.nextElementSibling !== actions) anchor.after(actions);
  actions.hidden = ACTIVE.has(task.status);
  if (pendingField && ACTIVE.has(task.status)) {
    const dither = task.phase !== "preparing" && Date.now() - pendingStarted >= 2000;
    pendingField.setSettings({ filter: dither ? "dither" : "ascii", size: dither ? Math.max(8, 64 - Math.floor((Date.now() - pendingStarted) / 1000) * 6) : 26, strength: dither ? 24 : 100, mask: 0, palette: "meadow" });
  }
}
function drawEdges() {
  let edges = nodes.filter(node => node.parentKey && positions.has(node.parentKey)).map(node => ({ a: positions.get(node.parentKey), b: positions.get(node.key) }));
  const pending = $("versionCards").querySelector("[data-pending]");
  if (pending) {
    const own = nodes.filter(node => node.historyId === task.result?.historyRecord?.id);
    const parent = own.at(-1) || parentVersion(nodes, task.request);
    if (parent) edges.push({ a: positions.get(parent.key), b: { x: parseFloat(pending.style.left), y: parseFloat(pending.style.top) }, active: ACTIVE.has(task.status) });
  }
  $("versionEdges").innerHTML = edges.map(({ a, b, active }) => `<path ${active ? 'class="is-active"' : ""} d="M ${a.x + 360} ${a.y + 168} C ${a.x + 384} ${a.y + 168}, ${b.x - 24} ${b.y + 168}, ${b.x} ${b.y + 168}" />`).join("");
}
function renderReview() {
  const node = selected(); $("reviewPanel").hidden = !node; document.body.classList.toggle("has-review", Boolean(node));
  rings?.destroy(); rings = null;
  if (!node) {
    for (const id of ["ringsHost", "rubricScores", "suggestions"]) $(id).replaceChildren();
    $("reviewPrompt").textContent = ""; $("reviewStatus").textContent = ""; $("totalScore").textContent = "—"; $("reviewVersion").textContent = "";
    return;
  }
  const evaluation = node.evaluation;
  $("reviewHeadingVersion").textContent = $("reviewVersion").textContent = `v${node.version}`;
  $("reviewHeadingScore").textContent = $("totalScore").textContent = score(evaluation?.score) ?? "—";
  $("reviewStatus").textContent = evaluation?.evaluationPending ? "正在评审，图片已保留" : evaluation?.evaluationFailed ? "评审未完成，图片已保留" : evaluation ? "" : "单次结果未进行视觉评审";
  // TODO_TEXT:review.scene
  $("rubricScores").innerHTML = DIMENSIONS.map(([key, label]) => `<dt data-ui-copy>${label}</dt><dd data-score="${key}">${score(evaluation?.rubric?.[key]) ?? "—"}</dd>`).join("");
  $("ringsHost").replaceChildren();
  rings = mountGrowthRings($("ringsHost"), DIMENSIONS.map(([key, label]) => ({ element: $("rubricScores").querySelector(`[data-score="${key}"]`), label })));
  $("ringsHost").querySelector(".growth-rings__score").textContent = score(evaluation?.score) ?? "—";
  $("suggestions").replaceChildren(...suggestions(evaluation || {}).map(text => {
    const button = document.createElement("button"); button.type = "button"; button.textContent = `${text} ↗`;
    button.addEventListener("click", () => { $("promptInput").value = text.slice(0, 1000); $("promptInput").focus(); syncReview(false); }); return button;
  }));
  $("reviewPrompt").textContent = node.prompt || "暂无英文提示词";
  $("reviewPrompt").toggleAttribute("data-ui-copy", !node.prompt);
}
function workMetaKey() {
  const family = familyRecords(records, activeRoot).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const root = family.find(record => !family.some(parent => parent.id === record.parentId)) || family[0];
  return `musheng-v3-work:${demo || "live"}:${currentUser?.id}:${root?.id || activeRoot}`;
}
function saveWorkMeta() {
  if (!currentUser || !activeRoot || activeRoot === "new") return;
  try { localStorage.setItem(workMetaKey(), JSON.stringify({ title: $("workTitle").value, memory })); } catch { /* Metadata is optional. */ }
}
function loadWorkMeta() {
  memory = [];
  try { const meta = JSON.parse(localStorage.getItem(workMetaKey())); if (meta) { $("workTitle").value = typeof meta.title === "string" ? meta.title : $("workTitle").value; memory = Array.isArray(meta.memory) ? meta.memory.filter(item => typeof item === "string").slice(0, 3) : []; } } catch { /* Use server title. */ }
  renderMemory();
}
$("workTitle").addEventListener("change", saveWorkMeta);
function renderMemory() {
  $("designMemory").replaceChildren(...memory.map(value => {
    const button = document.createElement("button"); button.textContent = `锁定 ${value} ×`; button.title = "取消锁定";
    button.addEventListener("click", () => { memory = memory.filter(item => item !== value); renderMemory(); saveWorkMeta(); }); return button;
  }));
  for (const input of $("memoryOptions").querySelectorAll("input")) input.checked = memory.some(value => value.startsWith(`${input.value}：`));
}
function renderHistory() {
  const filter = $("historyFilterInput").value.trim().toLowerCase();
  const matches = records.filter(record => `${record.title} ${record.originalPrompt}`.toLowerCase().includes(filter));
  $("historyEmpty").textContent = !currentUser ? "登录后查看作品" : filter ? "没有匹配的作品" : "还没有作品";
  $("historyEmpty").hidden = Boolean(matches.length);
  $("historyGrid").innerHTML = matches.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map(record => {
    const src = safeImageUrl(record.images?.[0]?.url || record.rounds?.[0]?.image?.url, { allowData: true });
    return `<article class="history-item" data-history="${escapeHtml(record.id)}">${src ? `<img src="${escapeHtml(src)}" alt="" />` : ""}<button class="history-open" type="button" data-history-action="open">${titleMarkup(record)} · <span data-ui-copy>${record.rounds?.length || record.images?.length || 0} 版</span></button><button type="button" data-history-action="delete" data-ui-copy>删除</button></article>`;
  }).join("");
}
async function loadHistory(stamp = epoch) {
  if (!currentUser) return;
  const revision = ++historyRevision;
  const result = await request("/history", undefined, "GET", abort.signal);
  if (!alive(stamp) || revision !== historyRevision) return;
  records = result.records || [];
  if (!activeRoot && records.length) { activeRoot = records[0].id; const latest = versionNodes(familyRecords(records, activeRoot)).at(-1); selectedKey = latest?.key || null; $("workTitle").value = recordTitle(records[0]); }
  render();
}
function ingest(taskResult) {
  const record = taskResult?.historyRecord;
  if (!record) return;
  historyRevision += 1; records = [...records.filter(item => item.id !== record.id), record];
  if (activeRoot === "new" || !activeRoot) { activeRoot = record.id; saveWorkMeta(); }
  const previousCount = nodes.filter(node => node.historyId === record.id).length;
  const arriving = versionNodes(familyRecords(records, record.id)).filter(node => node.historyId === record.id);
  if (arriving.length > previousCount) selectedKey = arriving.at(-1)?.key || selectedKey;
  render();
}
function adoptTask(next, { recovered = false } = {}) {
  handedPrompt = null;
  task = next; uncertainRequest = null; retryError = null;
  if (task.request?.parentId && records.some(record => record.id === task.request.parentId)) activeRoot = task.request.parentId;
  else if (!task.result?.historyRecord && ACTIVE.has(task.status)) activeRoot = "new";
  storeTask({ id: task.id });
  if (task.result?.historyRecord && (!task.request?.parentId || !records.some(record => record.id === task.request.parentId))) activeRoot = task.result.historyRecord.id;
  if (task.result) ingest(task.result); else render();
  if (recovered && task.status !== "failed") notify("已恢复上次的任务");
  if (ACTIVE.has(task.status)) schedulePoll();
  else finishTask();
}
function schedulePoll(delay = 1200) { clearTimeout(pollTimer); pollTimer = setTimeout(() => void poll(epoch), delay); }
async function poll(stamp) {
  if (!task?.id || !alive(stamp) || pollBusy) return;
  const id = task.id; pollBusy = true;
  try {
    const result = await request(`/generation-tasks/${encodeURIComponent(id)}`, undefined, "GET", abort.signal);
    if (!alive(stamp)) return;
    connection(); task = result.task;
    if (task.result) ingest(task.result); else { renderPending(); drawEdges(); updateComposer(); }
    if (ACTIVE.has(task.status)) schedulePoll(); else finishTask();
  } catch (error) {
    if (!alive(stamp)) return;
    if ([401, 403].includes(error.status)) { notify(error.message); await session.refresh(); return; }
    connection(error.status === 404 ? "任务暂不可读取，请从作品确认已有结果后刷新。" : "连接中断，正在重连；任务可能仍在执行，请勿重复提交。");
    schedulePoll(3000);
  } finally { if (alive(stamp)) pollBusy = false; }
}
function finishTask() {
  clearTimeout(pollTimer); render(); updateComposer(); void refreshQuota();
  if (task.status === "failed") {
    notify("");
    const pending = $("versionCards").querySelector("[data-pending]");
    if (pending) canvas.center({ x: parseFloat(pending.style.left), y: parseFloat(pending.style.top) });
  }
  else if (task.status === "cancelled" || task.stopRequested) { notify("已取消；已发出的请求可能仍计入额度。"); const own = nodes.filter(node => node.historyId === task.result?.historyRecord?.id); if (own.length) selectNode(own.at(-1).key, true); }
  else { notify(task.message || "已完成，可以继续修改或对比"); const own = nodes.filter(node => node.historyId === task.result?.historyRecord?.id); if (own.length) selectNode(own.at(-1).key, true); }
}
async function recoverUncertain(stamp) {
  try {
    const { tasks } = await request("/generation-tasks", undefined, "GET", abort.signal);
    if (!alive(stamp)) return;
    const found = tasks?.find(item => item.requestId === uncertainRequest?.requestId);
    if (found) { connection(); adoptTask(found, { recovered: true }); return; }
    if (uncertainRequest?.prompt) {
      // Reuse the exact idempotency key: the server returns the original task even
      // when it already completed between the lost POST response and reconnection.
      const { failedId, ...payload } = uncertainRequest;
      const response = await request("/generation-tasks", payload, "POST", abort.signal);
      if (alive(stamp)) { connection(); adoptTask(response.task, { recovered: true }); }
    } else connection("提交结果尚未确认，请先在作品中核对结果后刷新。");
  } catch (error) {
    if (!alive(stamp)) return;
    if (error.status && error.status < 500) { rejectSubmission(error, uncertainRequest?.failedId); connection(); }
    else { connection(`任务连接暂不可用，正在重连：${error.message}`); clearTimeout(pollTimer); pollTimer = setTimeout(() => void recoverUncertain(stamp), 3000); }
  }
}
async function refreshQuota(stamp = epoch) {
  try { const result = await request("/generation-tasks/quota", undefined, "GET", abort.signal); if (alive(stamp)) { quota = result.quota || null; updateComposer(); } }
  catch { /* The server still enforces the limit; the hint is only a courtesy. */ }
}
async function restoreWorkspace(stamp) {
  try {
    await loadHistory(stamp); if (!alive(stamp)) return;
    void refreshQuota(stamp);
    let stored = readStored();
    if (demo && !stored && ["failed", "失败", "stopped", "已停止"].includes(demo)) stored = { id: "demo-terminal" };
    const { tasks } = await request("/generation-tasks", undefined, "GET", abort.signal);
    if (!alive(stamp)) return;
    let recovered = tasks?.[0];
    if (!recovered && (stored?.id || stored?.failedId)) {
      try { recovered = (await request(`/generation-tasks/${encodeURIComponent(stored.id || stored.failedId)}`, undefined, "GET", abort.signal)).task; }
      catch (error) { if (error.status !== 404) throw error; storeTask(null); }
    }
    if (!alive(stamp)) return;
    // A new brief from the home page starts a new work. Only an active or
    // uncertain submission takes precedence, so refresh cannot duplicate it.
    if (handedPrompt && !ACTIVE.has(recovered?.status) && !stored?.requestId) {
      task = null; activeRoot = "new"; selectedKey = null; memory = [];
      storeTask(null); $("workTitle").value = "";
      $("promptInput").value = handedPrompt.slice(0, 1000);
      handedPrompt = null;
      renderMemory(); render(); return;
    }
    if (recovered && !ACTIVE.has(recovered.status) && recovered.result?.historyRecord) {
      // The task can finish after the first history snapshot but before the
      // active-task lookup. Re-read after observing its terminal state: a
      // missing/stale record in the earlier snapshot is not proof of deletion.
      await loadHistory(stamp);
      if (!alive(stamp)) return;
      const canonical = records.find(record => record.id === recovered.result.historyRecord.id);
      if (canonical) recovered.result.historyRecord = canonical;
      else { recovered = null; storeTask(null); }
    }
    if (recovered) {
      mode = recovered.mode || "normal";
      setMode(mode);
      for (const [id, key] of [["styleSelect", "style"], ["qualitySelect", "quality"], ["sizeSelect", "size"], ["targetScore", "targetScore"], ["maxAgentRounds", "maxRounds"]]) { if (recovered.request?.[key] != null) $(id).value = String(recovered.request[key]); }
      $("promptInput").value = (recovered.request?.originalPrompt || recovered.request?.prompt || "").slice(0, 1000);
      adoptTask(recovered, { recovered: true });
    }
    if (stored?.requestId && !ACTIVE.has(task?.status)) {
      uncertainRequest = stored; storeTask(stored); await recoverUncertain(stamp); updateComposer();
    }
    loadWorkMeta(); selectNode(selectedKey, true);
    const pending = $("versionCards").querySelector("[data-pending]");
    if (pending && (task?.status === "failed" || ACTIVE.has(task?.status))) {
      canvas.center({ x: parseFloat(pending.style.left), y: parseFloat(pending.style.top) });
    }
  } catch (error) {
    if (!alive(stamp)) return;
    if (error.status === 401) { await session.refresh(); return; }
    connection(`恢复任务暂不可用，正在重试：${error.message}`);
    clearTimeout(pollTimer); pollTimer = setTimeout(() => void restoreWorkspace(stamp), 3000);
  }
}
function settings() {
  return { engine: $("taskEngineSelect").value, mode, style: $("styleSelect").value, quality: $("qualitySelect").value, size: $("sizeSelect").value, mood: $("moodRange").value, targetScore: $("targetScore").value, maxRounds: $("maxAgentRounds").value, constraints: $("constraintsInput").value.trim(), englishPrompt: $("enhancedPrompt").value.trim(), negativePrompt: $("negativePrompt").value.trim() };
}
async function submit(description, parent = selected(), region = null) {
  if (ACTIVE.has(task?.status) || submitting || uncertainRequest) return;
  if (!description.trim()) { $("promptInput").focus(); return; }
  if (!currentUser) { session.requireLogin(); return; }
  if (mode === "agent" && engineModes && !engineModes.agentEngines?.includes($("taskEngineSelect").value)) { notify("当前模型未配置迭代评审，请选择单次或更换模型"); return; }
  const payload = generationPayload({ description, parent, region, memory, settings: settings() });
  if (payload.prompt.length > 12000) { notify("描述与设计记忆合计超过 12000 字，请精简设置中的提示词或设计记忆。"); return; }
  await sendSubmission(payload, { description });
}
function submissionMessage(error) {
  return error.payload?.details?.code === "PARENT_IMAGE_UNAVAILABLE"
    ? pendingUiCopy("studio.parentImage.unavailable", error.message)
    : uiCopy(error.message);
}
function rejectSubmission(error, failedId) {
  uncertainRequest = null;
  const preserve = failedId && task?.id === failedId;
  storeTask(preserve ? { id: failedId } : null);
  if (preserve && task.status === "failed") retryError = error;
  else notify(submissionMessage(error));
  if (error.status === 401) session.requireLogin();
  if (error.status === 429) void refreshQuota();
  renderPending(); updateComposer();
}
async function sendSubmission(requestFields, { description, failedId } = {}) {
  if (submitting || uncertainRequest || ACTIVE.has(task?.status)) return;
  const stamp = epoch;
  const payload = { ...requestFields, requestId: crypto.randomUUID() };
  const recovery = { ...payload, failedId };
  submitting = true; retryError = null; updateComposer(); renderPending(); storeTask(recovery);
  try {
    const result = await request("/generation-tasks", payload, "POST", abort.signal);
    if (!alive(stamp)) return;
    if (!payload.parentId && description) { activeRoot = "new"; $("workTitle").value = description.slice(0, 24); }
    adoptTask(result.task);
    const pending = $("versionCards").querySelector("[data-pending]");
    if (pending) canvas.center({ x: parseFloat(pending.style.left), y: parseFloat(pending.style.top) });
  } catch (error) {
    if (!alive(stamp)) return;
    if (!error.status || error.status >= 500) {
      uncertainRequest = recovery; storeTask(recovery); await recoverUncertain(stamp);
    } else rejectSubmission(error, failedId);
  } finally { if (alive(stamp)) { submitting = false; render(); } }
}
function retryTask() {
  if (!task?.request?.prompt || !currentUser) return;
  void sendSubmission({ ...task.request, mode: task.mode }, { failedId: task.id });
}
async function stopTask() {
  if (!ACTIVE.has(task?.status)) return;
  const stamp = epoch;
  try {
    const result = await request(`/generation-tasks/${encodeURIComponent(task.id)}/stop`, {});
    if (!alive(stamp)) return;
    task = result.task; renderPending(); notify(task.message || "正在取消；已发出的请求可能仍计入额度。"); updateComposer();
  } catch (error) { if (alive(stamp)) notify(`停止尚未确认：${error.message}`); }
}
function setMode(next) {
  mode = next;
  for (const button of $("generationMode").querySelectorAll("button")) button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
}
function chooseCompare(node, opener) {
  const available = new Set([...$("versionCards").querySelectorAll("[data-key]:has(img)")].map(card => card.dataset.key));
  if (!available.has(node.key)) return notify("请选两张可用的图片");
  const candidates = nodes.filter(item => item.key !== node.key && available.has(item.key));
  if (!candidates.length) return notify("生成第二版后即可对比");
  compareSource = node.key;
  $("compareChoices").replaceChildren(...candidates.map(other => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "yui-button";
    button.dataset.variant = "secondary";
    button.dataset.compareKey = other.key;
    button.innerHTML = versionMarkup(other);
    return button;
  }));
  $("comparePicker").hidden = false;
  $("compareResult").hidden = true;
  compareOpener = opener;
  $("compareModal").showModal();
  $("compareChoices").firstElementChild.focus();
}
function openCompare(a, b) {
  if (!a || !b) return;
  const first = safeImageUrl(a.image?.url, { allowData: true }), second = safeImageUrl(b.image?.url, { allowData: true });
  if (!first || !second) return notify("请选两张可用的图片");
  $("compareA").src = first; $("compareB").src = second;
  $("compareLabels").innerHTML = `${versionMarkup(a)} / ${versionMarkup(b)}`;
  $("comparePicker").hidden = true;
  $("compareResult").hidden = false;
  $("compareRange").value = "50";
  setCompareMode("slider");
  $("compareModes").firstElementChild.focus();
}
function clearCompare() {
  compareSource = null;
  $("compareChoices").replaceChildren();
  for (const id of ["compareA", "compareB"]) $(id).removeAttribute("src");
}
$("compareModal").addEventListener("close", () => {
  if ($("compareModal").open) return;
  clearCompare();
  if (compareOpener?.isConnected) compareOpener.focus({ preventScroll: true });
  compareOpener = null;
});
$("compareChoices").addEventListener("click", event => {
  const key = event.target.closest("[data-compare-key]")?.dataset.compareKey;
  if (key) openCompare(nodes.find(node => node.key === compareSource), nodes.find(node => node.key === key));
});
function setCompareMode(mode) {
  $("compareStage").dataset.mode = mode;
  $("compareRangeLabel").hidden = mode === "side";
  for (const button of $("compareModes").querySelectorAll("button")) button.setAttribute("aria-pressed", String(button.dataset.compareMode === mode));
  updateCompareRange();
}
function updateCompareRange() {
  const mode = $("compareStage").dataset.mode;
  $("compareRangeName").textContent = mode === "overlay" ? pendingUiCopy("compare.opacity", "半透明叠看") : uiCopy("分界位置");
  const range = $("compareRange");
  const percent = Number(range.value) / 100;
  // TODO_TEXT:compare.valuePercent
  range.setAttribute("aria-valuetext", new Intl.NumberFormat(document.documentElement.lang, { style: "percent" }).format(percent));
  $("compareStage").style.setProperty("--compare-value", `${range.value}%`);
  $("compareStage").style.setProperty("--compare-opacity", percent);
}
window.addEventListener("musheng:locale-change", updateCompareRange);
function syncReview(open) {
  $("reviewPanel").classList.toggle("is-open", open);
  $("reviewToggle").setAttribute("aria-expanded", String(open));
}
$("reviewToggle").addEventListener("click", () => syncReview(!$("reviewPanel").classList.contains("is-open")));
// Native dialogs supply focus containment, Escape dismissal and focus restoration.
for (const dialog of document.querySelectorAll("dialog")) {
  dialog.addEventListener("click", event => {
    if (event.target.closest("[data-close-dialog]")) dialog.close();
    if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); }
  });
}
$("composer").addEventListener("submit", event => { event.preventDefault(); if (ACTIVE.has(task?.status)) void stopTask(); else void submit($("promptInput").value); });
$("promptInput").addEventListener("keydown", event => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); $("composer").requestSubmit(); } });
$("generationMode").addEventListener("click", event => { if (event.target.dataset.mode) setMode(event.target.dataset.mode); });
$("clearSelection").addEventListener("click", () => { clearCompare(); syncReview(false); selectNode(null); });
$("settingsButton").addEventListener("click", event => { $("workTitleSetting").value = $("workTitle").value; openDialog($("settingsModal"), event.currentTarget); });
$("workTitleSetting").addEventListener("input", () => { $("workTitle").value = $("workTitleSetting").value; saveWorkMeta(); });
$("zoomIn").addEventListener("click", () => canvas.zoom(1.2));
$("zoomOut").addEventListener("click", () => canvas.zoom(1 / 1.2));
$("zoomReset").addEventListener("click", () => canvas.center(positions.get(selectedKey)));
function newWork() {
  if (ACTIVE.has(task?.status) || submitting || uncertainRequest) return;
  clearCompare(); syncReview(false); task = null; activeRoot = "new"; selectedKey = null; memory = []; storeTask(null);
  $("workTitle").value = ""; $("promptInput").value = ""; renderMemory(); render();
}
$("newWorkButton").addEventListener("click", newWork);
$("mobileNewWorkButton").addEventListener("click", () => { newWork(); $("settingsModal").close(); });
$("mobileCenterButton").addEventListener("click", () => { canvas.center(positions.get(selectedKey)); $("settingsModal").close(); });
for (const button of document.querySelectorAll("[data-seed]")) button.addEventListener("click", () => { $("promptInput").value = button.dataset.seed; void submit(button.dataset.seed, null); });
$("historyNavButton").addEventListener("click", event => { openDialog($("historyModal"), event.currentTarget); if (currentUser) void loadHistory().catch(error => notify(error.message)); });
$("refreshHistoryButton").addEventListener("click", () => void loadHistory().catch(error => notify(error.message)));
$("historyFilterInput").addEventListener("input", renderHistory);
$("historyGrid").addEventListener("click", async event => {
  const action = event.target.closest("[data-history-action]")?.dataset.historyAction;
  const id = event.target.closest("[data-history]")?.dataset.history;
  if (!action || !id) return;
  if (action === "open") {
    if (ACTIVE.has(task?.status)) return notify("任务进行中，完成后可切换作品");
    clearCompare(); syncReview(false); activeRoot = id; task = null; render(); const node = nodes.find(item => item.historyId === id); selectNode(node?.key, true);
    $("workTitle").value = recordTitle(node?.record); loadWorkMeta(); $("historyModal").close(); return;
  }
  if (ACTIVE.has(task?.status)) return notify("请等待当前任务完成后删除作品");
  if (!confirm(uiCopy("删除这条历史及图片？子版本将保留。"))) return;
  const stamp = epoch;
  try { await request(`/history/${encodeURIComponent(id)}`, undefined, "DELETE"); if (alive(stamp)) { if (task?.result?.historyRecord?.id === id) { task = null; storeTask(null); } records = records.filter(record => record.id !== id).map(record => record.parentId === id ? { ...record, parentId: null, parentImageIndex: undefined } : record); if (activeRoot === id) activeRoot = null; render(); } }
  catch (error) { if (alive(stamp)) notify(error.message); }
});
$("versionCards").addEventListener("click", event => {
  const card = event.target.closest(".version-card");
  if (card) activateCard(card, event.target.closest("[data-action]"));
});
$("compactActions").addEventListener("click", event => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const card = [...$("versionCards").querySelectorAll("[data-key]")].find(item => item.dataset.key === selectedKey);
  activateCard(card, button);
});
function activateCard(card, button) {
  const action = button?.dataset.action;
  if (action === "retry") { retryTask(); return; }
  const node = nodes.find(item => item.key === card?.dataset.key);
  if (!node) return;
  selectNode(node.key, button?.parentElement === $("compactActions") && action === "region");
  if (action === "rerun") { $("promptInput").value = "保留当前设计，再生成一个版本"; void submit($("promptInput").value, node); }
  if (action === "download") void downloadImage(node).catch(error => notify(error.message));
  if (action === "compare") chooseCompare(node, button);
  if (action === "region") {
    const img = card.querySelector("img");
    if (!img?.naturalWidth) return notify("图片加载完成后再框选");
    regionCleanup?.(); regionTarget = node;
    const opener = button.isConnected && button.getClientRects().length ? button : card.querySelector('[data-action="region"]');
    regionCleanup = enableRegion(card.querySelector(".card-media"), img, {
      opener,
      controls: $("regionControls"), cancel: $("regionCancel"), status: $("regionBounds"),
      onRegion(region) {
        regionCleanup = null;
        regionBox = region;
        updateRegionLabel();
        $("regionInput").value = "";
        openDialog($("regionModal"), opener);
      },
    });
  }
}
function updateRegionLabel() {
  // TODO_TEXT:region.position
  if (regionTarget && regionBox) $("regionLabel").textContent = `v${regionTarget.version} · ${uiCopy(regionDescription(regionBox))}`;
}
window.addEventListener("musheng:locale-change", () => { updateRegionLabel(); renderPending(); });
$("regionForm").addEventListener("submit", event => { event.preventDefault(); const text = `按区域描述修改：v${regionTarget.version} · ${regionDescription(regionBox)}，${$("regionInput").value.trim()}`; $("promptInput").value = text; $("regionModal").close(); void submit(text, regionTarget, regionBox); });
$("materialOptions").addEventListener("click", event => { const material = event.target.dataset.material; if (!material) return; $("promptInput").value = `将材质调整为${material}，保留结构与比例`; $("promptInput").focus(); });
$("memoryOptions").addEventListener("change", event => {
  const name = event.target.value;
  memory = memory.filter(value => !value.startsWith(`${name}：`));
  if (event.target.checked && selected()) {
    const source = selected().record.originalPrompt || selected().prompt;
    const pattern = name === "材质" ? /[^，。；;\n]*(?:木|竹|藤|金属|皮革|walnut|oak|bamboo)[^，。；;\n]*/i : name === "靠背造型" ? /[^，。；;\n]*(?:靠背|backrest|curved back)[^，。；;\n]*/i : /[^，。；;\n]*(?:比例|尺寸|高宽|proportion)[^，。；;\n]*/i;
    memory.push(`${name}：${(source.match(pattern)?.[0] || `保留当前版本的${name}`).slice(0, 160)}`);
  }
  renderMemory(); saveWorkMeta();
});
$("compareModes").addEventListener("click", event => {
  if (event.target.dataset.compareMode) setCompareMode(event.target.dataset.compareMode);
});
$("compareRange").addEventListener("input", updateCompareRange);
$("compareStage").addEventListener("pointerdown", event => { $("compareStage").setPointerCapture(event.pointerId); moveCompare(event); });
$("compareStage").addEventListener("pointermove", event => { if (event.buttons) moveCompare(event); });
function moveCompare(event) { if ($("compareStage").dataset.mode === "side") return; const r = $("compareStage").getBoundingClientRect(); $("compareRange").value = String(Math.round(100 * (event.clientX - r.left) / r.width)); $("compareRange").dispatchEvent(new Event("input")); }
$("exportButton").addEventListener("click", async () => {
  const node = selected(); if (!node) return;
  $("exportButton").disabled = true;
  try { await exportPage(node, $("workTitle").value || recordTitle(node.record) || uiCopy("未命名作品")); notify("设计页已导出为 PNG"); }
  catch (error) { notify(`导出失败：${error.message}。外部图片需要允许跨域读取。`); }
  finally { updateComposer(); }
});
window.addEventListener("online", () => { if (task && ACTIVE.has(task.status)) schedulePoll(0); else if (uncertainRequest) void recoverUncertain(epoch); });
window.addEventListener("offline", () => connection("连接中断，联网后继续恢复任务。"));
window.addEventListener("pagehide", () => { clearTimeout(pollTimer); pendingField?.destroy(); cleanups.splice(0).forEach(cleanup => cleanup()); emptyField.destroy(); layoutObserver.disconnect(); abort.abort(); });
const layoutObserver = new ResizeObserver(() => {
  document.body.style.setProperty("--composer-height", `${$("composer").offsetHeight}px`);
  document.body.style.setProperty("--review-height", `${$("reviewPanel").offsetHeight}px`);
});
layoutObserver.observe($("composer"));
layoutObserver.observe($("reviewPanel"));
// The empty canvas shows the same fixed ASCII art as the home page.
const emptyField = { destroy() {} };
async function fetchEngineModes() {
  try {
    const info = await request("/engines"); engineModes = info;
    const online = (info.modes || Object.keys(info.engines || {})).filter(mode => !/automatic1111|comfyui/.test(mode));
    for (const id of ["taskEngineSelect", "configEngine"]) {
      $(id).replaceChildren(...online.map(value => { const option = document.createElement("option"); option.value = value; option.dataset.uiCopy = ""; option.textContent = value === "imageModel" ? "在线图像模型" : value === "codexCli" ? "创作模型" : value; return option; }));
      $(id).value = online.includes(info.defaultEngine) ? info.defaultEngine : online[0] || "";
    }
    connection(online.length ? "" : "没有可用的在线模型，请联系管理员。");
  } catch { connection("模型状态暂不可用，请检查连接。"); }
}
void fetchEngineModes();
void session.refresh();
if (demo) notify("演示数据 · 不调用模型，不写入真实作品");
