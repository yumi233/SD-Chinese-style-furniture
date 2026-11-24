// yui ascii: a picture, or anything drawn on a canvas, set in type. Density is stroke count
// (丶 一 二 十 木 林 森) or the usual ASCII ramp; the only colours are --sub, --ink and --olive.
const reduced = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
const SCALE = 4; // source pixels read per character cell, each way
const FRAME = 33; // ms between frames while something moves
const mounted = new WeakMap();

export const RAMPS = Object.freeze({
  han: Object.freeze(["　", "丶", "一", "二", "十", "木", "林", "森"]),
  ascii: Object.freeze([" ", ".", ":", "-", "=", "+", "*", "#", "%", "@"]),
});

// A ramp runs from blank to densest; its first character is never drawn.
export function resolveRamp(ramp) {
  const chars = Array.isArray(ramp) && ramp.length > 1 ? ramp : RAMPS[ramp] || RAMPS.han;
  return { chars, wide: chars.some((char) => char.codePointAt(0) > 0x2e7f) };
}

// One number per character cell: how much ink its scale × scale block of RGBA pixels holds.
// "dark" reads dark pixels as ink (a photo on a light ground), "light" reads light ones (a mask drawn white on black).
export function cellDensity(data, cols, rows, scale = SCALE, ink = "dark") {
  const width = cols * scale;
  const out = new Float32Array(cols * rows);
  for (let y = 0, i = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++, i++) {
      let sum = 0;
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const p = ((y * scale + sy) * width + x * scale + sx) * 4;
          const light = (0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]) / 255;
          sum += (data[p + 3] / 255) * (ink === "light" ? light : 1 - light);
        }
      }
      out[i] = sum / (scale * scale);
    }
  }
  return out;
}

// Stretch a flat photo so its lightest cells stay blank and its darkest reach the end of the ramp.
export function stretch(values, low = 0.02, high = 0.98) {
  if (!values.length) return values;
  const sorted = Float32Array.from(values).sort();
  const from = sorted[Math.floor((sorted.length - 1) * low)];
  const to = sorted[Math.floor((sorted.length - 1) * high)];
  if (to - from < 0.05) return values;
  for (let i = 0; i < values.length; i++) values[i] = Math.min(1, Math.max(0, (values[i] - from) / (to - from)));
  return values;
}

const pick = (option, width) => (typeof option === "function" ? option(width) : option);

/**
 * Sets `host` in type and keeps it fitted to the host's width.
 *
 * options.source  an <img>, a canvas, or (ctx, width, height) => void drawing white on black; defaults to the host's own <img>
 * options.ramp    "han", "ascii" or an array of characters from blank to densest
 * options.ink     "dark" or "light"; defaults to "dark" for pictures and "light" for drawings
 * options.cell    character size in px, or (hostWidth) => px
 * options.rows    row count, or (hostWidth) => count; otherwise options.ratio (rows per column) or the picture's own shape
 * options.settle  false to show a new source at once instead of letting the type fall into place
 * options.paint   ({ cols, rows, time, density, value, tone }) => void, called every frame for a moving field. It sets
 *                 value (0–1) and tone (0 quiet, 1 ink, 2 accent) for every cell; density is what the source gave.
 * options.paused  true to hold a moving field still: nothing is drawn until set() or draw() is called
 */
