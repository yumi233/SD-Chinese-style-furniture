const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const { createApp } = require("../src/http/app");
const { HistoryStore } = require("../src/historyStore");
const { UserStore } = require("../src/userStore");
const { DesignChat } = require("../src/designChat");
const { createPiAdapter, resolveKey } = require("../src/agent/piAdapter");
const { AgentRuntimeError, extractPartialReply, parseDesignResult } = require("../src/agent/runtime");

const ASKING = JSON.stringify({ reply: "放在哪个房间？", ready: false, brief: null });
const BRIEF = { prompt: "一把黑胡桃木明式圈椅，座宽 58 厘米，外露榫卯", use: "书房单人座", size: "宽 58 深 52 高 98 厘米", wood: "黑胡桃木", structure: "外露榫卯", style: "ming", constraints: ["扶手轻薄", "靠背弧线"] };
const READY = JSON.stringify({ reply: "整理好了。", ready: true, brief: BRIEF });

function tempDir(t, prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("design results are parsed strictly and never guessed", () => {
  assert.deepEqual(parseDesignResult(ASKING), { reply: "放在哪个房间？", ready: false, brief: null });
  assert.deepEqual(parseDesignResult(READY).brief, BRIEF);
  assert.equal(parseDesignResult("```json\n" + READY + "\n```").ready, true);
  for (const bad of [
    `好的：${ASKING}`,
    ASKING.slice(0, -1),
    JSON.stringify({ reply: "x", ready: false, brief: null, extra: 1 }),
    JSON.stringify({ reply: "x", ready: "false", brief: null }),
    JSON.stringify({ reply: "x", ready: false, brief: BRIEF }),
    JSON.stringify({ reply: "x", ready: true, brief: { ...BRIEF, style: "baroque" } }),
    JSON.stringify({ reply: "x", ready: true, brief: { ...BRIEF, color: "red" } }),
    JSON.stringify({ reply: "", ready: false, brief: null }),
  ]) {
    assert.throws(() => parseDesignResult(bad), error => error instanceof AgentRuntimeError && error.code === "invalid_result", bad);
  }
});

test("Pi keys resolve from the environment and shell commands are refused", () => {
  assert.equal(resolveKey("literal", {}), "literal");
  assert.equal(resolveKey("$KEY", { KEY: "abc" }), "abc");
  assert.equal(resolveKey("${KEY}-x", { KEY: "abc" }), "abc-x");
  assert.equal(resolveKey("$MISSING", {}), "");
  assert.equal(resolveKey("!cat secret", {}), "");
});

// A fake child process that replays JSONL records, so no model is called.
function fakePi(t, script) {
  const root = tempDir(t, "musheng-pi-");
  const command = path.join(root, "pi");
  fs.writeFileSync(command, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const modelsFile = path.join(root, "models.json");
  fs.writeFileSync(modelsFile, JSON.stringify({ providers: { magpie: { api: "openai-completions", apiKey: "sk-private-key", baseUrl: "http://127.0.0.1:9/v1", headers: { Authorization: "secret" }, models: [{ id: "chat-model" }, { id: "other-model" }] } } }));
  const calls = [];
  const spawnImpl = (file, args, options) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.killed = [];
    child.kill = signal => { child.killed.push(signal); setImmediate(() => child.emit("close", null, signal)); return true; };
    calls.push({ file, args, options, child });
    setImmediate(() => script(child, args));
    return child;
  };
  const dataDir = path.join(root, "data");
  const adapter = (options = {}) => createPiAdapter({ command, model: "chat-model", modelsFile, dataDir, spawnImpl, probeGateway: async () => true, baseEnv: { PATH: "/usr/bin", HOME: "/Users/someone", SECRET_TOKEN: "leak" }, ...options });
  return { adapter, calls, dataDir, command };
}

function reply(child, args, text, extra = {}) {
  const ref = args[args.indexOf("--session-id") + 1];
  const records = [
    { type: "session", version: 3, id: ref },
    { type: "agent_start" },
    { type: "message_end", message: { role: "assistant", content: [{ type: "text", text }], stopReason: "stop", ...extra } },
    { type: "agent_settled", aborted: false },
  ];
  child.stdout.end(records.map(record => JSON.stringify(record)).join("\n") + "\n");
  child.emit("close", 0, null);
}

test("Pi adapter runs isolated with tools, extensions and retries off", async t => {
  const pi = fakePi(t, (child, args) => reply(child, args, ASKING));
  const adapter = pi.adapter();
  assert.deepEqual(await adapter.status(), { available: true, reason: null });
  const { runtimeSessionRef } = await adapter.startSession();
  const result = await adapter.sendMessage({ runtimeSessionRef, text: "@/etc/passwd 一把椅子" });
  assert.deepEqual(adapter.readResult(result.text).reply, "放在哪个房间？");

  const [{ file, args, options }] = pi.calls;
  assert.equal(file, pi.command);
  for (const flag of ["-p", "--no-tools", "--no-extensions", "--no-mcp", "--no-skills", "--no-prompt-templates", "--no-context-files", "--no-approve", "--offline"]) assert.ok(args.includes(flag), flag);
  assert.deepEqual(args.slice(0, 3), ["-p", "--mode", "json"]);
  assert.equal(args[args.indexOf("--model") + 1], "chat-model");
  assert.equal(args[args.indexOf("--provider") + 1], "magpie");
  assert.equal(args[args.indexOf("--session-id") + 1], runtimeSessionRef);
  // The message comes after `--` and can never be read as an @file attachment.
  assert.equal(args.at(-2), "--");
  assert.ok(!args.at(-1).startsWith("@"));
  assert.ok(!args.join(" ").includes("sk-private-key"));

  assert.deepEqual(Object.keys(options.env).sort(), ["HOME", "LANG", "MUSHENG_PI_API_KEY", "NO_COLOR", "PATH", "PI_CODING_AGENT_DIR", "PI_OFFLINE", "PI_TELEMETRY", "TMPDIR"]);
  assert.equal(options.env.PATH.split(path.delimiter)[0], path.dirname(pi.command));
  assert.equal(options.env.MUSHENG_PI_API_KEY, "sk-private-key");
  assert.ok(options.env.HOME.startsWith(pi.dataDir) && options.env.TMPDIR.startsWith(pi.dataDir) && options.cwd.startsWith(pi.dataDir));

  const models = fs.readFileSync(path.join(pi.dataDir, "agent", "models.json"), "utf8");
  assert.ok(!models.includes("sk-private-key") && !models.includes("secret") && !models.includes("other-model"));
  assert.match(models, /"\$MUSHENG_PI_API_KEY"/);
  const settings = JSON.parse(fs.readFileSync(path.join(pi.dataDir, "agent", "settings.json"), "utf8"));
  assert.equal(settings.retry.enabled, false);
  assert.deepEqual(settings.extensions, []);
});

test("Pi adapter turns a hung run into a timeout and kills the child", async t => {
  const pi = fakePi(t, () => {});
  const adapter = pi.adapter({ timeoutMs: 30 });
  const { runtimeSessionRef } = await adapter.startSession();
  await assert.rejects(adapter.sendMessage({ runtimeSessionRef, text: "hi" }), error => error.code === "timeout" && error.statusCode === 504);
  assert.deepEqual(pi.calls[0].child.killed, ["SIGTERM"]);
});

test("Pi adapter stops oversized output, tool calls and leaks no stderr", async t => {
  const big = fakePi(t, child => child.stdout.write(Buffer.alloc(4096, 0x61)));
  const { runtimeSessionRef } = await big.adapter().startSession();
  await assert.rejects(big.adapter({ maxOutputBytes: 1024 }).sendMessage({ runtimeSessionRef, text: "hi" }), error => error.code === "too_large");

  const tool = fakePi(t, child => child.stdout.write(JSON.stringify({ type: "tool_execution_start", toolName: "bash" }) + "\n"));
  await assert.rejects(tool.adapter().sendMessage({ runtimeSessionRef, text: "hi" }), error => error.code === "failed");
  assert.deepEqual(tool.calls[0].child.killed, ["SIGTERM"]);

  const denied = fakePi(t, child => { child.stderr.end("Error: 401 Unauthorized at /Users/someone/.pi/agent key=sk-private-key\n"); child.stdout.end(); child.emit("close", 1, null); });
  await assert.rejects(denied.adapter().sendMessage({ runtimeSessionRef, text: "hi" }), error => {
    assert.equal(error.code, "auth");
    assert.ok(!/Users|sk-private|401/.test(error.message));
    return true;
  });

  const offline = fakePi(t, (child, args) => reply(child, args, "", { stopReason: "error", errorMessage: "connect ECONNREFUSED 127.0.0.1:3425" }));
  await assert.rejects(offline.adapter().sendMessage({ runtimeSessionRef, text: "hi" }), error => error.code === "gateway" && !error.message.includes("127.0.0.1"));
});

test("Pi adapter reports a missing program, missing model and cancels a reply", async t => {
  const pi = fakePi(t, () => {});
  assert.deepEqual(await pi.adapter({ command: path.join(pi.dataDir, "nope") }).status(), { available: false, reason: "missing" });
  assert.deepEqual(await pi.adapter({ model: "unknown" }).status(), { available: false, reason: "unconfigured" });
  assert.deepEqual(await pi.adapter({ probeGateway: async () => false }).status(), { available: false, reason: "gateway" });
  const adapter = pi.adapter();
  const { runtimeSessionRef } = await adapter.startSession();
  const running = adapter.sendMessage({ runtimeSessionRef, text: "hi" });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(adapter.cancel(runtimeSessionRef), true);
  await assert.rejects(running, error => error.code === "cancelled");
  assert.equal(adapter.cancel(runtimeSessionRef), false);
});

// HTTP behaviour with an offline runtime double.
function fakeRuntime() {
  const runtime = {
    available: true, reason: null, replies: [], sent: [], gate: null, cancelled: [],
    async status() { return { available: this.available, reason: this.reason }; },
    async startSession() { return { runtimeSessionRef: `ms-${String(this.sent.length).padStart(36, "0")}` }; },
    async sendMessage(input) {
      this.sent.push(input);
      if (this.gate) await this.gate;
      const next = this.replies.shift();
      if (next instanceof Error) throw next;
      return { text: next ?? ASKING };
    },
    readResult: parseDesignResult,
    cancel(ref) { this.cancelled.push(ref); return true; },
  };
  return runtime;
}

async function startApp(t, { runtime = fakeRuntime(), chat = {}, designChat, guest } = {}) {
  const root = tempDir(t, "musheng-chat-");
  const generations = [];
  const gateway = {
    getConfig: () => ({}), getRuntimeConfig: () => ({}), listEngines: () => ({ engines: [], modes: [] }), async health() { return { ok: true }; },
    async generate() { generations.push(1); throw new Error("no generation in chat"); },
    async runAgent() { generations.push(1); throw new Error("no generation in chat"); },
  };
  const chatRoot = path.join(root, "design-chat");
  const service = designChat === undefined ? new DesignChat({ runtime, rootDir: chatRoot, ...chat }) : designChat;
  const guestRoot = path.join(root, "guest-chat");
  const guestChat = guest ? new DesignChat({ runtime: guest.runtime || runtime, rootDir: guestRoot, singleConversation: true, perMinute: 2, maxMessages: 6, fullMessage: "试用对话已到上限，登录后可继续", ...guest.options }) : null;
  const historyStore = new HistoryStore({ rootDir: path.join(root, "history") });
  const app = createApp({ rootDir: root, publicDir: path.join(root, "public"), historyStore, userStore: new UserStore({ filePath: path.join(root, "users.json") }), gateway, designChat: service, guestChat });
  const server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const call = async (method, url, { cookie, body } = {}) => {
    const response = await fetch(base + url, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const setCookie = response.headers.get("set-cookie");
    return { status: response.status, headers: response.headers, body: await response.json(), cookie: setCookie ? setCookie.split(";")[0] : "" };
  };
  const register = async name => {
    const response = await fetch(base + "/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: name, email: `${name}@example.com`, password: "safe-pass-8" }) });
    assert.equal(response.status, 201);
    return response.headers.get("set-cookie").split(";")[0];
  };
  return { call, register, runtime, generations, chatRoot, guestRoot, service, guestChat, historyStore, base };
}

test("design chat requires login, isolates accounts and persists the conversation", async t => {
  const app = await startApp(t);
  for (const [method, url] of [["GET", "/design-chat"], ["POST", "/design-chat/messages"], ["GET", "/design-chat/00000000-0000-4000-8000-000000000000"]]) {
    assert.equal((await app.call(method, url, { body: method === "POST" ? { text: "hi" } : undefined })).status, 401, url);
  }
  const alice = await app.register("alice"), bob = await app.register("bob");
  app.runtime.replies.push(ASKING, READY);
  const first = await app.call("POST", "/design-chat/messages", { cookie: alice, body: { text: "想要一把圈椅" } });
  assert.equal(first.status, 200);
  const id = first.body.session.id;
  assert.equal(first.body.session.brief, null);
  const second = await app.call("POST", "/design-chat/messages", { cookie: alice, body: { sessionId: id, text: "书房用，黑胡桃" } });
  assert.deepEqual(second.body.session.brief, BRIEF);
  assert.deepEqual(second.body.session.messages.map(message => message.role), ["user", "assistant", "user", "assistant"]);
  // One Pi session carries the whole conversation.
  assert.equal(new Set(app.runtime.sent.map(input => input.runtimeSessionRef)).size, 1);

  for (const [method, url, body] of [["GET", `/design-chat/${id}`], ["POST", "/design-chat/messages", { sessionId: id, text: "偷看" }], ["POST", `/design-chat/${id}/cancel`, {}]]) {
    const response = await app.call(method, url, { cookie: bob, body });
    assert.equal(response.status, 404, `${method} ${url}`);
    assert.ok(!JSON.stringify(response.body).includes("圈椅"));
  }
  assert.equal((await app.call("GET", "/design-chat", { cookie: bob })).body.session, null);
  assert.equal((await app.call("GET", "/design-chat/../../users", { cookie: alice })).status, 404);

  // A fresh service over the same files restores the latest conversation.
  const restored = new DesignChat({ runtime: fakeRuntime(), rootDir: app.chatRoot });
  const user = { id: JSON.parse(fs.readFileSync(path.join(app.chatRoot, "conversations", `${id}.json`), "utf8")).ownerId };
  assert.equal(restored.latest(user.id).id, id);
  assert.deepEqual(restored.latest(user.id).brief, BRIEF);
  assert.equal(app.generations.length, 0);
});

test("design chat allows one reply at a time per account and limits rate and length", async t => {
  const app = await startApp(t, { chat: { perMinute: 3, maxMessages: 2 } });
  const alice = await app.register("alice");
  let release;
  app.runtime.gate = new Promise(resolve => { release = resolve; });
  const slow = app.call("POST", "/design-chat/messages", { cookie: alice, body: { text: "第一句" } });
  while (!app.runtime.sent.length) await new Promise(resolve => setTimeout(resolve, 5));
  const busy = await app.call("POST", "/design-chat/messages", { cookie: alice, body: { text: "第二句" } });
  assert.equal(busy.status, 429);
  const latest = await app.call("GET", "/design-chat", { cookie: alice });
  assert.equal(latest.body.session.pending, true);
  release(); app.runtime.gate = null;
  const id = (await slow).body.session.id;
  assert.equal(app.runtime.sent.length, 1, "a rejected request never reaches the model");

  assert.equal((await app.call("POST", "/design-chat/messages", { cookie: alice, body: { sessionId: id, text: "第二句" } })).status, 200);
  const full = await app.call("POST", "/design-chat/messages", { cookie: alice, body: { sessionId: id, text: "第三句" } });
  assert.equal(full.status, 409);
  assert.equal((await app.call("POST", "/design-chat/messages", { cookie: alice, body: { text: "x".repeat(1001) } })).status, 400);
  assert.equal((await app.call("POST", "/design-chat/messages", { cookie: alice, body: { text: "新的一段" } })).status, 200);
  const limited = await app.call("POST", "/design-chat/messages", { cookie: alice, body: { text: "再来" } });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
  assert.equal(app.runtime.sent.length, 3);
});

test("design chat records model failures without retrying and explains an unavailable Pi", async t => {
  const app = await startApp(t);
  const alice = await app.register("alice");
  app.runtime.replies.push("这不是 JSON");
  const invalid = await app.call("POST", "/design-chat/messages", { cookie: alice, body: { text: "一张茶桌" } });
  assert.equal(invalid.status, 502);
  assert.equal(invalid.body.reason, "invalid_result");
  assert.equal(invalid.body.session.messages[0].status, "failed");
  assert.equal(invalid.body.session.messages[0].error, "对话模型回复格式无效，请重新发送");
  assert.equal(app.runtime.sent.length, 1);

  app.runtime.replies.push(new AgentRuntimeError("timeout"));
  const timeout = await app.call("POST", "/design-chat/messages", { cookie: alice, body: { sessionId: invalid.body.session.id, text: "再说一次" } });
  assert.equal(timeout.status, 504);
  assert.equal(timeout.body.reason, "timeout");
  assert.equal(app.runtime.sent.length, 2);

  app.runtime.available = false; app.runtime.reason = "missing";
  const status = await app.call("GET", "/design-chat", { cookie: alice });
  assert.deepEqual([status.body.enabled, status.body.available, status.body.reason], [true, false, "missing"]);
  assert.match(status.body.message, /Pi/);
  const refused = await app.call("POST", "/design-chat/messages", { cookie: alice, body: { text: "还在吗" } });
  assert.equal(refused.status, 503);
  assert.equal(refused.body.reason, "missing");
  assert.equal(app.runtime.sent.length, 2);
  assert.equal(app.generations.length, 0);
});

test("an interrupted reply reads as failed after a restart and cancel reaches the runtime", async t => {
  const app = await startApp(t);
  const alice = await app.register("alice");
  let release;
  app.runtime.gate = new Promise(resolve => { release = resolve; });
  const slow = app.call("POST", "/design-chat/messages", { cookie: alice, body: { text: "第一句" } });
  while (!app.runtime.sent.length) await new Promise(resolve => setTimeout(resolve, 5));
  const { session } = (await app.call("GET", "/design-chat", { cookie: alice })).body;
  const restarted = new DesignChat({ runtime: fakeRuntime(), rootDir: app.chatRoot });
  const ownerId = JSON.parse(fs.readFileSync(path.join(app.chatRoot, "conversations", `${session.id}.json`), "utf8")).ownerId;
  assert.equal(restarted.get(session.id, ownerId).messages[0].error, "回复中断，请重新发送");
  assert.equal((await app.call("POST", `/design-chat/${session.id}/cancel`, { cookie: alice, body: {} })).body.cancelled, true);
  assert.equal(app.runtime.cancelled.length, 1);
  release();
  await slow;
});

test("design chat stays off without configuration", async t => {
  const app = await startApp(t, { designChat: null });
  const alice = await app.register("alice");
  const status = await app.call("GET", "/design-chat", { cookie: alice });
  assert.deepEqual([status.body.enabled, status.body.available], [false, false]);
  assert.equal((await app.call("POST", "/design-chat/messages", { cookie: alice, body: { text: "hi" } })).status, 503);
  assert.equal((await app.call("GET", "/design-chat/00000000-0000-4000-8000-000000000000", { cookie: alice })).status, 404);
});

test("guests chat without an account, isolated per browser session and never generating", async t => {
  const app = await startApp(t, { guest: {} });
  app.runtime.replies.push(ASKING, READY);
  const first = await app.call("POST", "/guest/design-chat/messages", { body: { text: "想要一把圈椅" } });
  assert.equal(first.status, 200);
  assert.match(first.cookie, /^musheng_guest=[A-Za-z0-9_-]{43}$/);
  assert.match(first.headers.get("set-cookie"), /HttpOnly; SameSite=Lax/);
  assert.doesNotMatch(first.headers.get("set-cookie"), /Max-Age|Expires/, "the cookie ends with the browser session");
  const guestA = first.cookie, id = first.body.session.id;
  // Without a sessionId a guest continues its one conversation.
  const second = await app.call("POST", "/guest/design-chat/messages", { cookie: guestA, body: { text: "书房，黑胡桃" } });
  assert.equal(second.body.session.id, id);
  assert.deepEqual(second.body.session.brief, BRIEF);
  assert.equal(second.cookie, "", "an existing guest keeps its cookie");
  assert.equal((await app.call("GET", "/guest/design-chat", { cookie: guestA })).body.session.id, id);
  assert.equal((await app.call("GET", `/guest/design-chat/${id}`, { cookie: guestA })).status, 200);

  // Another browser session, no cookie, or an account route sees nothing.
  const guestB = (await app.call("POST", "/guest/design-chat/messages", { body: { text: "茶桌" } })).cookie;
  assert.notEqual(guestB, guestA);
  assert.equal((await app.call("GET", `/guest/design-chat/${id}`, { cookie: guestB })).status, 404);
  assert.equal((await app.call("POST", "/guest/design-chat/messages", { cookie: guestB, body: { sessionId: id, text: "偷看" } })).status, 404);
  assert.equal((await app.call("POST", `/guest/design-chat/${id}/cancel`, { cookie: guestB, body: {} })).status, 404);
  assert.equal((await app.call("GET", `/guest/design-chat/${id}`)).status, 404);
  assert.equal((await app.call("GET", "/guest/design-chat")).body.session, null);
  for (const [method, url, body] of [["GET", `/design-chat/${id}`], ["GET", "/design-chat"], ["POST", "/generation-tasks", { prompt: "chair" }], ["POST", "/generate", { prompt: "chair" }], ["GET", "/history"]]) {
    assert.equal((await app.call(method, url, { cookie: guestA, body })).status, 401, `${method} ${url}`);
  }
  // An account's conversation is not reachable through the guest routes.
  const alice = await app.register("alice");
  const own = await app.call("POST", "/design-chat/messages", { cookie: alice, body: { text: "账号对话" } });
  assert.equal((await app.call("GET", `/guest/design-chat/${own.body.session.id}`, { cookie: guestA })).status, 404);
  assert.ok(fs.existsSync(path.join(app.guestRoot, "conversations", `${id}.json`)));
  assert.ok(!fs.existsSync(path.join(app.chatRoot, "conversations", `${id}.json`)));
  assert.equal(app.generations.length, 0);
});

test("guest limits: two messages a minute, six in all, and a cap shared by every guest", async t => {
  const app = await startApp(t, { guest: {} });
  const guest = (await app.call("POST", "/guest/design-chat/messages", { body: { text: "一" } })).cookie;
  assert.equal((await app.call("POST", "/guest/design-chat/messages", { cookie: guest, body: { text: "二" } })).status, 200);
  const limited = await app.call("POST", "/guest/design-chat/messages", { cookie: guest, body: { text: "三" } });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) > 0);

  let clock = Date.now();
  const full = await startApp(t, { guest: { options: { now: () => clock } } });
  let cookie = "";
  for (let turn = 0; turn < 6; turn += 1) {
    clock += 31_000;
    const response = await full.call("POST", "/guest/design-chat/messages", { cookie, body: { text: `第${turn}轮` } });
    assert.equal(response.status, 200);
    cookie ||= response.cookie;
  }
  clock += 31_000;
  const over = await full.call("POST", "/guest/design-chat/messages", { cookie, body: { text: "第七轮" } });
  assert.equal(over.status, 409);
  assert.equal(over.body.message, "试用对话已到上限，登录后可继续");

  const shared = await startApp(t, { guest: { options: { globalPerMinute: 2 } } });
  for (let index = 0; index < 2; index += 1) assert.equal((await shared.call("POST", "/guest/design-chat/messages", { body: { text: "hi" } })).status, 200);
  assert.equal((await shared.call("POST", "/guest/design-chat/messages", { body: { text: "hi" } })).status, 429, "a fresh cookie does not reset the shared cap");
});

test("expired guest conversations disappear and are swept with their Pi sessions", async t => {
  const root = tempDir(t, "musheng-guest-");
  let clock = Date.now();
  const pruned = [];
  const runtime = { ...fakeRuntime(), prune(maxAge) { pruned.push(maxAge); return 0; } };
  const chat = new DesignChat({ runtime, rootDir: root, ttlMs: 3_600_000, singleConversation: true, now: () => clock });
  const view = await chat.send({ id: "guest-a" }, { text: "椅子" });
  assert.equal(chat.get(view.id, "guest-a").id, view.id);
  clock += 3_600_001;
  assert.equal(chat.get(view.id, "guest-a"), null);
  assert.equal(chat.latest("guest-a"), null);
  assert.equal(chat.sweep(), 1);
  assert.deepEqual(fs.readdirSync(path.join(root, "conversations")), []);
  assert.deepEqual(pruned, [3_600_000]);

  const pi = fakePi(t, () => {});
  const adapter = pi.adapter();
  await adapter.status();
  const stale = path.join(pi.dataDir, "sessions", "old.jsonl"), fresh = path.join(pi.dataDir, "sessions", "new.jsonl");
  fs.writeFileSync(stale, "{}"); fs.writeFileSync(fresh, "{}");
  const old = new Date(Date.now() - 7_200_000); fs.utimesSync(stale, old, old);
  assert.equal(adapter.prune(3_600_000), 1);
  assert.deepEqual(fs.readdirSync(path.join(pi.dataDir, "sessions")), ["new.jsonl"]);
});

test("in-place brief editing preserves messages, enforces ownership and wins over re-organization", async t => {
  const app = await startApp(t);
  const alice = await app.register("alice"), bob = await app.register("bob");
  app.runtime.replies.push(READY, JSON.stringify({
    reply: "重新整理好了。", ready: true,
    brief: { ...BRIEF, wood: "橡木", style: "zen" },
  }));
  const first = await app.call("POST", "/design-chat/messages", { cookie: alice, body: { text: "想要一把圈椅" } });
  const id = first.body.session.id;
  const edited = await app.call("PATCH", `/design-chat/${id}/brief`, {
    cookie: alice,
    body: { use: "茶室主座", size: "宽 62 厘米", wood: "白蜡木", structure: "贯通榫", style: "song" },
  });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.session.brief.wood, "白蜡木");
  assert.equal(edited.body.session.brief.style, "song");
  assert.equal(edited.body.session.brief.use, "茶室主座");
  assert.equal(edited.body.session.messages.length, 2, "original messages stay intact");
  assert.equal((await app.call("PATCH", `/design-chat/${id}/brief`, { cookie: bob, body: { wood: "松木" } })).status, 404);
  const reorg = await app.call("POST", "/design-chat/messages", { cookie: alice, body: { sessionId: id, text: "帮我再整理一次" } });
  assert.equal(reorg.status, 200);
  assert.equal(reorg.body.session.brief.wood, "白蜡木");
  assert.equal(reorg.body.session.brief.style, "song");
  assert.equal(reorg.body.session.messages.length, 4);
  assert.match(app.runtime.sent[1].text, /白蜡木/);
});

