// 同桌 · studio. Mock-data prototype: versions live on an endless board, the agent works beside you.
import { render, review, applyEdit, partAt, WOODS, PART_NAMES, DIMENSIONS, DEFAULTS } from "./furniture.js";

const $ = (id) => document.getElementById(id);
const board = $("board"), world = $("world"), links = $("links"), cursor = $("agentCursor"), says = $("agentSays");
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const mobile = () => innerWidth <= 720;

const STYLES = [["ming", "明式"], ["new", "新中式"], ["song", "宋韵"], ["zen", "禅意"]];
const STAGES = ["理解需求", "起稿", "出图", "评审"];
const KIND_NAME = { chair: "椅", table: "桌案", cabinet: "柜" };
const TARGET = 85, MAX_ROUNDS = 3;
const CARD_W = () => (mobile() ? 300 : 360), GAP_X = 420, GAP_Y = 400;

const state = { versions: [], selected: null, view: { x: 0, y: 0, z: 1 }, running: null, mode: "single", style: "ming", memory: new Set(), offline: false, failNext: false, seq: 0 };

/* ---------- prompt parsing ---------- */
function parse(text) {
  const kind = /桌|案/.test(text) ? "table" : /柜/.test(text) ? "cabinet" : "chair";
  const p = { ...DEFAULTS };
  for (const [key, w] of Object.entries(WOODS)) if (text.includes(w.name) || text.includes(w.name.replace("木", ""))) p.wood = key;
  if (/浅|白/.test(text) && !/白蜡/.test(text)) p.wood = "ash";
  if (/轻|薄|细/.test(text)) { p.arm = 0.75; p.leg = 0.85; p.seat = 0.8; }
  if (/厚重|结实|稳/.test(text)) { p.arm = 1.4; p.leg = 1.3; }
  if (/高背/.test(text)) p.back = 1.25;
  if (/矮|低/.test(text)) p.back = 0.8;
  const style = STYLES.find(([k]) => k === state.style)[1];
  const tags = [KIND_NAME[kind], WOODS[p.wood].name, style];
  if (/轻|薄|细/.test(text)) tags.push("轻");
  if (/公寓|小/.test(text)) tags.push("小空间");
  return { kind, params: p, tags };
}
const english = (v) => `A ${{ ming: "Ming-style", new: "contemporary Chinese", song: "Song-style", zen: "Zen" }[v.style]} ${{ chair: "armchair", table: "writing desk", cabinet: "low cabinet" }[v.kind]} in ${{ walnut: "black walnut", cherry: "cherry", ash: "white ash", bamboo: "bamboo", ink: "ink-stained oak" }[v.params.wood]}, arm ${v.params.arm.toFixed(2)}, back ${v.params.back.toFixed(2)}, studio product render, soft daylight, 16:9`;

/* ---------- versions & layout ---------- */
function create({ parent = null, kind, params, label, tags = [], prompt = "" }) {
  state.seq += 1;
  const v = { id: `v${state.seq}`, n: state.seq, parent, kind, params: { ...params }, label, tags, prompt, style: state.style, status: "queued", stage: -1, review: null, view: { mode: "ascii", assemble: 0, block: 10, highlight: null }, round: parent ? (state.versions.find((x) => x.id === parent)?.round || 1) : 1 };
  // design memory: locked attributes survive every edit
  if (parent) {
    const from = state.versions.find((x) => x.id === parent).params;
    if (state.memory.has("wood")) v.params.wood = from.wood;
    if (state.memory.has("back")) v.params.back = from.back;
    if (state.memory.has("proportion")) { v.params.leg = from.leg; v.params.seat = from.seat; }
  }
  state.versions.push(v);
  mountCard(v);
  layout();
  return v;
}

function layout() {
  const kids = (id) => state.versions.filter((v) => v.parent === id);
  let slot = 0;
  const place = (v, depth) => {
    const c = kids(v.id);
    v.x = depth * GAP_X;
    if (!c.length) { v.y = slot * GAP_Y; slot += 1; return v.y; }
    const ys = c.map((k) => place(k, depth + 1));
    v.y = (Math.min(...ys) + Math.max(...ys)) / 2;
    return v.y;
  };
  state.versions.filter((v) => !v.parent).forEach((root) => place(root, 0));
  for (const v of state.versions) v.el.style.transform = `translate(${v.x}px, ${v.y}px)`;
  drawLinks();
  $("empty").hidden = state.versions.length > 0;
  renderStrip();
}

