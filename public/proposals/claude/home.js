// 同桌 · home. Every demo runs on the same furniture renderer as the studio.
import { render, review, applyEdit, partAt, DEFAULTS, DIMENSIONS, PART_NAMES } from "./furniture.js";

const $ = (id) => document.getElementById(id);
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const ease = (t) => 1 - (1 - t) ** 3;

function surface(canvas) {
  const w = canvas.clientWidth, h = canvas.clientHeight, dpr = Math.min(devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}
function tween(ms, fn) {
  return new Promise((ok) => {
    const t0 = performance.now(), dur = reduced ? 1 : ms;
    const step = (now) => { const t = Math.min(1, (now - t0) / dur); fn(t); t < 1 ? requestAnimationFrame(step) : ok(); };
    requestAnimationFrame(step);
  });
}
const wait = (ms) => new Promise((ok) => setTimeout(ok, reduced ? 0 : ms));
// Only the lit share of frames is spent on sections in view.
function whenVisible(el, fn) { new IntersectionObserver(([e]) => e.isIntersecting && fn(), { threshold: 0.3 }).observe(el); }

/* ---------- hero: the desk ---------- */
const desk = { kind: "chair", params: { ...DEFAULTS }, busy: false, yaw: 34 };
const agent = $("heroAgent"), says = $("heroSays");
function paintDesk(opts) { const { ctx, w, h } = surface($("deskCanvas")); render(ctx, w, h, desk.kind, desk.params, { zoom: 0.78, yaw: desk.yaw, fontSize: innerWidth < 760 ? 7 : 9, ...opts }); }
function moveAgent(x, y, text) { agent.style.transform = `translate(${x}px, ${y}px)`; says.textContent = `木生 · ${text}`; }
function stage(text) { $("deskStage").hidden = !text; $("deskStage").textContent = text || ""; }

async function draw() {
  if (desk.busy) return;
  desk.busy = true;
  $("deskScore").hidden = true;
  const box = $("desk").getBoundingClientRect();
  const cx = box.width * 0.62, cy = box.height * 0.42;
  stage("01 理解需求"); moveAgent(cx - 120, cy - 60, "读你的需求");
  await wait(500);
  stage("02 起稿"); moveAgent(cx + 40, cy - 20, "起稿");
  await tween(1400, (t) => paintDesk({ mode: "ascii", assemble: ease(t) }));
  stage("03 出图"); moveAgent(cx + 80, cy + 60, "上材质");
  await tween(1100, (t) => paintDesk({ mode: "dither", block: Math.round(11 - t * 8) }));
  await tween(360, (t) => { $("deskCanvas").style.filter = `blur(${(1 - t) * 5}px)`; paintDesk({ mode: "solid" }); });
  $("deskCanvas").style.filter = "";
  stage("04 评审"); moveAgent(box.width - 220, 56, "评审");
  await wait(500);
  const r = review(desk.params, 3);
  $("deskScore").innerHTML = `${r.total}<small>${r.notes[0].text}</small>`;
  $("deskScore").hidden = false;
  stage(""); moveAgent(box.width - 240, box.height - 90, "要改哪里？");
  desk.busy = false;
  // idle: the finished piece slowly turns
  if (!reduced) { const t0 = performance.now(); const spin = (now) => { if (desk.busy) return; desk.yaw = 34 + Math.sin((now - t0) / 1800) * 18; paintDesk({ mode: "solid" }); requestAnimationFrame(spin); }; requestAnimationFrame(spin); }
}

function pick(attr, value) {
  document.querySelectorAll(`[data-${attr}]`).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset[attr] === value)));
}
$("try").addEventListener("click", (e) => {
  const b = e.target.closest("button[type=button]");
  if (!b || desk.busy) return;
  if (b.dataset.kind) { desk.kind = b.dataset.kind; pick("kind", desk.kind); }
  if (b.dataset.wood) { desk.params.wood = b.dataset.wood; pick("wood", desk.params.wood); }
  if ("light" in b.dataset) {
    const on = b.getAttribute("aria-pressed") !== "true";
    b.setAttribute("aria-pressed", String(on));
    Object.assign(desk.params, on ? { arm: 0.7, leg: 0.8, seat: 0.8 } : { arm: 1, leg: 1, seat: 1 });
  }
  paintDesk({ mode: "ascii", assemble: 1 });
});
$("try").addEventListener("submit", (e) => { e.preventDefault(); draw(); });
paintDesk({ mode: "ascii", assemble: 1 });
whenVisible($("desk"), () => { if (!desk.started) { desk.started = true; setTimeout(draw, 600); } });

