import "./material-motion.js";
// One moving surface communicates which item in a group has focus or selection.
export function initFluidMotion(root = document) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  for (const group of root.querySelectorAll(".mode-switch, .settings-nav, .wb-rail, .profile-mode-switch, .segmented, [data-shared-highlight]")) {
    if (group.dataset.fluidGroup) continue;
    group.dataset.fluidGroup = "true";
    const indicator = document.createElement("span");
    indicator.className = "fluid-indicator";
    indicator.setAttribute("aria-hidden", "true");
    group.append(indicator);
    let hovered = null;
    let queued = false;
    const items = () => [...group.children].filter((e) => e.matches("button, a"));
    const update = () => {
      queued = false;
      const target = hovered || items().find((e) => e.matches(".active, .is-active, [aria-selected='true'], [aria-pressed='true']"));
      if (!target || !target.getClientRects().length) { indicator.style.opacity = "0"; return; }
      const outer = group.getBoundingClientRect();
      const box = target.getBoundingClientRect();
      indicator.style.transitionDuration = reduced.matches ? "0ms" : "";
      indicator.style.width = `${box.width}px`;
      indicator.style.height = `${box.height}px`;
      indicator.style.translate = `${box.left - outer.left - group.clientLeft + group.scrollLeft}px ${box.top - outer.top - group.clientTop + group.scrollTop}px`;
      indicator.style.opacity = "1";
    };
    const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
    group.addEventListener("pointerover", (event) => {
      if (event.pointerType === "touch") return;
      const item = event.target.closest("button, a");
      if (item?.parentElement === group) { hovered = item; schedule(); }
    });
    group.addEventListener("pointerleave", () => { hovered = null; schedule(); });
    group.addEventListener("focusin", (event) => { if (event.target.parentElement === group) { hovered = event.target; schedule(); } });
    group.addEventListener("focusout", () => { hovered = null; schedule(); });
    new MutationObserver(schedule).observe(group, { subtree: true, attributes: true, attributeFilter: ["class", "aria-selected", "aria-pressed"] });
    new ResizeObserver(schedule).observe(group);
    reduced.addEventListener("change", schedule);
    document.fonts.ready.then(schedule);
    schedule();
  }
}
initFluidMotion();
