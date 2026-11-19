const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
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
    originalPrompt: "一张明式圈椅，放在有植物的书房",
    prompt: "local prompt",
    negativePrompt: "yellow plastic",
    style: "ming",
    quality: "hd",
    size: "16:9-720p",
  });

  assert.deepEqual(result.engines, ["automatic1111", "imageModel"]);
  assert.equal(result.images.length, 2);
  assert.equal(result.request.prompt, "enhanced Chinese furniture prompt");
  assert.equal(result.promptPipeline.localPrompt, "local prompt");
  assert.match(requests.find((item) => item.url === "/sdapi/v1/txt2img").body.prompt, /^enhanced Chinese furniture prompt\n.*seamless pure white studio backdrop/);
  assert.match(
    requests.find((item) => item.url === "/v1/images/generations").body.prompt,
    /enhanced Chinese furniture prompt/,
  );
  const sdRequest = requests.find((item) => item.url === "/sdapi/v1/txt2img").body;
  assert.match(sdRequest.negative_prompt, /^antique, .*patina, .*cracked lacquer, .*room interior, window, plants, rug, props, tableware, books, decor, colored background, dark background, busy background, cropped furniture, yellow plastic$/);
  assert.ok(requests.find((item) => item.url === "/v1/images/generations").body.prompt.endsWith(`Avoid: ${sdRequest.negative_prompt}`));
  const systemPrompt = requests.find((item) => item.url === "/v1/chat/completions").body.messages[0].content;
  assert.match(systemPrompt, /stated room or activity to infer the furniture's function only/);
  assert.match(systemPrompt, /seamless pure white studio backdrop/);
  assert.match(systemPrompt, /Reinterpret traditional forms/);
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

test("ComfyUI sends exclusions through the built-in and custom workflow", async (t) => {
  const workflows = [];
  const server = http.createServer(async (req, res) => {
    if (req.url === "/prompt") {
      workflows.push((await readJson(req)).prompt);
      return sendJson(res, { prompt_id: "bench" });
    }
    if (req.url === "/history/bench") {
      return sendJson(res, { bench: { outputs: { 7: { images: [{ filename: "test.png" }] } } } });
    }
    return res.end("local image fixture");
  });
  await listen(server);
  t.after(() => { server.closeAllConnections(); server.close(); });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const gateway = createGateway(baseUrl, { textModelEnabled: false });
  const brief = { engine: "comfyui", prompt: 'an "oak" chair\nside view', negativePrompt: 'yellow "plastic"\nstripes' };
  await gateway.generate(brief);
  assert.match(workflows[0]["3"].inputs.text, /^antique, .*sepia, .*cropped furniture, yellow "plastic"\nstripes$/);
  assert.deepEqual(workflows[0]["5"].inputs.negative, ["3", 0]);

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "musheng-comfy-test-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const workflowFile = path.join(dir, "workflow.json");
  await fs.writeFile(workflowFile, '{"1":{"class_type":"CLIPTextEncode","inputs":{"text":"{{prompt}}","width":{{width}}}},"2":{"class_type":"CLIPTextEncode","inputs":{"text":"{{negativePrompt}}"}},"3":{"class_type":"KSampler","inputs":{"positive":["1",0],"negative":["2",0]}},"4":{"class_type":"CLIPTextEncode","inputs":{"text":"blurry"}},"5":{"class_type":"KSamplerAdvanced","inputs":{"positive":["1",0],"negative":["4",0]}}}');
  gateway.updateConfig({ comfyWorkflowFile: workflowFile });
  await gateway.generate(brief);
  const routedPositive = workflows[1][workflows[1]["3"].inputs.positive[0]];
  assert.equal(routedPositive.inputs.width, 1280);
  assert.ok(routedPositive.inputs.text.startsWith(brief.prompt));
  assert.match(routedPositive.inputs.text, /exactly one memorable design feature/);
  assert.equal(workflows[1]["2"].inputs.text, workflows[0]["3"].inputs.text);
  assert.equal(workflows[1]["4"].inputs.text, workflows[0]["3"].inputs.text + ", blurry");
  assert.doesNotMatch(routedPositive.inputs.text, /yellow "plastic"/);

  await fs.writeFile(workflowFile, JSON.stringify({
    2: { class_type: "CLIPTextEncode", inputs: { text: "blurry" } },
    5: { class_type: "KSampler", inputs: { negative: ["2", 0] } },
  }));
  await gateway.generate(brief);
  assert.equal(workflows[2]["2"].inputs.text, `${workflows[0]["3"].inputs.text}, blurry`);

  await fs.writeFile(workflowFile, '{"1":{"inputs":{"text":"{{prompt}}"}}}');
  const unknown = await gateway.generate(brief);
  assert.equal(unknown.images[0].warning.message, "反向词未验证");

  const shared = {
    1: { class_type: "CLIPTextEncode", inputs: { text: "{{prompt}}" } },
    3: { class_type: "KSampler", inputs: { positive: [1, 0], negative: ["1", 0] } },
  };
  const sharedSource = JSON.stringify(shared);
  await fs.writeFile(workflowFile, sharedSource);
  const cloned = await gateway.generate(brief);
  const queuedShared = workflows[4];
  const negativeId = queuedShared[3].inputs.negative[0];
  assert.notEqual(negativeId, "1");
  assert.deepEqual(queuedShared[3].inputs.positive, [1, 0]);
  assert.doesNotMatch(queuedShared[1].inputs.text, /antique, aged/);
  assert.match(queuedShared[negativeId].inputs.text, /^antique, aged/);
  assert.match(queuedShared[1].inputs.text, /seamless pure white studio backdrop/);
  assert.doesNotMatch(queuedShared[negativeId].inputs.text, /seamless pure white studio backdrop|exactly one memorable design feature/);
  assert.equal(await fs.readFile(workflowFile, "utf8"), sharedSource);
  assert.equal(cloned.metadata.comfyui.whiteBackdropVerified, true);
  assert.equal(cloned.images[0].warning, undefined);

  const indirect = {
    1: { class_type: "CLIPTextEncode", inputs: { text: "{{negativePrompt}}" } },
    2: { class_type: "ConditioningZeroOut", inputs: { conditioning: ["1", 0] } },
    3: { class_type: "KSampler", inputs: { negative: ["2", 0] } },
  };
  await fs.writeFile(workflowFile, JSON.stringify(indirect));
  const complex = await gateway.generate(brief);
  assert.deepEqual(workflows[5][3].inputs.negative, ["2", 0]);
  assert.equal(workflows[5][1].inputs.text, brief.negativePrompt);
  assert.equal(complex.metadata.comfyui.warning.code, "COMFYUI_NEGATIVE_UNVERIFIED");

  const advanced = {
    ...indirect,
    3: { class_type: "CFGGuider", inputs: { negative: ["1", 0] } },
    4: { class_type: "SamplerCustomAdvanced", inputs: { guider: ["3", 0] } },
  };
  await fs.writeFile(workflowFile, JSON.stringify(advanced));
  const custom = await gateway.generate(brief);
  assert.equal(custom.images[0].warning.code, "COMFYUI_NEGATIVE_UNVERIFIED");
  assert.ok(custom.images[0].warnings.some(warning => warning.message === "白底未验证"));
  assert.equal(workflows[6][1].inputs.text, brief.negativePrompt);
  assert.deepEqual(workflows[6][4], advanced[4]);
  const strictGateway = createGateway(baseUrl, { comfyWorkflowFile: workflowFile, textModelEnabled: false }, { comfyStrictNegativeValidation: true });
  await assert.rejects(strictGateway.generate(brief), /unverified negative conditioning/);
  assert.equal(workflows.length, 7);

  const fixed = {
    1: { class_type: "CLIPTextEncode", inputs: { text: "wood chair in a blue room" } },
    2: { class_type: "CLIPTextEncode", inputs: { text: "{{negativePrompt}}" } },
    3: { class_type: "KSampler", inputs: { positive: ["1", 0], negative: ["2", 0] } },
  };
  const fixedSource = JSON.stringify(fixed);
  await fs.writeFile(workflowFile, fixedSource);
  const corrected = await gateway.generate(brief);
  assert.match(workflows[7][1].inputs.text, /^wood chair in a blue room\n.*overrides.*\n.*seamless pure white studio backdrop/);
  assert.doesNotMatch(workflows[7][2].inputs.text, /seamless pure white studio backdrop/);
  assert.equal(corrected.metadata.comfyui.whiteBackdropVerified, true);
  assert.equal(await fs.readFile(workflowFile, "utf8"), fixedSource);

  fixed[4] = { class_type: "ConditioningZeroOut", inputs: { conditioning: ["1", 0] } };
  fixed[3].inputs.positive = ["4", 0];
  await fs.writeFile(workflowFile, JSON.stringify(fixed));
  const unverified = await strictGateway.generate(brief);
  assert.equal(unverified.metadata.comfyui.whiteBackdropVerified, false);
  assert.equal(unverified.images[0].warning.message, "白底未验证");
  assert.deepEqual(workflows[8][3].inputs.positive, ["4", 0]);
  assert.equal(workflows[8][1].inputs.text, "wood chair in a blue room");
});

test("ComfyUI inserts the full enhanced prompt through intermediate conditioning and skips unusable slots", async t => {
  const workflows = [];
  let enhancementCalls = 0;
  const server = http.createServer(async (req, res) => {
    if (req.url === "/v1/chat/completions") {
      await readJson(req);
      enhancementCalls++;
      return sendJson(res, { choices: [{ message: { content: "enhanced walnut chair" } }] });
    }
    if (req.url === "/prompt") {
      workflows.push((await readJson(req)).prompt);
      return sendJson(res, { prompt_id: "bench" });
    }
    if (req.url === "/history/bench") {
      return sendJson(res, { bench: { outputs: { 7: { images: [{ filename: "test.png" }] } } } });
    }
    return res.end("mock image");
  });
  await listen(server);
  t.after(() => server.close());
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "musheng-prompt-slot-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const workflowFile = path.join(directory, "workflow.json");
  const template = {
    1: { class_type: "CLIPTextEncode", inputs: { text: "{{prompt}}" } },
    2: { class_type: "ConditioningSetArea", inputs: { conditioning: ["1", 0] } },
    3: { class_type: "KSampler", inputs: { positive: ["2", 0], negative: ["1", 0] } },
  };
  const source = JSON.stringify(template);
  await fs.writeFile(workflowFile, source);
  const gateway = createGateway("http://127.0.0.1:" + server.address().port, { comfyWorkflowFile: workflowFile });
  const brief = { engine: "comfyui", prompt: "local chair" };
  const enhanced = await gateway.generate(brief);
  const [first] = workflows;
  const positiveArea = first[first[3].inputs.positive[0]];
  const positiveText = first[positiveArea.inputs.conditioning[0]].inputs.text;
  assert.equal(positiveText, enhanced.promptPipeline.finalPrompt);
  assert.match(positiveText, /^enhanced walnut chair\n.*seamless pure white studio backdrop/);
  assert.doesNotMatch(first[first[3].inputs.negative[0]].inputs.text, /enhanced walnut chair|seamless pure white studio backdrop/);
  assert.equal(await fs.readFile(workflowFile, "utf8"), source);

  template[1].inputs.text = "fixed chair preset";
  template[4] = { class_type: "CLIPTextEncode", inputs: { text: "{{prompt}}" } };
  template[3].inputs.negative = ["4", 0];
  await fs.writeFile(workflowFile, JSON.stringify(template));
  const fixed = await gateway.generate(brief);
  assert.equal(enhancementCalls, 1);
  assert.equal(fixed.promptPipeline.finalPrompt, workflows[1][1].inputs.text);
  assert.equal(fixed.promptPipeline.finalPrompt, "fixed chair preset");
  assert.deepEqual(fixed.promptPipeline.textModel, { skipped: true, reason: "NO_POSITIVE_PROMPT_SLOT" });
  assert.match(workflows[1][4].inputs.text, /local chair/);

  template[2] = { class_type: "ControlNetApplyAdvanced", inputs: { positive: ["1", 0], negative: ["4", 0] } };
  template[3].inputs.negative = ["2", 1];
  await fs.writeFile(workflowFile, JSON.stringify(template));
  const dual = await gateway.generate(brief);
  assert.equal(enhancementCalls, 1, "a slot on the negative output cannot trigger enhancement");
  assert.equal(dual.promptPipeline.finalPrompt, "fixed chair preset");
  assert.equal(dual.metadata.comfyui.whiteBackdropVerified, false);
  assert.deepEqual(workflows[2][3].inputs.negative, ["2", 1]);
  assert.equal(workflows[2][4].inputs.text, "local chair");

  template[1].inputs.text = "{{prompt}}";
  await fs.writeFile(workflowFile, JSON.stringify(template));
  const paired = await gateway.generate(brief);
  assert.equal(enhancementCalls, 2);
  const queued = workflows[3];
  const positiveControl = queued[queued[3].inputs.positive[0]];
  assert.equal(queued[positiveControl.inputs.positive[0]].inputs.text, paired.promptPipeline.finalPrompt);
  assert.match(paired.promptPipeline.finalPrompt, /^enhanced walnut chair/);
  assert.deepEqual(queued[3].inputs.negative, ["2", 1]);
  assert.equal(queued[queued[2].inputs.negative[0]].inputs.text, "local chair");

  template[2].class_type = "UnknownConditioning";
  await fs.writeFile(workflowFile, JSON.stringify(template));
  const opaque = await gateway.generate(brief);
  assert.equal(enhancementCalls, 2);
  assert.equal(opaque.promptPipeline.finalPrompt, "");
  assert.equal(opaque.metadata.comfyui.whiteBackdropVerified, false);
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

  assert.match(sdPrompt, /^local fallback prompt\n.*exactly one memorable design feature/);
  assert.equal(result.images.length, 1);
  assert.equal(result.errors[0].engine, "textModel");
});

function createGateway(baseUrl, overrides = {}, options = {}) {
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
  }, options);
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

