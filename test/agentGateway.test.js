const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const { createImageGateway } = require("../src/imageGateway");

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
              score: 74,
              structureScore: 70,
              materialScore: 78,
              styleScore: 76,
              problems: ["扶手连接不自然"],
              suggestion: "强化轻巧比例和合理榫卯连接",
              revisedPrompt: "revised furniture prompt",
            }
          : {
              score: 89,
              rubric: {
                cultureAccuracy: 91,
                structureReasoning: 90,
                materialCraft: 88,
                designInnovation: 84,
                sceneFit: 87,
                aiUsage: 95,
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
        choices: [{ message: { content: JSON.stringify(evaluation) } }],
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
    maxRounds: 2,
    size: 512,
  });

  assert.equal(result.completedRounds, 2);
  assert.equal(result.bestScore, 89);
  assert.equal(result.bestRound, 2);
  assert.equal(result.rounds.length, 2);
  assert.equal(result.bestEvaluation.rubric.cultureAccuracy, 91);
  assert.deepEqual(result.bestEvaluation.learningFeedback.nextSteps, ["继续优化空间尺度"]);
  assert.ok(result.referenceCases.some((item) => item.title === "明式圈椅"));
  assert.deepEqual(generationPrompts, [
    "initial furniture prompt",
    "revised furniture prompt",
  ]);
  assert.equal(visionRequests.length, 2);
  assert.equal(visionRequests[0].model, "vision-model");
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
