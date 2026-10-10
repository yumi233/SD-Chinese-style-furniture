// Contour lines for the Musheng workbench.
//
// A smooth noise field plus optional "knots" (radial bumps, like the heart of a
// log) is traced with marching squares. Every fifth level is an index contour:
// drawn heavier and labelled with its elevation, as on a survey map. The field
// can drift slowly (idle), move faster while a generation runs (busy), or stay
// still when the user prefers reduced motion.

const SVG_NS = "http://www.w3.org/2000/svg";

function hash(x, y, z, seed) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 144269504) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

function valueNoise(x, y, z, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const zf = smooth(z - zi);
  const lerp = (a, b, t) => a + (b - a) * t;
  const corner = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz, seed);
  return lerp(
    lerp(lerp(corner(0, 0, 0), corner(1, 0, 0), xf), lerp(corner(0, 1, 0), corner(1, 1, 0), xf), yf),
    lerp(lerp(corner(0, 0, 1), corner(1, 0, 1), xf), lerp(corner(0, 1, 1), corner(1, 1, 1), xf), yf),
    zf,
  );
}

function fbm(x, y, z, seed) {
  let total = 0;
  let amplitude = 0.55;
  let frequency = 1;
  for (let octave = 0; octave < 3; octave += 1) {
    total += valueNoise(x * frequency, y * frequency, z, seed + octave * 17) * amplitude;
    frequency *= 2.03;
    amplitude *= 0.48;
  }
  return total;
}

/**
 * Builds contour geometry. Returns one entry per level with an SVG path and,
 * for index contours, a label position.
 */
export function traceContours({ width, height, cell = 14, levels = 18, time = 0, seed = 7, scale = 360, knots = [] }) {
  const cols = Math.ceil(width / cell) + 1;
  const rows = Math.ceil(height / cell) + 1;
  const field = new Float32Array(cols * rows);
  let min = Infinity;
  let max = -Infinity;
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const x = i * cell;
      const y = j * cell;
      // Slight horizontal stretch reads as wood grain rather than terrain.
      let value = fbm(x / (scale * 1.35), y / scale, time, seed);
      for (const knot of knots) {
        const dx = (x - knot.x * width) / (knot.r * Math.min(width, height));
        const dy = (y - knot.y * height) / (knot.r * Math.min(width, height));
        value += (knot.strength ?? 0.55) * Math.exp(-(dx * dx + dy * dy));
      }
      field[j * cols + i] = value;
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }

  const result = [];
  const span = max - min || 1;
  for (let level = 1; level <= levels; level += 1) {
    const threshold = min + (span * level) / (levels + 1);
    let d = "";
    let label = null;
    for (let j = 0; j < rows - 1; j += 1) {
      for (let i = 0; i < cols - 1; i += 1) {
        const a = field[j * cols + i];
        const b = field[j * cols + i + 1];
        const c = field[(j + 1) * cols + i + 1];
        const e = field[(j + 1) * cols + i];
        const index = (a > threshold ? 8 : 0) | (b > threshold ? 4 : 0) | (c > threshold ? 2 : 0) | (e > threshold ? 1 : 0);
        if (index === 0 || index === 15) continue;
        const x = i * cell;
        const y = j * cell;
        const t = (p, q) => (threshold - p) / (q - p || 1e-6);
        const top = [x + cell * t(a, b), y];
        const right = [x + cell, y + cell * t(b, c)];
        const bottom = [x + cell * t(e, c), y + cell];
        const left = [x, y + cell * t(a, e)];
        const segments = {
          1: [[left, bottom]], 2: [[bottom, right]], 3: [[left, right]], 4: [[top, right]],
          5: [[left, top], [bottom, right]], 6: [[top, bottom]], 7: [[left, top]], 8: [[left, top]],
          9: [[top, bottom]], 10: [[left, bottom], [top, right]], 11: [[top, right]], 12: [[left, right]],
          13: [[bottom, right]], 14: [[left, bottom]],
        }[index];
        for (const [p, q] of segments) {
          d += `M${p[0].toFixed(1)} ${p[1].toFixed(1)}L${q[0].toFixed(1)} ${q[1].toFixed(1)}`;
          if (!label && level % 5 === 0 && i > cols * 0.15 && i < cols * 0.85 && j > rows * 0.15 && j < rows * 0.85) {
            label = { x: (p[0] + q[0]) / 2, y: (p[1] + q[1]) / 2 };
          }
        }
      }
    }
    result.push({ level, d, index: level % 5 === 0, label });
  }
  return result;
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/**
 * Mounts a live contour field into `host` (an element with a size). The SVG is
 * decorative and hidden from assistive technology.
 */
