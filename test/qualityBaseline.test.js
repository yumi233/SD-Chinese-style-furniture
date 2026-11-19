"use strict";

const assert = require("node:assert/strict");
const { execFile, execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { promisify } = require("node:util");
const { setTimeout: delay } = require("node:timers/promises");
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

async function benchmarkFixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "musheng-subset-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.cp(path.join(__dirname, "../src"), path.join(root, "src"), { recursive: true });
  await fs.symlink(path.join(__dirname, "../node_modules"), path.join(root, "node_modules"), "junction");
  await fs.mkdir(path.join(root, "scripts"));
  const script = path.join(root, "scripts", "quality-baseline.js");
  await fs.copyFile(path.join(__dirname, "../scripts/quality-baseline.js"), script);
  const git = (...args) => execFileSync("git", ["-c", "user.name=Mock Test", "-c", "user.email=mock@example.invalid", "-c", "core.hooksPath=/dev/null", ...args], { cwd: root });
  git("init", "-q");
  git("add", "src");
  git("commit", "-qm", "Mock source", "--no-gpg-sign");
  return { root, script };
}

test("paired subset calls only the capped cases and matches the baseline by ID", async t => {
  const { root, script } = await benchmarkFixture(t);
  let generationCalls = 0;
  let reviewCalls = 0;
  const sentPrompts = [];
  const reviewedPrompts = [];
  const server = http.createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/sdapi/v1/txt2img") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      sentPrompts.push(JSON.parse(Buffer.concat(chunks)).prompt);
      generationCalls++;
      return res.end(JSON.stringify({ images: ["bW9jayBpbWFnZQ=="] }));
    }
    if (req.url === "/v1/chat/completions") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const messages = JSON.parse(Buffer.concat(chunks)).messages;
      assert.match(messages[0].content, /Write all review feedback in Simplified Chinese/);
      const message = messages[1].content[0].text;
      reviewedPrompts.push(message.split("Prompt used for round 1: ")[1].split("\nTarget score:")[0]);
      reviewCalls++;
      return res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
        score: 90, antiqueLook: false, decision: "pass", rubric: { contemporaneity: 91 },
        productPresentation: { whiteBackdrop: true, propFree: true, furnitureFullyVisible: true },
        highlight: "扶手向下彎折，直接撐到地面。", highlightEvidence: { position: "扶手前端", formChange: "向下彎折", visibleUse: "直接撐到地面" },
      }) } }] }));
    }
    return res.end(JSON.stringify({ data: [{ id: "mock" }] }));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const baseUrl = "http://127.0.0.1:" + server.address().port;
  const env = { PATH: process.env.PATH, AUTO1111_BASE_URL: baseUrl, AUTO1111_LORA: "benchmark-mock", VISION_MODEL_BASE_URL: baseUrl + "/v1", VISION_MODEL_NAME: "mock" };
  const date = "2000-01-01";
  const run = (phase, only) => promisify(execFile)(process.execPath, [
    script, "--engine", "automatic1111", "--phase", phase, "--date", date, "--only", only, "--max-calls", "2",
  ], { cwd: root, env });
  await run("before", "11,ming-chair,song-cabinet");
  await run("after", "ming-chair,11,song-cabinet");
  assert.equal(generationCalls, 4);
  assert.equal(reviewCalls, 4);
  assert.deepEqual(reviewedPrompts, sentPrompts);
  assert.ok(reviewedPrompts.every(prompt => prompt.startsWith("<lora:benchmark-mock:1>")));
  const directory = path.join(root, "local-archive", "quality-baseline", date);
  const after = JSON.parse(await fs.readFile(path.join(directory, "after", "results.json"), "utf8"));
  assert.equal(after.generationLimit, 2);
  assert.deepEqual(after.rows.map(row => row.id), ["ming-chair", "zen-table"]);
  assert.deepEqual(after.rows.map(row => row.finalPrompt), reviewedPrompts.slice(2));
  assert.equal(after.rows[0].evaluation.highlight, "扶手向下弯折，直接撑到地面。");
  assert.equal(after.rows[0].evaluation.highlightEvidence.visibleUse, "直接撑到地面");
  const comparison = await fs.readFile(path.join(directory, "comparison.md"), "utf8");
  assert.match(comparison, /before\/ming-chair\.png\).*\(after\/ming-chair\.png\)/);
  assert.doesNotMatch(comparison, /song-cabinet/);
});

