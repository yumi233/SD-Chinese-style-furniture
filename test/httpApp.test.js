const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createApp } = require("../src/http/app");
const { HistoryStore } = require("../src/historyStore");
const { ModelConfigStore } = require("../src/modelConfigStore");
const { UserStore } = require("../src/userStore");

const ONE_PIXEL_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

test("HTTP auth, API version aliases, admin config, and owner isolation", async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "musheng-http-"));
  const publicDir = path.join(tempRoot, "public");
  fs.mkdirSync(publicDir, { recursive: true });
  fs.writeFileSync(path.join(publicDir, "index.html"), "<!doctype html><title>studio</title>");
  fs.writeFileSync(path.join(publicDir, "studio.html"), "<!doctype html><title>workbench</title>");
  fs.writeFileSync(path.join(tempRoot, "config.local.json"), '{"secret":"private"}\n');
  fs.mkdirSync(path.join(tempRoot, "data"), { recursive: true });
  fs.writeFileSync(path.join(tempRoot, "data", "private.txt"), "private");

  const historyStore = new HistoryStore({ rootDir: path.join(tempRoot, "history") });
  const modelConfigStore = new ModelConfigStore({
    filePath: path.join(tempRoot, "model.json"),
    defaults: { defaultEngine: "automatic1111" },
  });
  const userStore = new UserStore({
    filePath: path.join(tempRoot, "users.json"),
  });
  const gateway = createFakeGateway();
  const app = createApp({
    rootDir: tempRoot,
    publicDir,
    port: 3000,
    allowedOrigins: ["http://allowed.test"],
    historyStore,
    modelConfigStore,
    userStore,
    gateway,
    mushengPort: 4319,
  });
  const server = await listen(app);
  t.after(async () => {
    await close(server);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  const unauthenticated = await request(server, "POST", "/api/generate", {
    body: { prompt: "chair" },
  });
  assert.equal(unauthenticated.status, 401);
  assert.equal(unauthenticated.headers["cache-control"], "private, no-store");
  assert.equal(unauthenticated.headers.pragma, "no-cache");
  const unauthenticatedMe = await request(server, "GET", "/api/v1/auth/me");
  assert.equal(unauthenticatedMe.status, 200);
  assert.equal(unauthenticatedMe.body.user, null);
  assert.equal(unauthenticatedMe.headers["cache-control"], "private, no-store");
  const live = await request(server, "GET", "/api/v1/live");
  assert.deepEqual(live.body, { ok: true });
  const unauthenticatedAgent = await request(server, "POST", "/api/v1/agent/run", {
    body: { prompt: "chair" },
  });
  assert.equal(unauthenticatedAgent.status, 401);

  const blockedOrigin = await request(server, "POST", "/api/auth/register", {
    origin: "http://evil.test",
    body: { displayName: "Evil", email: "evil@example.com", password: "safe-pass-8" },
  });
  assert.equal(blockedOrigin.status, 403);

  const alice = await register(server, "Alice", "alice@example.com");
  const bob = await register(server, "Bob", "bob@example.com");
  const admin = await register(server, "Admin", "admin@example.com", {
    id: "forged-id",
    role: "admin",
  });
  assert.equal(alice.user.isAdmin, false);
  assert.doesNotMatch(alice.headers["set-cookie"][0], /; Secure/i);
  assert.equal(admin.user.isAdmin, false);
  userStore.adminUserIds.add(admin.user.id);
  const adminMe = await request(server, "GET", "/api/v1/auth/me", { cookie: admin.cookie });
  assert.equal(adminMe.body.user.isAdmin, true);
  assert.equal(adminMe.headers["cache-control"], "private, no-store");

  const aliceGeneration = await request(server, "POST", "/api/v1/generate", {
    cookie: alice.cookie,
    body: {
      originalPrompt: "Alice chair",
      prompt: "alice prompt",
      engine: "automatic1111",
      negativePrompt: "bad chair",
      seed: 42,
    },
  });
  assert.equal(aliceGeneration.status, 200);
  assert.equal(aliceGeneration.body.historyRecord.ownerId, alice.user.id);
  const recordId = aliceGeneration.body.historyRecord.id;
  const legacy = await historyStore.saveGeneration(
    { originalPrompt: "Migrated chair", prompt: "legacy prompt" },
    {
      engine: "automatic1111",
      request: { prompt: "legacy prompt" },
      images: [{ engine: "automatic1111", mimeType: "image/png", url: ONE_PIXEL_PNG }],
    },
  );

  const bobHistory = await request(server, "GET", "/api/history", { cookie: bob.cookie });
  assert.deepEqual(bobHistory.body.records, []);
  const bobRecord = await request(server, "GET", `/api/history/${recordId}`, { cookie: bob.cookie });
  assert.equal(bobRecord.status, 404);
  const bobLegacy = await request(server, "GET", `/api/history/${legacy.record.id}`, { cookie: bob.cookie });
  assert.equal(bobLegacy.status, 404);
  const bobAsset = await request(server, "GET", "/api/history/assets/missing.png", {
    cookie: bob.cookie,
  });
  assert.equal(bobAsset.status, 404);
  const aliceAssetName = path.basename(aliceGeneration.body.historyRecord.images[0].url);
  const bobAliceAsset = await request(server, "GET", `/api/history/assets/${aliceAssetName}`, {
    cookie: bob.cookie,
  });
  assert.equal(bobAliceAsset.status, 404);
  assert.equal(bobAliceAsset.headers["cache-control"], "private, no-store");

  const aliceHistory = await request(server, "GET", "/api/history", { cookie: alice.cookie });
  assert.equal(aliceHistory.body.records.length, 1);
  assert.equal(aliceHistory.body.records[0].negativePrompt, "bad chair");
  assert.equal(aliceHistory.body.records[0].seed, 42);
  const v1History = await request(server, "GET", "/api/v1/history", { cookie: alice.cookie });
  assert.equal(v1History.body.records.length, 1);
  const allowedPreviewOrigin = await request(server, "GET", "/api/v1/auth/me", {
    cookie: alice.cookie,
    origin: "http://localhost:4319",
  });
  assert.equal(allowedPreviewOrigin.status, 200);

  const regularConfig = await request(server, "GET", "/api/config", { cookie: alice.cookie });
  assert.equal(regularConfig.status, 403);
  const adminConfig = await request(server, "POST", "/api/v1/config", {
    cookie: admin.cookie,
    body: { defaultEngine: "imageModel", textModelApiKey: "admin-secret" },
  });
  assert.equal(adminConfig.status, 200);
  assert.equal(Object.hasOwn(adminConfig.body.config, "textModelApiKey"), false);
  assert.equal(gateway.runtime.textModelApiKey, "admin-secret");

  const adminHistory = await request(server, "GET", "/api/history", { cookie: admin.cookie });
  assert.equal(adminHistory.body.records.length, 2);
  const adminLegacy = await request(server, "GET", `/api/history/${legacy.record.id}`, { cookie: admin.cookie });
  assert.equal(adminLegacy.status, 200);
  const adminAsset = await request(server, "GET", `/api/history/assets/${aliceAssetName}`, {
    cookie: admin.cookie,
  });
  assert.equal(adminAsset.status, 200);
  assert.equal(adminAsset.headers["cache-control"], "private, no-store");

  gateway.failGenerate = Object.assign(new Error("upstream http://model.invalid?token=secret"), {
    statusCode: 500,
    details: { apiKey: "secret" },
  });
  const unavailable = await request(server, "POST", "/api/generate", {
    cookie: alice.cookie,
    body: { prompt: "retry chair" },
  });
  assert.equal(unavailable.status, 502);
  assert.equal(unavailable.body.message, "生成服务不可用，请检查模型连接后重试");
  assert.doesNotMatch(JSON.stringify(unavailable.body), /secret|model\.invalid/);
  gateway.failGenerate = null;

  const unknownApi = await request(server, "GET", "/api/v1/unknown", { cookie: alice.cookie });
  assert.equal(unknownApi.status, 404);
  assert.equal(unknownApi.body.ok, false);
  assert.equal(unknownApi.headers["cache-control"], "private, no-store");
  const unknownFile = await request(server, "GET", "/config.local.json");
  assert.equal(unknownFile.status, 404);
  const privateFile = await request(server, "GET", "/data/private.txt");
  assert.equal(privateFile.status, 404);
  const studio = await request(server, "GET", "/studio/");
  assert.equal(studio.status, 200);
  assert.notEqual(studio.headers["cache-control"], "private, no-store");
  assert.match(studio.body, /workbench/);
  const unknownPage = await request(server, "GET", "/does-not-exist");
  assert.equal(unknownPage.status, 404);

  const profile = await request(server, "PATCH", "/api/v1/auth/profile", {
    cookie: alice.cookie,
    body: { displayName: "Alice Updated", role: "admin", id: "forged" },
  });
  assert.equal(profile.status, 200);
  assert.equal(profile.body.user.displayName, "Alice Updated");
  assert.equal(profile.body.user.isAdmin, false);

  const registerRateOne = await request(server, "POST", "/api/auth/register", {
    body: { email: "rate-one@example.com", password: "safe-pass-8" },
  });
  const registerRateTwo = await request(server, "POST", "/api/auth/register", {
    body: { email: "rate-two@example.com", password: "safe-pass-8" },
  });
  const registerRateThree = await request(server, "POST", "/api/auth/register", {
    body: { email: "rate-three@example.com", password: "safe-pass-8" },
  });
  assert.equal(registerRateOne.status, 201);
  assert.equal(registerRateTwo.status, 201);
  assert.equal(registerRateThree.status, 429);

  const logout = await request(server, "POST", "/api/auth/logout", { cookie: alice.cookie });
  assert.equal(logout.status, 200);
  const afterLogout = await request(server, "POST", "/api/generate", {
    cookie: alice.cookie,
    body: { prompt: "chair" },
  });
  assert.equal(afterLogout.status, 401);
});