function drawLinks() {
  links.innerHTML = state.versions.filter((v) => v.parent).map((v) => {
    const p = state.versions.find((x) => x.id === v.parent);
    const x1 = p.x + CARD_W(), y1 = p.y + 170, x2 = v.x, y2 = v.y + 170, mx = (x1 + x2) / 2;
    return `<path class="${v.status === "running" ? "is-live" : ""}" d="M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}"/>`;
  }).join("");
}

/* ---------- cards ---------- */
function mountCard(v) {
  const el = document.createElement("article");
  el.className = "card";
  el.dataset.id = v.id;
  el.innerHTML = `
    <header><span class="v">v${v.n}</span><strong></strong><button class="score" type="button" hidden><i class="ring"></i><span></span></button></header>
    <div class="art"><canvas></canvas><div class="tags"></div></div>
    <footer>
      <button type="button" data-act="frame" aria-pressed="false">改一处</button>
      <button type="button" data-act="again">再来一版</button>
      <button type="button" data-act="compare">对比</button>
      <button type="button" data-act="download" aria-label="下载">↓</button>
    </footer>`;
  el.querySelector("strong").textContent = v.label;
  world.append(el);
  v.el = el;
  v.canvas = el.querySelector("canvas");
  el.addEventListener("pointerdown", (e) => e.stopPropagation());
  el.addEventListener("click", (e) => onCardClick(v, e));
  bindFraming(v);
  draw(v);
}

function draw(v) {
  const c = v.canvas, box = c.parentElement.getBoundingClientRect();
  const w = c.parentElement.clientWidth || 344, h = c.parentElement.clientHeight || 280;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const ctx = c.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const vw = v.view;
  render(ctx, w, h, v.kind, v.params, { mode: vw.mode, assemble: vw.assemble, block: vw.block, highlight: vw.highlight, accent: "#3d5afe", fontSize: 8 });
  void box;
}

function setStage(v, i, text) {
  v.stage = i;
  const art = v.el.querySelector(".art");
  art.querySelector(".stage")?.remove();
  if (i >= 0) {
    const s = document.createElement("div");
    s.className = "stage";
    s.innerHTML = `<i></i>${text || STAGES[i]}`;
    art.append(s);
  }
  moveAgent(v, text || STAGES[i]);
  if (state.selected === v.id) renderInspector();
}

function finishCard(v) {
  v.el.querySelector(".stage")?.remove();
  v.el.querySelector(".tags").innerHTML = "";
  const b = v.el.querySelector(".score");
  b.hidden = !v.review;
  if (v.review) { b.querySelector("span").textContent = v.review.total; b.querySelector(".ring").style.setProperty("--p", v.review.total); }
  drawLinks();
}

/* ---------- agent cursor ---------- */
function moveAgent(v, text) {
  if (!v) { cursor.hidden = true; return; }
  cursor.hidden = false;
  says.textContent = text ? `木生 · ${text}` : "木生";
  const jitter = (v.stage + 1) * 18;
  cursor.style.transform = `translate(${v.x + CARD_W() - 70 - jitter}px, ${v.y + 120 + jitter}px)`;
}

/* ---------- generation ---------- */
const sleep = (ms, run) => new Promise((ok, no) => { const t = setTimeout(() => (run.stopped ? no(new Error("stopped")) : ok()), reduced ? 0 : ms); run.timers.push(t); });
function tween(ms, run, fn) {
  return new Promise((ok, no) => {
    const t0 = performance.now(), dur = reduced ? 1 : ms;
    const step = (now) => {
      if (run.stopped) return no(new Error("stopped"));
      if (state.offline) { run.pausedAt ??= now; return requestAnimationFrame(step); }
      const t = Math.min(1, (now - t0) / dur);
      try { fn(t); } catch (err) { return no(err); }
      if (t < 1) requestAnimationFrame(step); else ok();
    };
    requestAnimationFrame(step);
  });
}

