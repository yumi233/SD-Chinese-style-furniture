// Drafting-table chrome: tool-rail popovers and the collapsible review drawer.
// Only one popover is open at a time; Escape or a click outside closes it and
// returns focus to the rail button that opened it.

export function initWorkbench(root = document) {
  const rail = root.querySelector(".wb-rail");
  const panels = new Map(
    [...root.querySelectorAll("[data-pop-panel]")].map((panel) => [panel.dataset.popPanel, panel]),
  );
  let openKey = null;
  const header = root.querySelector(".wb-top");
  const syncHeader = () => {
    if (header) document.body.style.setProperty("--wb-top-offset", `${header.getBoundingClientRect().height}px`);
  };
  if (header) new ResizeObserver(syncHeader).observe(header);
  syncHeader();
  const backdrop = document.createElement("button");
  backdrop.className = "wb-pop-backdrop";
  backdrop.type = "button";
  backdrop.hidden = true;
  backdrop.tabIndex = -1;
  backdrop.setAttribute("aria-label", "关闭工具面板");
  root.querySelector(".wb")?.append(backdrop);
  panels.forEach(panel => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "wb-icon-button wb-pop__close";
    button.textContent = "×";
    button.setAttribute("aria-label", "关闭工具面板");
    button.addEventListener("click", () => close({ restoreFocus: true }));
    panel.querySelector(".wb-pop__header")?.append(button);
  });
  backdrop.addEventListener("click", () => close({ restoreFocus: true }));

  function close({ restoreFocus = false } = {}) {
    if (!openKey) return;
    const panel = panels.get(openKey);
    const button = rail?.querySelector(`[data-pop="${openKey}"]`);
    if (panel) panel.hidden = true;
    button?.setAttribute("aria-expanded", "false");
    button?.classList.remove("is-active");
    openKey = null;
    backdrop.hidden = true;
    if (restoreFocus) button?.focus();
  }

  function open(key) {
    if (openKey === key) return close();
    close();
    const panel = panels.get(key);
    const button = rail?.querySelector(`[data-pop="${key}"]`);
    if (!panel || !button) return;
    panel.hidden = false;
    button.setAttribute("aria-expanded", "true");
    button.classList.add("is-active");
    openKey = key;
    backdrop.hidden = false;
    panel.querySelector("button, textarea, input, select, [tabindex]")?.focus({ preventScroll: true });
  }

  rail?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-pop]");
    if (button) open(button.dataset.pop);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && openKey) close({ restoreFocus: true });
  });
  document.addEventListener("pointerdown", (event) => {
    if (!openKey) return;
    const panel = panels.get(openKey);
    if (panel?.contains(event.target) || rail?.contains(event.target) || event.target === backdrop) return;
    close();
  });

  const drawerToggle = root.querySelector("[data-drawer-toggle]");
  const layout = root.querySelector(".studio-layout");
  drawerToggle?.addEventListener("click", () => {
    const collapsed = layout?.toggleAttribute("data-drawer-collapsed");
    drawerToggle.setAttribute("aria-expanded", String(!collapsed));
  });

  return { open, close };
}