export function mountAscii(host, options = {}) {
  const existing = mounted.get(host);
  if (existing) {
    existing.set(options);
    return existing;
  }
  const state = { source: host.querySelector(":scope > img"), ramp: host.dataset.ramp || "han", ink: "", cell: Number(host.dataset.cell) || 0, rows: 0, ratio: 0, gamma: 0.75, settle: true, paint: null, paused: false, ...options };
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  host.append(canvas);
  const done = new AbortController();
  const look = { ink: "#252525", sub: "#6B6B6B", olive: "#5F7044", sans: "sans-serif", mono: "monospace", slow: 420 };
  let cols = 0, rows = 0, cell = 12, width = 0, ctx = null;
  let density = null, jitter = null, value = null, tone = null, ids = null, tones = null;
  let started = 0, settling = false, played = false, visible = true, raf = 0, last = 0, queued = false, count = 0;

  function readTokens() {
    const css = getComputedStyle(host);
    for (const name of ["ink", "sub", "olive"]) look[name] = css.getPropertyValue(`--${name}`).trim() || look[name];
    look.sans = css.getPropertyValue("--font-sans").trim() || look.sans;
    look.mono = css.getPropertyValue("--font-mono").trim() || look.mono;
    const slow = parseFloat(css.getPropertyValue("--motion-slow"));
    look.slow = Number.isFinite(slow) ? slow : 420;
  }

  // Reads the source at SCALE pixels per cell. Leaves density empty while a picture is still loading or cannot be read.
  function sample() {
    density = null;
    const source = state.source;
    if (!source) {
      density = new Float32Array(cols * rows);
    } else {
      const off = document.createElement("canvas");
      off.width = cols * SCALE;
      off.height = rows * SCALE;
      const o = off.getContext("2d", { willReadFrequently: true });
      const drawing = typeof source === "function";
      if (drawing) {
        o.fillStyle = "#000";
        o.fillRect(0, 0, off.width, off.height);
        o.fillStyle = o.strokeStyle = "#fff";
        o.lineCap = o.lineJoin = "round";
        source(o, off.width, off.height);
      } else {
        const w = source.naturalWidth || source.width;
        const h = source.naturalHeight || source.height;
        if (!w || !h) {
          source.addEventListener?.("load", () => relayout(true), { once: true, signal: done.signal });
          return;
        }
        const fit = Math.max(off.width / w, off.height / h); // cover, like the picture behind it
        o.drawImage(source, (off.width - w * fit) / 2, (off.height - h * fit) / 2, w * fit, h * fit);
      }
      try {
        density = cellDensity(o.getImageData(0, 0, off.width, off.height).data, cols, rows, SCALE, state.ink || (drawing ? "light" : "dark"));
      } catch {
        // A picture from another origin without CORS headers cannot be read; the plain picture stays.
        host.dataset.ascii = "blocked";
        return;
      }
      if (!drawing) stretch(density);
    }
    host.dataset.ascii = "ready";
  }

  function layout() {
    width = host.clientWidth;
    if (!width) return false;
    cell = pick(state.cell, width) || (width < 420 ? 10 : 12);
    cols = Math.max(8, Math.floor(width / cell));
    const picture = typeof state.source === "function" ? null : state.source;
    const shape = picture?.naturalWidth ? picture.naturalHeight / picture.naturalWidth : picture?.width ? picture.height / picture.width : 0.64;
    rows = pick(state.rows, width) || Math.max(4, Math.round(cols * (state.ratio || shape)));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = cols * cell * dpr;
    canvas.height = rows * cell * dpr;
    canvas.style.width = `${cols * cell}px`;
    canvas.style.height = `${rows * cell}px`;
    ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    jitter = Float32Array.from({ length: cols * rows }, Math.random);
    value = new Float32Array(cols * rows);
    tone = new Uint8Array(cols * rows);
    ids = new Uint8Array(cols * rows);
    tones = new Uint8Array(cols * rows);
    sample();
    return Boolean(density);
  }

  function draw(now = performance.now()) {
    if (!ctx || !density) return;
    const { chars, wide } = resolveRamp(state.ramp);
    const top = chars.length - 1;
    if (state.paint) state.paint({ cols, rows, time: now / 1000, density, value, tone });
    else {
      for (let i = 0; i < density.length; i++) {
        value[i] = density[i] ** state.gamma;
        tone[i] = 1;
      }
    }
    const progress = settling ? ((now - started) / look.slow) * 1.3 : 2;
    for (let y = 0, i = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++, i++) {
        ids[i] = Math.round(Math.min(1, Math.max(0, value[i])) * top);
        tones[i] = tone[i];
        if (progress >= 1.3) continue;
        // Type falls into place left to right: loose sorts ahead of the front, the accent on what has just landed.
        const since = progress - ((x / cols) * 0.75 + (y / rows) * 0.25 + jitter[i] * 0.18);
        if (since < 0) {
          ids[i] = jitter[i] < 0.2 ? 1 + Math.floor(Math.random() * top) : 0;
          tones[i] = 0;
        } else if (since < 0.07) tones[i] = 2;
      }
    }
    if (progress >= 1.3) settling = false;
    ctx.clearRect(0, 0, cols * cell, rows * cell);
    ctx.font = wide ? `${Math.round(cell * 0.93)}px ${look.sans}` : `600 ${Math.round(cell * 0.98)}px ${look.mono}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    count = 0;
    for (const [pass, colour] of [look.sub, look.ink, look.olive].entries()) {
      ctx.fillStyle = colour;
      ctx.globalAlpha = pass ? 1 : 0.6;
      for (let y = 0, i = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++, i++) {
          if (!ids[i] || tones[i] !== pass) continue;
          ctx.fillText(chars[ids[i]], (x + 0.5) * cell, (y + 0.55) * cell);
          count++;
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  // Frames run only while type is settling or a paint function is moving the field, and only on screen.
  const live = () => visible && !document.hidden && !reduced?.matches && (settling || (Boolean(state.paint) && !state.paused));
  function frame(now) {
    raf = 0;
    if (now - last >= FRAME) {
      last = now;
      draw(now);
    }
    if (live()) raf = requestAnimationFrame(frame);
  }
  const wake = () => {
    if (!raf && live()) raf = requestAnimationFrame(frame);
  };

  function play() {
    started = performance.now();
    settling = state.settle !== false && look.slow > 0 && !reduced?.matches;
    draw(started);
    wake();
  }

  function relayout(replay = false) {
    if (!layout()) return;
    if (replay || !played) {
      played = true;
      play();
    } else {
      draw();
      wake();
    }
  }

  function set(patch = {}) {
    Object.assign(state, patch);
    if (["source", "cell", "rows", "ratio", "ink"].some((key) => key in patch)) relayout("source" in patch);
    else {
      draw();
      wake();
    }
  }

  const resized = new ResizeObserver(() => {
    if (queued || host.clientWidth === width) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      relayout();
    });
  });
  resized.observe(host);
  const seen = new IntersectionObserver((entries) => {
    visible = entries.some((entry) => entry.isIntersecting);
    wake();
  });
  seen.observe(host);
  const themed = new MutationObserver(() => {
    readTokens();
    draw();
  });
  for (const scope of new Set([document.documentElement, host.closest("[data-theme]")])) {
    if (scope) themed.observe(scope, { attributes: true, attributeFilter: ["data-theme"] });
  }
  document.addEventListener("visibilitychange", wake, { signal: done.signal });
  reduced?.addEventListener("change", () => draw(), { signal: done.signal });

  // Hover and focus reveal the picture in CSS; touch has neither, so a tap toggles it.
  if (host.hasAttribute("data-reveal")) {
    if (!host.hasAttribute("tabindex") && !host.closest("a, button")) host.tabIndex = 0;
    host.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "touch") host.dataset.revealed = String(host.dataset.revealed !== "true");
    }, { signal: done.signal });
  }

  const field = {
    get cols() { return cols; },
    get rows() { return rows; },
    get cell() { return cell; },
    /** Characters drawn in the last frame. */
    get count() { return count; },
    set,
    play,
    draw: () => draw(),
    /** The pointer's position in character cells: [column, row]. */
    cellAt(event) {
      const box = canvas.getBoundingClientRect();
      return [(event.clientX - box.left) / cell, (event.clientY - box.top) / cell];
    },
    destroy() {
      done.abort();
      resized.disconnect();
      seen.disconnect();
      themed.disconnect();
      cancelAnimationFrame(raf);
      canvas.remove();
      delete host.dataset.ascii;
      mounted.delete(host);
    },
  };
  mounted.set(host, field);
  readTokens();
  relayout();
  return field;
}

/** The field mounted on `host`, if any. */
export const fieldOf = (host) => mounted.get(host);

// Every .yui-ascii that wraps a picture sets itself up; drawings and moving fields call mountAscii.
export function initAscii(root = document) {
  for (const host of root.querySelectorAll(".yui-ascii")) {
    if (!mounted.has(host) && host.querySelector(":scope > img")) mountAscii(host);
  }
}

if (typeof document !== "undefined") initAscii();
