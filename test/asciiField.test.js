const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const moduleUrl = pathToFileURL(
  path.join(__dirname, "..", "public", "js", "modules", "ascii-field.js"),
).href;
const asciiField = import(moduleUrl);

test("palette lookup tables use the four meadow stops and preserve original colours", async () => {
  const { buildPaletteLut, applyPalette } = await asciiField;
  const meadow = buildPaletteLut("meadow");

  assert.ok(meadow instanceof Uint8ClampedArray);
  assert.equal(meadow.length, 256 * 3);
  assert.deepEqual(Array.from(meadow.slice(0, 3)), [43, 54, 31]);
  assert.deepEqual(Array.from(meadow.slice(255 * 3)), [229, 225, 189]);
  for (let index = 0; index < 3; index += 1) {
    assert.ok(Math.abs(meadow[Math.round(0.4 * 255) * 3 + index] - [103, 125, 69][index]) <= 1);
    assert.ok(Math.abs(meadow[Math.round(0.74 * 255) * 3 + index] - [174, 186, 120][index]) <= 1);
  }
  assert.equal(buildPaletteLut("original"), null);

  const rgba = new Uint8ClampedArray([0, 0, 0, 17, 255, 255, 255, 199]);
  applyPalette(rgba, "meadow");
  assert.deepEqual(Array.from(rgba), [43, 54, 31, 17, 229, 225, 189, 199]);
});

test("paper look maps cell luminance directly to the meadow palette", async () => {
  const { paperColorForLuminance } = await asciiField;

  assert.deepEqual(paperColorForLuminance(0), {
    red: 43,
    green: 54,
    blue: 31,
    css: "rgb(43, 54, 31)",
  });
  assert.deepEqual(paperColorForLuminance(1), {
    red: 229,
    green: 225,
    blue: 189,
    css: "rgb(229, 225, 189)",
  });
  for (const [light, expected] of [
    [0.4, [103, 125, 69]],
    [0.74, [174, 186, 120]],
  ]) {
    const color = paperColorForLuminance(light);
    assert.ok(Math.abs(color.red - expected[0]) <= 1);
    assert.ok(Math.abs(color.green - expected[1]) <= 1);
    assert.ok(Math.abs(color.blue - expected[2]) <= 1);
  }
  assert.equal(paperColorForLuminance(0.5, "original").red > 0, true);
});

test("paper look fades the top 36 percent with the 1.4 exponent", async () => {
  const { PAPER_TOP_FADE_END, paperTopFade } = await asciiField;

  assert.equal(PAPER_TOP_FADE_END, 0.36);
  assert.equal(paperTopFade(0), 1);
  assert.ok(Math.abs(paperTopFade(0.18) - 0.5 ** 1.4) < 1e-12);
  assert.equal(paperTopFade(0.36), 0);
  assert.equal(paperTopFade(0.8), 0);
  assert.equal(paperTopFade(-0.01), 0);
  assert.equal(paperTopFade(Number.NaN), 0);
});

test("paper title zone reduces character opacity by about 60 percent", async () => {
  const { PAPER_TITLE_ZONE_OPACITY, paperTitleZoneOpacity } = await asciiField;
  const zone = { x: 0, y: 0.63, w: 0.38, h: 0.37 };

  assert.equal(PAPER_TITLE_ZONE_OPACITY, 0.4);
  assert.equal(paperTitleZoneOpacity(0.19, 0.8, zone), 0.4);
  assert.equal(paperTitleZoneOpacity(0, 0.63, zone), 0.4);
  assert.equal(paperTitleZoneOpacity(0.19, 0.62, zone), 1);
  assert.equal(paperTitleZoneOpacity(0.4, 0.8, zone), 1);
  assert.equal(paperTitleZoneOpacity(0.19, 0.8, null), 1);
  assert.equal(paperTitleZoneOpacity(0.19, 0.8, { x: 0, y: 0, w: 0, h: 0 }), 1);
});

