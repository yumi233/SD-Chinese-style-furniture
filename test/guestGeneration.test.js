const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createApp } = require("../src/http/app");
const { HistoryStore } = require("../src/historyStore");
const { UserStore } = require("../src/userStore");

const ONE_PIXEL_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

// Offline engine double: counts calls, can fail or hold a run open.
function fakeGateway() {
  const gateway = {
    calls: 0, fail: 0, gate: null,
    listEngines: () => ({ defaultEngine: "imageModel", engines: ["imageModel"], modes: ["imageModel"], agentEngines: ["imageModel"], parentEngines: [] }),
    getConfig: () => ({}), getRuntimeConfig: () => ({}), async health() { return { ok: true }; },
    async generate(request, context) {
      gateway.calls += 1;
      context.onCall("generation");
      if (gateway.gate) await gateway.gate;
      if (gateway.fail > 0) { gateway.fail -= 1; const error = new Error("upstream 500 at http://10.0.0.1/secret"); error.statusCode = 502; throw error; }
      return { engine: "imageModel", engines: ["imageModel"], request: { ...request }, settings: {}, images: [{ engine: "imageModel", mimeType: "image/png", url: ONE_PIXEL_PNG }], metadata: {}, errors: [], promptPipeline: { finalPrompt: request.prompt } };
    },
    async runAgent() { throw new Error("agent not used"); },
  };
  return gateway;
}