test("reference images from the task context reach the Codex provider call", async t => {
  const { CodexCliAdapter } = require("../src/providers/codexCli");
  const received = [];
  const original = CodexCliAdapter.prototype.generate;
  CodexCliAdapter.prototype.generate = async function (args) { received.push(args.referenceImages); return { images: [{ url: "data:image/png;base64,aW1hZ2U=" }], metadata: {} }; };
  t.after(() => { CodexCliAdapter.prototype.generate = original; });
  const gateway = createGateway("http://127.0.0.1:9", { defaultEngine: "codexCli", textModelEnabled: false }, { codexCli: { enabled: true } });
  assert.deepEqual(gateway.listEngines().parentEngines, ["codexCli", "imageModel"]);
  const parent = { bytes: Buffer.from("x"), mimeType: "image/png", title: "v1", role: "parent" };
  await gateway.generate({ engine: "codexCli", prompt: "椅子" }, { referenceImages: [parent] });
  await gateway.generate({ engine: "codexCli", prompt: "椅子" }, {});
  assert.deepEqual(received, [[parent], undefined]);
  assert.deepEqual(createGateway("http://127.0.0.1:9", { defaultEngine: "imageModel" }).listEngines().parentEngines, ["imageModel"]);
  assert.deepEqual(createGateway("http://127.0.0.1:9", { defaultEngine: "imageModel", imageModelName: "" }).listEngines().parentEngines, []);
});

