// Material feedback never changes business state, focus ownership or dismiss rules.
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
let source = null;
document.addEventListener("click", (event) => {
  const trigger = event.target.closest("button,a,summary");
  if (!trigger) return;
  const rect = trigger.getBoundingClientRect();
  source = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, time: performance.now() };
}, true);
function origin(panel) {
  if (!source || performance.now() - source.time > 700) return;
  const rect = panel.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const x = Math.max(0, Math.min(rect.width, source.x - rect.left));
  const y = Math.max(0, Math.min(rect.height, source.y - rect.top));
  panel.style.setProperty("--origin-x", `${x}px`);
  panel.style.setProperty("--origin-y", `${y}px`);
  if (panel.id !== "demo-drawer") {
    panel.style.setProperty("--enter-x", `${Math.max(-18, Math.min(18, (source.x - rect.left - rect.width / 2) * .06))}px`);
    panel.style.setProperty("--enter-y", `${Math.max(-18, Math.min(18, (source.y - rect.top - rect.height / 2) * .06))}px`);
  }
}
for (const modal of document.querySelectorAll(".history-modal, .config-modal, .profile-modal, .wb-pop, dialog")) {
  const panel = modal.querySelector(".modal-dialog") || modal;
  const visible = () => modal.matches("dialog") ? modal.open : !modal.hidden && !modal.classList.contains("hidden");
  let wasOpen = visible();
  new MutationObserver(() => {
    const isOpen = visible();
    if (isOpen && !wasOpen) origin(panel);
    wasOpen = isOpen;
  }).observe(modal, { attributes: true, attributeFilter: ["class", "hidden", "open"] });
}
for (const popover of document.querySelectorAll("[popover]")) {
  popover.addEventListener("toggle", () => { if (popover.matches(":popover-open")) requestAnimationFrame(() => origin(popover)); });
}
// Fine-pointer light/parallax is bounded, frame-coalesced and stops at rest.
const art = document.querySelector("[data-material-art]");
if (art) {
  let frame = 0;
  let x = 0;
  let y = 0;
  const reset = () => { x = y = 0; update(); };
  const update = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      art.style.setProperty("--art-x", `${x}px`);
      art.style.setProperty("--art-y", `${y}px`);
      frame = 0;
    });
  };
  art.addEventListener("pointermove", (event) => {
    if (reduced.matches || event.pointerType !== "mouse") return;
    const rect = art.getBoundingClientRect();
    x = ((event.clientX - rect.left) / rect.width - .5) * 12;
    y = ((event.clientY - rect.top) / rect.height - .5) * 12;
    update();
  });
  art.addEventListener("pointerleave", reset);
  reduced.addEventListener("change", reset);
  const image = art.querySelector("img");
  const names = { chair: "椅凳", bench: "桌案", cabinet: "柜架" };
  let animation;
  for (const button of art.querySelectorAll("[data-study]")) button.addEventListener("click", () => {
    if (button.getAttribute("aria-pressed") === "true") return;
    art.querySelectorAll("[data-study]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
    image.src = `/assets/studies/${button.dataset.study}-tile.svg`;
    image.alt = `${names[button.dataset.study]}原创结构示意图`;
    animation?.cancel();
    if (!reduced.matches) animation = image.animate([
      { opacity: .25, filter: "blur(4px)", scale: .96 },
      { opacity: 1, filter: "blur(0px)", scale: 1 }
    ], { duration: 340, easing: "cubic-bezier(.2,.8,.2,1)" });
  });
}
for (const surface of document.querySelectorAll(".material-sample, [data-material-art]")) {
  let frame = 0;
  let angle = 145;
  surface.addEventListener("pointermove", (event) => {
    if (reduced.matches || event.pointerType !== "mouse") return;
    const rect = surface.getBoundingClientRect();
    angle = Math.atan2(event.clientY - rect.top - rect.height / 2, event.clientX - rect.left - rect.width / 2) * 180 / Math.PI + 90;
    if (!frame) frame = requestAnimationFrame(() => { surface.style.setProperty("--light-angle", `${angle}deg`); frame = 0; });
  });
}
for (const range of document.querySelectorAll("input[type='range']")) {
  const update = () => {
    const min = Number(range.min || 0);
    const max = Number(range.max || 100);
    range.style.setProperty("--range-fill", `${max > min ? (range.valueAsNumber - min) / (max - min) * 100 : 0}%`);
  };
  range.addEventListener("input", update);
  range.addEventListener("change", update);
  update();
}