test("selected version context carries owner parent image and rejects another account's version", async t => {
  const app = await startApp(t);
  const alice = await app.register("alice"), bob = await app.register("bob");
  const aliceUser = JSON.parse(fs.readFileSync(path.join(path.dirname(app.chatRoot), "users.json"), "utf8")).users.find(u => u.displayName === "alice");
  const png = fs.readFileSync(path.join(__dirname, "../public/assets/brand/musheng-icon-64.png"));
  const saved = await app.historyStore.saveGeneration(
    { prompt: "黑胡桃木圈椅", style: "ming" },
    { images: [{ url: `data:image/png;base64,${png.toString("base64")}`, engine: "imageModel" }] },
    { ownerId: aliceUser.id },
  );
  app.runtime.replies.push(ASKING, ASKING);
  const plain = await app.call("POST", "/design-chat/messages", { cookie: alice, body: { text: "想做一把新椅子" } });
  assert.equal(plain.body.session.parentContext, null);
  assert.equal(app.runtime.sent[0].attachments, undefined);
  const withParent = await app.call("POST", "/design-chat/messages", {
    cookie: alice,
    body: { text: "基于 v2 把扶手做细", parentId: saved.record.id, parentImageIndex: 0, parentVersion: 2 },
  });
  assert.equal(withParent.status, 200);
  assert.equal(withParent.body.session.parentContext.parentId, saved.record.id);
  assert.equal(withParent.body.session.parentContext.version, 2);
  assert.equal(app.runtime.sent[1].attachments?.[0]?.role, "parent");
  assert.match(app.runtime.sent[1].text, /v2/);
  const cross = await app.call("POST", "/design-chat/messages", {
    cookie: bob,
    body: { text: "偷用版本", parentId: saved.record.id, parentImageIndex: 0, parentVersion: 2 },
  });
  assert.equal(cross.status, 404);
});

