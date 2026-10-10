const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createApp } = require("../src/http/app");
const { HistoryStore } = require("../src/historyStore");
const { UserStore } = require("../src/userStore");
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

async function setup(t, overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "musheng-legacy-limits-"));
  const historyStore = new HistoryStore({ rootDir: path.join(root, "history") });
  const userStore = new UserStore({ filePath: path.join(root, "users.json") });
  const calls = [];
  const gateway = {
    listEngines: () => ({ defaultEngine: "codexCli", modes: ["codexCli", "imageModel"], agentEngines: ["codexCli", "imageModel"] }),
    generate: async request => { calls.push("normal"); return { request, images: [{ url: PNG }] }; },
    runAgent: async request => { calls.push("agent"); return agentResult(request); },
    ...overrides,
  };
  const alice = await userStore.register({ email: "legacy-alice@example.invalid", password: "fixture-safe-password" });
  const bob = await userStore.register({ email: "legacy-bob@example.invalid", password: "fixture-safe-password" });
  const server = createApp({ rootDir: root, publicDir: path.join(root, "public"), historyStore, userStore, gateway }).listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  t.after(async () => { await new Promise(resolve => server.close(resolve)); fs.rmSync(root, { recursive: true, force: true }); });
  const call = (endpoint, { owner = alice, method = "POST", body = { prompt: "fixture chair", engine: "imageModel" }, origin } = {}) => fetch(`http://127.0.0.1:${server.address().port}${endpoint}`, {
    method, headers: { "Content-Type": "application/json", ...(owner ? { Cookie: `musheng_session=${owner.token}` } : {}), ...(origin ? { Origin: origin } : {}) },
    ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
  });
  return { root, historyStore, userStore, calls, alice, bob, call };
}
function agentResult(request) {
  const evaluation = { score: 90, decision: "accept" };
  return { request, bestRound: 1, bestScore: 90, bestEvaluation: evaluation, completedRounds: 1,
    rounds: [{ round: 1, prompt: request.prompt, image: { url: PNG }, evaluation, engines: ["imageModel"] }] };
}
async function waitUntil(check) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const value = await check();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error("fixture did not reach expected state");
}