async function generate(v, { agent = false, from = 0 } = {}) {
  const run = { id: v.id, stopped: false, timers: [] };
  state.running = run;
  v.status = "running";
  select(v.id, { focus: true });
  syncGo();
  drawLinks();
  try {
    if (from <= 0) {
      setStage(v, 0);
      const tags = v.el.querySelector(".tags");
      for (const t of v.tags) { const s = document.createElement("span"); s.textContent = t; tags.append(s); await sleep(220, run); }
      await sleep(300, run);
      tags.innerHTML = "";
    }
    if (from <= 1) {
      setStage(v, 1);
      v.view.mode = "ascii";
      await tween(1500, run, (t) => { v.view.assemble = t; draw(v); });
    }
    setStage(v, 2);
    v.view.mode = "dither";
    v.view.assemble = 1;
    await tween(1300, run, (t) => {
      if (state.failNext && t > 0.5) throw Object.assign(new Error("fail"), { fail: true });
      v.view.block = Math.round(10 - t * 7);
      draw(v);
    });
    v.view.mode = "solid";
    await tween(380, run, (t) => { v.canvas.style.filter = `blur(${(1 - t) * 6}px) saturate(${t})`; draw(v); });
    v.canvas.style.filter = "";
    setStage(v, 3);
    await sleep(500, run);
    v.review = review(v.params, v.n, agent ? (v.round - 1) * 4 : 0);
    v.status = "done";
    finishCard(v);
    if (v.view.highlight) { draw(v); setTimeout(() => { v.view.highlight = null; draw(v); }, 1600); }
    state.running = null;
    moveAgent(null);
    renderInspector();
    syncGo();
    if (agent && v.review.total < TARGET && v.round < MAX_ROUNDS) {
      const note = v.review.notes[0];
      const { params, changed } = applyEdit(v.params, note.fix, note.part);
      toast(`v${v.n} ${v.review.total} 分，未到 ${TARGET}。木生自动修正：${note.text}`);
      const child = create({ parent: v.id, kind: v.kind, params, label: `第 ${v.round + 1} 轮 · ${PART_NAMES[changed] || "调整"}`, tags: ["修正", PART_NAMES[changed] || "整体"] });
      child.round = v.round + 1;
      child.view.highlight = changed;
      await sleep(600, { stopped: false, timers: [] });
      return generate(child, { agent: true });
    }
    if (agent) toast(v.review.total >= TARGET ? `达到 ${TARGET} 分，迭代完成` : `已到 ${MAX_ROUNDS} 轮上限，保留最佳一版`);
  } catch (err) {
    run.timers.forEach(clearTimeout);
    state.running = null;
    moveAgent(null);
    v.canvas.style.filter = "";
    if (err.fail) {
      state.failNext = false;
      v.status = "failed";
      v.el.querySelector(".art").insertAdjacentHTML("beforeend", `<div class="fail"><b>出图失败</b><span>模型没有返回图片，这次没有扣次数。</span><button class="btn btn--sm" type="button" data-act="retry">重试</button></div>`);
    } else {
      v.status = "stopped";
      setStage(v, v.stage, `已停止 · ${STAGES[Math.max(0, v.stage)]}`);
      cursor.hidden = true;
    }
    finishCard(v);
    renderInspector();
    syncGo();
  }
}

function stop() { if (state.running) state.running.stopped = true; }

/* ---------- selection, inspector ---------- */
function select(id, { focus = false } = {}) {
  state.selected = id;
  for (const v of state.versions) v.el.classList.toggle("is-selected", v.id === id);
  renderInspector();
  renderStrip();
  syncGo();
  if (focus) focusOn(state.versions.find((v) => v.id === id));
}

