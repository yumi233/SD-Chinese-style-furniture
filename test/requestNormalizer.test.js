const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildGenerationSettings,
  getSizeLabel,
  normalizeGenerateRequest,
  normalizeSize,
  resolveSize,
} = require("../src/lib/requestNormalizer");

test("new canvas presets map 16:9 and 4:3 720p/1080p to exact dimensions", () => {
  const expected = {
    "16:9-720p": { width: 1280, height: 720, label: "16:9 720p" },
    "16:9-1080p": { width: 1920, height: 1080, label: "16:9 1080p" },
    "4:3-720p": { width: 960, height: 720, label: "4:3 720p" },
    "4:3-1080p": { width: 1440, height: 1080, label: "4:3 1080p" },
  };

  for (const [size, dimensions] of Object.entries(expected)) {
    const request = normalizeGenerateRequest({ prompt: "chair", size }, "automatic1111");
    const settings = buildGenerationSettings(request);
    assert.equal(request.size, size);
    assert.equal(request.sizeLabel, dimensions.label);
    assert.equal(getSizeLabel(size), dimensions.label);
    assert.equal(settings.width, dimensions.width);
    assert.equal(settings.height, dimensions.height);
  }
});

test("legacy square sizes and raw dimensions remain compatible", () => {
  assert.equal(normalizeSize(512), "512");
  assert.deepEqual(resolveSize("512"), { width: 512, height: 512, label: "512 × 512" });
  assert.equal(normalizeSize("1280x720"), "16:9-720p");
  assert.equal(normalizeSize("1440 × 1080"), "4:3-1080p");
  assert.equal(normalizeSize("bad-size"), "16:9-720p");
});
