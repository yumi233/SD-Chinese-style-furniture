"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const test = require("node:test");
const { CodexCliAdapter } = require("../src/providers/codexCli");

const MODEL = "gpt-6.1-sol";
const AUTH_SENTINEL = "fixture-only-auth-value-must-not-leak";

function pngFixture() {
  const bytes = Buffer.alloc(58);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(1, 16);
  bytes.writeUInt32BE(1, 20);
  bytes[24] = 8;
  bytes[25] = 6;
  bytes.writeUInt32BE(1, 33);
  bytes.write("IDAT", 37, "ascii");
  bytes[41] = 0;
  bytes.write("IEND", 50, "ascii");
  return bytes;
}

function jpegFixture() {
  return Buffer.from([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x08, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01,
    0xff, 0xd9,
  ]);
}

function webpFixture() {
  const bytes = Buffer.alloc(30);
  bytes.write("RIFF", 0, "ascii");
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WEBP", 8, "ascii");
  bytes.write("VP8X", 12, "ascii");
  bytes.writeUInt32LE(10, 16);
  return bytes;
}

function eventOutput(events) {
  return `${events.map((event) => JSON.stringify(event)).join("\n")}\n`;
}

function mockSpawn(onGenerate, calls = []) {
  const killSignals = [];
  const spawnImpl = (command, args, options) => {
    const call = { command, args: [...args], options };
    calls.push(call);
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = (signal) => {
      killSignals.push(signal);
      if (signal === "SIGTERM" && onGenerate?.hang) {
        setImmediate(() => {
          child.stdout.end();
          child.stderr.end();
          child.emit("close", null, signal);
        });
      }
      return true;
    };

    if (args[0] === "--version") {
      setImmediate(() => {
        child.stdout.end("codex-cli 0.154.0\n");
        child.stderr.end("version diagnostic should remain private\n");
        child.emit("close", 0, null);
      });
      return child;
    }

    let input = "";
    child.stdin.on("data", (chunk) => {
      input += chunk.toString("utf8");
    });
    child.stdin.on("end", () => {
      if (onGenerate?.hang) return;
      Promise.resolve(onGenerate ? onGenerate({ call, child, input }) : {}).then((outcome = {}) => {
        if (outcome.delayMs) {
          setTimeout(() => finish(outcome), outcome.delayMs);
        } else {
          finish(outcome);
        }
      }).catch((error) => {
        child.stderr.end(String(error));
        child.emit("close", 1, null);
      });

      function finish(outcome) {
        child.stdout.end(outcome.stdout ?? eventOutput([
          { type: "turn.started" },
          { type: "turn.completed", usage: { input_tokens: 12, cached_input_tokens: 2, output_tokens: 9, ignored: "private" } },
        ]));
        child.stderr.end(outcome.stderr || "");
        child.emit("close", outcome.exitCode ?? 0, null);
      }
    });
    return child;
  };
  spawnImpl.killSignals = killSignals;
  return spawnImpl;
}

async function makeHarness(t, options = {}) {
  const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-cli-adapter-test-"));
  t.after(async () => fs.rm(testRoot, { recursive: true, force: true }));
  const workRoot = path.join(testRoot, "jobs");
  await fs.mkdir(workRoot, { recursive: true });
  const authFile = path.join(testRoot, "mock-auth.json");
  await fs.writeFile(authFile, "local mock auth fixture", { mode: 0o600 });
  const calls = [];
  const spawnImpl = options.spawnImpl || mockSpawn(options.onGenerate, calls);
  const adapter = new CodexCliAdapter({
    enabled: true,
    command: "codex",
    model: MODEL,
    reasoningEffort: "max",
    authFile,
    workRoot,
    timeoutMs: options.timeoutMs || 1000,
    maxImageBytes: options.maxImageBytes || 20 * 1024 * 1024,
    ...(options.adapterOptions || {}),
    spawnImpl,
  });
  return { adapter, calls, spawnImpl, testRoot, workRoot };
}

