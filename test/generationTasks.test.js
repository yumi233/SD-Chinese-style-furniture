const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { GenerationTasks } = require("../src/generationTasks");
const { HistoryStore } = require("../src/historyStore");
const { toSafeGenerationError } = require("../src/http/routes");
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
function setup(t, override = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "furniture-tasks-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const historyStore = new HistoryStore({ rootDir: path.join(root, "history") });
  const gateway = { listEngines: () => ({ defaultEngine: "codexCli", modes: ["codexCli", "imageModel"], agentEngines: ["codexCli"] }), generate: async request => ({ request, images: [{ url: PNG }], engines: [request.engine] }), ...override };
  return { gateway, historyStore, rootDir: path.join(root, "tasks"), safeError: toSafeGenerationError };
}
const user = { id: "alice", isAdmin: true };
const body = extra => ({ prompt: "现代中式圈椅", requestId: "request_1234567890", ...extra });
async function finished(task) { for (let i=0; i<100 && ["queued", "running"].includes(task.status); i++) await new Promise(resolve => setTimeout(resolve, 5)); assert.equal(task.status, "completed"); }

test("authenticated users can use the default CLI; client model and executable stay ignored", async t => {
  const service = new GenerationTasks(setup(t));
  assert.throws(() => service.create(body(), null), error => error.statusCode === 401);
  assert.throws(() => service.create(body({ prompt: { command: "ls" } }), user), error => error.statusCode === 400);
  const task = service.create(body({ model: "unknown", command: "/private" }), { id: "bob", isAdmin: false });
  await finished(task);
  assert.equal(task.request.engine, "codexCli");
  assert.equal(task.request.model, undefined);
  assert.equal(task.request.command, undefined);
});