async function startApp(t, guest = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "musheng-guestgen-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const gateway = fakeGateway();
  const guestHistory = new HistoryStore({ rootDir: path.join(root, "guest-history"), assetPrefix: "/api/guest/history/assets/" });
  const app = createApp({
    rootDir: root, publicDir: path.join(root, "public"), gateway,
    historyStore: new HistoryStore({ rootDir: path.join(root, "history") }),
    userStore: new UserStore({ filePath: path.join(root, "users.json") }),
    guestGeneration: guest === null ? null : { historyStore: guestHistory, perSession: 1, perDay: 10, ...guest },
  });
  const server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const call = async (method, url, { cookie, body } = {}) => {
    const response = await fetch(base + url, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const type = response.headers.get("content-type") || "";
    const setCookie = response.headers.get("set-cookie");
    return { status: response.status, body: type.includes("json") ? await response.json() : null, cookie: setCookie ? setCookie.split(";")[0] : "" };
  };
  let requests = 0;
  const generate = (cookie, extra = {}) => call("POST", "/guest/generation-tasks", { cookie, body: { prompt: "一把圈椅", requestId: `guest-request-${String(++requests).padStart(8, "0")}`, ...extra } });
  const settle = async (cookie, id) => {
    for (let i = 0; i < 200; i += 1) {
      const { body } = await call("GET", `/guest/generation-tasks/${id}`, { cookie });
      if (!["queued", "running"].includes(body.task.status)) return body.task;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error("task did not settle");
  };
  return { call, generate, settle, gateway, root, guestHistory };
}

test("a guest generates one real image into an isolated history and then sees the limit", async t => {
  const app = await startApp(t);
  const quotaBefore = await app.call("GET", "/guest/generation-tasks/quota");
  assert.deepEqual([quotaBefore.body.quota.generation.remaining, quotaBefore.body.quota.generation.message], [1, "试用可生成 1 张，登录后可继续"]);
  const first = await app.generate();
  assert.equal(first.status, 202);
  assert.match(first.cookie, /^musheng_guest=/);
  const guest = first.cookie;
  const done = await app.settle(guest, first.body.task.id);
  assert.equal(done.status, "completed");
  assert.equal(app.gateway.calls, 1);

  const { body: history } = await app.call("GET", "/guest/history", { cookie: guest });
  assert.equal(history.records.length, 1);
  const url = history.records[0].images[0].url;
  assert.match(url, /^\/api\/guest\/history\/assets\//);
  const asset = url.replace("/api", "");
  assert.equal((await app.call("GET", asset, { cookie: guest })).status, 200);
  assert.equal((await app.call("GET", asset)).status, 404, "no cookie, no image");
  assert.ok(fs.existsSync(path.join(app.root, "guest-history", "records.json")));
  assert.equal(JSON.parse(fs.readFileSync(path.join(app.root, "history", "records.json"), "utf8")).length, 0, "nothing lands in account history");

  const second = await app.generate(guest);
  assert.equal(second.status, 429);
  assert.equal(second.body.message, "试用可生成 1 张，已用完；登录后可继续");
  const quotaAfter = await app.call("GET", "/guest/generation-tasks/quota", { cookie: guest });
  assert.deepEqual([quotaAfter.body.quota.generation.remaining, quotaAfter.body.quota.generation.message], [0, "试用可生成 1 张，已用完；登录后可继续"]);
  assert.equal(app.gateway.calls, 1, "a refused request never reaches the engine");
  // The same requestId returns the original task instead of generating again.
  const again = await app.call("POST", "/guest/generation-tasks", { cookie: guest, body: { prompt: "一把圈椅", requestId: first.body.task.requestId } });
  assert.equal(again.body.task.id, first.body.task.id);
  assert.equal(app.gateway.calls, 1);
});

test("a failed guest generation keeps its reason and returns the slot", async t => {
  const app = await startApp(t);
  app.gateway.fail = 1;
  const first = await app.generate();
  const guest = first.cookie;
  const failed = await app.settle(guest, first.body.task.id);
  assert.equal(failed.status, "failed");
  assert.equal(failed.message, "生成服务不可用，请检查模型连接后重试");
  assert.ok(!JSON.stringify(failed).includes("10.0.0.1"));
  assert.equal((await app.call("GET", "/guest/generation-tasks/quota", { cookie: guest })).body.quota.generation.remaining, 1);
  const retry = await app.generate(guest);
  assert.equal(retry.status, 202);
  assert.equal((await app.settle(guest, retry.body.task.id)).status, "completed");
  assert.equal(app.gateway.calls, 2);
});

test("the daily guest cap is shared, and a running guest holds the engine slot", async t => {
  const app = await startApp(t, { perDay: 2 });
  for (let i = 0; i < 2; i += 1) {
    const response = await app.generate();
    assert.equal(response.status, 202);
    await app.settle(response.cookie, response.body.task.id);
  }
  const third = await app.generate();
  assert.equal(third.status, 429);
  assert.equal(third.body.message, "今日试用额度已用完");
  assert.equal((await app.call("GET", "/guest/generation-tasks/quota")).body.quota.generation.message, "今日试用额度已用完");
  assert.equal(app.gateway.calls, 2);

  const busy = await startApp(t);
  let release;
  busy.gateway.gate = new Promise(resolve => { release = resolve; });
  const running = await busy.generate();
  const other = await busy.generate();
  assert.equal(other.status, 429);
  assert.equal(other.body.message, "已有生成任务正在执行，请查看当前任务");
  // A running task already holds this guest's only slot.
  assert.equal((await busy.call("GET", "/guest/generation-tasks/quota", { cookie: running.cookie })).body.quota.generation.remaining, 0);
  release();
  await busy.settle(running.cookie, running.body.task.id);
});

test("guests stay outside the account system and other guests' work", async t => {
  const app = await startApp(t);
  const first = await app.generate();
  const guest = first.cookie;
  await app.settle(guest, first.body.task.id);
  const other = (await app.generate()).cookie;
  const id = first.body.task.id;
  const recordId = (await app.call("GET", "/guest/history", { cookie: guest })).body.records[0].id;
  for (const [method, url] of [["GET", `/guest/generation-tasks/${id}`], ["POST", `/guest/generation-tasks/${id}/stop`], ["GET", `/guest/history/${recordId}`], ["PATCH", `/guest/history/${recordId}`], ["DELETE", `/guest/history/${recordId}`]]) {
    assert.equal((await app.call(method, url, { cookie: other, body: method === "PATCH" ? { title: "x" } : undefined })).status, 404, `${method} ${url}`);
  }
  assert.ok(!(await app.call("GET", "/guest/history", { cookie: other })).body.records.some(record => record.id === recordId));
  assert.deepEqual((await app.call("GET", "/guest/history")).body.records, []);
  for (const [method, url] of [["GET", "/history"], ["GET", `/history/${recordId}`], ["GET", "/generation-tasks"], ["POST", "/generation-tasks"], ["GET", "/config"], ["PATCH", "/auth/profile"]]) {
    assert.equal((await app.call(method, url, { cookie: guest, body: method !== "GET" ? {} : undefined })).status, 401, `${method} ${url}`);
  }
  const agent = await app.generate(other, { mode: "agent" });
  assert.equal(agent.status, 400);
  assert.equal(agent.body.message, "试用仅支持单次生成");
});

test("guest history and tasks expire, and generation can be switched off", async t => {
  const app = await startApp(t);
  const first = await app.generate();
  await app.settle(first.cookie, first.body.task.id);
  assert.equal(app.guestHistory.sweep(3_600_000, Date.now() + 3_600_001), 1);
  assert.deepEqual((await app.call("GET", "/guest/history", { cookie: first.cookie })).body.records, []);
  assert.deepEqual(fs.readdirSync(path.join(app.root, "guest-history", "images")), []);

  const off = await startApp(t, null);
  const refused = await off.generate();
  assert.equal(refused.status, 404);
  assert.equal(refused.body.message, "试用生成未开启");
  assert.equal(off.gateway.calls, 0);
});