test("compatible image API edits upload the parent image and the region to /images/edits", async t => {
  const hits = [];
  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString("latin1");
    hits.push({ url: req.url, type: req.headers["content-type"] || "", auth: req.headers.authorization, text });
    sendJson(res, { data: [{ b64_json: "aW1hZ2U=" }] });
  });
  await listen(server);
  t.after(() => { server.closeAllConnections(); server.close(); });
  const gateway = createGateway(`http://127.0.0.1:${server.address().port}`, { textModelEnabled: false });
  assert.ok(gateway.listEngines().parentEngines.includes("imageModel"));
  const parent = { bytes: Buffer.from("89504e470d0a1a0a", "hex"), mimeType: "image/png", title: "v1", role: "parent" };
  await gateway.generate({ engine: "imageModel", prompt: "靠背薄一点", region: { x: 0.25, y: 0.1, width: 0.5, height: 0.3 } }, { referenceImages: [parent] });
  await gateway.generate({ engine: "imageModel", prompt: "新椅子" }, {});
  assert.deepEqual(hits.map(hit => hit.url), ["/v1/images/edits", "/v1/images/generations"]);
  assert.match(hits[0].type, /^multipart\/form-data; boundary=/);
  assert.equal(hits[0].auth, "Bearer test-key");
  assert.match(hits[0].text, /name="image"; filename="parent\.png"/);
  assert.match(hits[0].text, /25% from the left and 10% from the top, 50% wide and 30% tall/);
  assert.match(hits[0].text, /seamless pure white studio backdrop/);
  assert.match(hits[0].text, /Preserve materials and every furniture part not mentioned/);
  assert.match(hits[0].text, /Replace the entire scene with pure white and remove all props, including outside the selected region/);
  assert.match(hits[0].text, /Preserve the original camera angle/);
  assert.doesNotMatch(hits[0].text, /keep the composition, camera, background/i);
  assert.match(hits[1].type, /^application\/json/);
});
