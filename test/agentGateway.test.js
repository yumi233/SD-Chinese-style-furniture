const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const { createImageGateway } = require("../src/imageGateway");
const { normalizeEvaluation, VisionModelAdapter } = require("../src/providers/visionModel");
const { designDirection, photographyDirection } = require("../src/lib/designDirection");
const { matchReferenceCases, formatReferenceContext } = require("../src/referenceKnowledge");

const visibleJoint = {
  position: "armrest at the front post",
  formChange: "oversized exposed wedge projecting through the post",
  visibleUse: "wedge locks the armrest to the post",
};
const whiteProduct = { whiteBackdrop: true, propFree: true, furnitureFullyVisible: true };

test("agent generates, visually evaluates, revises, and selects the best round", async (t) => {
  const generationPrompts = [];
  const visionRequests = [];
  let evaluationRound = 0;

  const server = http.createServer(async (req, res) => {
    const body = await readJson(req);

    if (req.url === "/sdapi/v1/txt2img") {
      generationPrompts.push(body.prompt);
      return sendJson(res, {
        images: [Buffer.from(`round-${generationPrompts.length}`).toString("base64")],
        info: "{}",
      });
    }

    if (req.url === "/v1/chat/completions") {
      evaluationRound += 1;
      visionRequests.push(body);
      const evaluation =
        evaluationRound === 1
          ? {
              score: 98,
              decision: "pass",
              antiqueLook: true,
              rubric: { contemporaneity: 24 },
              structureScore: 70,
              materialScore: 78,
              styleScore: 76,
              problems: ["扶手连接不自然"],
              suggestion: "强化轻巧比例和合理榫卯连接",
              revisedPrompt: "revised furniture prompt",
            }
          : evaluationRound === 2 ? {
              score: 97,
              decision: "pass",
              antiqueLook: false,
              highlight: "",
              rubric: { contemporaneity: 92, designInnovation: 88 },
              revisedPrompt: "Expose one working wedge joint at the armrest connection",
            } : {
              score: 89,
              antiqueLook: false,
              decision: "pass",
              highlight: "  楔榫外露，\n 把扶手固定在椅柱上。  ",
              highlightEvidence: visibleJoint,
              rubric: {
                cultureAccuracy: 91,
                structureReasoning: 90,
                materialCraft: 88,
                designInnovation: 84,
                sceneFit: 87,
                aiUsage: 95,
                contemporaneity: 88,
              },
              structureScore: 90,
              materialScore: 88,
              styleScore: 89,
              problems: [],
              suggestion: "结构与材质已达到目标",
              learningFeedback: {
                strengths: ["明式比例较清楚"],
                issues: [],
                nextSteps: ["继续优化空间尺度"],
              },
              revisedPrompt: "final furniture prompt",
            };
      return sendJson(res, {
        choices: [{ message: { content: JSON.stringify({ productPresentation: whiteProduct, ...evaluation }) } }],
        usage: { total_tokens: 120 },
      });
    }

    res.statusCode = 404;
    return res.end();
  });

  await listen(server);
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const gateway = createImageGateway({
    defaultEngine: "automatic1111",
    auto1111BaseUrl: baseUrl,
    auto1111Lora: "",
    comfyBaseUrl: baseUrl,
    comfyCheckpoint: "",
    comfyWorkflowFile: "",
    textModelEnabled: false,
    textModelBaseUrl: "",
    textModelApiKey: "",
    textModelName: "",
    imageModelBaseUrl: "",
    imageModelApiKey: "",
    imageModelName: "",
    imageModelSize: "1024x1024",
    visionModelBaseUrl: `${baseUrl}/v1`,
    visionModelApiKey: "vision-key",
    visionModelName: "vision-model",
  });

  const result = await gateway.runAgent({
    engine: "automatic1111",
    originalPrompt: "设计一张黑胡桃木明式圈椅",
    prompt: "initial furniture prompt",
    negativePrompt: "deformed",
    targetScore: 85,
    maxRounds: 3,
    size: 512,
  });

  assert.equal(result.completedRounds, 3);
  assert.equal(result.bestScore, 89);
  assert.equal(result.bestRound, 3);
  assert.equal(result.rounds.length, 3);
  assert.equal(result.rounds[0].evaluation.decision, "revise");
  assert.equal(result.rounds[0].evaluation.antiqueLook, true);
  assert.equal(result.rounds[1].evaluation.decision, "revise");
  assert.equal(result.rounds[1].evaluation.rubric.designInnovation, 49);
  assert.equal(result.bestEvaluation.highlight, "楔榫外露， 把扶手固定在椅柱上。");
  assert.deepEqual(result.bestEvaluation.highlightEvidence, visibleJoint);
  assert.equal(result.bestEvaluation.rubric.contemporaneity, 88);
  assert.equal(result.bestEvaluation.antiqueLook, false);
  assert.equal(result.bestEvaluation.rubric.cultureAccuracy, 91);
  assert.deepEqual(result.bestEvaluation.learningFeedback.nextSteps, ["继续优化空间尺度"]);
  assert.ok(result.referenceCases.some((item) => item.title === "明式圈椅"));
  assert.deepEqual(generationPrompts, [
    "initial furniture prompt",
    "revised furniture prompt",
    "Expose one working wedge joint at the armrest connection",
  ].map(prompt => [prompt, designDirection("newChinese", photographyDirection("设计一张黑胡桃木明式圈椅"))].join("\n")));
  assert.equal(visionRequests.length, 3);
  assert.equal(visionRequests[0].model, "vision-model");
  assert.match(visionRequests[0].messages[0].content, /"contemporaneity":0/);
  assert.match(visionRequests[0].messages[0].content, /"antiqueLook":false/);
  assert.match(visionRequests[0].messages[0].content, /"highlight":""/);
  assert.match(visionRequests[0].messages[1].content[0].text, /Reference cases:/);
  assert.match(visionRequests[0].messages[1].content[0].text, /明式圈椅/);
  assert.equal(
    visionRequests[0].messages[1].content[1].image_url.url,
    `data:image/png;base64,${Buffer.from("round-1").toString("base64")}`,
  );
  const publicConfig = gateway.getConfig();
  assert.equal(publicConfig.visionModelApiKeyConfigured, true);
  assert.equal(Object.hasOwn(publicConfig, "visionModelApiKey"), false);
});

