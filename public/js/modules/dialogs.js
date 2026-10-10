const focusableSelector = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function visible(root) {
  return !root.classList.contains("hidden") && !root.hasAttribute("hidden");
}

export function enhanceDialog(root, { closeSelector = null } = {}) {
  if (!root) return;
  let trigger = null;
  let inertSiblings = [];
  const viewport = window.visualViewport;
  const updateViewport = () => {
    const zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    const height = (viewport?.height || window.innerHeight) / zoom;
    root.style.setProperty("--dialog-viewport-height", `${height}px`);
    root.style.setProperty("--dialog-center-y", `${height / 2 + (viewport?.offsetTop || 0) / zoom}px`);
  };
  const zoomObserver = new MutationObserver(updateViewport);
  zoomObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
  viewport?.addEventListener("resize", updateViewport);
  viewport?.addEventListener("scroll", updateViewport);
  window.addEventListener("resize", updateViewport);
  updateViewport();
  const rememberTrigger = () => {
    if (visible(root) && !trigger && document.activeElement instanceof HTMLElement) {
      trigger = document.activeElement;
    }
  };
  const focusFirst = () => {
    const first = [...root.querySelectorAll(focusableSelector)].find((item) => item.getClientRects().length > 0);
    if (first) {
      first.focus({ preventScroll: true });
      return;
    }
    const title = root.querySelector("[aria-labelledby], h1, h2, h3");
    if (title instanceof HTMLElement) {
      title.tabIndex = -1;
      title.focus({ preventScroll: true });
    }
  };
  const setSiblingsInert = (isOpen) => {
    if (isOpen) {
      inertSiblings = [...document.body.children].filter((element) => element !== root && element instanceof HTMLElement);
      inertSiblings.forEach((element) => { element.inert = true; });
    } else {
      inertSiblings.forEach((element) => { element.inert = false; });
      inertSiblings = [];
    }
  };
  const restore = () => {
    if (!visible(root) && trigger) {
      setSiblingsInert(false);
      trigger.focus({ preventScroll: true });
      trigger = null;
    }
  };
  const observer = new MutationObserver(() => {
    if (visible(root)) {
      rememberTrigger();
      setSiblingsInert(true);
      window.requestAnimationFrame(focusFirst);
    } else restore();
  });
  observer.observe(root, { attributes: true, attributeFilter: ["class", "hidden"] });
  root.addEventListener("keydown", (event) => {
    if (!visible(root)) return;
    if (event.key === "Escape") {
      event.preventDefault();
      const close = closeSelector ? root.querySelector(closeSelector) : root.querySelector("[data-close-history='true'], [data-close-config='true'], [data-close-profile='true'], .config-close, .history-close, .profile-close");
      close?.click();
      return;
    }
    if (event.key !== "Tab") return;
    const items = [...root.querySelectorAll(focusableSelector)].filter((item) => item.getClientRects().length > 0);
    if (!items.length) return;
    const first = items[0];
    const last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !visible(root) || event.defaultPrevented) return;
    event.preventDefault();
    const close = closeSelector ? root.querySelector(closeSelector) : root.querySelector("[data-close-history='true'], [data-close-config='true'], [data-close-profile='true'], .config-close, .history-close, .profile-close");
    close?.click();
  });
  return () => {
    observer.disconnect();
    zoomObserver.disconnect();
    viewport?.removeEventListener("resize", updateViewport);
    viewport?.removeEventListener("scroll", updateViewport);
    window.removeEventListener("resize", updateViewport);
  };
}

export function enhanceDialogs(roots) {
  return roots.map((root) => enhanceDialog(root)).filter(Boolean);
}