function completedEvents() {
  return [
    { type: "thread.started", thread_id: "private-thread-id" },
    { type: "turn.started" },
    { type: "turn.completed", usage: { input_tokens: 12, cached_input_tokens: 2, output_tokens: 9, ignored: "private" } },
  ];
}

for (const fixture of [
  { extension: ".png", mimeType: "image/png", bytes: pngFixture },
  { extension: ".jpg", mimeType: "image/jpeg", bytes: jpegFixture },
  { extension: ".webp", mimeType: "image/webp", bytes: webpFixture },
]) {
  test(`generates one validated ${fixture.mimeType} data URL with isolated Codex flags`, async (t) => {
    const harness = await makeHarness(t, {
      onGenerate: async ({ call, input }) => {
        const packageData = JSON.parse(input);
        assert.match(packageData.task, /built-in image_generation tool once/);
        assert.equal(packageData.designBrief.prompt, "明式圈椅放在安静的茶室");
        assert.equal(packageData.settings.width, 1024);
        assert.equal(call.options.shell, false);
        assert.equal(call.args[call.args.indexOf("-m") + 1], MODEL);
        assert.ok(call.args.includes("model_reasoning_effort=max"));
        assert.ok(call.args.includes("--enable") && call.args.includes("image_generation"));
        for (const disabled of ["shell_tool", "unified_exec", "multi_agent", "apps", "plugins"]) {
          assert.ok(call.args.some((argument, index) => argument === "--disable" && call.args[index + 1] === disabled));
        }
        assert.equal(call.args.at(-1), "-");
        assert.equal(call.options.env.CODEX_HOME, call.options.env.HOME);
        assert.equal(call.options.cwd.startsWith(harness.workRoot), true);
        assert.equal(Object.hasOwn(call.options.env, "CODEX_API_KEY"), false);
        const generated = path.join(call.options.env.CODEX_HOME, "generated_images");
        await fs.mkdir(generated, { recursive: true });
        await fs.writeFile(path.join(generated, `made${fixture.extension}`), fixture.bytes());
        return { stdout: eventOutput(completedEvents()), stderr: "private stderr detail" };
      },
    });

    const result = await harness.adapter.generate({
      request: { prompt: "明式圈椅放在安静的茶室", negativePrompt: "文字" },
      settings: { width: 1024, height: 1024, seed: 7 },
    });
    assert.equal(result.images.length, 1);
    assert.equal(result.images[0].mimeType, fixture.mimeType);
    assert.equal(result.images[0].url.startsWith(`data:${fixture.mimeType};base64,`), true);
    assert.deepEqual(result.metadata, {
      model: MODEL,
      provider: "codexCli",
      usage: { input_tokens: 12, cached_input_tokens: 2, output_tokens: 9 },
    });
    assert.equal(JSON.stringify(result).includes("private stderr detail"), false);
    assert.equal(JSON.stringify(result).includes("private-thread-id"), false);
    assert.equal(harness.calls.length, 1);
    assert.equal(harness.calls[0].options.shell, false);
  });
}

test("health checks the executable version without verifying image generation", async (t) => {
  const harness = await makeHarness(t);
  const health = await harness.adapter.health();
  assert.deepEqual(health, {
    model: MODEL,
    engine: "codexCli",
    availability: "not_generation_verified",
    ok: true,
  });
  assert.deepEqual(harness.calls[0].args, ["--version"]);
  assert.equal(JSON.stringify(health).includes("version diagnostic"), false);
  assert.equal(JSON.stringify(health).includes(harness.workRoot), false);
});

test("completed text without an image returns CODEX_NO_IMAGE", async (t) => {
  const harness = await makeHarness(t, {
    onGenerate: async () => ({ stdout: eventOutput(completedEvents()) }),
  });
  await assert.rejects(harness.adapter.generate({ request: { prompt: "椅子" }, settings: {} }), (error) => {
    assert.equal(error.code, "CODEX_NO_IMAGE");
    assert.equal(error.statusCode, 502);
    return true;
  });
});

