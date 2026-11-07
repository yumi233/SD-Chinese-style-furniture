import "./modules/dock.js";
import "./modules/fluid-motion.js";
let toastTimer;
function toast() {
  let el = document.querySelector(".fluid-toast");
  if (!el) { el = document.createElement("div"); el.className = "fluid-toast"; el.setAttribute("role", "status"); document.body.append(el); }
  el.textContent = "✓ 操作已完成（组件演示）";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 2400);
}
for (const button of document.querySelectorAll("[data-demo-toast]")) button.addEventListener("click", toast);
for (const button of document.querySelectorAll("[data-open-demo]")) button.addEventListener("click", () => document.getElementById(button.dataset.openDemo).showModal());
for (const dialog of document.querySelectorAll("dialog")) dialog.addEventListener("click", (event) => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
const tabs = [...document.querySelectorAll('[role="tab"]')];
const copy = ["从一把椅子开始，观察轮廓与比例。", "从一张桌案开始，寻找材料与结构的关系。", "从一件柜架开始，思考收纳与空间。"];
function selectTab(index) {
  tabs.forEach((t,i) => { t.classList.toggle("active",i === index); t.setAttribute("aria-selected",String(i === index)); t.tabIndex = i === index ? 0 : -1; });
  const panel = document.getElementById("demo-tab-content"); panel.textContent = copy[index]; panel.setAttribute("aria-labelledby",tabs[index].id);
}
tabs.forEach((t,i) => {
  t.addEventListener("click",() => selectTab(i));
  t.addEventListener("keydown", (e) => { let next; if (e.key === "ArrowRight") next = (i+1)%tabs.length; if (e.key === "ArrowLeft") next = (i+tabs.length-1)%tabs.length; if (e.key === "Home") next = 0; if (e.key === "End") next = tabs.length-1; if (next !== undefined) { e.preventDefault(); selectTab(next); tabs[next].focus(); } });
});
const progress = document.getElementById("demo-progress");
progress.addEventListener("click",() => { progress.disabled = true; progress.setAttribute("aria-busy","true"); progress.textContent = "◌ 正在生成"; document.getElementById("demo-progress-status").textContent = "组件演示：处理进行中…"; setTimeout(() => { progress.disabled = false; progress.removeAttribute("aria-busy"); progress.textContent = "再次体验"; document.getElementById("demo-progress-status").textContent = "✓ 演示完成，实际生成请前往工作台。"; },1400); });

const range = document.getElementById("demo-range");
range.addEventListener("input", () => { document.getElementById("demo-range-value").textContent = range.value; });

// Keep the native popover next to its trigger, flipping and clamping to the viewport.
const popover = document.getElementById("demo-popover");
const popoverTrigger = document.querySelector('[popovertarget="demo-popover"]');
function placePopover() {
  if (!popover.matches(":popover-open")) return;
  const anchor = popoverTrigger.getBoundingClientRect();
  const panel = popover.getBoundingClientRect();
  const gap = 10;
  const above = anchor.top - panel.height - gap;
  const below = anchor.bottom + gap;
  const top = below + panel.height <= innerHeight - 16 || above < 16 ? below : above;
  popover.style.translate = "none";
  popover.style.left = `${Math.max(16, Math.min(anchor.left, innerWidth - panel.width - 16))}px`;
  popover.style.top = `${Math.max(16, Math.min(top, innerHeight - panel.height - 16))}px`;
}
popover.addEventListener("toggle", () => requestAnimationFrame(placePopover));
window.addEventListener("resize", placePopover);
document.addEventListener("scroll", placePopover, { capture: true, passive: true });

const light = document.getElementById("material-light");
light.addEventListener("input", () => document.querySelector(".material-lab").style.setProperty("--light-x", `${light.value}%`));