function rings(scores) {
  const R = [60, 52, 44, 36, 28, 20];
  return `<svg viewBox="0 0 132 132" aria-hidden="true">${scores.map((s, i) => {
    const c = 2 * Math.PI * R[i];
    return `<circle cx="66" cy="66" r="${R[i]}" stroke="#0000000f" stroke-width="5"/><circle cx="66" cy="66" r="${R[i]}" stroke="${i === 0 ? "#3d5afe" : "#141414"}" stroke-opacity="${1 - i * 0.12}" stroke-width="5" stroke-dasharray="${(c * s) / 100} ${c}" transform="rotate(-90 66 66)"/>`;
  }).join("")}</svg>`;
}

function renderInspector() {
  const v = state.versions.find((x) => x.id === state.selected);
  const insp = $("inspector");
  insp.hidden = !v;
  document.body.classList.toggle("has-inspector", !!v);
  if (!v) return;
  const body = $("inspectorBody");
  if (v.status === "running" || v.status === "queued") {
    body.innerHTML = `<div class="block"><h3>v${v.n} 正在生成</h3><ol class="dims">${STAGES.map((s, i) => `<li><span>${i < v.stage ? "✓" : i === v.stage ? "●" : "○"} ${s}</span><b>${i < v.stage ? "完成" : i === v.stage ? (state.offline ? "等待重连" : "进行中") : ""}</b></li>`).join("")}</ol></div>
      <div class="block"><h3>描述</h3><p class="prompt-en">${escapeHtml(v.prompt || v.label)}</p></div>`;
    return;
  }
  if (v.status === "failed" || v.status === "stopped") {
    body.innerHTML = `<div class="block"><h3>v${v.n}</h3><p>${v.status === "failed" ? "出图失败，没有扣次数。可以直接重试。" : `在「${STAGES[Math.max(0, v.stage)]}」阶段停止，已完成的部分保留在画布上。`}</p><button class="btn btn--sm" type="button" data-act="retry">${v.status === "failed" ? "重试" : "继续生成"}</button></div>`;
    body.querySelector("[data-act=retry]").onclick = () => retry(v);
    return;
  }
  const r = v.review;
  body.innerHTML = `
    <div class="block">
      <div class="total"><b>${r.total}</b><span>v${v.n} · ${escapeHtml(v.label)}</span></div>
      <div class="rings">${rings(r.scores)}<ul class="dims">${DIMENSIONS.map((d, i) => `<li><span>${d}</span><b>${r.scores[i]}</b></li>`).join("")}</ul></div>
    </div>
    <div class="block"><h3>建议</h3><ul class="notes">${r.notes.map((n, i) => `<li><button type="button" data-note="${i}"><small>${PART_NAMES[n.part] || ""}</small>${n.text}</button></li>`).join("")}</ul></div>
    <div class="block"><h3>材质</h3><div class="woods">${Object.entries(WOODS).map(([k, w]) => `<button type="button" title="${w.name}" aria-label="${w.name}" aria-pressed="${v.params.wood === k}" data-wood="${k}" style="background: rgb(${w.rgb})"></button>`).join("")}</div></div>
    <div class="block"><h3>锁定</h3><div class="lock">${[["wood", "材质"], ["back", "靠背"], ["proportion", "比例"]].map(([k, l]) => `<button class="chip" type="button" data-lock="${k}" aria-pressed="${state.memory.has(k)}">${l}</button>`).join("")}</div></div>
    <details class="block"><summary>英文提示词</summary><p class="prompt-en">${english(v)}</p></details>`;
  body.querySelectorAll("[data-note]").forEach((b) => b.addEventListener("click", () => {
    const note = r.notes[+b.dataset.note];
    v.view.highlight = note.part; draw(v);
    setTimeout(() => { v.view.highlight = null; draw(v); }, 1400);
    openBubble(v, null, note.part, note.fix);
  }));
  body.querySelectorAll("[data-wood]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.wood === v.params.wood) return;
    const child = create({ parent: v.id, kind: v.kind, params: { ...v.params, wood: b.dataset.wood }, label: `换${WOODS[b.dataset.wood].name}`, tags: ["换材质", WOODS[b.dataset.wood].name] });
    if (state.memory.has("wood")) { toast("材质已锁定，先在「锁定」里解开"); child.params.wood = v.params.wood; }
    generate(child);
  }));
  body.querySelectorAll("[data-lock]").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.lock;
    state.memory.has(k) ? state.memory.delete(k) : state.memory.add(k);
    renderMemory(); renderInspector();
  }));
}

function renderMemory() {
  const v = state.versions.find((x) => x.id === state.selected);
  const label = { wood: v ? WOODS[v.params.wood].name : "材质", back: "靠背", proportion: "比例" };
  $("memory").innerHTML = [...state.memory].map((k) => `<span class="chip" title="已锁定">${label[k]}</span>`).join("");
}

function renderStrip() {
  $("strip").innerHTML = state.versions.map((v) => `<button type="button" data-id="${v.id}" aria-current="${v.id === state.selected}">v${v.n}${v.review ? ` · ${v.review.total}` : ""}</button>`).join("");
  $("strip").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => select(b.dataset.id, { focus: true })));
}

function syncGo() {
  const go = $("go"), v = state.versions.find((x) => x.id === state.selected);
  go.classList.toggle("is-stop", !!state.running);
  go.textContent = state.running ? "停止" : v && v.status === "done" ? `修改 v${v.n}` : "生成";
  $("prompt").placeholder = v && v.status === "done" ? `对 v${v.n} 说：扶手再薄一点` : "一把给小公寓的圈椅，黑胡桃，轻一点";
}

/* ---------- card actions ---------- */
let picking = null;
function onCardClick(v, e) {
  const act = e.target.closest("[data-act]")?.dataset.act;
  if (picking && picking !== v) { openCompare(picking, v); return; }
  if (act === "frame") return toggleFraming(v);
  if (act === "again") {
    const params = { ...v.params, arm: v.params.arm * (0.9 + Math.random() * 0.2), back: v.params.back * (0.95 + Math.random() * 0.1) };
    return generate(create({ parent: v.parent || v.id, kind: v.kind, params, label: "再来一版", tags: ["同参数", "新种子"] }));
  }
  if (act === "compare") {
    const others = state.versions.filter((x) => x !== v && x.status === "done");
    if (!others.length) return toast("还没有可以比较的版本");
    if (others.length === 1) return openCompare(v, others[0]);
    picking = v;
    others.forEach((o) => o.el.classList.add("is-pick"));
    return toast("点另一张卡片来比较");
  }
  if (act === "download") { const a = document.createElement("a"); a.href = v.canvas.toDataURL("image/png"); a.download = `木生-v${v.n}.png`; a.click(); return; }
  if (act === "retry") return retry(v);
  select(v.id);
}

function retry(v) {
  v.el.querySelector(".fail")?.remove();
  generate(v, { from: v.status === "stopped" ? Math.max(1, v.stage) : 1 });
}

/* ---------- frame to edit ---------- */
function toggleFraming(v, on = !v.framing) {
  for (const x of state.versions) if (x.framing && x !== v) toggleFraming(x, false);
  v.framing = on;
  v.el.querySelector("[data-act=frame]").setAttribute("aria-pressed", String(on));
  v.el.querySelector(".art").classList.toggle("is-framing", on);
  if (on) { select(v.id); toast("在图上框出要改的地方"); } else { v.el.querySelector(".frame-rect")?.remove(); $("bubble").hidden = true; }
}

function bindFraming(v) {
  const art = v.el.querySelector(".art");
  let start = null, rectEl = null;
  art.addEventListener("pointerdown", (e) => {
    if (!v.framing) return;
    e.preventDefault();
    try { art.setPointerCapture(e.pointerId); } catch {}
    const b = art.getBoundingClientRect();
    start = { x: (e.clientX - b.left) / b.width, y: (e.clientY - b.top) / b.height };
    art.querySelector(".frame-rect")?.remove();
    rectEl = document.createElement("div");
    rectEl.className = "frame-rect";
    art.append(rectEl);
  });
  art.addEventListener("pointermove", (e) => {
    if (!start) return;
    const b = art.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), y = Math.min(1, Math.max(0, (e.clientY - b.top) / b.height));
    Object.assign(v.frame = { x: Math.min(x, start.x), y: Math.min(y, start.y), w: Math.abs(x - start.x), h: Math.abs(y - start.y) });
    Object.assign(rectEl.style, { left: `${v.frame.x * 100}%`, top: `${v.frame.y * 100}%`, width: `${v.frame.w * 100}%`, height: `${v.frame.h * 100}%` });
  });
  art.addEventListener("pointerup", () => {
    if (!start) return;
    start = null;
    if (!v.frame || v.frame.w < 0.04 || v.frame.h < 0.04) { rectEl?.remove(); return; }
    const part = partAt(v.kind, v.params, v.frame, { aspect: art.clientHeight / art.clientWidth });
    v.view.highlight = part; draw(v);
    openBubble(v, rectEl, part);
  });
}

function openBubble(v, anchor, part, preset = "") {
  const bubble = $("bubble"), b = (anchor || v.el.querySelector(".art")).getBoundingClientRect();
  bubble.hidden = false;
  $("bubblePart").textContent = PART_NAMES[part] || "这里";
  $("bubbleInput").value = preset;
  const w = 300;
  bubble.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, b.left + b.width / 2 - w / 2))}px`;
  bubble.style.top = `${Math.min(innerHeight - 160, b.bottom + 12)}px`;
  $("bubbleInput").focus();
  bubble.onsubmit = null;
  const go = () => {
    const text = $("bubbleInput").value.trim() || `${PART_NAMES[part] || ""}再薄一点`;
    const { params, changed } = applyEdit(v.params, text, part);
    bubble.hidden = true;
    v.view.highlight = null; draw(v);
    if (v.framing) toggleFraming(v, false);
    const child = create({ parent: v.id, kind: v.kind, params, label: text, tags: ["改一处", PART_NAMES[changed] || "整体"], prompt: text });
    child.view.highlight = changed;
    generate(child, { agent: state.mode === "agent" });
  };
  $("bubbleGo").onclick = go;
  $("bubbleInput").onkeydown = (e) => { if (e.key === "Enter") go(); if (e.key === "Escape") { bubble.hidden = true; v.view.highlight = null; draw(v); } };
}

