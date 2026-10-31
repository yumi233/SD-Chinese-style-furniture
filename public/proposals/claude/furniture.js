// Parametric furniture, ray-cast into a grid. One model, four renderings:
// ascii (glyphs), dither (Bayer blocks), slices (scan lines) and solid (shaded wood).

const rad = (d) => (d * Math.PI) / 180;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

export const WOODS = {
  walnut: { name: "黑胡桃", rgb: [92, 62, 44] },
  cherry: { name: "樱桃木", rgb: [150, 88, 60] },
  ash: { name: "白蜡木", rgb: [206, 182, 146] },
  bamboo: { name: "竹", rgb: [196, 168, 98] },
  ink: { name: "墨染", rgb: [44, 44, 48] },
};

export const PART_NAMES = { seat: "座面", back: "靠背", arm: "扶手", leg: "腿", rail: "横枨", top: "台面", apron: "牙板", body: "柜体", door: "柜门", deck: "床板", cushion: "垫", end: "床头" };

export const DEFAULTS = { arm: 1, back: 1, leg: 1, seat: 1, wood: "walnut" };

// Boxes: centre c, half-size h, tilt about x (deg), explode direction e. Units: cm.
export function build(kind, p = DEFAULTS) {
  const q = { ...DEFAULTS, ...p };
  if (kind === "table") return [
    { name: "top", c: [0, 72, 0], h: [56, 2 * q.seat, 30], e: [0, 1, 0] },
    { name: "apron", c: [0, 66, 0], h: [50, 3, 24], e: [0, 0.4, 0] },
    ...[[-48, 22], [48, 22], [-48, -22], [48, -22]].map(([x, z]) => ({ name: "leg", c: [x, 34, z], h: [2.2 * q.leg, 34, 2.2 * q.leg], e: [Math.sign(x), -0.4, Math.sign(z) * 0.6] })),
  ];
  if (kind === "cabinet") return [
    { name: "body", c: [0, 52, 0], h: [36, 38, 20], e: [0, 0, -0.6] },
    { name: "door", c: [-17.5, 52, 21], h: [17, 36, 1], e: [-0.8, 0, 1] },
    { name: "door", c: [17.5, 52, 21], h: [17, 36, 1], e: [0.8, 0, 1] },
    { name: "top", c: [0, 91.5, 0], h: [38, 1.5, 22], e: [0, 1, 0] },
    ...[[-32, 16], [32, 16], [-32, -16], [32, -16]].map(([x, z]) => ({ name: "leg", c: [x, 7, z], h: [1.6 * q.leg, 7, 1.6 * q.leg], e: [Math.sign(x) * 0.6, -1, Math.sign(z) * 0.5] })),
  ];
  // chair
  const backH = 15 * q.back;
  const arm = q.arm;
  return [
    { name: "seat", c: [0, 42, 2], h: [25, 2.4 * q.seat, 23], e: [0, 0.2, 0.4] },
    { name: "back", c: [0, 47 + backH, -21], h: [25, backH, 1.8], tilt: -12, e: [0, 0.4, -1] },
    { name: "leg", c: [-21, 20, 19], h: [1.8 * q.leg, 20, 1.8 * q.leg], e: [-0.8, -0.6, 0.6] },
    { name: "leg", c: [21, 20, 19], h: [1.8 * q.leg, 20, 1.8 * q.leg], e: [0.8, -0.6, 0.6] },
    { name: "leg", c: [-21, 26, -17], h: [1.8 * q.leg, 26, 1.8 * q.leg], e: [-0.8, -0.4, -0.7] },
    { name: "leg", c: [21, 26, -17], h: [1.8 * q.leg, 26, 1.8 * q.leg], e: [0.8, -0.4, -0.7] },
    { name: "arm", c: [-25, 58, 0], h: [2 * arm, 1.4 * arm, 19], e: [-1, 0.5, 0] },
    { name: "arm", c: [25, 58, 0], h: [2 * arm, 1.4 * arm, 19], e: [1, 0.5, 0] },
    { name: "arm", c: [-25, 51, 15], h: [1.4 * arm, 7, 1.4 * arm], e: [-1, 0.2, 0.4] },
    { name: "arm", c: [25, 51, 15], h: [1.4 * arm, 7, 1.4 * arm], e: [1, 0.2, 0.4] },
    { name: "rail", c: [0, 10, 19], h: [19, 1.2 * q.leg, 1.2 * q.leg], e: [0, -0.8, 0.8] },
  ];
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const rotX = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c]; };
const rotY = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]; };
const LIGHT = norm([-0.55, 0.85, 0.65]);