test("concurrent registrations cannot overwrite the same email", async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "musheng-user-race-"));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  const store = new UserStore({ filePath: path.join(tempRoot, "users.json") });
  const results = await Promise.allSettled([
    store.register({ displayName: "A", email: "same@example.com", password: "safe-pass-8" }),
    store.register({ displayName: "B", email: "same@example.com", password: "safe-pass-8" }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal(store.read().users.length, 1);
});

test("login rereads state so concurrent registration and profile updates survive", async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "musheng-user-login-race-"));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  const store = new UserStore({ filePath: path.join(tempRoot, "users.json") });
  const first = await store.register({ email: "first@example.com", password: "safe-pass-8" });

  const [loginResult, registerResult] = await Promise.all([
    store.login({ email: "first@example.com", password: "safe-pass-8" }),
    store.register({ email: "second@example.com", password: "safe-pass-8" }),
    Promise.resolve().then(() => store.updateProfile(first.user.id, { displayName: "Updated" })),
  ]);

  assert.equal(loginResult.user.id, first.user.id);
  assert.equal(registerResult.user.email, "second@example.com");
  const state = store.read();
  assert.equal(state.users.length, 2);
  assert.equal(state.users.find((user) => user.id === first.user.id).displayName, "Updated");
  assert.ok(state.sessions.length >= 2);
});

