"use strict";

const assert = require("node:assert/strict");
const { execFile, execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { promisify } = require("node:util");
const { planCases, resumeCases } = require("../scripts/quality-baseline");
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

test("selection accepts IDs and case numbers, and the saved cap includes interrupted calls", () => {
  const script = path.join(__dirname, "../scripts/quality-baseline.js");
  const args = [script, "--dry-run"];
  const preview = JSON.parse(execFileSync(process.execPath, [...args, "--only", "11,ming-chair,song-cabinet", "--max-calls", "2"], { encoding: "utf8" }));
  assert.deepEqual(preview.cases.map(entry => entry.id), ["zen-table", "ming-chair"]);
  assert.deepEqual(preview.calls, { generation: 2, review: 2 });
  for (const flags of [
    ["--only", "unknown"], ["--only", "1,ming-chair"], ["--max-calls", "0"], ["--max-calls", "13"], ["--max-calls", "1.5"],
  ]) {
    assert.equal(spawnSync(process.execPath, [...args, ...flags]).status, 1);
  }
  const report = { generationLimit: 2, rows: [{ id: "zen-table", status: "generation-started" }] };
  const plan = { maxCalls: 12, only: ["ming-chair", "song-cabinet"] };
  assert.deepEqual(planCases(plan, report).cases.map(entry => entry.id), ["ming-chair"]);
  report.rows.push({ id: "ming-chair", status: "generation-failed", revision: "new-rules" });
  assert.deepEqual(planCases(plan, report).cases, []);
  const ordered = planCases({ maxCalls: 2, only: ["ming-chair", "ming-table", "song-cabinet"] }, { rows: [] });
  assert.deepEqual(ordered.cases.map(entry => entry.id), ["ming-chair", "ming-table"]);
});

test("paired subset calls only the capped cases and matches the baseline by ID", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "musheng-subset-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.cp(path.join(__dirname, "../src"), path.join(root, "src"), { recursive: true });
  await fs.mkdir(path.join(root, "scripts"));
  const script = path.join(root, "scripts", "quality-baseline.js");
  await fs.copyFile(path.join(__dirname, "../scripts/quality-baseline.js"), script);
  const git = (...args) => execFileSync("git", ["-c", "user.name=Mock Test", "-c", "user.email=mock@example.invalid", "-c", "core.hooksPath=/dev/null", ...args], { cwd: root });
  git("init", "-q");
  git("add", "src");
  git("commit", "-qm", "Mock source", "--no-gpg-sign");

  let generationCalls = 0;
  let reviewCalls = 0;
  const server = http.createServer((req, res) => {
    req.resume();
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/sdapi/v1/txt2img") {
      generationCalls++;
      return res.end(JSON.stringify({ images: ["bW9jayBpbWFnZQ=="] }));
    }
    if (req.url === "/v1/chat/completions") {
      reviewCalls++;
      return res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
        score: 90, antiqueLook: false, decision: "pass", rubric: { contemporaneity: 91 },
        highlight: "A bent armrest reaches the floor", highlightEvidence: { position: "front arm", formChange: "curved down", visibleUse: "front support" },
      }) } }] }));
    }
    return res.end(JSON.stringify({ data: [{ id: "mock" }] }));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const baseUrl = "http://127.0.0.1:" + server.address().port;
  const env = { PATH: process.env.PATH, AUTO1111_BASE_URL: baseUrl, VISION_MODEL_BASE_URL: baseUrl + "/v1", VISION_MODEL_NAME: "mock" };
  const date = "2000-01-01";
  const run = (phase, only) => promisify(execFile)(process.execPath, [
    script, "--engine", "automatic1111", "--phase", phase, "--date", date, "--only", only, "--max-calls", "2",
  ], { cwd: root, env });
  await run("before", "11,ming-chair,song-cabinet");
  await run("after", "ming-chair,11,song-cabinet");
  assert.equal(generationCalls, 4);
  assert.equal(reviewCalls, 4);
  const directory = path.join(root, "local-archive", "quality-baseline", date);
  const after = JSON.parse(await fs.readFile(path.join(directory, "after", "results.json"), "utf8"));
  assert.equal(after.generationLimit, 2);
  assert.deepEqual(after.rows.map(row => row.id), ["ming-chair", "zen-table"]);
  const comparison = await fs.readFile(path.join(directory, "comparison.md"), "utf8");
  assert.match(comparison, /before\/ming-chair\.png\).*\(after\/ming-chair\.png\)/);
  assert.doesNotMatch(comparison, /song-cabinet/);
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