// Orthographic ray-cast over a cols x rows grid; cellAspect = cell height / cell width.
export function sample(parts, { cols, rows, cellAspect = 1, explode = 0, yaw = 34, pitch = 20, zoom = 1 }) {
  let minY = Infinity, maxY = -Infinity, maxR = 0;
  for (const p of parts) {
    minY = Math.min(minY, p.c[1] - p.h[1]);
    maxY = Math.max(maxY, p.c[1] + p.h[1]);
    maxR = Math.max(maxR, Math.hypot(p.c[0], p.c[2]) + Math.hypot(p.h[0], p.h[2]));
  }
  const cy = (minY + maxY) / 2;
  const span = Math.max(maxY - minY, maxR * 1.6) * (1.15 + explode * 0.9);
  const unit = Math.max(span / (rows * cellAspect), span / cols) / zoom;
  const placed = parts.map((p) => ({
    ...p,
    o: [p.c[0] + p.e[0] * explode * 26, p.c[1] + p.e[1] * explode * 26, p.c[2] + p.e[2] * explode * 26],
    t: rad(p.tilt || 0),
  }));
  const d = rotY(rotX([0, 0, -1], rad(-pitch)), rad(-yaw));
  const out = new Array(cols * rows);
  for (let r = 0; r < rows; r += 1) {
    for (let k = 0; k < cols; k += 1) {
      const u = (k - cols / 2 + 0.5) * unit;
      const v = -(r - rows / 2 + 0.5) * unit * cellAspect;
      let o = rotY(rotX([u, v, 500], rad(-pitch)), rad(-yaw));
      o = [o[0], o[1] + cy, o[2]];
      let best = null;
      for (let i = 0; i < placed.length; i += 1) {
        const p = placed[i];
        const lo = rotX(sub(o, p.o), -p.t);
        const ld = rotX(d, -p.t);
        let tmin = -Infinity, tmax = Infinity, axis = 0, sign = 1, miss = false;
        for (let a = 0; a < 3; a += 1) {
          if (Math.abs(ld[a]) < 1e-9) { if (Math.abs(lo[a]) > p.h[a]) { miss = true; break; } continue; }
          let t1 = (-p.h[a] - lo[a]) / ld[a], t2 = (p.h[a] - lo[a]) / ld[a], s = -1;
          if (t1 > t2) { [t1, t2] = [t2, t1]; s = 1; }
          if (t1 > tmin) { tmin = t1; axis = a; sign = s; }
          tmax = Math.min(tmax, t2);
        }
        if (miss || tmin > tmax || tmax < 0) continue;
        if (!best || tmin < best.depth) {
          const n = [0, 0, 0];
          n[axis] = sign;
          const hitLocal = [lo[0] + ld[0] * tmin, lo[1] + ld[1] * tmin, lo[2] + ld[2] * tmin];
          best = { depth: tmin, n: rotX(n, p.t), part: i, axis, local: hitLocal };
        }
      }
      if (!best) { out[r * cols + k] = null; continue; }
      const lambert = Math.max(0, dot(best.n, LIGHT));
      const p = placed[best.part];
      // grain runs along the longest axis of the part
      const long = p.h[0] >= p.h[1] && p.h[0] >= p.h[2] ? 0 : p.h[1] >= p.h[2] ? 1 : 2;
      const across = best.local[(long + 1) % 3 === best.axis ? (long + 2) % 3 : (long + 1) % 3];
      const grain = Math.sin(across * 2.1 + Math.sin(best.local[long] * 0.18) * 2.4) * 0.5 + 0.5;
      out[r * cols + k] = { shade: 0.12 + 0.88 * lambert, part: best.part, name: p.name, grain };
    }
  }
  return out;
}

