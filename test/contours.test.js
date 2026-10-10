const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const moduleUrl = pathToFileURL(path.join(__dirname, "..", "public", "js", "modules", "contours.js")).href;

test("traceContours returns one path per level and labels index contours", async () => {
  const { traceContours } = await import(moduleUrl);
  const contours = traceContours({ width: 320, height: 200, cell: 16, levels: 10, seed: 3 });
  assert.equal(contours.length, 10);
  assert.ok(contours.every((item) => typeof item.d === "string"));
  assert.ok(contours.some((item) => item.d.length > 0), "at least one level should produce line segments");
  const indexLevels = contours.filter((item) => item.index).map((item) => item.level);
  assert.deepEqual(indexLevels, [5, 10]);
});

test("traceContours is deterministic for the same seed and time", async () => {
  const { traceContours } = await import(moduleUrl);
  const a = traceContours({ width: 200, height: 120, seed: 9, time: 1.5 });
  const b = traceContours({ width: 200, height: 120, seed: 9, time: 1.5 });
  assert.deepEqual(a, b);
});
