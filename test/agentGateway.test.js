const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const { createImageGateway } = require("../src/imageGateway");
const { checklistItems, parseBrief } = require("../src/design/brief");
const { findEnConcepts } = require("../src/design/concepts");

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const ARMLESS_METAL = "一把无扶手的新中式餐椅，全金属，不要木头";

// A mock OpenAI-compatible image + vision service. `review(round, body)`
// returns the reviewer's JSON (or a status code to fail with).
async function startService(t, { review, generations = [], edits = [], visionRequests = [] } = {}) {
  let round = 0;
  const server = http.createServer(async (req, res) => {
    const raw = await readBody(req);
    if (req.url === "/v1/images/generations") {
      generations.push(JSON.parse(raw.toString("utf8")));
      return sendJson(res, { data: [{ b64_json: PNG }] });
    }
    if (req.url === "/v1/images/edits") {
      edits.push(raw.toString("latin1"));
      return sendJson(res, { data: [{ b64_json: PNG }] });
    }
    if (req.url === "/v1/chat/completions") {
      round += 1;
      const body = JSON.parse(raw.toString("utf8"));
      visionRequests.push(body);
      const answer = review(round, body);
      if (typeof answer === "number") return sendJson(res, { error: { message: "unavailable" } }, answer);
      return sendJson(res, { choices: [{ message: { content: typeof answer === "string" ? answer : JSON.stringify(answer) } }] });
    }
    res.statusCode = 404;
    return res.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  return `http://127.0.0.1:${server.address().port}/v1`;
}

function gatewayFor(base, extra = {}) {
  return createImageGateway({
    defaultEngine: "imageModel",
    auto1111BaseUrl: "", auto1111Lora: "", comfyBaseUrl: "", comfyCheckpoint: "", comfyWorkflowFile: "",
    textModelEnabled: false, textModelBaseUrl: "", textModelApiKey: "", textModelName: "",
    imageModelBaseUrl: base, imageModelApiKey: "image-key", imageModelName: "image-model", imageModelSize: "1024x1024",
    visionModelBaseUrl: base, visionModelApiKey: "vision-key", visionModelName: "vision-model",
  }, extra);
}

function passingReview(text, overrides = {}) {
  const brief = parseBrief(text, { style: "newChinese" });
  return {
    requirements: checklistItems(brief).map((item) => ({ id: item.id, status: "pass", evidence: "可见" })),
    style: { status: "pass", evidence: "比例清瘦", antiqueRisk: 8, materialSwapOnly: false },
    plausibility: { status: "pass", evidence: "结构可信" },
    consistency: { status: "not_applicable" },
    score: 89,
    rubric: { cultureAccuracy: 88, structureReasoning: 90, materialCraft: 86, designInnovation: 84, sceneFit: 87, aiUsage: 92 },
    corrections: [],
    ...overrides,
  };
}

function withViolation(review, id, evidence) {
  return { ...review, requirements: review.requirements.map((item) => (item.id === id ? { ...item, status: "fail", evidence } : item)) };
}

test("a requirement violation is not outscored: the agent corrects armrests on the previous image", async (t) => {
  const generations = [];
  const edits = [];
  const visionRequests = [];
  const base = await startService(t, {
    generations,
    edits,
    visionRequests,
    review: (round) => round === 1
      ? withViolation(passingReview(ARMLESS_METAL, { score: 94 }), "prohibited:armrest", "两侧有扶手")
      : passingReview(ARMLESS_METAL, { consistency: { status: "pass", evidence: "轮廓一致", changedUnrequested: [] } }),
  });
  const gateway = gatewayFor(base);
  const result = await gateway.runAgent({ engine: "imageModel", originalPrompt: ARMLESS_METAL, prompt: "dining chair", targetScore: 85, maxRounds: 3 });

  assert.equal(result.completedRounds, 2);
  assert.equal(result.stopReason, "passed");
  assert.equal(result.rounds[0].evaluation.status, "fail");
  assert.ok(result.rounds[0].evaluation.score <= 60, "a violation caps the score");
  // The passing round wins even though the failing one claimed a higher score.
  assert.equal(result.bestRound, 2);
  // Round 1 is a fresh generation; round 2 edits round 1's image with the correction.
  assert.equal(generations.length, 1);
  assert.equal(edits.length, 1);
  assert.match(edits[0], /name="image\[\]"/);
  assert.match(edits[0], /corrections for this version: 1\) remove all armrests completely/);
  assert.match(edits[0], /previous version to edit/);
  // The reviewer compares round 2 with round 1.
  assert.equal(visionRequests[1].messages[1].content.filter((part) => part.type === "image_url").length, 2);
  // No clause of any prompt asks for wood or armrests.
  for (const prompt of [generations[0].prompt, result.rounds[1].prompt]) {
    for (const clause of prompt.split("\nAvoid:")[0].split(/,\s*|;\s*/)) {
      const asked = findEnConcepts(clause).positive;
      assert.ok(!asked.includes("wood") && !asked.includes("armrest"), clause);
    }
  }
  assert.equal(result.design.capability.provider, "imageModel");
});

test("an incomplete evaluation stops the loop and keeps the image", async (t) => {
  const base = await startService(t, { review: () => ({ score: 97 }) });
  const result = await gatewayFor(base).runAgent({ engine: "imageModel", originalPrompt: ARMLESS_METAL, prompt: "chair", maxRounds: 3 });
  assert.equal(result.completedRounds, 1);
  assert.equal(result.stopReason, "evaluation_incomplete");
  assert.equal(result.rounds[0].evaluation.status, "incomplete");
  assert.equal(result.rounds[0].evaluation.decision, "needs_review");
  assert.equal(result.rounds[0].evaluation.styleCheck.antiqueRisk, null, "unknown risk is not zero risk");
  assert.equal(result.reviewIncomplete, true);
  assert.ok(result.bestImage.url.startsWith("data:image/png"));
});

test("a reviewer network failure stops the loop, and the generated image is kept", async (t) => {
  const base = await startService(t, { review: () => 503 });
  const result = await gatewayFor(base).runAgent({ engine: "imageModel", originalPrompt: ARMLESS_METAL, prompt: "chair", maxRounds: 3 });
  assert.equal(result.stopReason, "evaluation_error");
  assert.equal(result.rounds.length, 1);
  assert.equal(result.rounds[0].evaluation.evaluationFailed, true);
  assert.ok(result.bestImage.url);
});

test("two rounds in a row without improvement stop the loop", async (t) => {
  const failing = withViolation(passingReview(ARMLESS_METAL), "material:metal", "可见木质座面");
  const base = await startService(t, { review: (round) => (round === 1 ? failing : { ...failing, consistency: { status: "pass", evidence: "一致", changedUnrequested: [] } }) });
  const result = await gatewayFor(base).runAgent({ engine: "imageModel", originalPrompt: ARMLESS_METAL, prompt: "chair", maxRounds: 3 });
  assert.equal(result.completedRounds, 3);
  assert.equal(result.stopReason, "no_improvement");
});

test("an image service failure before any image is reported, not hidden", async (t) => {
  const gateway = gatewayFor("http://127.0.0.1:9/v1");
  await assert.rejects(gateway.runAgent({ engine: "imageModel", originalPrompt: ARMLESS_METAL, prompt: "chair" }));
});

test("contradictory core requirements ask for clarification instead of generating", async (t) => {
  const base = await startService(t, { review: () => passingReview("无扶手的圈椅") });
  const gateway = gatewayFor(base);
  await assert.rejects(gateway.generate({ engine: "imageModel", originalPrompt: "无扶手的圈椅", prompt: "chair" }), (error) => {
    assert.equal(error.statusCode, 422);
    assert.deepEqual(error.details.clarification.map((item) => item.concept).sort(), ["armrest", "horseshoeBack"]);
    return true;
  });
});

test("regenerating with the same parameters sends the same prompt and the same design cues", async (t) => {
  const generations = [];
  const base = await startService(t, { generations, review: () => ({}) });
  const gateway = gatewayFor(base);
  const body = { engine: "imageModel", originalPrompt: "新中式边几，配沙发使用", prompt: "side table", style: "newChinese" };
  const first = await gateway.generate(body);
  // The page replays the final prompt; the server must rebuild the same thing.
  const second = await gateway.generate({ ...body, prompt: first.request.prompt });
  assert.equal(second.request.prompt, first.request.prompt);
  assert.equal(second.request.styleGuidance.designMove, first.request.styleGuidance.designMove);
  assert.equal(second.request.styleGuidance.expression, first.request.styleGuidance.expression);
  assert.ok(first.request.prompt.includes(first.request.styleGuidance.expression.replace(/^optional traditional technique: /, "")));
});

test("contemporary Song-inspired briefs get their own direction, not Ming reproduction cues", async (t) => {
  const base = await startService(t, { review: () => ({}) });
  const result = await gatewayFor(base).generate({ engine: "imageModel", originalPrompt: "当代宋式书桌，适合小书房", prompt: "desk", style: "song" });
  const { direction } = result.design;
  assert.equal(direction.style, "song");
  assert.ok(direction.expression.cues.every((cue) => cue.id.startsWith("song-")));
  assert.match(result.request.prompt, /contemporary Song-inspired furniture/);
  assert.match(result.request.negativePrompt, /Ming or Qing reproduction/);
  assert.doesNotMatch(result.request.prompt, /horse-?hoof|horseshoe|waist/i);
});

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function sendJson(res, payload, statusCode = 200) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}
