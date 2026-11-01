// Large-format ASCII and Bayer-dither rendering for the Musheng v3 surfaces.
//
// The module owns only its canvas layers. The host keeps control of size,
// radius, surrounding content, and the source element passed to the field.

export const CHARS = "  .,:;-=+xX08S#&@";

export const BAYER_4X4 = Object.freeze([
  Object.freeze([0, 8, 2, 10]),
  Object.freeze([12, 4, 14, 6]),
  Object.freeze([3, 11, 1, 9]),
  Object.freeze([15, 7, 13, 5]),
]);

export const PALETTES = Object.freeze({
  meadow: Object.freeze(["#2B361F", "#677D45", "#AEBA78", "#E5E1BD"]),
  moss: Object.freeze(["#1F2A1B", "#536D42", "#A5B77A", "#EBE5C9"]),
  clay: Object.freeze(["#382722", "#875845", "#C69569", "#F0DAB7"]),
  celadon: Object.freeze(["#203A36", "#5F8178", "#A9CBC0", "#E6EFE5"]),
  ink: Object.freeze(["#171A17", "#50564B", "#A6AA9D", "#F2F0E7"]),
});

export const PALETTE_STOPS = Object.freeze([0, 0.4, 0.74, 1]);
export const PAPER_BACKGROUND = "#F5F7EF";
export const PAPER_TOP_FADE_END = 0.36;
export const PAPER_TITLE_ZONE_OPACITY = 0.4;

export const RECOMMENDED = Object.freeze({
  ascii: Object.freeze({
    filter: "ascii",
    mask: 90,
    palette: "meadow",
    inkTone: "dark",
    strength: 100,
    size: 37,
    spacing: 0,
  }),
  dither: Object.freeze({
    filter: "dither",
    mask: 88,
    palette: "meadow",
    inkTone: "dark",
    strength: 100,
    size: 15,
    spacing: 0,
  }),
});

const FILTERS = new Set(["ascii", "dither"]);
const LOOKS = new Set(["overlay", "paper"]);
const PALETTE_KEYS = new Set(["original", ...Object.keys(PALETTES)]);
const SETTING_KEYS = ["filter", "mask", "palette", "inkTone", "strength", "size", "spacing"];
const MASK_BASES = Object.freeze({
  light: Object.freeze({ color: "#FFFFFF", stops: Object.freeze([54, 20, 38]) }),
  dark: Object.freeze({ color: "#000000", stops: Object.freeze([44, 20, 50]) }),
});

export function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export function range(value, from, to) {
  return from + ((to - from) * value) / 100;
}

