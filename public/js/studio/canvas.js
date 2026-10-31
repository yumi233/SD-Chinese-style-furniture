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
      view.x = (available - 360 * view.scale) / 2 - position.x * view.scale;
      view.y = Math.max(100, (viewport.clientHeight - 240 - 344 * view.scale) / 2) - position.y * view.scale;
      apply();
    },
  };
}
// Selection coordinates follow the contained image, including any letterboxing.
export function enableRegion(media, image, onRegion) {
  let start = null;
  const box = document.createElement("div"); box.className = "region-box"; box.hidden = true;
  media.append(box); media.classList.add("region-mode");
  function bounds() {
    const r = media.getBoundingClientRect();
    const ratio = image.naturalWidth / image.naturalHeight || r.width / r.height;
    const width = Math.min(r.width, r.height * ratio);
    const height = width / ratio;
    return { x: r.x + (r.width - width) / 2, y: r.y + (r.height - height) / 2, width, height, outer: r };
  }
  function point(event) {
    const r = bounds();
    return { x: Math.max(0, Math.min(1, (event.clientX - r.x) / r.width)), y: Math.max(0, Math.min(1, (event.clientY - r.y) / r.height)) };
  }
  function down(event) {
    event.stopPropagation(); event.preventDefault(); start = point(event); media.setPointerCapture(event.pointerId); box.hidden = false;
  }
  function move(event) {
    if (!start) return;
    const end = point(event); const r = bounds();
    const scale = media.clientWidth / r.outer.width;
    box.style.left = `${(r.x - r.outer.x + Math.min(start.x, end.x) * r.width) * scale}px`;
    box.style.top = `${(r.y - r.outer.y + Math.min(start.y, end.y) * r.height) * scale}px`;
    box.style.width = `${Math.abs(end.x - start.x) * r.width * scale}px`;
    box.style.height = `${Math.abs(end.y - start.y) * r.height * scale}px`;
  }
  function up(event) {
    if (!start) return;
    const end = point(event);
    const region = { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
    start = null;
    if (region.width < .025 || region.height < .025) { box.hidden = true; return; }
    cleanup(); onRegion(region);
  }
  const cancel = () => { start = null; box.hidden = true; };
  const escape = event => { if (event.key === "Escape") cleanup(); };
  function cleanup() {
    media.classList.remove("region-mode"); box.remove();
    media.removeEventListener("pointerdown", down); media.removeEventListener("pointermove", move); media.removeEventListener("pointerup", up); media.removeEventListener("pointercancel", cancel); document.removeEventListener("keydown", escape);
  }
  media.addEventListener("pointerdown", down); media.addEventListener("pointermove", move); media.addEventListener("pointerup", up); media.addEventListener("pointercancel", cancel); document.addEventListener("keydown", escape);
  return cleanup;
}
