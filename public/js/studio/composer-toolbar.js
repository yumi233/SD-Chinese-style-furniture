// Keep the primary action and mode switch in the toolbar. Overflow uses the
// actual localized control widths, including the selected style and version.
export function initComposerToolbar() {
  const more = document.getElementById("composerMore");
  const tools = document.getElementById("composerTools");
  const bar = more.parentElement;
  const mode = document.getElementById("generationMode");
  const style = document.getElementById("styleSelect").parentElement;
  const settings = document.getElementById("settingsButton");
  const attach = document.getElementById("attachReference");
  const chat = document.getElementById("designChatButton");
  const submit = document.getElementById("generateButton");

  function setOpen(open) {
    more.setAttribute("aria-expanded", String(open));
    tools.inert = !more.hidden && !open;
  }

  function layout() {
    const css = getComputedStyle(bar);
    // Before the stylesheet applies, the gap reads "normal"; treat it as zero.
    const available = bar.clientWidth - (parseFloat(css.paddingLeft) || 0) - (parseFloat(css.paddingRight) || 0);
    const gap = parseFloat(css.columnGap) || 0;
    const pinned = mode.offsetWidth + submit.offsetWidth;
    const extra = chat.hidden ? 0 : chat.offsetWidth + gap;
    const overflow = pinned + style.offsetWidth + settings.offsetWidth + attach.offsetWidth + extra + 4 * gap > available;
    const focus = document.activeElement;
    bar.toggleAttribute("data-overflow", overflow);
    more.hidden = !overflow;
    const inlineMode = !overflow || pinned + more.offsetWidth + 2 * gap <= available;
    const coreWidth = submit.offsetWidth + more.offsetWidth + gap + (inlineMode ? mode.offsetWidth + gap : 0);
    const inlineStyle = !overflow || coreWidth + style.offsetWidth + gap <= available;
    const styleAnchor = inlineStyle ? more : settings;
    if (style.parentElement !== styleAnchor.parentElement) styleAnchor.before(style);
    const modeAnchor = inlineMode === inlineStyle ? style : inlineMode ? more : settings;
    if (mode.parentElement !== modeAnchor.parentElement) modeAnchor.before(mode);
    if (focus !== document.activeElement && (style.contains(focus) || mode.contains(focus))) {
      focus.focus({ preventScroll: true });
    }
    setOpen(overflow && (more.getAttribute("aria-expanded") === "true" || tools.contains(focus)));
    if (!overflow && focus === more) settings.focus();
  }

  const observer = new ResizeObserver(() => requestAnimationFrame(layout));
  for (const control of [bar, mode, style, settings, attach, chat, submit]) observer.observe(control);
  // A new label can change the footprint before the next resize frame,
  // especially when a running task restores its style and Stop action.
  const labels = new MutationObserver(layout);
  labels.observe(style.querySelector(".yui-picker__trigger"), { childList: true, subtree: true });
  labels.observe(submit, { childList: true });
  // The design chat entry comes and goes with the empty canvas.
  labels.observe(chat, { attributes: true, attributeFilter: ["hidden"] });
  style.addEventListener("change", layout);
  layout();
  more.addEventListener("click", () => setOpen(tools.inert));
  bar.addEventListener("keydown", event => {
    if (event.key === "Escape" && more.getAttribute("aria-expanded") === "true") {
      event.preventDefault();
      setOpen(false);
      more.focus();
    }
  });
  function dismissOutside(event) {
    if (!tools.contains(event.target) && !more.contains(event.target)) setOpen(false);
  }
  document.addEventListener("pointerdown", dismissOutside);
  document.addEventListener("focusin", dismissOutside);
  function returnTarget(button) {
    return !more.hidden && tools.contains(button) ? more : button;
  }
  function closeTools(button) {
    const opener = returnTarget(button);
    setOpen(false);
    if (opener === more) more.focus({ preventScroll: true });
    return opener;
  }
  return { closeTools, returnTarget };
}
