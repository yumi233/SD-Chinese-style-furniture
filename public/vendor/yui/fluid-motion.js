// yui motion, after wxad.design: one moving surface per group ("跳跃")
// and panels that grow out of the control that opened them ("发芽").
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const GROUPS = ".yui-segmented, .yui-tabs, [data-shared-highlight]";
const SELECTED = "[aria-pressed='true'], [aria-selected='true'], .is-active";

export function initFluidMotion(root = document) {
  for (const group of root.querySelectorAll(GROUPS)) {
    if (group.dataset.fluidGroup) continue;
    group.dataset.fluidGroup = "true";
    const indicator = document.createElement("span");
    indicator.className = "fluid-indicator";
    indicator.setAttribute("aria-hidden", "true");
    group.append(indicator);
    let hovered = null;
    let queued = false;
    let placed = false;
    const items = () => [...group.children].filter((element) => element.matches("button, a"));
    const update = () => {
      queued = false;
      const target = hovered || items().find((element) => element.matches(SELECTED));
      if (!target || !target.getClientRects().length) { indicator.style.opacity = "0"; return; }
      const outer = group.getBoundingClientRect();
      const box = target.getBoundingClientRect();
      // The first placement must not slide in from the corner.
      indicator.style.transitionDuration = reduced.matches || !placed ? "0ms" : "";
      indicator.style.borderRadius = getComputedStyle(target).borderRadius;
      indicator.style.width = `${box.width}px`;
      indicator.style.height = `${box.height}px`;
      indicator.style.translate = `${box.left - outer.left - group.clientLeft + group.scrollLeft}px ${box.top - outer.top - group.clientTop + group.scrollTop}px`;
      indicator.style.opacity = "1";
      indicator.dataset.hover = String(Boolean(hovered) && !hovered.matches(SELECTED));
      placed = true;
    };
    const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
    group.addEventListener("pointerover", (event) => {
      if (event.pointerType === "touch") return;
      const item = event.target.closest("button, a");
      if (item?.parentElement === group) { hovered = item; schedule(); }
    });
    group.addEventListener("pointerleave", () => { hovered = null; schedule(); });
    group.addEventListener("focusin", (event) => { if (event.target.parentElement === group && event.target.matches(":focus-visible")) { hovered = event.target; schedule(); } });
    group.addEventListener("focusout", () => { hovered = null; schedule(); });
    new MutationObserver(schedule).observe(group, { subtree: true, attributes: true, attributeFilter: ["class", "aria-selected", "aria-pressed", "hidden"] });
    new ResizeObserver(schedule).observe(group);
    reduced.addEventListener("change", schedule);
    document.fonts?.ready.then(schedule);
    schedule();
  }
}

// Remember where the last click happened so a dialog can grow from it.
let source = null;
document.addEventListener("click", (event) => {
  const trigger = event.target.closest("button, a, summary");
  if (!trigger) return;
  const rect = trigger.getBoundingClientRect();
  source = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, time: performance.now() };
}, true);

export function growFrom(panel, point = source) {
  if (!point || performance.now() - (point.time ?? performance.now()) > 700) return;
  const rect = panel.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  panel.style.setProperty("--origin-x", `${Math.max(0, Math.min(rect.width, point.x - rect.left))}px`);
  panel.style.setProperty("--origin-y", `${Math.max(0, Math.min(rect.height, point.y - rect.top))}px`);
}

for (const dialog of document.querySelectorAll("dialog")) {
  let wasOpen = dialog.open;
  new MutationObserver(() => {
    if (dialog.open && !wasOpen) growFrom(dialog);
    wasOpen = dialog.open;
  }).observe(dialog, { attributes: true, attributeFilter: ["open"] });
}

initFluidMotion();