test("chat reference images validate format, stay private per account and reuse without re-upload", async t => {
  const app = await startApp(t);
  const alice = await app.register("alice"), bob = await app.register("bob");
  const png = fs.readFileSync(path.join(__dirname, "../public/assets/brand/musheng-icon-64.png"));
  const dataUrl = `data:image/png;base64,${png.toString("base64")}`;
  const bad = await app.call("POST", "/design-chat/messages", { cookie: alice, body: { text: "看这张图", referenceDataUrl: "data:text/plain;base64,aGk=" } });
  assert.equal(bad.status, 400);
  app.runtime.replies.push(ASKING, ASKING);
  const first = await app.call("POST", "/design-chat/messages", {
    cookie: alice,
    body: { text: "看这张图", referenceDataUrl: dataUrl, referenceName: "chair-ref.png" },
  });
  assert.equal(first.status, 200);
  const id = first.body.session.id;
  assert.equal(first.body.session.reference.name, "chair-ref.png");
  assert.equal(app.runtime.sent[0].attachments?.[0]?.role, "reference");
  const ownRef = await fetch(`${app.base}/design-chat/${id}/reference`, { headers: { Cookie: alice } });
  assert.equal(ownRef.status, 200);
  assert.equal(ownRef.headers.get("x-content-type-options"), "nosniff");
  const otherRef = await fetch(`${app.base}/design-chat/${id}/reference`, { headers: { Cookie: bob } });
  assert.equal(otherRef.status, 404);
  const second = await app.call("POST", "/design-chat/messages", { cookie: alice, body: { sessionId: id, text: "腿再细一点" } });
  assert.equal(second.status, 200);
  assert.equal(app.runtime.sent[1].attachments?.[0]?.role, "reference");
  const cleared = await app.call("DELETE", `/design-chat/${id}/reference`, { cookie: alice });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.session.reference, null);
});