test("mask stops use light and dark bases with the specified 1.08 curve", async () => {
  const { maskStops, maskStopOpacity } = await asciiField;

  const light = maskStops(50, "light");
  const dark = maskStops(50, "dark");
  assert.deepEqual(light.positions, [0, 42, 100]);
  assert.deepEqual(light.opacities.map((value) => Math.round(value * 1000) / 1000), [54, 20, 38]);
  assert.deepEqual(dark.opacities.map((value) => Math.round(value * 1000) / 1000), [44, 20, 50]);
  assert.equal(maskStops(0, "light").color, "#FFFFFF");
  assert.equal(maskStops(0, "dark").color, "#000000");
  assert.deepEqual(maskStops(0, "light").opacities, [0, 0, 0]);
  assert.deepEqual(maskStops(100, "light").opacities, [100, 100, 100]);

  const expected = 54 + (100 - 54) * ((90 - 50) / 50) ** 1.08;
  assert.ok(Math.abs(maskStopOpacity(54, 90) - expected) < 1e-10);
  assert.ok(Math.abs(maskStopOpacity(20, 90) - (20 + 80 * 0.8 ** 1.08)) < 1e-10);
});

test("ASCII character mapping follows round(tone * 16) and skips blank tones", async () => {
  const { CHARS, mapAsciiCharacter } = await asciiField;

  assert.equal(CHARS, "  .,:;-=+xX08S#&@");
  assert.equal(mapAsciiCharacter(0), "");
  assert.equal(mapAsciiCharacter(0.02), "");
  assert.equal(mapAsciiCharacter(0.1), ".");
  assert.equal(mapAsciiCharacter(0.5), "+");
  assert.equal(mapAsciiCharacter(0.999), "@");
  assert.equal(mapAsciiCharacter(1), "@");
});

test("ASCII tone follows raw, percentile, black/white and smoothstep formulas", async () => {
  const { asciiToneDetails, smoothstep } = await asciiField;
  const details = asciiToneDetails({
    luminance: 0.25,
    low: 0.1,
    high: 0.9,
    inkTone: "dark",
    strength: 100,
  });

  assert.equal(details.raw, 0.75);
  assert.equal(details.normalized, 0.8125);
  assert.equal(details.mix, 0.86);
  assert.ok(Math.abs(details.t - (0.75 * 0.14 + 0.8125 * 0.86)) < 1e-12);
  assert.equal(details.black, 0.22);
  assert.equal(details.white, 0.92);
  const expectedLev = (details.t - details.black) / (details.white - details.black);
  assert.ok(Math.abs(details.lev - expectedLev) < 1e-12);
  assert.ok(Math.abs(details.tone - smoothstep(details.lev)) < 1e-12);

  const flat = asciiToneDetails({
    luminance: 0.3,
    low: 0.4,
    high: 0.42,
    inkTone: "light",
    strength: 50,
  });
  assert.equal(flat.normalized, 0.3);
  assert.equal(flat.raw, 0.3);
  assert.equal(flat.t, 0.3);
  assert.equal(flat.lev, (0.3 - 0.11) / (0.96 - 0.11));
  assert.equal(flat.tone, flat.lev * 0.5 + smoothstep(flat.lev) * 0.5);
});

test("Bayer thresholds expose the canonical 4x4 matrix and quantize channels", async () => {
  const { BAYER_4X4, bayerThreshold, bayerQuantize } = await asciiField;

  assert.deepEqual(BAYER_4X4, [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]);
  assert.equal(bayerThreshold(0, 0), 0.5 / 16);
  assert.equal(bayerThreshold(3, 2), 9.5 / 16);
  assert.equal(bayerThreshold(15, 7), 5.5 / 16);
  assert.equal(bayerQuantize(127.49, 0.5, 2, 1), 0);
  assert.equal(bayerQuantize(127.51, 0.5, 2, 1), 255);
  assert.equal(bayerQuantize(255, 0.9, 2, 1), 255);
  assert.equal(bayerQuantize(0, 0.1, 2, 1), 0);
  assert.ok(Math.abs(bayerQuantize(255, 0.9, 2, 0.32) - 255) < 1e-12);
});