/* ---------- compare ---------- */
function openCompare(a, b) {
  picking = null;
  state.versions.forEach((o) => o.el.classList.remove("is-pick"));
  const [older, newer] = a.n < b.n ? [a, b] : [b, a];
  $("compare").hidden = false;
  $("cmpTitle").textContent = `v${older.n} 与 v${newer.n}`;
  $("cmpTagA").textContent = `v${older.n} · ${older.review?.total ?? "--"}`;
  $("cmpTagB").textContent = `v${newer.n} · ${newer.review?.total ?? "--"}`;
  const paint = () => {
    for (const [id, v] of [["cmpA", older], ["cmpB", newer]]) {
      const c = $(id), w = c.clientWidth, h = c.clientHeight, dpr = Math.min(devicePixelRatio || 1, 2);
      c.width = w * dpr; c.height = h * dpr;
      const ctx = c.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      render(ctx, w, h, v.kind, v.params, { mode: "solid" });
    }
  };
  requestAnimationFrame(paint);
  setCut(50);
  $("cmpModes").querySelectorAll("button").forEach((btn) => (btn.onclick = () => {
    $("cmpModes").querySelectorAll("button").forEach((x) => x.setAttribute("aria-checked", String(x === btn)));
    $("cmpStage").dataset.mode = btn.dataset.cmp;
    requestAnimationFrame(paint);
  }));
}
function setCut(p) {
  p = Math.max(0, Math.min(100, p));
  $("cmpStage").style.setProperty("--cut", `${p}%`);
  $("cmpStage").style.setProperty("--onion", (p / 100).toFixed(2));
  $("cmpHandle").setAttribute("aria-valuenow", Math.round(p));
}
{
  let drag = false;
  const stage = $("cmpStage");
  stage.addEventListener("pointerdown", (e) => { drag = true; try { stage.setPointerCapture(e.pointerId); } catch {} move(e); });
  stage.addEventListener("pointermove", (e) => drag && move(e));
  stage.addEventListener("pointerup", () => (drag = false));
  function move(e) { const b = stage.getBoundingClientRect(); setCut(((e.clientX - b.left) / b.width) * 100); }
  $("cmpHandle").addEventListener("keydown", (e) => { const now = +$("cmpHandle").getAttribute("aria-valuenow"); if (e.key === "ArrowLeft") setCut(now - 5); if (e.key === "ArrowRight") setCut(now + 5); });
  $("cmpClose").onclick = () => ($("compare").hidden = true);
}

