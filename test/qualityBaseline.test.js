"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const test = require("node:test");

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
