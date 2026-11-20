import { studioCopy } from "../modules/locale.js";

export function createCanvas(viewport, world, onZoom) {
  const view = { x: 64, y: 144, scale: 1 };
  const pointers = new Map();
  let gesture = null;
  const apply = () => {
    world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    viewport.style.backgroundPosition = `${view.x}px ${view.y}px`;
    viewport.style.backgroundSize = `${24 * view.scale}px ${24 * view.scale}px`;
    onZoom(Math.round(view.scale * 100));
  };
  const zoom = (next, x = viewport.clientWidth / 2, y = viewport.clientHeight / 2) => {
    const scale = Math.max(.25, Math.min(2, next));
    view.x = x - (x - view.x) * scale / view.scale;
    view.y = y - (y - view.y) * scale / view.scale;
    view.scale = scale; apply();
  };
  viewport.addEventListener("wheel", event => {
    if (event.target.closest(".version-card")) {
      if (event.target.closest("textarea, input")) return;
    }
    event.preventDefault();
    if (event.shiftKey) { view.x -= event.deltaY; view.y -= event.deltaX; apply(); }
    else zoom(view.scale * Math.exp(-event.deltaY * .003), event.clientX, event.clientY);
  }, { passive: false });
  viewport.addEventListener("pointerdown", event => {
    if (event.target.closest("button, input, textarea, a, .version-card, .studio-empty")) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    viewport.setPointerCapture(event.pointerId);
    gesture = null;
  });
  viewport.addEventListener("pointermove", event => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (gesture) {
        zoom(view.scale * distance / Math.max(1, gesture.distance), center.x, center.y);
        view.x += center.x - gesture.center.x; view.y += center.y - gesture.center.y; apply();
      }
      gesture = { distance, center };
    } else { view.x += event.clientX - previous.x; view.y += event.clientY - previous.y; apply(); }
  });
  const release = event => { pointers.delete(event.pointerId); gesture = null; };
  viewport.addEventListener("pointerup", release);
  viewport.addEventListener("pointercancel", release);
  viewport.addEventListener("lostpointercapture", release);
  viewport.addEventListener("keydown", event => {
    if (event.target !== viewport) return;
    const directions = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] };
    if (directions[event.key]) { event.preventDefault(); view.x += directions[event.key][0]; view.y += directions[event.key][1]; apply(); }
    if (event.key === "+" || event.key === "=") zoom(view.scale * 1.2);
    if (event.key === "-") zoom(view.scale / 1.2);
  });
  apply();
  return {
    zoom: factor => zoom(view.scale * factor),
    center(position = { x: 0, y: 0 }) {
      const mobile = viewport.clientWidth <= 760;
      view.scale = mobile ? Math.min(.88, (viewport.clientWidth - 48) / 360) : 1;
      const available = viewport.clientWidth - (document.body.classList.contains("has-review") && !mobile ? 320 : 0);
      if (mobile) {
        const top = (document.querySelector(".studio-bar").getBoundingClientRect().bottom || 56) + 8;
        const composer = document.querySelector(".studio-composer");
        const review = document.querySelector(".review-panel:not([hidden])");
        // Center before the ResizeObserver callback too, using the current composer height.
        const bottom = review
          ? Math.min(review.getBoundingClientRect().top, viewport.clientHeight - composer.offsetHeight - review.offsetHeight - 16)
          : composer.getBoundingClientRect().top;
        const room = bottom - top;
        if (room < 360 * view.scale) {
          // Leave space for the fixed actions while keeping the image container intact.
          view.scale = Math.max(.25, Math.min(.87, view.scale, (room - 48) / 312));
          view.y = top + Math.max(0, (room - 48 - 312 * view.scale) / 2) - position.y * view.scale;
        } else {
          view.y = top + (room - 360 * view.scale) / 2 - position.y * view.scale;
        }
      } else {
        view.y = Math.max(100, (viewport.clientHeight - 240 - 344 * view.scale) / 2) - position.y * view.scale;
      }
      view.x = (available - 360 * view.scale) / 2 - position.x * view.scale;
      apply();
    },
  };
}
// Selection coordinates follow the contained image, including any letterboxing.
export function enableRegion(media, image, { opener, controls, cancel, status, onRegion }) {
  const minimum = .025;
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  let region = { x: .375, y: .375, width: .25, height: .25 };
  let drag = null;
  const events = new AbortController();
  const listen = (target, type, callback) => target.addEventListener(type, callback, { signal: events.signal });
  const box = document.createElement("div");
  box.className = "region-box";
  box.tabIndex = 0;
  box.setAttribute("role", "group");
  box.setAttribute("aria-label", "改一处");
  box.dataset.uiAttrs = "aria-label";
  box.setAttribute("aria-describedby", "regionKeys regionHelp regionBounds");
  media.append(box);
  media.classList.add("region-mode");
  controls.hidden = false;
  const help = document.getElementById("regionHelp");
  function localizeHelp() {
    help.textContent = studioCopy("region.keyboardHelp");
  }
  localizeHelp();

  function bounds() {
    const outer = media.getBoundingClientRect();
    const ratio = image.naturalWidth / image.naturalHeight;
    const width = Math.min(outer.width, outer.height * ratio);
    const height = width / ratio;
    return { x: outer.x + (outer.width - width) / 2, y: outer.y + (outer.height - height) / 2, width, height, outer };
  }
  function point(event) {
    const r = bounds();
    return { x: clamp((event.clientX - r.x) / r.width, 0, 1), y: clamp((event.clientY - r.y) / r.height, 0, 1) };
  }
  function paint(selection) {
    const r = bounds();
    const locale = document.documentElement.lang;
    const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
    const values = Object.fromEntries(Object.entries(selection).map(([key, value]) => [key, percent.format(value)]));
    status.textContent = studioCopy("region.bounds", values);
    for (const [property, value] of Object.entries({
      left: (r.x - r.outer.x + selection.x * r.width) / r.outer.width,
      top: (r.y - r.outer.y + selection.y * r.height) / r.outer.height,
      width: selection.width * r.width / r.outer.width,
      height: selection.height * r.height / r.outer.height,
    })) box.style[property] = `${value * 100}%`;
  }
  function cleanup() {
    events.abort();
    if (drag && media.hasPointerCapture(drag.id)) media.releasePointerCapture(drag.id);
    media.classList.remove("region-mode");
    box.remove();
    controls.hidden = true;
  }
  function dismiss() { cleanup(); opener?.focus({ preventScroll: true }); }
  function confirm(selection) {
    cleanup();
    opener?.focus({ preventScroll: true });
    onRegion(selection);
  }
  function draggedRegion(event) {
    const end = point(event);
    const start = drag.start;
    return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
  }
  listen(box, "keydown", event => {
    if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); confirm(region); return; }
    if (event.key === "Tab" && !event.shiftKey) { event.preventDefault(); cancel.focus(); return; }
    const direction = { ArrowLeft: ["x", "width", -1], ArrowRight: ["x", "width", 1], ArrowUp: ["y", "height", -1], ArrowDown: ["y", "height", 1] }[event.key];
    if (!direction) return;
    event.preventDefault();
    const [position, size, step] = direction;
    if (event.shiftKey) region[size] = clamp(region[size] + step * .01, minimum, 1 - region[position]);
    else region[position] = clamp(region[position] + step * .01, 0, 1 - region[size]);
    paint(region);
  });
  listen(cancel, "keydown", event => {
    if (event.key === "Tab" && event.shiftKey) { event.preventDefault(); box.focus(); }
  });
  listen(cancel, "click", dismiss);
  listen(window, "musheng:locale-change", () => { localizeHelp(); paint(region); });
  listen(document, "keydown", event => { if (event.key === "Escape" && !document.querySelector("dialog[open]")) dismiss(); });
  listen(media, "pointerdown", event => {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    drag = { id: event.pointerId, start: point(event) };
    media.setPointerCapture(drag.id);
  });
  listen(media, "pointermove", event => { if (drag?.id === event.pointerId) paint(draggedRegion(event)); });
  listen(media, "pointerup", event => {
    if (drag?.id !== event.pointerId) return;
    const selection = draggedRegion(event);
    drag = null;
    if (selection.width >= minimum && selection.height >= minimum) confirm(selection);
    else paint(region);
  });
  listen(media, "pointercancel", event => {
    if (drag?.id !== event.pointerId) return;
    drag = null;
    paint(region);
  });
  paint(region);
  box.focus({ preventScroll: true });
  return cleanup;
}