export const RAMP = " .:-=+*#%@";
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const tone = (s) => clamp((1 - s.shade) ** 1.6 * 1.5);

function edge(g, cols, rows, k, r) {
  const s = g[r * cols + k];
  for (const [dk, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const kk = k + dk, rr = r + dr;
    if (kk < 0 || rr < 0 || kk >= cols || rr >= rows) return true;
    const n = g[rr * cols + kk];
    if (!n || n.part !== s.part || Math.abs(n.shade - s.shade) > 0.08) return true;
  }
  return false;
}

// Deterministic per-cell noise for assemble / scatter effects.
const hash = (k, r) => { const x = Math.sin(k * 127.1 + r * 311.7) * 43758.5453; return x - Math.floor(x); };

function rgba([r, g, b], a = 1) { return `rgba(${r | 0},${g | 0},${b | 0},${a})`; }
function hex(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

/**
 * Render a model into a 2D canvas context of css size w x h.
 * opts: mode ascii|dither|slices|solid, explode, yaw, pitch, zoom, assemble 0..1,
 *       block (dither px), ink, paper, accent (hex), highlight (part name), params.
 */
export function render(ctx, w, h, kind, params, opts = {}) {
  const { mode = "solid", explode = 0, yaw = 34, pitch = 20, zoom = 1, assemble = 1, block = 4, highlight = null } = opts;
  const ink = hex(opts.ink || "#141414"), paper = hex(opts.paper || "#f4f3ef"), accent = hex(opts.accent || "#3d5afe");
  const parts = build(kind, params);
  const wood = WOODS[(params && params.wood) || "walnut"].rgb;
  ctx.clearRect(0, 0, w, h);
  const view = { explode, yaw, pitch, zoom };
  const show = (k, r) => assemble >= 1 || hash(k, r) < assemble;

  if (mode === "ascii") {
    const fs = opts.fontSize || Math.max(7, Math.round(Math.min(w, h) / 46));
    const cw = fs * 0.6, ch = fs * 1.2;
    const cols = Math.floor(w / cw), rows = Math.floor(h / ch);
    const g = sample(parts, { cols, rows, cellAspect: ch / cw, ...view });
    ctx.font = `${fs}px ui-monospace, "SFMono-Regular", Menlo, monospace`;
    ctx.textBaseline = "top";
    const ox = (w - cols * cw) / 2, oy = (h - rows * ch) / 2;
    for (let r = 0; r < rows; r += 1) for (let k = 0; k < cols; k += 1) {
      const s = g[r * cols + k];
      if (!s) continue;
      if (!show(k, r)) {
        // not yet assembled: a faint glyph drifting toward its place
        if (hash(r, k) < 0.25) { ctx.fillStyle = rgba(ink, 0.18); ctx.fillText(".:-+"[Math.floor(hash(k + 3, r) * 4)], ox + k * cw + (hash(k, r + 9) - 0.5) * 40 * (1 - assemble), oy + r * ch + (hash(k + 5, r) - 0.5) * 40 * (1 - assemble)); }
        continue;
      }
      const t = clamp(tone(s) + (edge(g, cols, rows, k, r) ? 0.5 : 0));
      ctx.fillStyle = s.name === highlight ? rgba(accent) : rgba(ink, 0.35 + t * 0.65);
      ctx.fillText(RAMP[1 + Math.min(RAMP.length - 2, Math.floor(t * (RAMP.length - 1)))], ox + k * cw, oy + r * ch);
    }
    return;
  }
  if (mode === "dither") {
    const px = Math.max(2, block);
    const cols = Math.ceil(w / px), rows = Math.ceil(h / px);
    const g = sample(parts, { cols, rows, ...view });
    for (let r = 0; r < rows; r += 1) for (let k = 0; k < cols; k += 1) {
      const s = g[r * cols + k];
      if (!s || !show(k, r)) continue;
      const e = edge(g, cols, rows, k, r);
      const lum = e ? 0 : clamp(0.06 + tone(s) * 0.9);
      const on = lum > (BAYER[r % 4][k % 4] + 0.5) / 16;
      const base = s.name === highlight ? accent : ink;
      ctx.fillStyle = on ? rgba(base) : rgba(base, 0.12);
      ctx.fillRect(k * px, r * px, px - (px > 3 ? 1 : 0), px - (px > 3 ? 1 : 0));
    }
    return;
  }
  if (mode === "slices") {
    const step = opts.step || 5;
    const cols = Math.ceil(w / 2), rows = Math.ceil(h / step);
    const g = sample(parts, { cols, rows, cellAspect: step / 2, ...view });
    ctx.lineCap = "round";
    for (let r = 0; r < rows; r += 1) {
      let start = -1, acc = 0, name = null;
      for (let k = 0; k <= cols; k += 1) {
        const s = k < cols ? g[r * cols + k] : null;
        const prev = k > 0 ? g[r * cols + k - 1] : null;
        if (start >= 0 && (!s || s.part !== prev.part)) {
          const a = 0.3 + 0.7 * clamp(tone({ shade: acc / (k - start) }) + 0.15);
          ctx.strokeStyle = name === highlight ? rgba(accent) : rgba(ink, a);
          ctx.lineWidth = Math.max(1.2, step * 0.42);
          const y = r * step + step / 2;
          const reveal = assemble >= 1 ? 1 : clamp(assemble * 1.4 - hash(r, 1) * 0.4);
          if (reveal > 0) { ctx.beginPath(); ctx.moveTo(start * 2, y); ctx.lineTo(start * 2 + (k - start) * 2 * reveal, y); ctx.stroke(); }
          start = -1;
        }
        if (s && start < 0) { start = k; acc = 0; name = s.name; }
        if (s) acc += s.shade;
      }
    }
    return;
  }
  // solid: shaded wood, written straight into pixels at half resolution
  const scale = opts.pixel || 2;
  const cols = Math.ceil(w / scale), rows = Math.ceil(h / scale);
  const g = sample(parts, { cols, rows, ...view });
  const img = ctx.createImageData(cols, rows);
  for (let i = 0; i < g.length; i += 1) {
    const s = g[i];
    const o = i * 4;
    if (!s) { img.data[o + 3] = 0; continue; }
    const k = i % cols, r = (i / cols) | 0;
    const e = edge(g, cols, rows, k, r);
    const light = 0.38 + 0.72 * s.shade;
    const grain = 0.95 + s.grain * 0.07;
    const base = s.name === highlight ? accent : wood;
    for (let c = 0; c < 3; c += 1) img.data[o + c] = clamp(base[c] * light * grain * (e ? 0.72 : 1), 0, 255);
    img.data[o + 3] = 255;
  }
  const tmp = document.createElement("canvas");
  tmp.width = cols; tmp.height = rows;
  tmp.getContext("2d").putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(tmp, 0, 0, cols * scale, rows * scale);
}

// Which part covers most of a rectangle (fractions 0..1 of the canvas)?
export function partAt(kind, params, rect, { aspect = 1, ...opts } = {}) {
  const cols = 80, rows = Math.max(1, Math.round(80 * aspect));
  const g = sample(build(kind, params), { cols, rows, ...opts });
  const count = {};
  for (let r = Math.floor(rect.y * rows); r < Math.ceil((rect.y + rect.h) * rows); r += 1)
    for (let k = Math.floor(rect.x * cols); k < Math.ceil((rect.x + rect.w) * cols); k += 1) {
      const s = g[r * cols + k];
      if (s) count[s.name] = (count[s.name] || 0) + 1;
    }
  return Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

// Map a Chinese instruction (and optional selected part) onto parameter changes.
export function applyEdit(params, instruction, part) {
  const p = { ...DEFAULTS, ...params };
  const text = instruction || "";
  const target =
    (/扶手/.test(text) && "arm") || (/靠背|椅背/.test(text) && "back") || (/腿|脚/.test(text) && "leg") ||
    (/座|坐/.test(text) && "seat") || (part === "arm" || part === "back" || part === "leg" || part === "seat" ? part : null) ||
    (part === "rail" ? "leg" : null);
  const thinner = /薄|细|轻|窄|小/.test(text), thicker = /厚|粗|重|宽|大|结实/.test(text);
  const higher = /高|长/.test(text), lower = /低|矮|短/.test(text);
  let changed = target;
  if (target === "back" && (higher || lower)) p.back = clamp(p.back * (higher ? 1.22 : 0.78), 0.6, 1.5);
  else if (target && (thinner || thicker)) p[target] = clamp(p[target] * (thinner ? 0.62 : 1.45), 0.4, 2.2);
  else if (target) p[target] = clamp(p[target] * 0.75, 0.4, 2.2);
  for (const [key, wood] of Object.entries(WOODS)) if (text.includes(wood.name.replace("木", "")) || text.includes(wood.name)) { p.wood = key; changed = changed || "wood"; }
  if (/浅|白/.test(text)) { p.wood = "ash"; changed = changed || "wood"; }
  if (/深|黑/.test(text) && !/胡桃/.test(text)) { p.wood = "ink"; changed = changed || "wood"; }
  if (!changed) { p.arm = clamp(p.arm * 0.85, 0.4, 2.2); p.back = clamp(p.back * 1.08, 0.6, 1.5); changed = "arm"; }
  return { params: p, changed };
}

// Six review dimensions, derived from the parameters so edits move the scores.
export const DIMENSIONS = ["文化准确性", "结构合理性", "材料工艺", "设计创新", "场景适配", "AI 使用"];
// bonus: later agent rounds have the previous review to work from.
export function review(params, seed = 1, bonus = 0) {
  const p = { ...DEFAULTS, ...params };
  const j = (i) => Math.round((hash(seed * 7 + i, i * 3) - 0.5) * 6);
  const scores = [
    80 + (p.back > 0.9 ? 6 : 0) + j(0),
    88 - Math.abs(p.leg - 1) * 30 - (p.arm < 0.6 ? 8 : 0) + j(1),
    82 + (p.wood === "walnut" || p.wood === "cherry" ? 6 : 2) + j(2),
    76 + Math.abs(p.arm - 1) * 18 + Math.abs(p.back - 1) * 10 + j(3),
    84 + (p.arm < 1 ? 4 : 0) + j(4),
    86 + j(5),
  ].map((v) => Math.round(clamp(v + bonus, 52, 98)));
  // each note carries the instruction that would fix it
  const notes = [];
  if (p.arm > 1.3) notes.push({ part: "arm", text: "扶手偏粗，侧面看略显笨重", fix: "扶手再薄一点" });
  if (p.arm < 0.6) notes.push({ part: "arm", text: "扶手很薄，需确认握持强度", fix: "扶手再厚一点" });
  if (p.leg < 0.75) notes.push({ part: "leg", text: "腿足偏细，建议加粗或换硬木", fix: "腿再粗一点" });
  if (p.back < 0.85) notes.push({ part: "back", text: "靠背偏低，长坐支撑不足", fix: "靠背高一点" });
  const weakest = scores.indexOf(Math.min(...scores));
  const BY_DIMENSION = [
    { part: "back", text: "靠背比例偏矮，少了一点传统的挺拔", fix: "靠背高一点" },
    { part: "leg", text: "腿足略单薄，承重看起来不够稳", fix: "腿再粗一点" },
    { part: "seat", text: "座面偏厚，木材的轻盈没有显出来", fix: "座面再薄一点" },
    { part: "arm", text: "造型偏保守，扶手可以更轻巧", fix: "扶手再薄一点" },
    { part: "arm", text: "放进小空间略显笨重", fix: "扶手再薄一点" },
    { part: "seat", text: "细节偏少，座面边缘可以收薄", fix: "座面再薄一点" },
  ];
  if (!notes.length) notes.push(BY_DIMENSION[weakest]);
  return { scores, total: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length), notes };
}