test("an initial after run holds the resume lock and both modes share the saved limit", async t => {
  const { root, script } = await benchmarkFixture(t);
  const paths = Object.fromEntries(["auth.json", "codex", "gate", "arrived", "released", "calls"].map(name => [name, path.join(root, name)]));
  const mock = "#!/usr/bin/env node\n(" + mockCodex.toString() + ")(" + JSON.stringify(paths) + ")\n";
  await fs.writeFile(paths.codex, mock, { mode: 0o700 });
  await fs.writeFile(paths["auth.json"], "{}");
  const env = { PATH: process.env.PATH, CODEX_CLI_ENABLED: "true", CODEX_CLI_AUTH_FILE: paths["auth.json"], CODEX_CLI_COMMAND: paths.codex };
  const date = "2000-01-02";
  const run = (...args) => promisify(execFile)(process.execPath, [script, "--date", date, ...args], { cwd: root, env, timeout: 20000 });
  await run("--phase", "before", "--only", "1,2,3", "--max-calls", "3");
  await fs.writeFile(paths.gate, "");
  const initial = run("--phase", "after", "--only", "1", "--max-calls", "2");
  try {
    for (let attempt = 0; attempt < 160; attempt++) {
      const arrived = await fs.access(paths.arrived).then(() => true, () => false);
      if (arrived) break;
      await delay(25);
    }
    await fs.access(paths.arrived);
    const ownerPath = path.join(root, "local-archive", "quality-baseline", date, ".after.lock", "owner.json");
    const ownerText = await fs.readFile(ownerPath, "utf8");
    const owner = JSON.parse(ownerText);
    assert.equal(owner.hostname, os.hostname());
    assert.ok(Number.isInteger(owner.pid) && owner.pid > 0);
    assert.ok(Number.isFinite(Date.parse(owner.startedAt)));
    await assert.rejects(run("--phase", "after", "--resume-after", "--only", "2,3", "--max-calls", "3"), /already holds the lock/);
    assert.equal(await fs.readFile(ownerPath, "utf8"), ownerText);
    assert.equal((await fs.readFile(paths.calls, "utf8")).split("generation").length - 1, 4);
  } finally {
    await fs.writeFile(paths.released, "");
    await initial;
  }
  await run("--phase", "after", "--resume-after", "--only", "2,3", "--max-calls", "3");
  const noSlots = await run("--phase", "after", "--resume-after", "--only", "3", "--max-calls", "12");
  assert.match(noSlots.stdout, /No cases remain/);
  const directory = path.join(root, "local-archive", "quality-baseline", date);
  const report = JSON.parse(await fs.readFile(path.join(directory, "after", "results.json"), "utf8"));
  assert.equal(report.generationLimit, 2);
  assert.deepEqual(report.rows.map(row => row.id), ["ming-chair", "ming-table"]);
  assert.equal((await fs.readFile(paths.calls, "utf8")).split("generation").length - 1, 5);
  await assert.rejects(fs.access(path.join(directory, ".after.lock")), { code: "ENOENT" });
});

async function mockCodex(paths) {
  const fs = require("node:fs");
  const path = require("node:path");
  const { setTimeout: delay } = require("node:timers/promises");
  if (process.argv.includes("--version")) {
    console.log("mock codex");
    return;
  }
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  if (JSON.parse(input).designBrief) {
    fs.appendFileSync(paths.calls, "generation\n");
    if (fs.existsSync(paths.gate) && !fs.existsSync(paths.arrived)) {
      fs.writeFileSync(paths.arrived, "");
      while (!fs.existsSync(paths.released)) await delay(15);
    }
    const output = path.join(process.env.CODEX_HOME, "generated_images");
    fs.mkdirSync(output);
    fs.writeFileSync(path.join(output, "test.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));
  } else {
    const review = {
      score: 90, checks: [], revisedPrompt: "chair", antiqueLook: false, decision: "pass", rubric: { contemporaneity: 91 },
      productPresentation: { whiteBackdrop: true, propFree: true, furnitureFullyVisible: true },
      highlight: "Bent arm supports the frame", highlightEvidence: { position: "arm", formChange: "curves down", visibleUse: "support" },
    };
    console.log(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: JSON.stringify(review) } }));
  }
  console.log(JSON.stringify({ type: "turn.completed" }));
}

test("benchmark uses a fixed white backdrop and soft light while varying camera framing", () => {
  const plans = Array.from({ length: 12 }, (_, index) => photographyDirection("unchanged brief", index));
  assert.deepEqual([...new Set(plans.map(plan => plan.scene))], ["seamless pure white studio backdrop"]);
  assert.deepEqual([...new Set(plans.map(plan => plan.lighting))], ["soft studio lighting with a soft contact shadow only"]);
  assert.equal(new Set(plans.map(plan => plan.framing)).size, 4);
  assert.deepEqual(photographyDirection("old brief"), photographyDirection("old brief"));
});