export function luminance(red, green, blue) {
  return (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
}

export function smoothstep(value) {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
}

function validFilter(value, fallback = "ascii") {
  return FILTERS.has(value) ? value : fallback;
}

function validPalette(value, fallback = "meadow") {
  return PALETTE_KEYS.has(value) ? value : fallback;
}

function validLook(value, fallback = "overlay") {
  return LOOKS.has(value) ? value : fallback;
}

function roundFinite(value, fallback, min, max) {
  const number = Number(value);
  return Math.round(clamp(Number.isFinite(number) ? number : fallback, min, max));
}

export function sanitizeFilterSettings(value = {}, filter = "ascii") {
  const targetFilter = validFilter(filter);
  const fallback = RECOMMENDED[targetFilter];
  return {
    filter: targetFilter,
    mask: roundFinite(value.mask, fallback.mask, 0, 100),
    palette: validPalette(value.palette, fallback.palette),
    inkTone: value.inkTone === "light" ? "light" : "dark",
    strength: roundFinite(value.strength, fallback.strength, 0, 100),
    size: roundFinite(value.size, fallback.size, 0, 100),
    spacing: roundFinite(value.spacing, fallback.spacing, 0, 100),
  };
}

export function createSettings(seed = {}) {
  const initial = {
    filter: validFilter(seed.filter),
    ascii: sanitizeFilterSettings(RECOMMENDED.ascii, "ascii"),
    dither: sanitizeFilterSettings(RECOMMENDED.dither, "dither"),
  };
  return updateFilterSettings(initial, seed);
}

export function updateFilterSettings(current, patch = {}) {
  const source = current || createSettings();
  const next = {
    filter: validFilter(patch.filter, validFilter(source.filter)),
    ascii: sanitizeFilterSettings(source.ascii, "ascii"),
    dither: sanitizeFilterSettings(source.dither, "dither"),
  };
  let hasScopedPatch = false;

  for (const filter of FILTERS) {
    if (patch[filter] && typeof patch[filter] === "object") {
      next[filter] = sanitizeFilterSettings({ ...next[filter], ...patch[filter] }, filter);
      hasScopedPatch = true;
    }
  }

  const direct = {};
  for (const key of SETTING_KEYS) {
    if (Object.hasOwn(patch, key)) direct[key] = patch[key];
  }
  if (Object.keys(direct).length > (hasScopedPatch ? 1 : 0)) {
    next[next.filter] = sanitizeFilterSettings({ ...next[next.filter], ...direct }, next.filter);
  }
  return next;
}

export function getFilterSettings(settings, filter = settings?.filter) {
  const targetFilter = validFilter(filter);
  const source = settings?.[targetFilter] || RECOMMENDED[targetFilter];
  return { ...sanitizeFilterSettings(source, targetFilter), filter: targetFilter };
}

function hexToRgb(hex) {
  const value = String(hex).replace(/^#/, "");
  const expanded = value.length === 3 ? value.split("").map((part) => part + part).join("") : value;
  if (!/^[0-9a-f]{6}$/i.test(expanded)) throw new TypeError(`Invalid palette color: ${hex}`);
  return [
    Number.parseInt(expanded.slice(0, 2), 16),
    Number.parseInt(expanded.slice(2, 4), 16),
    Number.parseInt(expanded.slice(4, 6), 16),
  ];
}

function resolvePaletteColors(palette) {
  if (Array.isArray(palette)) return palette;
  if (typeof palette === "string" && PALETTES[palette]) return PALETTES[palette];
  return null;
}

/**
 * Builds a nearest-position, 256-step RGB lookup table from four colour stops.
 * "original" deliberately has no LUT and therefore keeps source colours.
 */
export function buildPaletteLut(palette) {
  if (palette === "original") return null;
  const colors = resolvePaletteColors(palette || "meadow");
  if (!colors || colors.length < 2) return null;
  const rgbStops = colors.map(hexToRgb);
  const lut = new Uint8ClampedArray(256 * 3);

  for (let index = 0; index < 256; index += 1) {
    const position = index / 255;
    let segment = 0;
    while (segment < PALETTE_STOPS.length - 2 && position > PALETTE_STOPS[segment + 1]) segment += 1;
    const from = PALETTE_STOPS[segment];
    const to = PALETTE_STOPS[segment + 1] ?? 1;
    const local = to === from ? 0 : clamp((position - from) / (to - from));
    const start = rgbStops[Math.min(segment, rgbStops.length - 1)];
    const end = rgbStops[Math.min(segment + 1, rgbStops.length - 1)];
    const offset = index * 3;
    lut[offset] = Math.round(start[0] + (end[0] - start[0]) * local);
    lut[offset + 1] = Math.round(start[1] + (end[1] - start[1]) * local);
    lut[offset + 2] = Math.round(start[2] + (end[2] - start[2]) * local);
  }
  return lut;
}

function paperColorFromLut(lut, value) {
  const level = Math.round(clamp(Number(value)) * 255) * 3;
  const red = lut[level];
  const green = lut[level + 1];
  const blue = lut[level + 2];
  return { red, green, blue, css: `rgb(${red}, ${green}, ${blue})` };
}

export function paperColorForLuminance(value, palette = "meadow") {
  const lut = buildPaletteLut(palette === "original" ? "meadow" : palette) || buildPaletteLut("meadow");
  return paperColorFromLut(lut, value);
}

export function paperTopFade(y) {
  const normalized = Number(y);
  if (!Number.isFinite(normalized) || normalized < 0 || normalized >= PAPER_TOP_FADE_END) return 0;
  return (1 - normalized / PAPER_TOP_FADE_END) ** 1.4;
}

export function paperTitleZoneOpacity(x, y, titleZone) {
  if (!titleZone) return 1;
  const x0 = Number(titleZone.x);
  const y0 = Number(titleZone.y);
  const width = Number(titleZone.w);
  const height = Number(titleZone.h);
  if (![x0, y0, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return 1;
  const inside = x >= x0 && x <= x0 + width && y >= y0 && y <= y0 + height;
  return inside ? PAPER_TITLE_ZONE_OPACITY : 1;
}

/** Mutates RGBA bytes in place, keeping alpha intact. */
export function applyPalette(data, palette) {
  const lut = buildPaletteLut(palette);
  if (!lut) return data;
  for (let index = 0; index < data.length; index += 4) {
    const level = Math.round(luminance(data[index], data[index + 1], data[index + 2]) * 255);
    const offset = level * 3;
    data[index] = lut[offset];
    data[index + 1] = lut[offset + 1];
    data[index + 2] = lut[offset + 2];
  }
  return data;
}

export function percentile(values, percentage) {
  if (!values?.length) return 0;
  const sorted = Array.from(values).sort((a, b) => a - b);
  const position = clamp(Number(percentage) / 100) * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const mix = position - lower;
  return sorted[lower] + (sorted[upper] - sorted[lower]) * mix;
}

/**
 * Returns the 8th/92nd luminance percentiles from approximately 12,000 evenly
 * spaced pixels. `paletteLut` may be supplied to avoid rebuilding it per frame.
 */
export function sampleStatistics(data, { sampleCount = 12000, paletteLut = null } = {}) {
  if (!data?.length) return { low: 0, high: 0, count: 0 };
  const pixelCount = Math.floor(data.length / 4);
  const step = Math.max(1, Math.floor(pixelCount / Math.max(1, sampleCount)));
  const values = [];
  for (let pixel = 0; pixel < pixelCount && values.length < sampleCount; pixel += step) {
    const index = pixel * 4;
    let red = data[index];
    let green = data[index + 1];
    let blue = data[index + 2];
    if (paletteLut) {
      const level = Math.round(luminance(red, green, blue) * 255) * 3;
      red = paletteLut[level];
      green = paletteLut[level + 1];
      blue = paletteLut[level + 2];
    }
    values.push(luminance(red, green, blue));
  }
  return {
    low: percentile(values, 8),
    high: percentile(values, 92),
    count: values.length,
  };
}

export function asciiToneDetails({ luminance: sourceLuminance, low, high, inkTone = "dark", strength = 100 }) {
  const scale = clamp(Number(strength) / 100);
  const lightInk = inkTone === "light";
  const raw = lightInk ? sourceLuminance : 1 - sourceLuminance;
  let normalized = raw;
  if (high - low >= 0.025) {
    normalized = lightInk
      ? (sourceLuminance - low) / (high - low)
      : (high - sourceLuminance) / (high - low);
    normalized = clamp(normalized);
  }
  const mix = 0.72 + 0.14 * scale;
  const t = raw * (1 - mix) + normalized * mix;
  const black = 0.22 * scale;
  const white = 1 - 0.08 * scale;
  const lev = clamp((t - black) / (white - black));
  const tone = clamp(lev * (1 - scale) + smoothstep(lev) * scale);
  return { raw, normalized, mix, t, black, white, lev, tone };
}

export function mapAsciiCharacter(tone) {
  if (tone <= 0.02) return "";
  return CHARS[Math.round(clamp(tone) * 16)] || "";
}

export function rgbToHsv(red, green, blue) {
  const r = clamp(red / 255);
  const g = clamp(green / 255);
  const b = clamp(blue / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;
  if (delta) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue /= 6;
    if (hue < 0) hue += 1;
  }
  return { h: hue, s: max === 0 ? 0 : delta / max, v: max };
}

export function hsvToRgb(hue, saturation, value) {
  const h = ((hue % 1) + 1) % 1;
  const s = clamp(saturation);
  const v = clamp(value);
  const chroma = v * s;
  const section = h * 6;
  const x = chroma * (1 - Math.abs((section % 2) - 1));
  const m = v - chroma;
  let rgb;
  if (section < 1) rgb = [chroma, x, 0];
  else if (section < 2) rgb = [x, chroma, 0];
  else if (section < 3) rgb = [0, chroma, x];
  else if (section < 4) rgb = [0, x, chroma];
  else if (section < 5) rgb = [x, 0, chroma];
  else rgb = [chroma, 0, x];
  return rgb.map((channel) => Math.round((channel + m) * 255));
}

export function asciiInkColor(red, green, blue, tone, strength = 100) {
  const scale = clamp(Number(strength) / 100);
  const hsv = rgbToHsv(red, green, blue);
  const value = clamp(hsv.v + (1 - hsv.v) * (0.24 + 0.18 * scale + 0.24 * tone));
  const saturation = clamp(hsv.s * (1.16 + 0.2 * scale));
  const alpha = clamp((0.12 + 0.7 * tone) * (0.72 + 0.28 * scale), 0.06, 0.94);
  return {
    ...hsvToRgb(hsv.h, saturation, value),
    alpha,
    css: `rgba(${hsvToRgb(hsv.h, saturation, value).join(", ")}, ${alpha.toFixed(3)})`,
  };
}

function maskTheme(theme) {
  if (theme === "dark" || theme === "night") return MASK_BASES.dark;
  return MASK_BASES.light;
}

export function maskStopOpacity(base, value) {
  const v = clamp(Number(value), 0, 100);
  const b = clamp(Number(base), 0, 100);
  const opacity = v <= 50
    ? b * (v / 50) ** 1.08
    : b + (100 - b) * ((v - 50) / 50) ** 1.08;
  return clamp(opacity, 0, 100);
}

export function maskStops(value, theme = "light") {
  const base = maskTheme(theme);
  return {
    color: base.color,
    positions: [0, 42, 100],
    opacities: base.stops.map((stop) => maskStopOpacity(stop, value)),
  };
}

export function bayerThreshold(x, y, textureMultiplier = 1) {
  const multiplier = Math.max(1, Math.round(Number(textureMultiplier) || 1));
  const column = ((Math.trunc(x) * multiplier) % 4 + 4) % 4;
  const row = ((Math.trunc(y) % 4) + 4) % 4;
  return (BAYER_4X4[row][column] + 0.5) / 16;
}

export function bayerQuantize(channel, threshold, levels, mix) {
  const c = clamp(Number(channel), 0, 255);
  const count = Math.max(2, Math.round(Number(levels)));
  const scaled = (c / 255) * (count - 1);
  const lower = Math.floor(scaled);
  const fraction = scaled - lower;
  const quantized = lower + (fraction > threshold ? 1 : 0);
  const target = (quantized / (count - 1)) * 255;
  return clamp(c + (target - c) * clamp(Number(mix)), 0, 255);
}

export function pushSaturation(channel, sourceLuminance, factor) {
  const gray = sourceLuminance * 255;
  return clamp(gray + (channel - gray) * Number(factor), 0, 255);
}

export function ditherRgb({ red, green, blue }, x, y, settings = {}) {
  const strength = clamp(Number(settings.strength ?? 100) / 100);
  const levels = Math.max(2, Math.round(range(settings.strength ?? 100, 8, 2)));
  const mix = range(settings.strength ?? 100, 0.32, 1);
  const textureMultiplier = Math.max(1, Math.round(range(settings.spacing ?? 0, 1, 4)));
  const saturationFactor = 1.06 + 0.18 * strength;
  const light = luminance(red, green, blue);
  const threshold = bayerThreshold(x, y, textureMultiplier);
  return {
    red: bayerQuantize(pushSaturation(red, light, saturationFactor), threshold, levels, mix),
    green: bayerQuantize(pushSaturation(green, light, saturationFactor), threshold, levels, mix),
    blue: bayerQuantize(pushSaturation(blue, light, saturationFactor), threshold, levels, mix),
  };
}

function sourceWidth(source) {
  return source?.videoWidth || source?.naturalWidth || source?.width || 0;
}

function sourceHeight(source) {
  return source?.videoHeight || source?.naturalHeight || source?.height || 0;
}

function coverGeometry(sourceW, sourceH, width, height, offsetX = 0, overscan = 0) {
  const safeSourceWidth = Math.max(1, sourceW);
  const safeSourceHeight = Math.max(1, sourceH);
  const extra = Math.abs(offsetX) * 2 + overscan * 2;
  const scale = Math.max((width + extra) / safeSourceWidth, (height + extra) / safeSourceHeight);
  const drawWidth = safeSourceWidth * scale;
  const drawHeight = safeSourceHeight * scale;
  return {
    x: (width - drawWidth) / 2 + offsetX,
    y: (height - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
  };
}

function drawCover(context, source, width, height, offsetX = 0, overscan = 0) {
  const sw = sourceWidth(source);
  const sh = sourceHeight(source);
  if (!sw || !sh) return false;
  const rect = coverGeometry(sw, sh, width, height, offsetX, overscan);
  context.drawImage(source, rect.x, rect.y, rect.width, rect.height);
  return true;
}

function preferredReducedMotion(view) {
  return Boolean(view?.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

function videoIsPlaying(video) {
  return Boolean(video && !video.paused && !video.ended && video.readyState >= 2);
}

function isVideoSource(source) {
  return Boolean(source && (source.tagName === "VIDEO" || source.videoWidth));
}

function isImageSource(source) {
  return Boolean(source && (
    (typeof HTMLCanvasElement !== "undefined" && source instanceof HTMLCanvasElement)
    || (typeof HTMLImageElement !== "undefined" && source instanceof HTMLImageElement)
    || (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap)
    || (typeof OffscreenCanvas !== "undefined" && source instanceof OffscreenCanvas)
    || (source.nodeType === 1 && typeof source.getContext === "function")
  ));
}

function cloneSettings(settings) {
  return {
    filter: settings.filter,
    ascii: { ...settings.ascii },
    dither: { ...settings.dither },
  };
}

/**
 * Mounts a live ASCII/Dither field into `host`.
 *
 * options.source accepts an image URL, video URL, Canvas, Image, Video, or
 * ImageBitmap. options.settings accepts either a scoped settings object or a
 * single flat filter setting. options.look is "overlay" (default) or "paper";
 * paper accepts an optional normalized titleZone rectangle.
 */
export function mountAsciiField(host, options = {}) {
  if (!host || host.nodeType !== 1) {
    throw new TypeError("mountAsciiField requires a DOM host element");
  }

  const documentRef = host.ownerDocument || document;
  const windowRef = documentRef.defaultView || window;
  const wrapper = documentRef.createElement("div");
  wrapper.className = `ascii-field${options.className ? ` ${options.className}` : ""}`;
  wrapper.dataset.filter = "ascii";
  wrapper.dataset.look = "overlay";
  wrapper.setAttribute("aria-hidden", "true");

  const layers = [0, 1].map(() => {
    const canvas = documentRef.createElement("canvas");
    canvas.className = "ascii-field__canvas";
    wrapper.append(canvas);
    return canvas;
  });
  const contexts = layers.map((canvas) => canvas.getContext("2d", { alpha: false }));
  if (contexts.some((context) => !context)) throw new Error("Canvas 2D is not available");

  const sampleCanvas = documentRef.createElement("canvas");
  const sampleContext = sampleCanvas.getContext("2d", { willReadFrequently: true });
  const scratchCanvas = documentRef.createElement("canvas");
  const scratchContext = scratchCanvas.getContext("2d", { willReadFrequently: true });
  if (!sampleContext || !scratchContext) throw new Error("Canvas 2D is not available");

  const hadInlinePosition = host.style.position;
  if (windowRef.getComputedStyle(host).position === "static") host.style.position = "relative";
  host.prepend(wrapper);
  host.dataset.asciiFieldHost = "";

  let settings = createSettings(options.settings || options);
  if (options.filter && FILTERS.has(options.filter)) {
    settings = updateFilterSettings(settings, { filter: options.filter });
  }
  let activeLayer = 0;
  let source = null;
  let sourceKind = "none";
  let sourceLoadToken = 0;
  let samplePixels = null;
  let sampleStats = { low: 0, high: 0, count: 0 };
  let sampledSource = null;
  let sampledPalette = null;
  let sampleDirty = true;
  let sampleWidth = 1;
  let sampleHeight = 1;
  let cssWidth = 1;
  let cssHeight = 1;
  let renderScale = 1;
  let visible = true;
  let destroyed = false;
  let reducedMotion = preferredReducedMotion(windowRef);
  let redrawTimer = 0;
  let singleFrame = 0;
  let animationFrame = 0;
  let videoFrame = 0;
  let lastPaint = -Infinity;
  let lastPointerRipple = -Infinity;
  let crossfadePending = false;
  let metrics = { filter: "ascii", look: "overlay", low: 0, high: 0, samples: 0 };
  const ripples = [];
  const RIPPLE_RADIUS = 80;
  const RIPPLE_DURATION = 820;
  const MAX_FPS = 30;
  const MIN_FRAME_INTERVAL = 1000 / MAX_FPS;
  const optionTheme = options.theme;
  let driftEnabled = Boolean(options.drift);
  const rippleEnabled = Boolean(options.ripple);
  // Lens: glyphs near the pointer darken towards olive, grow and fill in, easing in and out.
  const lensEnabled = Boolean(options.lens);
  const LENS_RADIUS = 132;
  const lens = { x: 0, y: 0, strength: 0, target: 0 };
  let look = validLook(options.look);
  let titleZone = options.titleZone || null;
  metrics.look = look;
  wrapper.dataset.look = look;

  function resolveTheme() {
    if (optionTheme) return optionTheme;
    const themed = host.closest?.("[data-theme]");
    const theme = themed?.dataset.theme || documentRef.documentElement.dataset.theme;
    if (theme === "dark" || theme === "night") return "dark";
    if (theme === "light" || theme === "day") return "light";
    return windowRef.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function resolvePaperColor() {
    // lightPaper: the host darkens the art itself (e.g. a night CSS invert), so always paint day paper.
    if (options.lightPaper || resolveTheme() !== "dark") return options.paperColor || PAPER_BACKGROUND;
    const themedHost = host.closest?.("[data-theme]") || documentRef.documentElement;
    return windowRef.getComputedStyle(themedHost).getPropertyValue("--paper").trim()
      || "#161A15";
  }

  function activeSettings() {
    return settings[settings.filter];
  }

  function paperLookActive() {
    return look === "paper" && settings.filter === "ascii";
  }

  function updateCanvasSize() {
    const rect = host.getBoundingClientRect();
    const nextWidth = Math.max(1, Math.round(rect.width));
    const nextHeight = Math.max(1, Math.round(rect.height));
    if (nextWidth === cssWidth && nextHeight === cssHeight && layers[0].width) return false;
    cssWidth = nextWidth;
    cssHeight = nextHeight;
    const dpr = Math.min(1.6, Math.max(1, windowRef.devicePixelRatio || 1));
    renderScale = Math.max(0.1, Math.min(dpr, 2048 / cssWidth, 2048 / cssHeight));
    for (const canvas of layers) {
      const width = Math.max(1, Math.round(cssWidth * renderScale));
      const height = Math.max(1, Math.round(cssHeight * renderScale));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
    }
    const longSide = 480;
    if (cssWidth >= cssHeight) {
      sampleWidth = longSide;
      sampleHeight = Math.max(1, Math.round((longSide * cssHeight) / cssWidth));
    } else {
      sampleHeight = longSide;
      sampleWidth = Math.max(1, Math.round((longSide * cssWidth) / cssHeight));
    }
    if (sampleCanvas.width !== sampleWidth) sampleCanvas.width = sampleWidth;
    if (sampleCanvas.height !== sampleHeight) sampleCanvas.height = sampleHeight;
    sampleDirty = true;
    return true;
  }

  function sourceReady() {
    if (!source) return false;
    if (sourceKind === "video") return source.readyState >= 2 && source.videoWidth > 0;
    return sourceWidth(source) > 0 && sourceHeight(source) > 0;
  }

  function driftedOffset(now) {
    if (!driftEnabled || reducedMotion) return 0;
    return Math.sin(((now || windowRef.performance.now()) / 20000) * Math.PI * 2) * cssWidth * 0.018;
  }

  function drawSampleSource(drift) {
    const config = activeSettings();
    const paperLook = paperLookActive();
    const samplingPalette = paperLook ? "original" : config.palette;
    const movingPaperSample = paperLook && driftEnabled;
    if (
      sourceKind !== "video"
      && !movingPaperSample
      && !sampleDirty
      && samplePixels
      && sampledSource === source
      && sampledPalette === samplingPalette
      && sourceReady()
    ) {
      return;
    }
    sampleContext.setTransform(1, 0, 0, 1, 0, 0);
    sampleContext.fillStyle = "#FFFFFF";
    sampleContext.fillRect(0, 0, sampleWidth, sampleHeight);
    if (sourceReady()) {
      const sampleDrift = paperLook ? drift * (sampleWidth / cssWidth) : 0;
      const overscan = paperLook ? sampleWidth * 0.02 : 0;
      drawCover(sampleContext, source, sampleWidth, sampleHeight, sampleDrift, overscan);
    }
    let pixels = sampleContext.getImageData(0, 0, sampleWidth, sampleHeight);
    if (!paperLook) applyPalette(pixels.data, samplingPalette);
    sampleContext.putImageData(pixels, 0, 0);
    samplePixels = pixels.data;
    sampleStats = sampleStatistics(samplePixels, { sampleCount: 12000 });
    sampledSource = sourceReady() ? source : null;
    sampledPalette = samplingPalette;
    sampleDirty = !sourceReady();
  }

  function drawRecolouredBase(context, drift) {
    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, cssWidth, cssHeight);
    drawCover(context, sampleCanvas, cssWidth, cssHeight, drift, 0);
  }

  function sampledPixel(x, y) {
    const sampleX = clamp(Math.round((x / cssWidth) * (sampleWidth - 1)), 0, sampleWidth - 1);
    const sampleY = clamp(Math.round((y / cssHeight) * (sampleHeight - 1)), 0, sampleHeight - 1);
    const index = (sampleY * sampleWidth + sampleX) * 4;
    return [samplePixels[index], samplePixels[index + 1], samplePixels[index + 2]];
  }

  function rippleOffset(x, y, now) {
    if (!rippleEnabled || reducedMotion || !ripples.length) return [0, 0];
    let offsetX = 0;
    let offsetY = 0;
    for (const ripple of ripples) {
      const age = now - ripple.started;
      if (age < 0 || age > RIPPLE_DURATION) continue;
      const dx = x - ripple.x;
      const dy = y - ripple.y;
      const distance = Math.hypot(dx, dy);
      if (!distance || distance >= RIPPLE_RADIUS) continue;
      const envelope = Math.sin((age / RIPPLE_DURATION) * Math.PI);
      const push = (1 - distance / RIPPLE_RADIUS) * 18 * envelope;
      offsetX += (dx / distance) * push;
      offsetY += (dy / distance) * push;
    }
    return [offsetX, offsetY];
  }

  function drawAsciiOverlay(context, now, drift) {
    drawRecolouredBase(context, drift);
    const config = activeSettings();
    const mask = maskStops(config.mask, resolveTheme());
    const maskGradient = context.createLinearGradient(0, 0, 0, cssHeight);
    for (let index = 0; index < mask.positions.length; index += 1) {
      maskGradient.addColorStop(mask.positions[index] / 100, colorWithAlpha(mask.color, mask.opacities[index]));
    }
    context.fillStyle = maskGradient;
    context.fillRect(0, 0, cssWidth, cssHeight);

    let fontSize = Math.round(range(config.size, 7, 24));
    if (cssWidth < 720) fontSize = Math.min(fontSize, 22);
    if (cssWidth < 480) fontSize = Math.max(fontSize, 8);
    fontSize = Math.max(1, fontSize);
    context.font = `${fontSize}px ui-monospace, Menlo, Monaco, "Courier New", monospace`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.imageSmoothingEnabled = true;

    let widestCharacter = 0;
    for (const character of new Set(CHARS)) {
      if (character !== " ") widestCharacter = Math.max(widestCharacter, context.measureText(character).width);
    }
    const atMetrics = context.measureText("@");
    const atHeight = (atMetrics.actualBoundingBoxAscent || fontSize * 0.72)
      + (atMetrics.actualBoundingBoxDescent || fontSize * 0.08);
    const spacingX = Math.max(range(config.spacing, 8, 24), widestCharacter * 1.08);
    const spacingY = Math.max(range(config.spacing, 9, 26), atHeight * 1.12, fontSize * 1.04);
    const points = {
      low: sampleStats.low,
      high: sampleStats.high,
      inkTone: config.inkTone,
      strength: config.strength,
    };
    let drawn = 0;

    for (let y = spacingY / 2; y < cssHeight; y += spacingY) {
      for (let x = spacingX / 2; x < cssWidth; x += spacingX) {
        const [red, green, blue] = sampledPixel(x, y);
        const details = asciiToneDetails({ ...points, luminance: luminance(red, green, blue) });
        const character = mapAsciiCharacter(details.tone);
        if (!character || character === " ") continue;
        const color = asciiInkColor(red, green, blue, details.tone, config.strength);
        const [offsetX, offsetY] = rippleOffset(x, y, now);
        context.fillStyle = color.css;
        context.fillText(character, x + offsetX, y + offsetY);
        drawn += 1;
      }
    }
    return { characters: drawn };
  }

  function drawAsciiPaper(context, now) {
    const config = activeSettings();
    const paperColor = resolvePaperColor();
    context.fillStyle = paperColor;
    context.fillRect(0, 0, cssWidth, cssHeight);

    const fontSize = cssWidth < 480 ? 9 : 12;
    context.font = `${fontSize}px ui-monospace, Menlo, Monaco, "Courier New", monospace`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.imageSmoothingEnabled = true;

    let widestCharacter = 0;
    for (const character of new Set(CHARS)) {
      if (character !== " ") widestCharacter = Math.max(widestCharacter, context.measureText(character).width);
    }
    const minimumGridWidth = fontSize >= 12 ? 8 : 6;
    const spacingX = Math.max(minimumGridWidth, widestCharacter * 1.08);
    const spacingY = fontSize;
    const points = {
      low: sampleStats.low,
      high: sampleStats.high,
      inkTone: config.inkTone,
      strength: config.strength,
    };
    const paletteLut = buildPaletteLut("meadow");
    let drawn = 0;

    for (let y = spacingY / 2; y < cssHeight; y += spacingY) {
      for (let x = spacingX / 2; x < cssWidth; x += spacingX) {
        const [red, green, blue] = sampledPixel(x, y);
        const light = luminance(red, green, blue);
        const details = asciiToneDetails({ ...points, luminance: light });
        let pull = 0;
        if (lens.strength > 0.002) {
          const distance = Math.hypot(x - lens.x, y - lens.y);
          if (distance < LENS_RADIUS) pull = (1 - distance / LENS_RADIUS) ** 2 * lens.strength;
        }
        const character = mapAsciiCharacter(pull ? clamp(details.tone + pull * 0.4) : details.tone);
        if (!character || character === " ") continue;
        const [offsetX, offsetY] = rippleOffset(x, y, now);
        context.globalAlpha = paperTitleZoneOpacity(x / cssWidth, y / cssHeight, titleZone);
        if (pull > 0.02) {
          // Under the lens the meadow ink deepens to olive and the glyph grows a little.
          context.fillStyle = paperColorFromLut(paletteLut, light * (1 - pull * 0.6)).css;
          context.font = `${Math.round(fontSize * (1 + pull * 0.35))}px ui-monospace, Menlo, Monaco, "Courier New", monospace`;
          context.fillText(character, x + offsetX, y + offsetY);
          context.font = `${fontSize}px ui-monospace, Menlo, Monaco, "Courier New", monospace`;
        } else {
          context.fillStyle = paperColorFromLut(paletteLut, light).css;
          context.fillText(character, x + offsetX, y + offsetY);
        }
        drawn += 1;
      }
    }
    context.globalAlpha = 1;

    const fadeHeight = cssHeight * PAPER_TOP_FADE_END;
    const fade = context.createLinearGradient(0, 0, 0, fadeHeight);
    for (let step = 0; step <= 12; step += 1) {
      const normalizedY = (step / 12) * PAPER_TOP_FADE_END;
      fade.addColorStop(step / 12, `rgba(255, 255, 255, ${paperTopFade(normalizedY).toFixed(4)})`);
    }
    context.fillStyle = fade;
    context.fillRect(0, 0, cssWidth, fadeHeight);
    return { characters: drawn };
  }

  function drawAscii(context, now, drift) {
    return paperLookActive()
      ? drawAsciiPaper(context, now)
      : drawAsciiOverlay(context, now, drift);
  }

  function drawDither(context, now, drift) {
    const config = activeSettings();
    let block = Math.max(2, Math.round(range(config.size, 2, 9)));
    if (cssWidth < 720) block = Math.min(block, 7);
    const textureMultiplier = Math.max(1, Math.round(range(config.spacing, 1, 4)));
    const levels = Math.max(2, Math.round(range(config.strength, 8, 2)));
    const mix = range(config.strength, 0.32, 1);
    const strength = clamp(config.strength / 100);
    const saturationFactor = 1.06 + 0.18 * strength;
    const smallWidth = Math.max(1, Math.ceil(cssWidth / block));
    const smallHeight = Math.max(1, Math.ceil(cssHeight / block));
    if (scratchCanvas.width !== smallWidth) scratchCanvas.width = smallWidth;
    if (scratchCanvas.height !== smallHeight) scratchCanvas.height = smallHeight;
    scratchContext.setTransform(1, 0, 0, 1, 0, 0);
    scratchContext.fillStyle = "#FFFFFF";
    scratchContext.fillRect(0, 0, smallWidth, smallHeight);
    drawCover(scratchContext, sampleCanvas, smallWidth, smallHeight, drift / block, 1);
    const image = scratchContext.getImageData(0, 0, smallWidth, smallHeight);
    const data = image.data;
    for (let y = 0; y < smallHeight; y += 1) {
      for (let x = 0; x < smallWidth; x += 1) {
        const index = (y * smallWidth + x) * 4;
        const light = luminance(data[index], data[index + 1], data[index + 2]);
        const threshold = bayerThreshold(x, y, textureMultiplier);
        data[index] = bayerQuantize(pushSaturation(data[index], light, saturationFactor), threshold, levels, mix);
        data[index + 1] = bayerQuantize(pushSaturation(data[index + 1], light, saturationFactor), threshold, levels, mix);
        data[index + 2] = bayerQuantize(pushSaturation(data[index + 2], light, saturationFactor), threshold, levels, mix);
      }
    }
    scratchContext.putImageData(image, 0, 0);

    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, cssWidth, cssHeight);
    context.imageSmoothingEnabled = false;
    context.drawImage(scratchCanvas, 0, 0, cssWidth, cssHeight);

    const mask = maskStops(config.mask, resolveTheme());
    const gradient = context.createLinearGradient(0, 0, 0, cssHeight);
    for (let index = 0; index < mask.positions.length; index += 1) {
      gradient.addColorStop(mask.positions[index] / 100, colorWithAlpha(mask.color, mask.opacities[index]));
    }
    context.fillStyle = gradient;
    context.fillRect(0, 0, cssWidth, cssHeight);
    return { blocks: smallWidth * smallHeight };
  }

  function colorWithAlpha(color, opacityPercent) {
    const alpha = clamp(opacityPercent / 100);
    const rgb = color === "#000000" ? "0, 0, 0" : "255, 255, 255";
    return `rgba(${rgb}, ${alpha.toFixed(4)})`;
  }

  function paint(frame, layerIndex) {
    const context = contexts[layerIndex];
    context.setTransform(renderScale, 0, 0, renderScale, 0, 0);
    context.clearRect(0, 0, cssWidth, cssHeight);
    const drift = driftedOffset(frame);
    drawSampleSource(drift);
    wrapper.dataset.filter = settings.filter;
    wrapper.dataset.look = look;
    const output = settings.filter === "ascii"
      ? drawAscii(context, frame, drift)
      : drawDither(context, frame, drift);
    metrics = {
      filter: settings.filter,
      look,
      low: sampleStats.low,
      high: sampleStats.high,
      samples: sampleStats.count,
      ...output,
    };
    options.onMetrics?.(metrics);
  }

  function paintTo(layerIndex, crossfade = false) {
    if (destroyed || !cssWidth || !cssHeight) return;
    const now = windowRef.performance.now();
    paint(now, layerIndex);
    lastPaint = now;
    if (crossfade) {
      layers[layerIndex].classList.add("is-active");
      layers[activeLayer]?.classList.remove("is-active");
      activeLayer = layerIndex;
    } else {
      layers.forEach((layer, index) => layer.classList.toggle("is-active", index === layerIndex));
      activeLayer = layerIndex;
    }
  }

  function render({ crossfade = false } = {}) {
    if (destroyed) return;
    updateCanvasSize();
    if (crossfade) paintTo(1 - activeLayer, true);
    else paintTo(activeLayer, false);
    options.onRender?.(metrics);
  }

  function requestDraw({ crossfade = false, immediate = false } = {}) {
    crossfadePending ||= crossfade;
    if (destroyed) return;
    if (immediate) {
      if (singleFrame) windowRef.cancelAnimationFrame(singleFrame);
      singleFrame = 0;
      const shouldCrossfade = crossfadePending;
      crossfadePending = false;
      render({ crossfade: shouldCrossfade });
      return;
    }
    if (singleFrame) return;
    singleFrame = windowRef.requestAnimationFrame(() => {
      singleFrame = 0;
      const shouldCrossfade = crossfadePending;
      crossfadePending = false;
      render({ crossfade: shouldCrossfade });
    });
  }

  function scheduleSettingsDraw(crossfade = false) {
    clearTimeout(redrawTimer);
    redrawTimer = windowRef.setTimeout(() => requestDraw({ crossfade }), 72);
  }

  function pruneRipples(now) {
    while (ripples.length && now - ripples[0].started > RIPPLE_DURATION) ripples.shift();
  }

  function loopIsNeeded() {
    return !reducedMotion && (
      driftEnabled
      || ripples.length > 0
      || (lensEnabled && (lens.target > 0 || lens.strength > 0.002))
      || (sourceKind === "video" && videoIsPlaying(source) && typeof source.requestVideoFrameCallback !== "function")
    );
  }

  function animate(now) {
    animationFrame = 0;
    if (destroyed) return;
    const hadRipple = ripples.length > 0;
    pruneRipples(now);
    if (!visible || documentRef.hidden) return;
    const rippleJustEnded = hadRipple && ripples.length === 0;
    if (lensEnabled) {
      lens.strength += (lens.target - lens.strength) * 0.14;
      if (lens.target === 0 && lens.strength < 0.002) lens.strength = 0;
    }
    if (rippleJustEnded || now - lastPaint >= MIN_FRAME_INTERVAL) paintTo(activeLayer, false);
    if (loopIsNeeded()) animationFrame = windowRef.requestAnimationFrame(animate);
  }

  function ensureAnimation() {
    if (!animationFrame && loopIsNeeded() && visible && !documentRef.hidden) {
      animationFrame = windowRef.requestAnimationFrame(animate);
    }
  }

  function cancelVideoFrame() {
    if (videoFrame && source?.cancelVideoFrameCallback) source.cancelVideoFrameCallback(videoFrame);
    videoFrame = 0;
  }

  function scheduleVideoFrame() {
    cancelVideoFrame();
    if (
      destroyed
      || reducedMotion
      || !visible
      || documentRef.hidden
      || !videoIsPlaying(source)
      || typeof source.requestVideoFrameCallback !== "function"
    ) {
      return;
    }
    videoFrame = source.requestVideoFrameCallback((now) => {
      videoFrame = 0;
      if (!destroyed && visible && videoIsPlaying(source)) {
        if (now - lastPaint >= MIN_FRAME_INTERVAL) paintTo(activeLayer, false);
        scheduleVideoFrame();
      }
    });
  }

  function addRipple(event) {
    if (reducedMotion) return;
    const now = windowRef.performance.now();
    if (now - lastPointerRipple < 44) return;
    const rect = host.getBoundingClientRect();
    ripples.push({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      started: now,
    });
    lastPointerRipple = now;
    ensureAnimation();
  }

  function sourceEventTarget() {
    return source && typeof source.addEventListener === "function" ? source : null;
  }

  function syncVideoEvents() {
    const target = sourceEventTarget();
    if (target && sourceKind === "video") {
      target.addEventListener("play", scheduleVideoFrame);
      target.addEventListener("pause", cancelVideoFrame);
      target.addEventListener("seeked", scheduleVideoFrame);
      target.addEventListener("loadeddata", scheduleVideoFrame);
    }
  }

  function clearVideoEvents() {
    const target = sourceEventTarget();
    if (target) {
      target.removeEventListener("play", scheduleVideoFrame);
      target.removeEventListener("pause", cancelVideoFrame);
      target.removeEventListener("seeked", scheduleVideoFrame);
      target.removeEventListener("loadeddata", scheduleVideoFrame);
    }
  }

  async function waitForSource(nextSource) {
    if (sourceKind === "video") {
      if (nextSource.readyState >= 2) return;
      await new Promise((resolve, reject) => {
        nextSource.addEventListener("loadeddata", resolve, { once: true });
        nextSource.addEventListener("error", () => reject(nextSource.error || new Error("Video failed to load")), { once: true });
      });
      return;
    }
    if (sourceWidth(nextSource) > 0) return;
    if (typeof nextSource.decode === "function") {
      try {
        await nextSource.decode();
        if (sourceWidth(nextSource) > 0) return;
      } catch {
        // A still image can be decoded but still require the load event.
      }
    }
    await new Promise((resolve, reject) => {
      nextSource.addEventListener("load", resolve, { once: true });
      nextSource.addEventListener("error", () => reject(new Error("Image failed to load")), { once: true });
    });
  }

  async function setSource(nextSource, { autoplay = options.autoplay !== false } = {}) {
    const token = ++sourceLoadToken;
    clearVideoEvents();
    cancelVideoFrame();
    if (sourceKind === "video" && source && source !== nextSource && source.dataset?.asciiFieldOwned === "true") {
      source.pause();
    }
    source = null;
    sourceKind = "none";
    sampleDirty = true;

    if (typeof nextSource === "string") {
      const video = /\.(?:mp4|webm|ogv|ogg|mov)(?:[?#]|$)/i.test(nextSource)
        || options.sourceType === "video";
      if (video) {
        const element = documentRef.createElement("video");
        element.dataset.asciiFieldOwned = "true";
        element.muted = options.muted !== false;
        element.loop = options.loop !== false;
        element.playsInline = true;
        element.preload = "auto";
        if (options.crossOrigin) element.crossOrigin = options.crossOrigin;
        element.src = nextSource;
        source = element;
        sourceKind = "video";
        element.load();
        if (autoplay) element.play().catch(() => {});
      } else {
        const image = new windowRef.Image();
        if (options.crossOrigin) image.crossOrigin = options.crossOrigin;
        image.decoding = "async";
        image.src = nextSource;
        source = image;
        sourceKind = "image";
      }
    } else if (isVideoSource(nextSource)) {
      source = nextSource;
      sourceKind = "video";
      if (autoplay && source.paused) source.play().catch(() => {});
    } else if (isImageSource(nextSource)) {
      source = nextSource;
      sourceKind = "image";
    }

    if (!source) {
      requestDraw({ immediate: true });
      return;
    }
    try {
      await waitForSource(source);
      if (token !== sourceLoadToken || destroyed) return;
      syncVideoEvents();
      scheduleVideoFrame();
      ensureAnimation();
      requestDraw({ immediate: true });
      options.onSource?.(source);
    } catch (error) {
      if (token !== sourceLoadToken || destroyed) return;
      options.onError?.(error);
      requestDraw({ immediate: true });
    }
  }

  function setSettings(next) {
    const before = activeSettings();
    settings = updateFilterSettings(settings, next);
    const after = activeSettings();
    const crossfade = before.filter !== after.filter || before.palette !== after.palette;
    if (before.palette !== after.palette) sampleDirty = true;
    scheduleSettingsDraw(crossfade);
    if (crossfade) ensureAnimation();
    return getFilterSettings(settings);
  }

  function setLook(next) {
    const normalized = validLook(next, look);
    if (normalized === look) return look;
    look = normalized;
    sampleDirty = true;
    scheduleSettingsDraw(true);
    return look;
  }

  function setTitleZone(next) {
    titleZone = next || null;
    if (paperLookActive()) scheduleSettingsDraw(false);
  }

  function setDrift(enabled) {
    const next = Boolean(enabled);
    if (driftEnabled === next) return;
    driftEnabled = next;
    if (next) ensureAnimation();
    else requestDraw({ immediate: true });
  }

  updateCanvasSize();
  render();
  layers[activeLayer].classList.add("is-active");
  if (options.source || options.media || options.image || options.video) {
    setSource(options.source || options.media || options.image || options.video);
  }

  const resizeObserver = typeof windowRef.ResizeObserver === "function"
    ? new windowRef.ResizeObserver(() => requestDraw({ immediate: true }))
    : null;
  resizeObserver?.observe(host);
  const intersectionObserver = typeof windowRef.IntersectionObserver === "function"
    ? new windowRef.IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      if (visible) {
        requestDraw({ immediate: true });
        scheduleVideoFrame();
        ensureAnimation();
      } else {
        cancelVideoFrame();
      }
    }, { threshold: 0.01 })
    : null;
  intersectionObserver?.observe(host);

  const onVisibilityChange = () => {
    if (documentRef.hidden) {
      cancelVideoFrame();
      if (animationFrame) windowRef.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    } else {
      requestDraw({ immediate: true });
      scheduleVideoFrame();
      ensureAnimation();
    }
  };
  documentRef.addEventListener("visibilitychange", onVisibilityChange);

  const motionQuery = windowRef.matchMedia?.("(prefers-reduced-motion: reduce)");
  const onMotionChange = (event) => {
    reducedMotion = event.matches;
    if (reducedMotion) {
      ripples.length = 0;
      if (animationFrame) windowRef.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      cancelVideoFrame();
      requestDraw({ immediate: true });
    } else {
      scheduleVideoFrame();
      ensureAnimation();
    }
  };
  motionQuery?.addEventListener?.("change", onMotionChange);

  const themeObserver = new windowRef.MutationObserver(() => requestDraw({ immediate: true }));
  themeObserver.observe(documentRef.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "class", "style"],
  });

  if (lensEnabled) {
    host.addEventListener("pointermove", (event) => {
      if (reducedMotion) return;
      const rect = host.getBoundingClientRect();
      lens.x = event.clientX - rect.left;
      lens.y = event.clientY - rect.top;
      lens.target = 1;
      ensureAnimation();
    }, { passive: true });
    host.addEventListener("pointerleave", () => { lens.target = 0; ensureAnimation(); }, { passive: true });
  }
  if (rippleEnabled) {
    host.addEventListener("pointerdown", addRipple, { passive: true });
    host.addEventListener("pointermove", addRipple, { passive: true });
  }

  return {
    element: wrapper,
    setSource,
    setSettings,
    setLook,
    setTitleZone,
    getSettings: () => getFilterSettings(settings),
    getAllSettings: () => cloneSettings(settings),
    getLook: () => look,
    getMetrics: () => ({ ...metrics }),
    refresh: () => requestDraw({ immediate: true }),
    play() {
      if (sourceKind === "video") return source.play();
      return Promise.resolve();
    },
    pause() {
      if (sourceKind === "video") source.pause();
    },
    setDrift,
    destroy() {
      destroyed = true;
      sourceLoadToken += 1;
      clearTimeout(redrawTimer);
      if (singleFrame) windowRef.cancelAnimationFrame(singleFrame);
      if (animationFrame) windowRef.cancelAnimationFrame(animationFrame);
      cancelVideoFrame();
      clearVideoEvents();
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      themeObserver.disconnect();
      documentRef.removeEventListener("visibilitychange", onVisibilityChange);
      motionQuery?.removeEventListener?.("change", onMotionChange);
      host.removeEventListener("pointerdown", addRipple);
      host.removeEventListener("pointermove", addRipple);
      if (sourceKind === "video" && source?.dataset?.asciiFieldOwned === "true") source.pause();
      wrapper.remove();
      delete host.dataset.asciiFieldHost;
      if (!hadInlinePosition && windowRef.getComputedStyle(host).position === "relative") {
        host.style.removeProperty("position");
      }
    },
  };
}