test("symlinked output that escapes the job is rejected without reading its target", async (t) => {
  const harness = await makeHarness(t, {
    onGenerate: async ({ call }) => {
      const generated = path.join(call.options.env.CODEX_HOME, "generated_images");
      await fs.mkdir(generated, { recursive: true });
      const outside = path.join(harness.testRoot, "outside.png");
      await fs.writeFile(outside, pngFixture());
      await fs.symlink(outside, path.join(generated, "escape.png"));
      return { stdout: eventOutput(completedEvents()) };
    },
  });
  await assert.rejects(harness.adapter.generate({ request: { prompt: "椅子" }, settings: {} }), (error) => {
    assert.equal(error.code, "CODEX_OUTPUT_INVALID");
    assert.equal(error.statusCode, 502);
    assert.equal(error.message.includes(harness.testRoot), false);
    return true;
  });
});

test("failed terminal events and non-JSON output cannot count as success", async (t) => {
  for (const outcome of [
    { stdout: eventOutput([{ type: "turn.failed", error: { message: "private error" } }]) },
    { stdout: "not-json\n" },
    { stdout: eventOutput(completedEvents()), exitCode: 1 },
  ]) {
    const harness = await makeHarness(t, { onGenerate: async () => outcome });
    await assert.rejects(harness.adapter.generate({ request: { prompt: "椅子" }, settings: {} }), (error) => {
      assert.equal(error.code, "CODEX_UNAVAILABLE");
      assert.equal(error.statusCode, 502);
      assert.equal(error.message.includes("private error"), false);
      return true;
    });
  }
});

test("timeout signals the process and returns a controlled CODEX_TIMEOUT", async (t) => {
  const spawnImpl = mockSpawn({ hang: true });
  const harness = await makeHarness(t, { spawnImpl, timeoutMs: 20 });
  await assert.rejects(harness.adapter.generate({ request: { prompt: "椅子" }, settings: {} }), (error) => {
    assert.equal(error.code, "CODEX_TIMEOUT");
    assert.equal(error.statusCode, 504);
    return true;
  });
  assert.ok(spawnImpl.killSignals.includes("SIGTERM"));
});

test("the adapter enforces one active generation per instance", async (t) => {
  const harness = await makeHarness(t, {
    onGenerate: async ({ call }) => {
      const generated = path.join(call.options.env.CODEX_HOME, "generated_images");
      await fs.mkdir(generated, { recursive: true });
      await new Promise((resolve) => setTimeout(resolve, 80));
      await fs.writeFile(path.join(generated, "made.png"), pngFixture());
      return { stdout: eventOutput(completedEvents()) };
    },
  });
  const first = harness.adapter.generate({ request: { prompt: "椅子" }, settings: {} });
  await assert.rejects(harness.adapter.generate({ request: { prompt: "桌子" }, settings: {} }), (error) => {
    assert.equal(error.code, "CODEX_BUSY");
    assert.equal(error.statusCode, 429);
    return true;
  });
  await first;
});

test("auth fixture is copied privately and never returned or logged", async (t) => {
  const harness = await makeHarness(t, {
    adapterOptions: {},
    onGenerate: async ({ call }) => {
      const authCopy = path.join(call.options.env.CODEX_HOME, "auth.json");
      const stat = await fs.stat(authCopy);
      assert.equal(stat.mode & 0o777, 0o600);
      assert.equal(stat.size, Buffer.byteLength(AUTH_SENTINEL));
      assert.equal(call.options.env.CODEX_HOME, call.options.env.HOME);
      assert.equal(Object.hasOwn(call.options.env, "OPENAI_API_KEY"), false);
      assert.equal(JSON.stringify(call.options).includes(AUTH_SENTINEL), false);
      const generated = path.join(call.options.env.CODEX_HOME, "generated_images");
      await fs.mkdir(generated, { recursive: true });
      await fs.writeFile(path.join(generated, "auth-test.png"), pngFixture());
      return { stdout: eventOutput(completedEvents()), stderr: AUTH_SENTINEL };
    },
  });
  const authFile = path.join(harness.testRoot, "auth.json");
  await fs.writeFile(authFile, AUTH_SENTINEL, { mode: 0o600 });
  harness.adapter.authFile = authFile;
  const result = await harness.adapter.generate({ request: { prompt: "椅子" }, settings: {} });
  assert.equal(JSON.stringify(result).includes(AUTH_SENTINEL), false);
  assert.equal(JSON.stringify(result).includes(authFile), false);
});

