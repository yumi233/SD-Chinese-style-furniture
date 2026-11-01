// Home demo: a scripted studio window. Four scenes play in a loop while the window is on screen
// and pause under the pointer; the visitor only picks a scene, nothing in the canvas is operable.
import { growFrom } from "../modules/fluid-motion.js";

const DIMS = [["文化", 87], ["结构", 90], ["工艺", 86], ["创新", 84], ["场景", 91], ["AI", 89]];
const PROMPT = "一把浅木小椅子，轻一点";
const ASK = "靠背再薄一点";

export function mountHomeDemo(root, { reduced = () => false } = {}) {
  const $ = (id) => document.getElementById(id);
  const stage = $("demoStage");
  const steps = [...root.querySelectorAll("[data-demo-step]")];
  const cards = [$("demoV1"), $("demoV2")];
  const cursors = { agent: $("demoAgent"), you: $("demoYou") };
  $("demoSheet").querySelector(".demo-sheet__dims").innerHTML = DIMS
    .map(([name, value]) => `<li><span data-ui-copy>${name}</span><i style="--v:${value}%"></i><b>${value}</b></li>`).join("");

  let token = 0;
  let paused = false;
  let visible = false;
  let started = false;

  // Sleeps count only unpaused time and give up as soon as another scene takes over.
  const sleep = (ms, t) => new Promise((resolve) => {
    if (reduced()) return resolve(t === token);
    let left = ms;
    let last = performance.now();
    const tick = (now) => {
      if (t !== token) return resolve(false);
      if (!paused) left -= now - last;
      last = now;
      if (left <= 0) resolve(true); else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const box = (element) => {
    const outer = stage.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    return { x: rect.left - outer.left, y: rect.top - outer.top, w: rect.width, h: rect.height };
  };
  const point = (name, x, y) => {
    const cursor = cursors[name];
    cursor.style.setProperty("--x", `${Math.round(x)}px`);
    cursor.style.setProperty("--y", `${Math.round(y)}px`);
    cursor.classList.add("is-on");
  };
  const click = (name) => { const cursor = cursors[name]; cursor.classList.remove("is-click"); void cursor.offsetWidth; cursor.classList.add("is-click"); };
  const status = (text) => { $("demoStatus").textContent = text; };

  // Lay a card out in its finished state without playing its transitions.
  const settle = (card) => {
    card.dataset.instant = "";
    card.classList.add("is-shown", "is-developed", "is-scored");
    card.classList.remove("is-drafting");
    void card.offsetWidth;
    delete card.dataset.instant;
  };
  const reset = (count) => {
    stage.dataset.count = String(count);
    stage.classList.remove("is-layered");
    cards.forEach((card) => card.classList.remove("is-shown", "is-drafting", "is-developed", "is-scored", "is-selected"));
    for (const id of ["demoEdge", "demoFrame", "demoBubble", "demoCompare", "demoSheet"]) $(id).classList.remove("is-on");
    $("demoExport").classList.remove("is-pressed");
    Object.values(cursors).forEach((cursor) => cursor.classList.remove("is-on"));
    $("demoTyped").textContent = "";
    $("demoAsk").textContent = "";
  };
  const type = async (element, text, t) => {
    for (let i = 1; i <= text.length; i += 1) {
      element.textContent = text.slice(0, i);
      if (!(await sleep(70, t))) return false;
    }
    return true;
  };
  const develop = async (card, t) => {
    card.classList.add("is-shown", "is-drafting");
    if (!(await sleep(1000, t))) return false;
    card.classList.add("is-developed");
    if (!(await sleep(1300, t))) return false;
    card.classList.remove("is-drafting");
    card.classList.add("is-scored");
    return true;
  };

  const scenes = [
    async function generate(t) {
      reset(1);
      status("v1 · 起稿");
      const composer = box($("demoComposer"));
      point("you", composer.x + composer.w + 16, composer.y + composer.h / 2);
      if (!(await type($("demoTyped"), PROMPT, t))) return false;
      if (!(await sleep(400, t))) return false;
      const card = box(cards[0]);
      point("agent", card.x + card.w - 24, card.y + card.h * .4);
      if (!(await develop(cards[0], t))) return false;
      status("v1 · 88");
      return true;
    },
    async function modify(t) {
      reset(1);
      settle(cards[0]);
      status("v1 · 88");
      const media = box(cards[0].querySelector(".demo-card__media"));
      // The backrest sits in the upper middle of the card crop.
      const frame = { x: media.x + media.w * .28, y: media.y + media.h * .3, w: media.w * .5, h: media.h * .16 };
      Object.assign($("demoFrame").style, { left: `${frame.x}px`, top: `${frame.y}px`, width: `${frame.w}px`, height: `${frame.h}px` });
      Object.assign($("demoBubble").style, { left: `${frame.x}px`, top: `${frame.y + frame.h + 12}px` });
      point("you", frame.x, frame.y);
      if (!(await sleep(800, t))) return false;
      point("you", frame.x + frame.w, frame.y + frame.h);
      $("demoFrame").classList.add("is-on");
      if (!(await sleep(900, t))) return false;
      $("demoBubble").classList.add("is-on");
      if (!(await type($("demoAsk"), ASK, t))) return false;
      if (!(await sleep(600, t))) return false;
      $("demoFrame").classList.remove("is-on");
      $("demoBubble").classList.remove("is-on");
      cursors.you.classList.remove("is-on");
      stage.dataset.count = "2";
      $("demoEdge").classList.add("is-on");
      if (!(await sleep(500, t))) return false;
      const next = box(cards[1]);
      point("agent", next.x + next.w - 24, next.y + next.h * .4);
      status("v2 · 起稿");
      if (!(await develop(cards[1], t))) return false;
      cards[1].classList.add("is-selected");
      status("v2 · 92");
      return true;
    },
    async function compare(t) {
      reset(2);
      cards.forEach(settle);
      $("demoEdge").classList.add("is-on");
      status("v1 / v2");
      const panel = $("demoCompare");
      const v2 = cards[1].getBoundingClientRect();
      const at = box(panel);
      growFrom(panel, { x: v2.left + v2.width / 2, y: v2.top + v2.height / 2 });
      if (!(await sleep(300, t))) return false;
      stage.classList.add("is-layered");
      panel.classList.add("is-on");
      if (!(await sleep(500, t))) return false;
      const sweep = async (from, to, ms) => {
        const begin = performance.now();
        let elapsed = 0;
        let last = begin;
        while (elapsed < ms) {
          if (!(await sleep(16, t))) return false;
          const now = performance.now();
          if (!paused) elapsed += now - last;
          last = now;
          const k = Math.min(1, elapsed / ms);
          const eased = k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
          const cut = from + (to - from) * eased;
          panel.style.setProperty("--cut", `${cut}%`);
          point("you", at.x + at.w * cut / 100 + 20, at.y + at.h * .6);
        }
        return true;
      };
      if (reduced()) { panel.style.setProperty("--cut", "50%"); return true; }
      return (await sweep(50, 20, 1100)) && (await sweep(20, 80, 1600)) && (await sweep(80, 50, 1000));
    },
    async function exportSheet(t) {
      reset(2);
      cards.forEach(settle);
      $("demoEdge").classList.add("is-on");
      cards[1].classList.add("is-selected");
      status("v2 · 92");
      const stageBox = stage.getBoundingClientRect();
      point("agent", stageBox.width - 120, stageBox.height - 56);
      if (!(await sleep(900, t))) return false;
      click("agent");
      $("demoExport").classList.add("is-pressed");
      if (!(await sleep(240, t))) return false;
      $("demoExport").classList.remove("is-pressed");
      cursors.agent.classList.remove("is-on");
      const sheet = $("demoSheet");
      const button = $("demoExport").getBoundingClientRect();
      growFrom(sheet, { x: button.left + button.width / 2, y: button.top });
      stage.classList.add("is-layered");
      sheet.classList.add("is-on");
      status("已导出 v2");
      return true;
    },
  ];

  const select = (step) => steps.forEach((button) => button.setAttribute("aria-pressed", String(Number(button.dataset.demoStep) === step)));
  async function play(step) {
    const t = ++token;
    started = true;
    select(step);
    stage.dataset.scene = ["generate", "modify", "compare", "export"][step];
    const done = await scenes[step](t);
    if (!done || reduced()) return;
    if (await sleep(2200, t)) play((step + 1) % 4);
  }

  steps.forEach((button) => button.addEventListener("click", () => play(Number(button.dataset.demoStep))));
  // Resting the pointer on the canvas holds the frame; the step buttons stay outside that area.
  stage.addEventListener("pointerenter", (event) => { if (event.pointerType === "mouse") paused = true; });
  stage.addEventListener("pointerleave", () => { paused = !visible; });

  if (reduced() || !("IntersectionObserver" in window)) play(0);
  else {
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      paused = !visible;
      if (visible && !started) play(0);
    }, { threshold: .3 }).observe(stage);
  }
}
