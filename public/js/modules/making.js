// Maps scroll through the making section to --draw, --fill and --open; CSS does the drawing.
const root = document.querySelector("[data-making]");

if (root) {
  const stage = root.querySelector(".making-stage");
  const sheet = root.querySelector(".making-sheet");
  const scene = root.querySelector(".making-scene");
  const captions = [...root.querySelectorAll(".making-captions h2")];
  const counter = root.querySelector("[data-making-step]");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const clamp = (v) => Math.min(1, Math.max(0, v));
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  const segment = (p, from, to) => ease(clamp((p - from) / (to - from)));
  let target = 0;
  let current = 0;
  let frame = 0;
  let step = -1;

  function measure() {
    // The room opens from the chair's centre and must reach the farthest corner of the scene.
    const box = scene.getBoundingClientRect();
    const chair = sheet.getBoundingClientRect();
    const cx = chair.left + chair.width / 2 - box.left;
    const cy = chair.top + chair.height * 0.55 - box.top;
    const rmax = Math.hypot(Math.max(cx, box.width - cx), Math.max(cy, box.height - cy));
    root.style.setProperty("--cx", `${cx}px`);
    root.style.setProperty("--cy", `${cy}px`);
    root.style.setProperty("--rmax", `${Math.ceil(rmax) + 2}px`);
  }

  function apply(p) {
    const open = segment(p, 0.7, 0.9);
    root.style.setProperty("--draw", segment(p, 0.02, 0.34).toFixed(4));
    root.style.setProperty("--fill", segment(p, 0.38, 0.64).toFixed(4));
    root.style.setProperty("--open", open.toFixed(4));
    root.style.setProperty("--progress", p.toFixed(4));
    const next = p < 0.36 ? 0 : p < 0.68 ? 1 : 2;
    if (next !== step) {
      step = next;
      captions.forEach((caption, i) => {
        caption.classList.toggle("is-active", i === step);
        caption.classList.toggle("is-past", i < step);
        caption.setAttribute("aria-hidden", String(i !== step));
      });
      counter.textContent = `0${step + 1}`;
    }
    scene.inert = open < 0.9;
  }

  function read() {
    const travel = root.offsetHeight - stage.offsetHeight;
    target = travel > 0 ? clamp(-root.getBoundingClientRect().top / travel) : 1;
  }

  function tick() {
    current += (target - current) * 0.18;
    if (Math.abs(target - current) < 0.0005) current = target;
    apply(current);
    frame = current === target ? 0 : requestAnimationFrame(tick);
  }

  function update() {
    if (reduced.matches) {
      apply(1);
      return;
    }
    read();
    if (!frame) frame = requestAnimationFrame(tick);
  }

  addEventListener("scroll", update, { passive: true });
  addEventListener("resize", () => { measure(); update(); });
  reduced.addEventListener("change", update);
  new ResizeObserver(measure).observe(stage);
  measure();
  read();
  current = target;
  apply(reduced.matches ? 1 : current);
}