test("missing configured auth file reports CODEX_AUTH without exposing its path", async (t) => {
  const harness = await makeHarness(t);
  const authFile = path.join(harness.testRoot, "not-present-auth.json");
  harness.adapter.authFile = authFile;
  const health = await harness.adapter.health();
  assert.equal(health.ok, false);
  assert.equal(health.code, "CODEX_AUTH");
  assert.equal(health.message.includes(authFile), false);
  await assert.rejects(harness.adapter.generate({ request: { prompt: "椅子" }, settings: {} }), (error) => {
    assert.equal(error.code, "CODEX_AUTH");
    assert.equal(error.statusCode, 400);
    assert.equal(error.message.includes(authFile), false);
    return true;
  });
  assert.equal(harness.calls.length, 0);
});

test("missing authFile configuration never falls back to the shared home", async (t) => {
  const harness = await makeHarness(t);
  harness.adapter.authFile = "";
  const health = await harness.adapter.health();
  assert.equal(health.ok, false);
  assert.equal(health.code, "CODEX_AUTH");
  assert.match(health.message, /not configured/i);
  await assert.rejects(harness.adapter.generate({ request: { prompt: "椅子" }, settings: {} }), (error) => {
    assert.equal(error.code, "CODEX_AUTH");
    return true;
  });
  assert.equal(harness.calls.length, 0);
});

test("approved Luna keeps max effort; unapproved model families are rejected", async (t) => {
  const allowed = await makeHarness(t, { adapterOptions: { model: "gpt-5.6-luna" } });
  assert.equal(allowed.adapter.configurationError(), null);
  assert.equal(allowed.adapter.reasoningEffort, "max");
  for (const model of ["gpt-6-astra", "gpt-5.6-sol", "gpt-5.6-terra", "unknown"]) {
    const denied = await makeHarness(t, { adapterOptions: { model } });
    await assert.rejects(denied.adapter.generate({ request: { prompt: "chair" } }), (error) => error.code === "CODEX_UNAVAILABLE");
    assert.equal(denied.calls.length, 0);
  }
});

test("explicitly approved current model is passed to CLI with matching effort", async (t) => {
  const harness = await makeHarness(t, {
    adapterOptions: { model: "gpt-6.1-sol", reasoningEffort: "high" },
    onGenerate: async ({ call }) => {
      assert.equal(call.args[call.args.indexOf("-m") + 1], "gpt-6.1-sol");
      assert.ok(call.args.includes("model_reasoning_effort=high"));
      const generated = path.join(call.options.env.CODEX_HOME, "generated_images");
      await fs.mkdir(generated, { recursive: true });
      await fs.writeFile(path.join(generated, "made.png"), pngFixture());
      return { stdout: eventOutput(completedEvents()), stderr: "" };
    },
  });
  assert.equal(harness.adapter.configurationError(), null);
  const result = await harness.adapter.generate({ request: { prompt: "现代宋式木椅" }, settings: { width: 1024, height: 1024 } });
  assert.match(result.images[0].url, /^data:image\/png;base64,/);
});

function reviewEvents(value) {
  return eventOutput([
    { type: "item.completed", item: { type: "agent_message", text: JSON.stringify(value) } },
    ...completedEvents(),
  ]);
}
const validReview = { score: 88, revisedPrompt: "a refined walnut chair", checks: [{ ruleId: "E03", status: "pass", evidence: "木架可见", confidence: "medium" }] };
const reviewImage = () => `data:image/png;base64,${pngFixture().toString("base64")}`;