test("dither colour applies saturation, matrix threshold and blend strength", async () => {
  const { ditherRgb, luminance, pushSaturation } = await asciiField;
  const source = { red: 180, green: 90, blue: 60 };
  const light = luminance(180, 90, 60);

  assert.ok(Math.abs(pushSaturation(180, light, 1.24) - (light * 255 + (180 - light * 255) * 1.24)) < 1e-10);
  const high = ditherRgb(source, 0, 0, { strength: 100, spacing: 0 });
  const low = ditherRgb(source, 3, 0, { strength: 100, spacing: 0 });
  assert.notDeepEqual(high, low);
  for (const value of Object.values(high)) assert.ok(value >= 0 && value <= 255);

  const partlyMixed = ditherRgb(source, 0, 0, { strength: 0, spacing: 0 });
  assert.ok(partlyMixed.red > 0 && partlyMixed.red < 255);
});

test("sampling returns 12,000 evenly spaced luminance percentiles and ink alpha", async () => {
  const { asciiInkColor, sampleStatistics } = await asciiField;
  const pixelCount = 240 * 100;
  const data = new Uint8ClampedArray(pixelCount * 4);
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const value = Math.round((pixel / (pixelCount - 1)) * 255);
    const index = pixel * 4;
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
    data[index + 3] = 255;
  }

  const stats = sampleStatistics(data, { sampleCount: 12000 });
  assert.equal(stats.count, 12000);
  assert.ok(stats.low > 0 && stats.low < 0.1);
  assert.ok(stats.high > 0.9 && stats.high < 1);

  const ink = asciiInkColor(120, 170, 90, 0.6, 80);
  const expectedAlpha = (0.12 + 0.7 * 0.6) * (0.72 + 0.28 * 0.8);
  assert.ok(Math.abs(ink.alpha - expectedAlpha) < 1e-12);
  assert.match(ink.css, /^rgba\(\d+, \d+, \d+, 0\.\d{3}\)$/);
});

test("filter settings remain isolated and default to meadow", async () => {
  const { RECOMMENDED, createSettings, getFilterSettings, updateFilterSettings } = await asciiField;

  assert.deepEqual(RECOMMENDED.ascii, {
    filter: "ascii",
    mask: 90,
    palette: "meadow",
    inkTone: "dark",
    strength: 100,
    size: 37,
    spacing: 0,
  });
  assert.deepEqual(RECOMMENDED.dither, {
    filter: "dither",
    mask: 88,
    palette: "meadow",
    inkTone: "dark",
    strength: 100,
    size: 15,
    spacing: 0,
  });

  let settings = createSettings();
  settings = updateFilterSettings(settings, { filter: "ascii", mask: 31, size: 61 });
  settings = updateFilterSettings(settings, { filter: "dither", mask: 47, size: 12, palette: "clay" });
  settings = updateFilterSettings(settings, { filter: "dither", strength: 42, spacing: 73 });

  assert.equal(settings.filter, "dither");
  assert.equal(settings.ascii.mask, 31);
  assert.equal(settings.ascii.size, 61);
  assert.equal(settings.ascii.palette, "meadow");
  assert.equal(settings.dither.mask, 47);
  assert.equal(settings.dither.size, 12);
  assert.equal(settings.dither.palette, "clay");
  assert.equal(settings.dither.strength, 42);
  assert.equal(settings.dither.spacing, 73);
  assert.equal(getFilterSettings(settings, "ascii").mask, 31);

  const clamped = updateFilterSettings(settings, {
    filter: "ascii",
    mask: 900,
    palette: "unknown",
  });
  assert.equal(clamped.ascii.mask, 100);
  assert.equal(clamped.ascii.palette, "meadow");
  assert.equal(clamped.dither.palette, "clay");
});