/* ---------- board: pan & zoom ---------- */
function applyView() {
  const { x, y, z } = state.view;
  world.style.transform = `translate(${x}px, ${y}px) scale(${z})`;
  board.style.setProperty("--z", z);
  board.style.setProperty("--bx", `${x}px`);
  board.style.setProperty("--by", `${y}px`);
  $("zoomFit").textContent = `${Math.round(z * 100)}%`;
}
function zoomAt(cx, cy, factor) {
  const v = state.view, z = Math.max(0.3, Math.min(2.5, v.z * factor));
  v.x = cx - ((cx - v.x) * z) / v.z; v.y = cy - ((cy - v.y) * z) / v.z; v.z = z;
  applyView();
}
function focusOn(v) {
  if (!v) return;
  const right = mobile() ? 0 : 336, top = mobile() ? 110 : 80, bottom = mobile() ? 200 : 140;
  const w = innerWidth - right, h = innerHeight - top - bottom;
  const z = mobile() ? Math.min(1, (innerWidth - 32) / CARD_W()) : Math.min(1, state.view.z || 1);
  world.style.transition = reduced ? "" : `transform 520ms var(--ease)`;
  state.view = { z, x: w / 2 - (v.x + CARD_W() / 2) * z, y: top + h / 2 - (v.y + 190) * z };
  applyView();
  setTimeout(() => (world.style.transition = ""), 540);
}
{
  const pts = new Map();
  let last = null, pinch = null;
  board.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".card, button, input, textarea, a")) return;
    try { board.setPointerCapture(e.pointerId); } catch {}
    pts.set(e.pointerId, e);
    last = { x: e.clientX, y: e.clientY };
    board.classList.add("is-panning");
    if (picking) { picking = null; state.versions.forEach((o) => o.el.classList.remove("is-pick")); }
  });
  board.addEventListener("pointermove", (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, e);
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      if (pinch) zoomAt((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2, d / pinch);
      pinch = d;
      return;
    }
    state.view.x += e.clientX - last.x; state.view.y += e.clientY - last.y;
    last = { x: e.clientX, y: e.clientY };
    applyView();
  });
  const end = (e) => { pts.delete(e.pointerId); pinch = null; if (!pts.size) board.classList.remove("is-panning"); const rest = [...pts.values()][0]; if (rest) last = { x: rest.clientX, y: rest.clientY }; };
  board.addEventListener("pointerup", end);
  board.addEventListener("pointercancel", end);
  board.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01));
    else { state.view.x -= e.deltaX; state.view.y -= e.deltaY; applyView(); }
  }, { passive: false });
  $("zoomIn").onclick = () => zoomAt(innerWidth / 2, innerHeight / 2, 1.2);
  $("zoomOut").onclick = () => zoomAt(innerWidth / 2, innerHeight / 2, 1 / 1.2);
  $("zoomFit").onclick = () => { state.view.z = 1; focusOn(state.versions.find((v) => v.id === state.selected) || state.versions[0]); };
}