test("rubric normalizes contemporaneity and leaves unavailable legacy data absent", () => {
  const legacy = normalizeEvaluation({ score: 89, style: 91, structure: 81 }, "chair");
  assert.equal(legacy.rubric.cultureAccuracy, 91);
  assert.equal(legacy.structureScore, 81);
  assert.equal(legacy.revisedPrompt, "chair");
  assert.equal(legacy.antiqueLook, undefined);
  assert.equal(Object.hasOwn(legacy, "highlight"), false);
  assert.equal(legacy.rubric.contemporaneity, undefined);
  assert.equal(normalizeEvaluation({ rubric: { contemporaneity: "114" } }).rubric.contemporaneity, 100);
  assert.equal(normalizeEvaluation({ rubric: { contemporaneity: -1, aiUsage: 80 } }).score, 40);
});

test("non-text and blank highlights normalize to an actionable revision", () => {
  for (const highlight of [null, {}, "  \n "]) {
    const result = normalizeEvaluation({ score: 92, highlight, revisedPrompt: "oak chair", decision: "pass" }, "oak chair");
    assert.equal(result.highlight, "");
    assert.equal(result.decision, "revise");
    assert.equal(result.rubric.designInnovation, 49);
    assert.match(result.revisedPrompt, /^oak chair\n.*exactly one memorable design feature/);
  }
});

test("live HTTP reviews reject missing highlights and flag an unknown antique verdict", async (t) => {
  let reply = { score: 95, antiqueLook: false, decision: "pass", highlightEvidence: visibleJoint, productPresentation: whiteProduct, rubric: { designInnovation: 94 } };
  const server = http.createServer((req, res) => sendJson(res, {
    choices: [{ message: { content: JSON.stringify(reply) } }],
  }));
  await listen(server);
  t.after(() => server.close());
  const adapter = new VisionModelAdapter({ baseUrl: "http://127.0.0.1:" + server.address().port, model: "mock" });
  const input = { imageUrl: "data:image/png;base64,eA==", prompt: "oak chair" };
  const missing = await adapter.evaluate(input);
  assert.equal(missing.highlight, "");
  assert.equal(missing.rubric.designInnovation, 49);
  assert.equal(missing.decision, "revise");
  reply = { ...reply, highlight: "A slot could open a drawer", highlightEvidence: { ...visibleJoint, visibleUse: " " } };
  const unsupported = await adapter.evaluate(input);
  assert.equal(unsupported.highlight, "");
  assert.equal(unsupported.rubric.designInnovation, 49);
  assert.equal(unsupported.decision, "revise");
  reply.highlightEvidence = visibleJoint;
  for (const antiqueLook of [undefined, "false"]) {
    reply = { ...reply, highlight: "Shaped arm support", antiqueLook };
    const incomplete = await adapter.evaluate(input);
    assert.equal(incomplete.evaluationFailed, true);
    assert.equal(incomplete.decision, "needs_review");
    assert.equal(incomplete.antiqueLook, undefined);
  }
});