/* ---------- lab: one chair, three ways ---------- */
const lab = { fx: "ascii" };
function paintLab() {
  const size = +$("fxSize").value, explode = +$("fxExplode").value / 100, mask = +$("fxMask").value / 100;
  $("fxSizeOut").textContent = size; $("fxExplodeOut").textContent = Math.round(explode * 100); $("fxMaskOut").textContent = Math.round(mask * 100);
  const { ctx, w, h } = surface($("labCanvas"));
  render(ctx, w, h, "chair", DEFAULTS, {
    mode: lab.fx, explode, zoom: 0.86,
    fontSize: Math.round(6 + size * 0.1), block: Math.round(2 + size * 0.08), step: Math.round(3 + size * 0.07),
  });
  // vertical veil: heavy at the top and bottom so the effect reads as texture
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, `rgba(244,243,239,${mask * 0.9})`); g.addColorStop(0.42, `rgba(244,243,239,${mask * 0.2})`); g.addColorStop(1, `rgba(244,243,239,${mask * 0.7})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}
document.querySelectorAll("[data-fx]").forEach((b) => b.addEventListener("click", () => {
  lab.fx = b.dataset.fx;
  document.querySelectorAll("[data-fx]").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
  paintLab();
}));
for (const id of ["fxSize", "fxExplode", "fxMask"]) $(id).addEventListener("input", paintLab);
whenVisible($("labCanvas"), () => {
  paintLab();
  if (reduced || lab.played) return;
  lab.played = true;
  // a short demo: the chair comes apart and goes back together
  tween(1800, (t) => { $("fxExplode").value = Math.round(Math.sin(t * Math.PI) * 80); paintLab(); });
});

/* ---------- frame to edit ---------- */
const ed = { params: { ...DEFAULTS }, n: 1, part: null, highlight: null };
function paintEdit() { const { ctx, w, h } = surface($("editCanvas")); render(ctx, w, h, "chair", ed.params, { mode: "solid", zoom: 0.86, highlight: ed.highlight }); }
{
  const art = $("editArt"), rect = $("editRect");
  let start = null, frame = null;
  const at = (e) => { const b = art.getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), y: Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)) }; };
  art.addEventListener("pointerdown", (e) => { try { art.setPointerCapture(e.pointerId); } catch {} start = at(e); rect.hidden = false; });
  art.addEventListener("pointermove", (e) => {
    if (!start) return;
    const p = at(e);
    frame = { x: Math.min(p.x, start.x), y: Math.min(p.y, start.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) };
    Object.assign(rect.style, { left: `${frame.x * 100}%`, top: `${frame.y * 100}%`, width: `${frame.w * 100}%`, height: `${frame.h * 100}%` });
  });
  art.addEventListener("pointerup", () => {
    start = null;
    if (!frame || frame.w < 0.04 || frame.h < 0.04) { rect.hidden = true; return; }
    ed.part = partAt("chair", ed.params, frame, { aspect: art.clientHeight / art.clientWidth }) || "seat";
    ed.highlight = ed.part; paintEdit();
    $("editPart").textContent = PART_NAMES[ed.part];
    $("editBubble").hidden = false;
    $("editHint").textContent = "说一句";
  });
}
$("editBubble").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-say]");
  if (!b) return;
  const before = { ...ed.params };
  const { params } = applyEdit(ed.params, `${PART_NAMES[ed.part]}${b.dataset.say}`, ed.part);
  $("editBubble").hidden = true; $("editRect").hidden = true;
  await tween(700, (t) => {
    const k = ease(t);
    for (const key of ["arm", "back", "leg", "seat"]) ed.params[key] = before[key] + (params[key] - before[key]) * k;
    paintEdit();
  });
  ed.n += 1;
  $("editVersions").innerHTML = Array.from({ length: ed.n }, (_, i) => (i === ed.n - 1 ? `<b>v${i + 1}</b>` : `v${i + 1}`)).join(" → ");
  setTimeout(() => { ed.highlight = null; paintEdit(); $("editHint").textContent = "再框一处试试"; }, 900);
});
whenVisible($("editArt"), paintEdit);

/* ---------- rings ---------- */
whenVisible($("ringSvg"), () => {
  const r = review(DEFAULTS, 3), R = [110, 96, 82, 68, 54, 40];
  $("ringSvg").innerHTML = r.scores.map((s, i) => `<circle cx="120" cy="120" r="${R[i]}" stroke="#0000000f" stroke-width="9"/><circle data-s="${s}" cx="120" cy="120" r="${R[i]}" stroke="${i === 0 ? "#3d5afe" : "#141414"}" stroke-opacity="${1 - i * 0.12}" stroke-width="9" stroke-dasharray="0 999" transform="rotate(-90 120 120)" style="transition-delay:${i * 120}ms"/>`).join("");
  $("ringList").innerHTML = DIMENSIONS.map((d, i) => `<li><span>${d}</span><b>${r.scores[i]}</b></li>`).join("");
  requestAnimationFrame(() => $("ringSvg").querySelectorAll("[data-s]").forEach((c) => { const L = 2 * Math.PI * c.r.baseVal.value; c.setAttribute("stroke-dasharray", `${(L * c.dataset.s) / 100} ${L}`); }));
});

addEventListener("resize", () => { paintDesk({ mode: desk.busy ? "ascii" : "solid", assemble: 1 }); paintLab(); paintEdit(); });