test("CLI reviews an attached image with isolated model, no tools, and source checks", async (t) => {
  const harness = await makeHarness(t, { onGenerate: async ({ call, input }) => {
    assert.equal(call.args[call.args.indexOf("-m") + 1], MODEL);
    assert.ok(call.args.includes("model_reasoning_effort=max"));
    assert.ok(!call.args.includes("--enable"));
    assert.ok(call.args.some((a, i) => a === "--disable" && call.args[i + 1] === "image_generation"));
    const imagePath = call.args[call.args.indexOf("-i") + 1];
    assert.deepEqual(await fs.readFile(imagePath), pngFixture());
    const authPath = path.join(call.options.env.CODEX_HOME, "auth.json");
    assert.equal((await fs.stat(authPath)).mode & 0o777, 0o600);
    assert.ok(JSON.parse(input).designData.furnitureEvidence.checks.length);
    return { stdout: reviewEvents(validReview), stderr: AUTH_SENTINEL };
  } });
  const result = await harness.adapter.evaluate({ imageUrl: reviewImage(), prompt: "chair", requirement: "椅子", furnitureEvidence: { checks: [{ ruleId: "E03" }, { ruleId: "E04" }] } });
  assert.equal(result.score, 88);
  assert.equal(result.decision, "needs_review");
  assert.equal(result.checks[0].status, "pass");
  assert.equal(result.checks.length, 1);
  assert.equal(result.metadata.model, MODEL);
  assert.equal(JSON.stringify(result).includes(AUTH_SENTINEL), false);
  assert.deepEqual(await fs.readdir(harness.workRoot), []);
});

test("CLI review rejects URLs, forged MIME, oversized and corrupt image before spawn", async (t) => {
  const harness = await makeHarness(t, { maxImageBytes: 100 });
  for (const imageUrl of ["http://127.0.0.1/private", "file:///private", "data:image/jpeg;base64," + pngFixture().toString("base64"), "data:image/png;base64,AAAA", "data:image/png;base64," + Buffer.alloc(120).toString("base64")]) {
    await assert.rejects(harness.adapter.evaluate({ imageUrl }), e => e.code === "CODEX_OUTPUT_INVALID");
  }
  assert.equal(harness.calls.length, 0);
});

test("CLI review rejects malformed evaluations without presenting a fabricated score", async (t) => {
  for (const value of [null, {}, { ...validReview, score: "99" }, { ...validReview, score: 101 }, { ...validReview, checks: [{ ruleId: "E03", status: "pass" }] }]) {
    const harness = await makeHarness(t, { onGenerate: async () => ({ stdout: reviewEvents(value) }) });
    await assert.rejects(harness.adapter.evaluate({ imageUrl: reviewImage() }), e => e.code === "CODEX_OUTPUT_INVALID");
    assert.equal(harness.adapter.busy, false);
    assert.deepEqual(await fs.readdir(harness.workRoot), []);
  }
});

test("CLI review shares the generation concurrency lock and times out with cleanup", async (t) => {
  const onGenerate = () => {}; onGenerate.hang = true;
  const harness = await makeHarness(t, { onGenerate, timeoutMs: 30 });
  const review = harness.adapter.evaluate({ imageUrl: reviewImage() });
  await assert.rejects(harness.adapter.generate({ request: { prompt: "chair" } }), e => e.code === "CODEX_BUSY");
  await assert.rejects(review, e => e.code === "CODEX_TIMEOUT");
  assert.equal(harness.adapter.busy, false);
  assert.deepEqual(await fs.readdir(harness.workRoot), []);
});

async function writeMockImage(call) {
  const dir = path.join(call.options.env.CODEX_HOME, "generated_images");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "result.png"), pngFixture());
}

test("a valid generated image survives a later failed response stream", async (t) => {
  const harness = await makeHarness(t, { onGenerate: async ({ call }) => {
    await writeMockImage(call);
    return { stdout: eventOutput([{type:"turn.started"},{type:"error",message:"stream disconnected private detail"},{type:"turn.failed",error:{message:AUTH_SENTINEL}}]), exitCode: 1 };
  }});
  const result = await harness.adapter.generate({ request: { prompt: "chair" } });
  assert.equal(result.images.length, 1);
  assert.equal(result.metadata.completionWarning.code, "CODEX_RESPONSE_INCOMPLETE");
  assert.equal(JSON.stringify(result).includes(AUTH_SENTINEL), false);
  assert.deepEqual(await fs.readdir(harness.workRoot), []);
});