/* ---------- composer ---------- */
$("composer").addEventListener("submit", (e) => {
  e.preventDefault();
  if (state.running) return stop();
  const text = $("prompt").value.trim() || $("prompt").placeholder.replace(/^对 v\d+ 说：/, "");
  const sel = state.versions.find((x) => x.id === state.selected);
  $("prompt").value = "";
  if (sel && sel.status === "done") {
    const { params, changed } = applyEdit(sel.params, text, null);
    const child = create({ parent: sel.id, kind: sel.kind, params, label: text, tags: ["修改", PART_NAMES[changed] || WOODS[params.wood].name], prompt: text });
    child.view.highlight = changed === "wood" ? null : changed;
    return generate(child, { agent: state.mode === "agent" });
  }
  const { kind, params, tags } = parse(text);
  generate(create({ kind, params, label: text.slice(0, 18), tags, prompt: text }), { agent: state.mode === "agent" });
});
$("prompt").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("composer").requestSubmit(); } });
document.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => {
  state.mode = b.dataset.mode;
  document.querySelectorAll("[data-mode]").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
}));
$("styles").innerHTML = STYLES.map(([k, l]) => `<button class="chip" type="button" role="radio" aria-pressed="${k === state.style}" aria-checked="${k === state.style}" data-style="${k}">${l}</button>`).join("");
$("styles").addEventListener("click", (e) => {
  const b = e.target.closest("[data-style]"); if (!b) return;
  state.style = b.dataset.style;
  $("styles").querySelectorAll("[data-style]").forEach((x) => { x.setAttribute("aria-pressed", String(x === b)); x.setAttribute("aria-checked", String(x === b)); });
});

/* ---------- empty state ---------- */
const SEEDS = ["小公寓圈椅，黑胡桃，轻一点", "樱桃木书案", "白蜡矮柜，高一点"];
$("seeds").innerHTML = SEEDS.map((s) => `<button class="chip" type="button">${s}</button>`).join("");
$("seeds").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; $("prompt").value = b.textContent; $("composer").requestSubmit(); });
function drawGhost() {
  const c = $("ghost"), w = c.clientWidth || 320, h = c.clientHeight || 240, dpr = Math.min(devicePixelRatio || 1, 2);
  c.width = w * dpr; c.height = h * dpr;
  const ctx = c.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  let t = 0;
  const tick = () => {
    if (state.versions.length) return;
    t += 0.6;
    render(ctx, w, h, "chair", DEFAULTS, { mode: "ascii", yaw: 34 + Math.sin(t / 40) * 20, fontSize: 8, ink: "#141414" });
    if (!reduced) setTimeout(() => requestAnimationFrame(tick), 60);
  };
  tick();
}

/* ---------- works, export, states ---------- */
const WORKS = [
  { title: "胡桃圈椅", kind: "chair", params: { ...DEFAULTS, arm: 0.8 }, edits: ["靠背高一点"] },
  { title: "樱桃书案", kind: "table", params: { ...DEFAULTS, wood: "cherry", leg: 0.8 }, edits: ["腿更粗"] },
  { title: "白蜡矮柜", kind: "cabinet", params: { ...DEFAULTS, wood: "ash" }, edits: ["换樱桃木"] },
];
function reset() {
  stop();
  state.versions.forEach((v) => v.el.remove());
  Object.assign(state, { versions: [], selected: null, running: null, seq: 0, failNext: false });
  state.memory.clear(); renderMemory();
  setOffline(false);
  layout(); renderInspector(); syncGo(); moveAgent(null);
  state.view = { x: 0, y: 0, z: 1 }; applyView();
  $("bubble").hidden = true;
  drawGhost();
}
function instant(v) { v.view = { mode: "solid", assemble: 1, block: 3, highlight: null }; v.review = review(v.params, v.n); v.status = "done"; draw(v); finishCard(v); }
function loadWork(w) {
  reset();
  $("title").value = w.title;
  const v1 = create({ kind: w.kind, params: w.params, label: w.title, tags: [] }); instant(v1);
  let prev = v1;
  for (const e of w.edits) { const { params } = applyEdit(prev.params, e, null); const v = create({ parent: prev.id, kind: w.kind, params, label: e }); instant(v); prev = v; }
  select(prev.id, { focus: true });
}
$("worksBtn").onclick = () => { const open = $("works").hidden; $("works").hidden = !open; $("worksBtn").setAttribute("aria-expanded", String(open)); if (open) paintWorks(); };
$("worksClose").onclick = () => { $("works").hidden = true; $("worksBtn").setAttribute("aria-expanded", "false"); };
function paintWorks() {
  $("worksList").innerHTML = WORKS.map((w, i) => `<button type="button" data-i="${i}"><canvas></canvas><span><strong>${w.title}</strong><small>${w.edits.length + 1} 个版本</small></span></button>`).join("");
  $("worksList").querySelectorAll("button").forEach((b) => {
    const w = WORKS[+b.dataset.i], c = b.querySelector("canvas"), dpr = Math.min(devicePixelRatio || 1, 2);
    c.width = 72 * dpr; c.height = 56 * dpr;
    const ctx = c.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render(ctx, 72, 56, w.kind, w.params, { mode: "solid", pixel: 1 });
    b.onclick = () => { $("works").hidden = true; loadWork(w); };
  });
}

