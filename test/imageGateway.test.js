const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const { createImageGateway } = require("../src/imageGateway");

test("text enhancement feeds both SD and image-model generation without exposing keys", async (t) => {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const body = await readJson(req);
    requests.push({ url: req.url, body, authorization: req.headers.authorization || "" });

    if (req.url === "/v1/chat/completions") {
      return sendJson(res, {
        choices: [{ message: { content: "enhanced Chinese furniture prompt" } }],
        usage: { total_tokens: 42 },
      });
    }
    if (req.url === "/sdapi/v1/txt2img") {
      return sendJson(res, { images: ["c2QtaW1hZ2U="], info: "{}" });
    }
    if (req.url === "/v1/images/generations") {
      return sendJson(res, { data: [{ b64_json: "YWktaW1hZ2U=" }] });
    }

    res.statusCode = 404;
    return res.end();
  });

  await listen(server);
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const gateway = createGateway(baseUrl);

  const result = await gateway.generate({
    engine: "automatic1111+imageModel",
    originalPrompt: "一张明式圈椅",
    prompt: "local prompt",
    style: "ming",
    quality: "hd",
    size: "16:9-720p",
  });

  assert.deepEqual(result.engines, ["automatic1111", "imageModel"]);
  assert.equal(result.images.length, 2);
  assert.equal(result.request.prompt, "enhanced Chinese furniture prompt");
  assert.equal(result.promptPipeline.localPrompt, "local prompt");
  assert.equal(requests.find((item) => item.url === "/sdapi/v1/txt2img").body.prompt, "enhanced Chinese furniture prompt");
  assert.match(
    requests.find((item) => item.url === "/v1/images/generations").body.prompt,
    /enhanced Chinese furniture prompt/,
  );
  const sdRequest = requests.find((item) => item.url === "/sdapi/v1/txt2img").body;
  assert.equal(sdRequest.width, 1280);
  assert.equal(sdRequest.height, 720);
  assert.equal(requests.find((item) => item.url === "/v1/images/generations").body.size, "1280x720");
  assert.equal(result.request.size, "16:9-720p");
  assert.equal(result.request.sizeLabel, "16:9 720p");
  assert.ok(requests.every((item) => item.authorization === "Bearer test-key" || item.url.includes("sdapi")));

  gateway.updateConfig({
    defaultEngine: "automatic1111+imageModel",
    textModelApiKey: "",
    imageModelApiKey: "",
  });
  const publicConfig = gateway.getConfig();
  assert.equal(publicConfig.textModelApiKeyConfigured, true);
  assert.equal(publicConfig.imageModelApiKeyConfigured, true);
  assert.equal(Object.hasOwn(publicConfig, "textModelApiKey"), false);
  assert.equal(Object.hasOwn(publicConfig, "imageModelApiKey"), false);
});

test("parallel mode keeps successful SD output when the image model fails", async (t) => {
  const server = http.createServer(async (req, res) => {
    await readJson(req);
    if (req.url === "/sdapi/v1/txt2img") {
      return sendJson(res, { images: ["c2QtaW1hZ2U="], info: "{}" });
    }
    if (req.url === "/v1/images/generations") {
      return sendJson(res, { error: { message: "unavailable" } }, 503);
    }
    res.statusCode = 404;
    return res.end();
  });

  await listen(server);
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const gateway = createGateway(baseUrl, { textModelEnabled: false });

  const result = await gateway.generate({
    engine: "automatic1111+imageModel",
    prompt: "furniture prompt",
  });

  assert.equal(result.images.length, 1);
  assert.equal(result.images[0].engine, "automatic1111");
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].engine, "imageModel");
});

test("text-model failure falls back to the local prompt", async (t) => {
  let sdPrompt = "";
  const server = http.createServer(async (req, res) => {
    const body = await readJson(req);
    if (req.url === "/v1/chat/completions") {
      return sendJson(res, { error: { message: "text unavailable" } }, 503);
    }
    if (req.url === "/sdapi/v1/txt2img") {
      sdPrompt = body.prompt;
      return sendJson(res, { images: ["c2QtaW1hZ2U="], info: "{}" });
    }
    res.statusCode = 404;
    return res.end();
  });

  await listen(server);
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const gateway = createGateway(baseUrl);

  const result = await gateway.generate({ engine: "automatic1111", prompt: "local fallback prompt" });

  assert.equal(sdPrompt, "local fallback prompt");
  assert.equal(result.images.length, 1);
  assert.equal(result.errors[0].engine, "textModel");
});