test("duplicate submission is idempotent, one active task per owner, task results stay private", async t => {
  let release, calls = 0;
  const options = setup(t, { generate: request => { calls++; return new Promise(resolve => { release = () => resolve({ request, images: [{ url: PNG }], engines: ["codexCli"] }); }); } });
  const service = new GenerationTasks(options);
  const task = service.create(body({ model: "gpt-6.1", command: "/secret" }), user);
  assert.equal(service.create(body(), user).id, task.id);
  assert.equal(service.get(task.id, "bob"), null);
  assert.equal(service.stop(task.id, "bob"), null);
  assert.deepEqual(service.active("bob"), []);
  assert.throws(() => service.create(body({ requestId: "second_request_1234" }), user), error => error.statusCode === 429);
  assert.equal(task.request.model, undefined);
  assert.equal(task.request.command, undefined);
  await new Promise(resolve => setImmediate(resolve));
  release(); await finished(task);
  assert.equal(calls, 1);
  assert.match(task.result.images[0].url, /^\/api\/history\/assets\//);
  assert.equal(options.historyStore.list(100, "alice").length, 1);
  assert.equal(service.create(body(), user).id, task.id);
});

test("agent checkpoints replace one history record and stopping preserves its completed round", async t => {
  let released;
  const options = setup(t, { runAgent: async (request, context) => {
    context.onProgress({ phase: "reviewing", round: 1 });
    const round = { round: 1, image: { url: PNG }, evaluation: { score: 80, decision: "revise" }, engines: ["codexCli"] };
    const result = { bestRound: 1, bestScore: 80, rounds: [round], bestEvaluation: round.evaluation, bestImage: round.image, completedRounds: 1 };
    await context.onRound(result);
    await new Promise(resolve => { released = resolve; });
    return { ...result, stopped: context.shouldStop() };
  } });
  const service = new GenerationTasks(options);
  const task = service.create(body({ mode: "agent" }), user);
  while (!released) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(task.phase, "reviewing");
  assert.match(task.result.bestImage.url, /^\/api\/history\/assets\//);
  service.stop(task.id, "alice"); released(); await service.waitForCompletion(task.id, "alice");
  assert.equal(task.status, "cancelled");
  assert.equal(task.result.stopped, true);
  assert.equal(options.historyStore.list(100, "alice").length, 1);
});

test("provider failures hide private diagnostics, restart never silently bills a retry", async t => {
  const options = setup(t, { generate: async () => { throw new Error("secret https://private.test /app/keys token=xyz"); } });
  const service = new GenerationTasks(options);
  const task = service.create(body(), user);
  while (["queued", "running"].includes(task.status)) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(task.status, "failed");
  assert.doesNotMatch(JSON.stringify(task), /xyz|private.test|app\/keys/);
  task.status = "running"; service.persist(task);
  const recovered = new GenerationTasks(options).get(task.id, "alice");
  assert.equal(recovered.status, "failed");
  assert.match(recovered.message, /服务曾重启/);
});

test("restart preserves saved image checkpoints without rerunning the model", async t => {
  let calls=0;
  const options=setup(t,{generate:async request=>{calls++;return {request,images:[{url:PNG}]};}});
  const service=new GenerationTasks(options),task=service.create(body(),user);
  await finished(task);
  task.status="running";service.persist(task);
  const restarted=new GenerationTasks(options).get(task.id,user.id);
  assert.equal(restarted.status,"completed");
  assert.equal(restarted.result.images[0].url,task.result.images[0].url);
  assert.equal(calls,1);
  assert.equal(fs.statSync(path.join(options.rootDir,task.id+".json")).mode&0o777,0o600);
});

test("failed image persistence never advertises a saved result or exposes a filesystem path", async t => {
  const options=setup(t);
  options.historyStore.persistImage=async()=>{throw new Error('EACCES /app/private/history/image.png');};
  const service=new GenerationTasks(options),task=service.create(body(),user);
  while(["queued","running"].includes(task.status))await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(task.status,"failed");
  assert.equal(task.result,undefined);
  assert.match(task.message,/保存失败/);
  assert.doesNotMatch(task.message,/EACCES|private|app/);
  assert.deepEqual(options.historyStore.list(100,user.id),[]);
});

test("task status write failures do not strand active jobs or crash the process", async t => {
  const options=setup(t),service=new GenerationTasks(options);
  const persist=service.persist.bind(service);
  service.persist=()=>{throw new Error('ENOSPC /app/private/tasks');};
  assert.throws(()=>service.create(body(),user),error=>error.statusCode===507&&!error.message.includes('/app'));
  assert.deepEqual(service.active(user.id),[]);
  service.persist=persist;
  const task=service.create(body(),user);
  service.persist=()=>{throw new Error('ENOSPC /app/private/tasks');};
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(task.status,'failed');
  assert.match(task.message,/存储/);
  assert.doesNotMatch(task.message,/ENOSPC|private|app/);
  assert.deepEqual(service.active(user.id),[]);
});


test("queued cancellation is idempotent, never dispatches, recovers as terminal and frees the slot", async t => {
  let calls = 0;
  const options = setup(t, { generate: async request => { calls++; return { request, images: [{ url: PNG }] }; } });
  const service = new GenerationTasks(options), task = service.create(body(), user);
  assert.equal(service.stop(task.id, user.id), task);
  service.stop(task.id, user.id);
  assert.equal(task.status, "queued", "slot stays occupied until the runner acknowledges abort");
  assert.throws(() => service.create(body({ requestId: "blocked_request_123" }), user), { statusCode: 429 });
  await service.waitForCompletion(task.id, user.id);
  assert.equal(task.status, "cancelled");
  assert.equal(calls, 0);
  assert.equal(new GenerationTasks(options).get(task.id, user.id).status, "cancelled");
  const next = service.create(body({ requestId: "next_request_123456" }), user);
  await finished(next);
  assert.equal(calls, 1);
});

test("running cancellation retains the global slot until the provider actually exits", async t => {
  let entered, release;
  const started = new Promise(resolve => { entered = resolve; });
  const options = setup(t, { generate: async (request, { signal }) => {
    entered(signal);
    await new Promise(resolve => { release = resolve; });
    signal.throwIfAborted();
  } });
  const service = new GenerationTasks(options), task = service.create(body(), user);
  const signal = await started;
  service.stop(task.id, user.id); service.stop(task.id, user.id);
  assert.equal(signal.aborted, true);
  assert.equal(task.status, "running");
  assert.throws(() => service.create(body({ requestId: "another_request_123" }), { id: "bob" }), { statusCode: 429 });
  release(); await service.waitForCompletion(task.id, user.id);
  assert.equal(task.status, "cancelled");
  assert.deepEqual(service.active(user.id), []);
});

test("cancelling at save completion preserves the image; stopping completed tasks is a no-op", async t => {
  const options = setup(t), service = new GenerationTasks(options);
  const save = options.historyStore.saveGeneration.bind(options.historyStore);
  options.historyStore.saveGeneration = async (...args) => {
    const saved = await save(...args);
    service.stop(task.id, user.id);
    return saved;
  };
  const task = service.create(body(), user);
  await service.waitForCompletion(task.id, user.id);
  assert.equal(task.status, "cancelled");
  assert.equal(options.historyStore.list(10, user.id).length, 1);
  assert.match(task.result.images[0].url, /^\/api\/history\/assets\//);
  options.historyStore.saveGeneration = save;
  const next = service.create(body({ requestId: "next_completed_12345" }), user);
  await finished(next);
  const snapshot = JSON.stringify(next);
  service.stop(next.id, user.id);
  assert.equal(JSON.stringify(next), snapshot);
});

const settle = async task => { for (let i = 0; i < 100 && ["queued", "running"].includes(task.status); i++) await new Promise(resolve => setTimeout(resolve, 5)); };
const makeId = n => `quota_request_${String(n).padStart(6, "0")}`;

test("quota counts dispatched generation and review calls, not tasks", async t => {
  const service = new GenerationTasks(setup(t, {
    generate: async (request, context) => { context.onCall("generation"); return { request, images: [{ url: PNG }], engines: [request.engine] }; },
    runAgent: async (request, context) => {
      for (let round = 1; round <= 3; round++) { context.onCall("generation"); context.onCall("review"); }
      const r = { round: 1, image: { url: PNG }, evaluation: { score: 90, decision: "accept" }, engines: ["codexCli"] };
      return { bestRound: 1, bestScore: 90, rounds: [r], bestEvaluation: r.evaluation, bestImage: r.image, completedRounds: 3 };
    },
  }));
  const agent = service.create(body({ requestId: makeId(1), mode: "agent", maxRounds: 3 }), user);
  await settle(agent);
  assert.equal(agent.usage.settled, true);
  assert.deepEqual(service.quota("alice").generation.remaining, 17);
  assert.deepEqual(service.quota("alice").review.remaining, 17);
  assert.ok(service.quota("alice").generation.resetAt);
  for (let n = 2; n <= 18; n++) { const task = service.create(body({ requestId: makeId(n) }), user); await settle(task); }
  assert.equal(service.quota("alice").generation.remaining, 0);
  assert.throws(() => service.create(body({ requestId: makeId(99) }), user), error => error.statusCode === 429 && /生成次数已用完，约 \d+ 分钟后恢复/.test(error.message));
  assert.equal(service.quota("bob").generation.remaining, 20);
});

test("reservations hold while running and unused ones return when the task ends", async t => {
  let release;
  const service = new GenerationTasks(setup(t, { runAgent: (request, context) => new Promise(resolve => {
    context.onCall("generation");
    release = () => { const r = { round: 1, image: { url: PNG }, evaluation: { score: 95, decision: "accept" }, engines: ["codexCli"] }; resolve({ bestRound: 1, bestScore: 95, rounds: [r], bestEvaluation: r.evaluation, bestImage: r.image, completedRounds: 1 }); };
  }) }));
  const task = service.create(body({ requestId: makeId(1), mode: "agent", maxRounds: 3 }), user);
  for (let i = 0; i < 50 && !release; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(service.quota("alice").generation.remaining, 17);   // 3 reserved while running
  assert.equal(service.quota("alice").review.remaining, 17);
  release(); await settle(task);
  assert.equal(service.quota("alice").generation.remaining, 19);   // one used, two returned
  assert.equal(service.quota("alice").review.remaining, 20);
});

test("a cancelled task keeps the calls it already dispatched and settlement survives restart", async t => {
  const options = setup(t, { generate: (request, context) => new Promise((resolve, reject) => {
    context.onCall("generation");
    context.signal.addEventListener("abort", () => reject(context.signal.reason), { once: true });
  }) });
  const service = new GenerationTasks(options);
  const task = service.create(body({ requestId: makeId(1) }), user);
  for (let i = 0; i < 50 && !task.usage.calls.length; i++) await new Promise(resolve => setTimeout(resolve, 5));
  service.stop(task.id, "alice"); await settle(task);
  assert.equal(task.status, "cancelled");
  assert.equal(service.quota("alice").generation.remaining, 19);
  const restarted = new GenerationTasks(options);
  assert.equal(restarted.quota("alice").generation.remaining, 19);
  assert.equal(restarted.get(task.id, "alice").usage.settled, true);
});

test("task files written before the ledger migrate once with an estimate", async t => {
  const options = setup(t);
  fs.mkdirSync(options.rootDir, { recursive: true });
  const id = "11111111-2222-4333-8444-555555555555";
  fs.writeFileSync(path.join(options.rootDir, `${id}.json`), JSON.stringify({ id, requestId: makeId(1), ownerId: "alice", mode: "agent", request: { maxRounds: 2 }, status: "completed", createdAt: new Date().toISOString(), result: { rounds: [{ evaluation: { score: 80 } }, { evaluation: { score: 85 } }] } }));
  const service = new GenerationTasks(options);
  const migrated = service.get(id, "alice");
  assert.equal(migrated.usage.inferred, true);
  assert.equal(migrated.usage.settled, true);
  assert.equal(service.quota("alice").generation.remaining, 18);
  assert.equal(service.quota("alice").review.remaining, 18);
});