test("a reconnect notice followed by a completed turn is successful only with a real image", async (t) => {
  const stdout = eventOutput([{type:"error",message:"Reconnecting... 1/5 (private network detail)"}, ...completedEvents()]);
  const harness = await makeHarness(t, { onGenerate: async ({call}) => { await writeMockImage(call); return {stdout}; }});
  const result = await harness.adapter.generate({request:{prompt:"chair"}});
  assert.equal(result.images.length, 1);
  assert.equal(result.metadata.completionWarning, undefined);
  const empty = await makeHarness(t, {onGenerate: async()=>({stdout})});
  await assert.rejects(empty.adapter.generate({request:{prompt:"chair"}}), e=>e.code==="CODEX_NO_IMAGE");
});

test("a malformed stream, invalid image and multiple outputs remain rejected during recovery", async (t) => {
  for (const kind of ["malformed", "invalid", "multiple"]) {
    const harness = await makeHarness(t, {onGenerate: async({call})=>{
      await writeMockImage(call);
      const dir=path.join(call.options.env.CODEX_HOME,"generated_images");
      if(kind==="invalid") await fs.writeFile(path.join(dir,"result.png"),Buffer.from("not an image"));
      if(kind==="multiple") await fs.writeFile(path.join(dir,"second.png"),pngFixture());
      return {stdout:kind==="malformed" ? "private non-json output" : eventOutput([{type:"turn.failed"}]),exitCode:1};
    }});
    await assert.rejects(harness.adapter.generate({request:{prompt:"chair"}}), e=>e.code==="CODEX_OUTPUT_INVALID");
  }
});

test("a fully written validated image survives response timeout without generating again", async (t) => {
  const harness = await makeHarness(t, {timeoutMs:30,onGenerate:async({call})=>{
    await writeMockImage(call);
    return {stdout:eventOutput(completedEvents()),delayMs:120};
  }});
  const result=await harness.adapter.generate({request:{prompt:"chair"}});
  assert.equal(result.images.length,1);
  assert.equal(result.metadata.completionWarning.code,"CODEX_RESPONSE_TIMEOUT");
  assert.equal(harness.calls.length,1);
  assert.equal(harness.adapter.busy,false);
  assert.deepEqual(await fs.readdir(harness.workRoot),[]);
});

test("reference inputs are attached with -i, stay private and never count as generated output", async t => {
  let inputPaths;
  const harness = await makeHarness(t, { onGenerate: async ({ call, input }) => {
    inputPaths = attachedImagePaths(call.args);
    assert.equal(inputPaths.length, 1);
    assert.equal(path.dirname(inputPaths[0]), call.options.env.CODEX_HOME);
    assert.deepEqual(await fs.readFile(inputPaths[0]), pngFixture());
    assert.equal((await fs.stat(inputPaths[0])).mode & 0o777, 0o600);
    const prompt = JSON.parse(input); assert.equal(prompt.visualReferences[0].attachment, 1);
    assert.match(prompt.task, /use them in the image_generation tool/);
    assert.match(prompt.task, /Generate a NEW image/);
    // A successful textual response plus input images must not claim generation.
    return { stdout: eventOutput(completedEvents()) };
  } });
  await assert.rejects(harness.adapter.generate({ request: { prompt: "chair" }, referenceImages: [{ id: "curated-chair", title: "chair", mimeType: "image/png", bytes: pngFixture() }] }), error => error.code === "CODEX_NO_IMAGE");
  await assert.rejects(fs.stat(inputPaths[0]), { code: "ENOENT" });
});
test("generated output and visual references coexist; review receives generated image first", async t => {
  let stage = "generate";
  const harness = await makeHarness(t, { onGenerate: async ({ call, input }) => {
    const paths = attachedImagePaths(call.args);
    if (stage === "generate") {
      assert.equal(paths.length, 1);
      await fs.writeFile(path.join(call.options.cwd, "output", "new.jpg"), jpegFixture());
      return { stdout: eventOutput(completedEvents()) };
    }
    assert.equal(paths.length, 2); assert.match(paths[0], /review\.jpg$/); assert.match(paths[1], /home\/reference-1\.png$/);
    const prompt = JSON.parse(input); assert.match(prompt.task, /attachment 1/); assert.equal(prompt.designData.visualReferenceCount, 1);
    return { stdout: eventOutput([{ type: "item.completed", item: { type: "agent_message", text: JSON.stringify({ score: 90, revisedPrompt: "chair", checks: [], decision: "pass" }) } }, ...completedEvents()]) };
  } });
  const referenceImages = [{ id: "curated-chair", title: "chair", mimeType: "image/png", bytes: pngFixture() }];
  const result = await harness.adapter.generate({ request: { prompt: "chair" }, referenceImages }); assert.equal(result.images.length, 1);
  assert.doesNotMatch(JSON.stringify(result), /reference-1|"bytes"|codex-cli-job-/);
  stage = "review";
  const review = await harness.adapter.evaluate({ imageUrl: result.images[0].url, prompt: "chair", requirement: "chair", referenceImages }); assert.equal(review.score, 90);
});