$("exportBtn").onclick = () => {
  const v = state.versions.find((x) => x.id === state.selected && x.status === "done") || state.versions.filter((x) => x.status === "done").at(-1);
  if (!v) return toast("先生成一版再导出");
  $("exportSheet").hidden = false;
  $("exportPage").innerHTML = `<canvas id="expCanvas"></canvas><div><h2>${escapeHtml($("title").value)}</h2><p>v${v.n} · ${WOODS[v.params.wood].name} · ${STYLES.find(([k]) => k === v.style)[1]}</p><div class="total"><b>${v.review.total}</b><span>综合</span></div><ul class="dims" style="margin-top:12px">${DIMENSIONS.map((d, i) => `<li><span>${d}</span><b>${v.review.scores[i]}</b></li>`).join("")}</ul></div>`;
  requestAnimationFrame(() => {
    const c = $("expCanvas"), w = c.clientWidth, h = c.clientHeight, dpr = 2;
    c.width = w * dpr; c.height = h * dpr;
    const ctx = c.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render(ctx, w, h, v.kind, v.params, { mode: "solid", pixel: 1 });
  });
  $("exportDownload").onclick = () => { const a = document.createElement("a"); a.href = $("expCanvas").toDataURL("image/png"); a.download = `${$("title").value}-v${v.n}.png`; a.click(); };
};
$("exportClose").onclick = () => ($("exportSheet").hidden = true);

function setOffline(on) { state.offline = on; $("net").hidden = !on; if (state.selected) renderInspector(); }
const SCENES = {
  空态: () => reset(),
  生成中: () => { reset(); $("prompt").value = SEEDS[0]; $("composer").requestSubmit(); },
  部分结果: () => { reset(); state.mode = "agent"; document.querySelector("[data-mode=agent]").click(); $("prompt").value = "厚重的胡桃圈椅"; $("composer").requestSubmit(); },
  成功: () => loadWork(WORKS[0]),
  失败: () => { reset(); state.failNext = true; $("prompt").value = SEEDS[1]; $("composer").requestSubmit(); },
  已停止: () => { reset(); $("prompt").value = SEEDS[0]; $("composer").requestSubmit(); setTimeout(stop, reduced ? 10 : 1900); },
  断线: () => { if (!state.running) { reset(); $("prompt").value = SEEDS[0]; $("composer").requestSubmit(); } setTimeout(() => setOffline(true), 900); setTimeout(() => { setOffline(false); toast("已重新连接，继续生成"); }, 4200); },
  刷新恢复: () => { reset(); const { kind, params, tags } = parse(SEEDS[2]); const v = create({ kind, params, label: SEEDS[2], tags }); toast("已恢复上次的任务：v1 正在出图"); generate(v, { from: 2 }); },
};
$("states").innerHTML = Object.keys(SCENES).map((k) => `<button type="button">${k}</button>`).join("");
$("states").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; b.closest("details").open = false; SCENES[b.textContent](); });

/* ---------- misc ---------- */
let toastTimer;
function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.add("is-on"); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("is-on"), 2600); }
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]); }
$("sheetHandle").onclick = () => $("inspector").classList.toggle("is-open");
addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  $("compare").hidden = true; $("exportSheet").hidden = true; $("works").hidden = true; $("bubble").hidden = true;
  state.versions.forEach((v) => v.framing && toggleFraming(v, false));
});
addEventListener("resize", () => { state.versions.forEach(draw); layout(); });

applyView();
syncGo();
drawGhost();
const scene = new URLSearchParams(location.search).get("state");
if (scene && SCENES[scene]) SCENES[scene]();