function createFakeGateway() {
  const runtime = {
    defaultEngine: "automatic1111",
    textModelApiKey: "",
    imageModelApiKey: "",
    visionModelApiKey: "",
  };
  return {
    runtime,
    getConfig() {
      return {
        defaultEngine: runtime.defaultEngine,
        textModelApiKeyConfigured: Boolean(runtime.textModelApiKey),
        imageModelApiKeyConfigured: Boolean(runtime.imageModelApiKey),
        visionModelApiKeyConfigured: Boolean(runtime.visionModelApiKey),
      };
    },
    getRuntimeConfig() {
      return { ...runtime };
    },
    updateConfig(next = {}) {
      Object.assign(runtime, next);
      return this.getConfig();
    },
    listEngines() {
      return { defaultEngine: runtime.defaultEngine, engines: ["automatic1111"], modes: ["automatic1111"] };
    },
    async health() {
      return { ok: true, engines: {} };
    },
    async generate(body = {}) {
      if (this.failGenerate) {
        throw this.failGenerate;
      }
      return {
        engine: body.engine || "automatic1111",
        engines: [body.engine || "automatic1111"],
        request: {
          ...body,
          prompt: body.prompt || body.enhancedPrompt || "chair",
          negativePrompt: body.negativePrompt || "",
          seed: body.seed ?? -1,
        },
        settings: {},
        images: [{ engine: body.engine || "automatic1111", mimeType: "image/png", url: ONE_PIXEL_PNG }],
        metadata: {},
        errors: [],
        promptPipeline: { finalPrompt: body.prompt || "chair" },
      };
    },
    async runAgent(body = {}) {
      const generated = await this.generate(body);
      const evaluation = { score: 90, rubric: {}, problems: [], suggestion: "ok" };
      return {
        targetScore: Number(body.targetScore || 85),
        maxRounds: Number(body.maxRounds || 1),
        completedRounds: 1,
        finalPrompt: generated.request.prompt,
        bestScore: 90,
        bestRound: 1,
        bestImage: generated.images[0],
        bestEvaluation: evaluation,
        referenceCases: [],
        rounds: [{ round: 1, prompt: generated.request.prompt, image: generated.images[0], engines: generated.engines, errors: [], evaluation }],
      };
    },
  };
}

async function register(server, displayName, email, extra = {}) {
  const response = await request(server, "POST", "/api/auth/register", {
    body: { displayName, email, password: "safe-pass-8", ...extra },
  });
  assert.equal(response.status, 201);
  return { user: response.body.user, cookie: response.cookie, headers: response.headers };
}

function request(server, method, requestPath, options = {}) {
  return new Promise((resolve, reject) => {
    const body = options.body ? JSON.stringify(options.body) : "";
    const headers = {
      ...(body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } : {}),
      ...(options.cookie ? { Cookie: options.cookie } : {}),
      ...(options.origin ? { Origin: options.origin } : {}),
    };
    const req = http.request({
      host: "127.0.0.1",
      port: server.address().port,
      method,
      path: requestPath,
      headers,
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let parsed = null;
        try {
          parsed = text ? JSON.parse(text) : null;
        } catch {
          parsed = text;
        }
        const setCookie = res.headers["set-cookie"]?.[0] || "";
        resolve({ status: res.statusCode, headers: res.headers, body: parsed, cookie: setCookie.split(";")[0] });
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}