test("copying the original reference into output is not a generated result", async t => {
  const harness = await makeHarness(t, { onGenerate: async ({ call }) => {
    await fs.copyFile(call.args[call.args.indexOf("-i") + 1], path.join(call.options.cwd, "output", "copy.png"));
    return { stdout: eventOutput(completedEvents()) };
  } });
  await assert.rejects(harness.adapter.generate({ request: { prompt: "chair" }, referenceImages: [{ id: "curated-chair", title: "chair", mimeType: "image/png", bytes: pngFixture() }] }), error => error.code === "CODEX_OUTPUT_INVALID");
});

test("a cached attached original beside a new image is excluded, never delivered", async t => {
  const harness = await makeHarness(t, { onGenerate: async ({ call }) => {
    const output = path.join(call.options.cwd, "output");
    await fs.copyFile(call.args[call.args.indexOf("-i") + 1], path.join(output, "cached-reference.png"));
    await fs.writeFile(path.join(output, "new.jpg"), jpegFixture());
    return { stdout: eventOutput(completedEvents()) };
  } });
  const result = await harness.adapter.generate({ request: { prompt: "chair" }, referenceImages: [{ id: "curated-chair", title: "chair", mimeType: "image/png", bytes: pngFixture() }] });
  assert.equal(result.images.length, 1);
  assert.ok(result.images[0].url.startsWith("data:image/jpeg;base64,"));
});

function attachedImagePaths(args) {
  const index = args.indexOf("-i");
  if (index === -1) return [];
  const paths = [];
  for (let i = index + 1; i < args.length && !args[i].startsWith("-"); i++) paths.push(args[i]);
  return paths;
}

test("refreshed credentials persist privately without changing the host seed", async t => {
  const harness = await makeHarness(t, { onGenerate: async ({ call }) => {
    await fs.writeFile(path.join(call.options.env.CODEX_HOME, "auth.json"), JSON.stringify({ auth_mode: "chatgpt", fixture: "refreshed-private" }));
    await writeMockImage(call);
    return { stdout: eventOutput(completedEvents()) };
  } });
  await fs.writeFile(harness.adapter.authFile, JSON.stringify({ auth_mode: "chatgpt", fixture: "seed-private" }));
  harness.adapter.authCacheFile = path.join(harness.testRoot, "private-auth", "auth.json");
  const result = await harness.adapter.generate({ request: { prompt: "modern Chinese chair" } });
  assert.equal(JSON.parse(await fs.readFile(harness.adapter.authCacheFile)).fixture, "refreshed-private");
  assert.equal(JSON.parse(await fs.readFile(harness.adapter.authFile)).fixture, "seed-private");
  assert.equal((await fs.stat(harness.adapter.authCacheFile)).mode & 0o777, 0o600);
  assert.doesNotMatch(JSON.stringify(result), /refreshed-private|seed-private/);
});