export function mountContours(host, options = {}) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", `contour-field ${options.className || ""}`.trim());
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("preserveAspectRatio", "none");
  host.prepend(svg);

  let mode = options.mode || "idle";
  let time = options.seedTime ?? Math.random() * 10;
  let frame = 0;
  let last = 0;
  let visible = true;
  let width = 0;
  let height = 0;
  const speeds = { still: 0, idle: 0.004, busy: 0.03, done: 0.012 };
  const interval = 1000 / (options.fps || 12);

  function draw() {
    if (!width || !height) return;
    const contours = traceContours({ ...options, width, height, time });
    const labels = options.labels !== false;
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.replaceChildren(
      ...contours.flatMap(({ d, index, label, level }) => {
        const path = document.createElementNS(SVG_NS, "path");
        path.setAttribute("d", d);
        path.setAttribute("class", index ? "contour-line contour-line--index" : "contour-line");
        if (!labels || !index || !label) return [path];
        const text = document.createElementNS(SVG_NS, "text");
        text.setAttribute("x", label.x.toFixed(1));
        text.setAttribute("y", label.y.toFixed(1));
        text.setAttribute("class", "contour-label");
        text.textContent = String((options.labelBase ?? 1000) + level * (options.labelStep ?? 20));
        return [path, text];
      }),
    );
  }

  function tick(now) {
    frame = 0;
    if (!visible || document.hidden) return;
    const speed = prefersReducedMotion() ? 0 : speeds[mode] ?? 0;
    if (now - last >= interval) {
      last = now;
      time += speed;
      draw();
    }
    if (speed > 0) frame = requestAnimationFrame(tick);
  }

  function request() {
    if (!frame) frame = requestAnimationFrame(tick);
  }

  const resize = new ResizeObserver(() => {
    const rect = host.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));
    draw();
  });
  resize.observe(host);
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true;
    if (visible) request();
  });
  intersection.observe(host);
  document.addEventListener("visibilitychange", request);

  request();

  return {
    setMode(next) {
      mode = next;
      svg.dataset.mode = next;
      request();
    },
    destroy() {
      cancelAnimationFrame(frame);
      resize.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", request);
      svg.remove();
    },
  };
}

/**
 * Draws the six review dimensions as growth rings: one ring per dimension,
 * filled clockwise to its score. Reads values from the existing score elements
 * so the studio script stays the single owner of the data.
 */
export function mountGrowthRings(host, items) {
  const size = 220;
  const center = size / 2;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.setAttribute("class", "growth-rings");
  svg.setAttribute("role", "img");
  host.prepend(svg);

  function read() {
    return items.map(({ element, label }) => {
      const value = Number.parseInt(element?.textContent || "", 10);
      return { label, value: Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : null };
    });
  }

  function draw() {
    const values = read();
    const known = values.filter((item) => item.value !== null);
    const average = known.length ? Math.round(known.reduce((sum, item) => sum + item.value, 0) / known.length) : null;
    svg.setAttribute(
      "aria-label",
      average === null ? "评审维度尚未评分" : `评审维度：${values.map((item) => `${item.label} ${item.value ?? "未评分"}`).join("，")}`,
    );
    const nodes = [];
    values.forEach((item, index) => {
      const radius = 96 - index * 13;
      const circumference = 2 * Math.PI * radius;
      const track = document.createElementNS(SVG_NS, "circle");
      track.setAttribute("cx", center);
      track.setAttribute("cy", center);
      track.setAttribute("r", radius);
      track.setAttribute("class", "growth-rings__track");
      nodes.push(track);
      const arc = document.createElementNS(SVG_NS, "circle");
      arc.setAttribute("cx", center);
      arc.setAttribute("cy", center);
      arc.setAttribute("r", radius);
      arc.setAttribute("class", `growth-rings__arc growth-rings__arc--${index}${item.value === null ? " is-empty" : ""}`);
      arc.setAttribute("stroke-dasharray", `${((item.value ?? 0) / 100) * circumference} ${circumference}`);
      arc.setAttribute("transform", `rotate(-90 ${center} ${center})`);
      nodes.push(arc);
    });
    const score = document.createElementNS(SVG_NS, "text");
    score.setAttribute("x", center);
    score.setAttribute("y", center + 6);
    score.setAttribute("class", "growth-rings__score");
    score.textContent = average === null ? "--" : String(average);
    const caption = document.createElementNS(SVG_NS, "text");
    caption.setAttribute("x", center);
    caption.setAttribute("y", center + 24);
    caption.setAttribute("class", "growth-rings__caption");
    caption.textContent = "AVG";
    nodes.push(score, caption);
    svg.replaceChildren(...nodes);
  }

  const observer = new MutationObserver(draw);
  for (const { element } of items) {
    if (element) observer.observe(element, { childList: true, characterData: true, subtree: true });
  }
  draw();
  return { refresh: draw, destroy: () => observer.disconnect() };
}
