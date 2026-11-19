"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const test = require("node:test");
const { resumeCases } = require("../scripts/quality-baseline");
const { photographyDirection } = require("../src/lib/designDirection");

test("quality baseline dry runs use the same twelve cases for either phase", () => {
  const script = path.join(__dirname, "../scripts/quality-baseline.js");
  const preview = phase => JSON.parse(execFileSync(process.execPath, [
    script, "--engine", "codexCli", "--phase", phase, "--dry-run",
  ], { env: {}, encoding: "utf8" }));
  const before = preview("before");
  const after = preview("after");
  assert.deepEqual(before.cases, after.cases);
  assert.deepEqual(before.calls, { generation: 12, review: 12 });
  assert.equal(before.reviewer, "codexCli");
  for (const style of ["ming", "newChinese", "song", "zen"]) {
    const cases = before.cases.filter(item => item.style === style);
    assert.deepEqual(cases.map(item => item.id.split("-").at(-1)), ["chair", "table", "cabinet"]);
  }
});

test("resuming counts the interrupted request and covers all four styles", () => {
  const rows = [
    { id: "ming-chair", image: "chair.png" },
    { id: "ming-table", image: "table.png" },
    { id: "ming-cabinet", status: "generation-started" },
  ];
  const remaining = resumeCases(rows);
  assert.equal(remaining.length, 9);
  assert.deepEqual(remaining.slice(0, 4).map(row => row.style), ["ming", "newChinese", "song", "zen"]);
  const failed = { id: "ming-cabinet", status: "generation-failed", revision: "new-rules" };
  assert.ok(!resumeCases([...rows, failed]).some(row => row.id === failed.id));
  assert.equal(resumeCases([...rows, ...remaining]).length, 0);
});

test("benchmark camera, scene and light are independently varied by case", () => {
  const plans = Array.from({ length: 12 }, (_, index) => photographyDirection("unchanged brief", index));
  for (const key of ["scene", "lighting", "framing"]) {
    assert.equal(new Set(plans.map(plan => plan[key])).size, 4);
  }
  for (const scene of new Set(plans.map(plan => plan.scene))) {
    const inScene = plans.filter(plan => plan.scene === scene);
    assert.equal(new Set(inScene.map(plan => plan.lighting)).size, 3);
    assert.equal(new Set(inScene.map(plan => plan.framing)).size, 3);
  }
  assert.deepEqual(photographyDirection("old brief"), photographyDirection("old brief"));
});