function createGateway(baseUrl, overrides = {}) {
  return createImageGateway({
    defaultEngine: "automatic1111+imageModel",
    auto1111BaseUrl: baseUrl,
    auto1111Lora: "",
    comfyBaseUrl: baseUrl,
    comfyCheckpoint: "",
    comfyWorkflowFile: "",
    textModelEnabled: true,
    textModelBaseUrl: `${baseUrl}/v1`,
    textModelApiKey: "test-key",
    textModelName: "text-model",
    imageModelBaseUrl: `${baseUrl}/v1`,
    imageModelApiKey: "test-key",
    imageModelName: "image-model",
    imageModelSize: "1024x1024",
    visionModelBaseUrl: `${baseUrl}/v1`,
    visionModelApiKey: "vision-key",
    visionModelName: "vision-model",
    ...overrides,
  });
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
}

function readJson(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => resolve(raw ? JSON.parse(raw) : null));
  });
}

function sendJson(res, payload, statusCode = 200) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

test("abort reaches A1111, compatible image HTTP and ComfyUI polling", async t => {
  for (const engine of ["automatic1111", "imageModel", "comfyui"]) {
    await t.test(engine, async t => {
      let entered, closed;
      const started = new Promise(resolve => { entered = resolve; });
      const disconnected = new Promise(resolve => { closed = resolve; });
      const server = http.createServer(async (req, res) => {
        await readJson(req);
        if (req.url === "/prompt") return sendJson(res, { prompt_id: "cancel-test" });
        res.on("close", closed);
        entered(); // Deliberately withhold the in-flight provider response.
      });
      await listen(server);
      t.after(() => { server.closeAllConnections(); server.close(); });
      const base = `http://127.0.0.1:${server.address().port}`;
      const gateway = createGateway(base, { textModelEnabled: false });
      const controller = new AbortController();
      const pending = gateway.generate({ engine, prompt: "椅子" }, { signal: controller.signal });
      await started;
      controller.abort();
      await assert.rejects(pending);
      await disconnected;
    });
  }
});

test("abort during text enhancement never falls through to image generation", async t => {
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const calls = [];
  const server = http.createServer(async (req, res) => { await readJson(req); calls.push(req.url); entered(); });
  await listen(server);
  t.after(() => { server.closeAllConnections(); server.close(); });
  const gateway = createGateway(`http://127.0.0.1:${server.address().port}`);
  const controller = new AbortController();
  const pending = gateway.generate({ engine: "imageModel", prompt: "椅子" }, { signal: controller.signal });
  await started; controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.deepEqual(calls, ["/v1/chat/completions"]);
});

test("agent abort during review retains its saved image and dispatches no next round", async t => {
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  let generations = 0, saved;
  const server = http.createServer(async (req, res) => {
    await readJson(req);
    if (req.url === "/v1/images/generations") { generations++; return sendJson(res, { data: [{ b64_json: "aW1hZ2U=" }] }); }
    entered(); // Hold the vision review, after the image checkpoint.
  });
  await listen(server);
  t.after(() => { server.closeAllConnections(); server.close(); });
  const gateway = createGateway(`http://127.0.0.1:${server.address().port}`, { textModelEnabled: false });
  const controller = new AbortController();
  const pending = gateway.runAgent({ engine: "imageModel", prompt: "椅子", maxRounds: 3 }, {
    signal: controller.signal, onRound: async result => { saved = result; },
  });
  await started; controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(saved.rounds.length, 1);
  assert.equal(saved.rounds[0].evaluation.evaluationPending, true);
  assert.equal(generations, 1);
});

test("every dispatched generation and review call is reported for quota", async t => {
  const server = http.createServer(async (req, res) => {
    await readJson(req);
    if (req.url === "/v1/images/generations") return sendJson(res, { data: [{ b64_json: "aW1hZ2U=" }] });
    res.writeHead(500); res.end("{}");   // review fails, but it was still dispatched
  });
  await listen(server);
  t.after(() => { server.closeAllConnections(); server.close(); });
  const gateway = createGateway(`http://127.0.0.1:${server.address().port}`, { textModelEnabled: false });
  const calls = [];
  await gateway.generate({ engine: "imageModel", prompt: "椅子" }, { onCall: kind => calls.push(kind) });
  assert.deepEqual(calls, ["generation"]);
  calls.length = 0;
  await gateway.runAgent({ engine: "imageModel", prompt: "椅子", maxRounds: 1 }, { onCall: kind => calls.push(kind), onRound: async () => {} });
  assert.deepEqual(calls, ["generation", "review"]);
});