test("SSE streaming emits progressive deltas, deduplicates requestId and preserves partial text on cancel/timeout", async t => {
  assert.equal(extractPartialReply('{"reply":"先看结构，\\n再定尺寸'), "先看结构，\n再定尺寸");
  const pi = fakePi(t, (child, args) => {
    const ref = args[args.indexOf("--session-id") + 1];
    child.stdout.write(JSON.stringify({ type: "session", version: 3, id: ref }) + "\n");
    child.stdout.write(JSON.stringify({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: '{"reply":"已收到首段内容' } }) + "\n");
  });
  const adapter = pi.adapter();
  const { runtimeSessionRef } = await adapter.startSession();
  const deltas = [];
  const running = adapter.sendMessage({ runtimeSessionRef, text: "hi", onDelta: text => deltas.push(text) });
  while (!deltas.length) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(deltas.at(-1), "已收到首段内容");
  adapter.cancel(runtimeSessionRef);
  await assert.rejects(running, error => error.code === "cancelled" && error.partialText === "已收到首段内容");

  const app = await startApp(t, { guest: {} });
  const alice = await app.register("alice");
  const origSend = app.runtime.sendMessage.bind(app.runtime);
  app.runtime.sendMessage = async input => {
    if (input.text.includes("超时测试")) {
      input.onDelta?.("已输出一半");
      const err = new AgentRuntimeError("timeout");
      err.partialText = "已输出一半";
      throw err;
    }
    if (input.onDelta) {
      input.onDelta("先看用途，");
      input.onDelta("先看用途，再定尺寸。");
    }
    return origSend(input);
  };
  app.runtime.replies.push(JSON.stringify({ reply: "先看用途，再定尺寸。", ready: false, brief: null }));
  const streamRes = await fetch(`${app.base}/guest/design-chat/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ text: "流式访客测试", requestId: "req-stream-guest-001" }),
  });
  assert.equal(streamRes.status, 200);
  const sseBody = await streamRes.text();
  assert.match(sseBody, /event: session/);
  assert.match(sseBody, /event: delta[\s\S]*先看用途，/);
  assert.match(sseBody, /event: done/);
  const countBefore = app.runtime.sent.length;
  const dup = await app.call("POST", "/design-chat/messages", { cookie: alice, body: { text: "去重测试", requestId: "req-dedup-000001" } });
  const dup2 = await app.call("POST", "/design-chat/messages", { cookie: alice, body: { text: "去重测试", requestId: "req-dedup-000001" } });
  assert.equal(dup.body.session.id, dup2.body.session.id);
  assert.equal(app.runtime.sent.length, countBefore + 1);
  const partialRes = await fetch(`${app.base}/design-chat/messages`, {
    method: "POST",
    headers: { Cookie: alice, "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ sessionId: dup.body.session.id, text: "超时测试" }),
  });
  const partialText = await partialRes.text();
  assert.match(partialText, /event: error/);
  assert.match(partialText, /已输出一半/);
  const loaded = await app.call("GET", `/design-chat/${dup.body.session.id}`, { cookie: alice });
  const lastMsg = loaded.body.session.messages.at(-1);
  assert.equal(lastMsg.role, "assistant");
  assert.equal(lastMsg.text, "已输出一半");
  assert.equal(lastMsg.status, "incomplete");
});

test("conversation history lists auto-titled chats, switches and deletes without touching generation history", async t => {
  const app = await startApp(t);
  const alice = await app.register("alice"), bob = await app.register("bob");
  const aliceUser = JSON.parse(fs.readFileSync(path.join(path.dirname(app.chatRoot), "users.json"), "utf8")).users.find(u => u.displayName === "alice");
  const png = fs.readFileSync(path.join(__dirname, "../public/assets/brand/musheng-icon-64.png"));
  const genRecord = await app.historyStore.saveGeneration(
    { prompt: "保留的生成作品", style: "ming" },
    { images: [{ url: `data:image/png;base64,${png.toString("base64")}`, engine: "imageModel" }] },
    { ownerId: aliceUser.id },
  );
  app.runtime.replies.push(ASKING, ASKING);
  const c1 = (await app.call("POST", "/design-chat/messages", { cookie: alice, body: { text: "胡桃木茶桌方案" } })).body.session;
  const c2 = (await app.call("POST", "/design-chat/messages", { cookie: alice, body: { text: "白蜡木矮柜方案" } })).body.session;
  const list = await app.call("GET", "/design-chat/conversations", { cookie: alice });
  assert.equal(list.status, 200);
  assert.equal(list.body.conversations.length, 2);
  assert.deepEqual(list.body.conversations.map(item => item.title).sort(), ["白蜡木矮柜方案", "胡桃木茶桌方案"]);
  assert.equal((await app.call("GET", "/design-chat/conversations", { cookie: bob })).body.conversations.length, 0);
  assert.equal((await app.call("DELETE", `/design-chat/${c1.id}`, { cookie: bob })).status, 404);
  const del = await app.call("DELETE", `/design-chat/${c1.id}`, { cookie: alice });
  assert.equal(del.status, 200);
  assert.equal(del.body.deleted, c1.id);
  assert.equal((await app.call("GET", `/design-chat/${c1.id}`, { cookie: alice })).status, 404);
  assert.equal((await app.call("GET", `/design-chat/${c2.id}`, { cookie: alice })).status, 200);
  assert.equal(app.historyStore.get(genRecord.record.id)?.id, genRecord.record.id);
});