test("legacy aliases preserve non-CLI 200 results and share persisted idempotency and hourly limits", async t => {
  const { root, calls, alice, call } = await setup(t);
  const body = { enhancedPrompt: "fixture chair", engine: "imageModel", requestId: "legacy_request_00000" };
  const first = await call("/api/generate", { body });
  assert.equal(first.status, 200);
  const result = await first.json();
  assert.equal(result.ok, true);
  assert.match(result.images[0].url, /^\/api\/history\/assets\//);
  assert.equal(result.historyRecord.ownerId, alice.user.id);
  const duplicate = await call("/api/v1/generate", { body });
  assert.equal(duplicate.status, 200);
  assert.equal((await duplicate.json()).historyRecord.id, result.historyRecord.id);
  assert.equal(calls.length, 1);
  for (let index = 1; index < 20; index++) {
    const response = await call(index % 2 ? "/api/agent/run" : "/api/v1/generate", {
      body: { prompt: "fixture chair", engine: "imageModel", requestId: `legacy_request_${String(index).padStart(5, "0")}` },
    });
    assert.equal(response.status, 200);
  }
  for (const endpoint of ["/api/generate", "/api/v1/agent/run", "/api/v1/generation-tasks"]) {
    assert.equal((await call(endpoint, { body: { prompt: "fixture", engine: "imageModel", requestId: "legacy_request_over_limit" } })).status, 429);
  }
  assert.equal(calls.length, 20);
  const tasks = fs.readdirSync(path.join(root, "history", "tasks")).filter(name => name.endsWith(".json"));
  assert.equal(tasks.length, 20);
  assert.ok(tasks.every(name => JSON.parse(fs.readFileSync(path.join(root, "history", "tasks", name))).status === "completed"));
});

test("all generation entrypoints share one active task and keep auth, Origin and owner checks", async t => {
  let release;
  const fixture = await setup(t, { generate: request => new Promise(resolve => { release = () => resolve({ request, images: [{ url: PNG }] }); }) });
  const { alice, bob, call } = fixture;
  const pending = call("/api/generate", { body: { prompt: "fixture", engine: "imageModel", requestId: "legacy_active_request" } });
  await waitUntil(() => release);
  const active = await (await call("/api/v1/generation-tasks", { method: "GET" })).json();
  assert.equal(active.tasks.length, 1);
  assert.equal(active.tasks[0].status, "running");
  for (const endpoint of ["/api/v1/generate", "/api/agent/run", "/api/v1/generation-tasks"]) {
    assert.equal((await call(endpoint, { owner: bob, body: { prompt: "fixture", engine: "imageModel", requestId: "legacy_other_request" } })).status, 429);
  }
  assert.equal((await call(`/api/v1/generation-tasks/${active.tasks[0].id}`, { method: "GET", owner: bob })).status, 404);
  assert.equal((await call("/api/generate", { owner: null })).status, 401);
  assert.equal((await call("/api/agent/run", { owner: alice, origin: "http://evil.test" })).status, 403);
  release();
  assert.equal((await pending).status, 200);
  const cli = await call("/api/v1/generate", { body: { prompt: "fixture", engine: "codexCli", requestId: "legacy_cli_request_1" } });
  assert.equal(cli.status, 202);
  const { task } = await cli.json();
  await waitUntil(async () => (await (await call(`/api/v1/generation-tasks/${task.id}`, { method: "GET" })).json()).task.status === "running");
  release();
  await waitUntil(async () => (await (await call(`/api/v1/generation-tasks/${task.id}`, { method: "GET" })).json()).task.status === "completed");
});

test("active agent history cannot be deleted by owner or admin until checkpoints finish", async t => {
  let release;
  const { alice, bob, call, historyStore, userStore, root } = await setup(t, { runAgent: async (request, context) => {
    const result = agentResult(request);
    await context.onRound(result);
    await new Promise(resolve => { release = resolve; });
    return result;
  } });
  const pending = call("/api/agent/run", { body: { prompt: "fixture", engine: "imageModel", requestId: "legacy_agent_delete_1" } });
  await waitUntil(() => release);
  const record = historyStore.list(100, alice.user.id)[0];
  assert.ok(record);
  assert.equal((await call(`/api/v1/history/${record.id}`, { owner: bob, method: "DELETE" })).status, 404);
  const blocked = await call(`/api/v1/history/${record.id}`, { method: "DELETE" });
  assert.equal(blocked.status, 409);
  assert.match((await blocked.json()).message, /等待任务完成/);
  userStore.adminUserIds.add(bob.user.id);
  assert.equal((await call(`/api/v1/history/${record.id}`, { owner: bob, method: "DELETE" })).status, 409);
  assert.ok(historyStore.get(record.id));
  assert.ok(fs.existsSync(historyStore.resolveAsset(path.basename(record.images[0].url))));
  release();
  assert.equal((await pending).status, 200);
  assert.equal(historyStore.list(100, alice.user.id).length, 1);
  const removed = await call(`/api/history/${record.id}`, { method: "DELETE" });
  assert.equal(removed.status, 200);
  assert.equal(historyStore.get(record.id), null);
  assert.deepEqual(fs.readdirSync(path.join(root, "history", "images")), []);
});

test("legacy waits preserve safe provider and storage failures without rebilling failed duplicate requests", async t => {
  let providerFailure = new Error("private https://fixture.invalid?token=fixture-secret /private/key");
  let calls = 0;
  const { call, historyStore, root } = await setup(t, { generate: async request => {
    calls++;
    if (providerFailure) throw providerFailure;
    return { request, images: [{ url: PNG }] };
  } });
  const body = { prompt: "fixture", engine: "imageModel", requestId: "legacy_failed_request_1" };
  const failed = await call("/api/generate", { body });
  assert.equal(failed.status, 502);
  const error = await failed.json();
  assert.equal(error.message, "生成服务不可用，请检查模型连接后重试");
  assert.doesNotMatch(JSON.stringify(error), /fixture-secret|fixture\.invalid|private/);
  assert.equal((await call("/api/v1/generate", { body })).status, 502);
  assert.equal(calls, 1);
  providerFailure = null;
  historyStore.persistImage = async () => { throw new Error("EACCES /private/images"); };
  const unsaved = await call("/api/generate", { body: { ...body, requestId: "legacy_failed_request_2" } });
  assert.equal(unsaved.status, 507);
  assert.match((await unsaved.json()).message, /保存失败/);
  const tasks = fs.readdirSync(path.join(root, "history", "tasks")).map(name => JSON.parse(fs.readFileSync(path.join(root, "history", "tasks", name))));
  assert.deepEqual(tasks.map(task => task.errorStatus).sort(), [502, 507]);
  assert.ok(tasks.every(task => task.status === "failed" && !task.result));
  assert.doesNotMatch(JSON.stringify(tasks), /fixture-secret|fixture\.invalid|EACCES|private\/images/);
  assert.deepEqual(historyStore.list(), []);
});