test("live vision review requires a white backdrop, no props and the entire furniture", async t => {
  const specificCorrection = {
    whiteBackdrop: /Replace the entire existing backdrop/,
    propFree: /Remove all unrelated objects/,
    furnitureFullyVisible: /Reframe to show every edge/,
  };
  for (const key of Object.keys(whiteProduct)) {
    const result = await runMockReviews(t, [{
      score: 97, antiqueLook: false, decision: "pass", rubric: { sceneFit: 99 },
      productPresentation: { ...whiteProduct, [key]: false },
    }]);
    const evaluation = result.bestEvaluation;
    assert.equal(evaluation.productPresentation[key], false);
    assert.equal(evaluation.decision, "revise");
    assert.equal(evaluation.rubric.sceneFit, 49);
    assert.match(evaluation.revisedPrompt, /seamless pure white studio backdrop/);
    assert.match(evaluation.revisedPrompt, /Do not depict a room, windows, plants, rugs, tableware, books or other props/);
    assert.match(evaluation.revisedPrompt, specificCorrection[key]);
  }
  const unknown = await runMockReviews(t, [{ score: 97, antiqueLook: false, decision: "pass", productPresentation: undefined }]);
  assert.equal(unknown.reviewIncomplete, true);
  assert.equal(unknown.bestEvaluation.decision, "needs_review");
});

test("best round prefers an approved design over a higher score marked for revision", async (t) => {
  const result = await runMockReviews(t, [
    { score: 95, antiqueLook: false, decision: "revise" },
    { score: 90, antiqueLook: false, decision: "pass" },
  ]);
  assert.equal(result.bestRound, 2);
  assert.equal(result.bestScore, 90);
  assert.deepEqual(result.rounds.map(row => row.evaluation.decision), ["revise", "pass"]);
  assert.deepEqual(result.rounds.map(row => row.image.url), ["data:image/png;base64,cm91bmQtMQ==", "data:image/png;base64,cm91bmQtMg=="]);
});

test("last antique round keeps its picture and revision guidance even when another round is best", async (t) => {
  const result = await runMockReviews(t, [
    { score: 95, antiqueLook: true, decision: "pass" },
    { score: 90, antiqueLook: true, decision: "pass", revisedPrompt: "Give the same joint a freshly finished surface" },
  ]);
  assert.equal(result.bestRound, 1);
  assert.equal(result.bestEvaluation.decision, "revise");
  const last = result.rounds.at(-1);
  assert.equal(last.round, 2);
  assert.equal(last.evaluation.decision, "revise");
  assert.equal(last.evaluation.antiqueLook, true);
  assert.equal(last.evaluation.revisedPrompt, "Give the same joint a freshly finished surface");
  assert.equal(last.image.url, "data:image/png;base64,cm91bmQtMg==");
});

async function runMockReviews(t, reviews) {
  let generated = 0;
  let reviewed = 0;
  const server = http.createServer((req, res) => {
    if (req.url === "/sdapi/v1/txt2img") {
      return sendJson(res, { images: [Buffer.from("round-" + ++generated).toString("base64")] });
    }
    const evaluation = { highlight: "An exposed armrest wedge locks the post", highlightEvidence: visibleJoint, productPresentation: whiteProduct, ...reviews[reviewed++] };
    return sendJson(res, { choices: [{ message: { content: JSON.stringify(evaluation) } }] });
  });
  await listen(server);
  t.after(() => server.close());
  const url = "http://127.0.0.1:" + server.address().port;
  return createImageGateway({ defaultEngine: "automatic1111", auto1111BaseUrl: url, comfyBaseUrl: url, visionModelBaseUrl: url + "/v1", visionModelName: "mock" })
    .runAgent({ prompt: "oak chair", maxRounds: reviews.length });
}

test("traditional chair, table and cabinet briefs retrieve contemporary translations without draft prose", () => {
  for (const [brief, id] of [
    ["明式圈椅，扶手与靠背", "contemporary-circle-chair"],
    ["夹头榫长案", "contemporary-recessed-leg-table"],
    ["格栅门收纳柜", "contemporary-rounded-cabinet"],
  ]) {
    const references = matchReferenceCases(brief);
    const reference = references.find(item => item.id === id);
    assert.ok(reference);
    for (const field of ["title", "titleTw", "titleEn", "teachingPoint", "teachingPointTw", "teachingPointEn"]) {
      assert.equal(typeof reference[field], "string");
      assert.ok(reference[field].trim());
    }
    assert.match(formatReferenceContext(references), /当代转译/);
    assert.doesNotMatch(JSON.stringify(references), /TODO_TEXT/);
    assert.doesNotMatch(formatReferenceContext(references), /TODO_TEXT|undefined/);
  }
});

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
