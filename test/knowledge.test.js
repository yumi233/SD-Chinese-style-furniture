const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const knowledge = require("../src/knowledge");
const { STYLE_PROFILES, describeModernity } = require("../src/knowledge/styleProfiles");
const { guardPrompt, mergeNegativePrompt } = require("../src/knowledge/promptGuard");
const { retrieveKnowledge, getReferenceCases, KIND_LABELS } = require("../src/referenceKnowledge");
const { normalizeEvaluation, ANTIQUE_SCORE_CAP } = require("../src/providers/visionModel");
const { createImageGateway } = require("../src/imageGateway");
const { summarize } = require("../scripts/evalStyle");

test("knowledge entries are complete, unique and cite https sources", () => {
  const ids = new Set();
  for (const entry of knowledge.entries) {
    assert.ok(!ids.has(entry.id), `duplicate id ${entry.id}`);
    ids.add(entry.id);
    assert.ok(KIND_LABELS[entry.kind], `${entry.id} has unknown kind ${entry.kind}`);
    assert.ok(entry.title && entry.summary, `${entry.id} needs a title and summary`);
    assert.ok(entry.keywords.length > 0, `${entry.id} needs keywords`);
    for (const style of entry.styles) assert.ok(STYLE_PROFILES[style], `${entry.id} has unknown style ${style}`);
    for (const source of entry.sources) assert.match(source.url, /^https:\/\//, `${entry.id} source must be https`);
  }
  assert.ok(knowledge.entries.length >= 150);
  for (const entry of knowledge.entries.filter((item) => item.kind === "method" && item.fits)) {
    assert.ok(entry.promptHints.length, `${entry.id} needs a prompt hint`);
  }
});

test("new Chinese retrieval always mixes a cue, a method, a material and an anti-pattern", () => {
  const cases = retrieveKnowledge("为年轻人公寓设计一把圈椅", { style: "newChinese" });
  const kinds = new Set(cases.map((item) => item.kind));
  for (const kind of ["gene", "method", "material", "antiPattern"]) assert.ok(kinds.has(kind), `missing ${kind}`);
  assert.ok(cases.some((item) => item.id === "gene-continuous-rail"));
  assert.ok(cases.some((item) => item.id === "scene-young-apartment"));
  assert.ok(cases.length <= 7);
  assert.equal(cases[0].id, "gene-continuous-rail");
  assert.ok(getReferenceCases({ style: "ming" }).every((item) => item.styles.includes("ming")));
});

test("prompt guard strips antique terms and keeps the style anchor exactly once", () => {
  const first = guardPrompt("Ming-style antique armchair, ornately carved back, dragon motif, light ash", { style: "newChinese", modernity: 80 });
  assert.doesNotMatch(first.prompt, /antique|Ming-style|carved|dragon/i);
  assert.match(first.prompt, /^contemporary new Chinese furniture design, /);
  assert.match(first.prompt, new RegExp(describeModernity(80).hint));
  assert.deepEqual(first.removed.map((item) => item.toLowerCase()), ["antique", "ming-style", "ornately carved", "dragon"]);
  const second = guardPrompt(first.prompt, { style: "newChinese" });
  assert.equal(second.prompt, first.prompt);
  assert.equal(guardPrompt("Ming-style chair", { style: "ming" }).prompt, "Ming-style chair");
});

test("style negatives are merged without duplicates", () => {
  const merged = mergeNegativePrompt("blurry, Antique", "newChinese").split(", ");
  assert.equal(merged.filter((item) => item.toLowerCase() === "antique").length, 1);
  assert.ok(merged.includes("ornate carving"));
});

test("an antique-looking result cannot pass in new Chinese mode", () => {
  const raw = { score: 92, styleCheck: { antiqueRisk: 75, keptCues: ["圈椅线"], antiqueSignals: ["深色红木", "雕花"] }, problems: ["靠背过高"] };
  const newChinese = normalizeEvaluation(raw, "prompt", [], { style: "newChinese" });
  assert.equal(newChinese.score, ANTIQUE_SCORE_CAP);
  assert.equal(newChinese.decision, "revise");
  assert.match(newChinese.problems[0], /古董化.*深色红木/);
  assert.equal(newChinese.styleCheck.tooAntique, true);

  const ming = normalizeEvaluation(raw, "prompt", [], { style: "ming" });
  assert.equal(ming.score, 92);
  assert.equal(ming.styleCheck, undefined);
});

test("text and vision models receive the style rules and retrieved knowledge", async (t) => {
  const chats = [];
  const server = http.createServer(async (req, res) => {
    const body = await readJson(req);
    if (req.url === "/v1/chat/completions") {
      chats.push(body);
      const isVision = Array.isArray(body.messages[1].content);
      const content = isVision
        ? JSON.stringify({ score: 88, rubric: {}, styleCheck: { antiqueRisk: 20, keptCues: ["连续椅圈线"], antiqueSignals: [] }, revisedPrompt: "antique replica chair, light ash" })
        : "light ash chair with a single continuous bent rail";
      return sendJson(res, { choices: [{ message: { content } }] });
    }
    if (req.url === "/v1/images/generations") return sendJson(res, { data: [{ b64_json: "aW1n" }] });
    res.statusCode = 404;
    return res.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/v1`;
  const gateway = createImageGateway({
    defaultEngine: "imageModel",
    auto1111BaseUrl: "", comfyBaseUrl: "",
    textModelEnabled: true, textModelBaseUrl: base, textModelName: "text", textModelApiKey: "k",
    imageModelBaseUrl: base, imageModelName: "image", imageModelApiKey: "k",
    visionModelBaseUrl: base, visionModelName: "vision", visionModelApiKey: "k",
  });

  const result = await gateway.runAgent({ originalPrompt: "年轻人公寓的圈椅", prompt: "round-back armchair", style: "newChinese", modernity: 80, maxRounds: 2, targetScore: 95 });

  const [textCall, visionCall] = chats;
  assert.match(textCall.messages[0].content, /not antique Chinese furniture/);
  assert.match(textCall.messages[1].content, /Design knowledge:\n.*一笔连续的椅圈线/s);
  assert.match(textCall.messages[1].content, /balance: 80\/100/);
  assert.match(visionCall.messages[0].content, /styleCheck/);
  assert.match(visionCall.messages[1].content[0].text, /Style: 新中式/);
  assert.equal(result.rounds[0].evaluation.styleCheck.antiqueRisk, 20);
  // The reviewer's revised prompt asked for an antique replica; round two must not.
  const secondPrompt = result.rounds[1].prompt;
  assert.doesNotMatch(secondPrompt, /antique|replica/i);
  assert.match(secondPrompt, /^contemporary new Chinese furniture design/);
});

test("style evaluation summary reports the antique rate", () => {
  const summary = summarize([
    { firstAntique: true, bestAntique: false, firstRisk: 70, bestScore: 80 },
    { firstAntique: false, bestAntique: false, firstRisk: 30, bestScore: 90 },
    { error: "timeout" },
  ]);
  assert.deepEqual(summary, { total: 3, failed: 1, firstAntiqueRate: 0.5, bestAntiqueRate: 0, averageRisk: 50, averageScore: 85 });
});

function readJson(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => resolve(data ? JSON.parse(data) : {}));
  });
}

function sendJson(res, value) {
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(value));
}

test("each furniture family gets a concrete traditional cue", () => {
  const { pickCues } = require("../src/knowledge/cuePicker");
  assert.equal(pickCues("新中式边几，配沙发使用").family, "table");
  assert.equal(pickCues("新中式吧台椅，用在茶饮店").family, "seat");
  assert.equal(pickCues("新中式床头柜，胡桃木").family, "cabinet");
  assert.equal(pickCues("新中式长凳").family, "bench");
  assert.equal(pickCues("新中式官帽椅的当代版本").cues[0].id, "form-official-hat-chair");
  // Subtle cues read as plain modern design, so they are never the only cue.
  for (const brief of ["新中式茶桌", "新中式边几", "新中式书桌", "新中式长凳", "新中式休闲躺椅"]) {
    assert.ok(!["gene-recessed-legs", "gene-waist"].includes(pickCues(brief).cues[0].id), brief);
  }
  assert.equal(pickCues("新中式茶室里的主人椅", { count: 2 }).cues.length, 2);
  const guarded = guardPrompt("contemporary new Chinese furniture design, side table", { style: "newChinese", cueText: "新中式边几" });
  assert.match(guarded.prompt, /clearly recognisable traditional chinese cue: /);
  assert.equal(guardPrompt(guarded.prompt, { style: "newChinese", cueText: "新中式边几" }).prompt, guarded.prompt);
  assert.equal(guardPrompt("Ming-style side table", { style: "ming" }).cues.length, 0);
});

test("a result with no visible Chinese cue is sent back as too generic", () => {
  const { GENERIC_SCORE_CAP } = require("../src/providers/visionModel");
  const generic = normalizeEvaluation({ score: 90, styleCheck: { antiqueRisk: 3, chineseCue: false, keptCues: [] } }, "p", [], { style: "newChinese" });
  assert.equal(generic.score, GENERIC_SCORE_CAP);
  assert.equal(generic.decision, "revise");
  assert.equal(generic.styleCheck.tooGeneric, true);
  assert.match(generic.problems[0], /普通现代家具/);
  const good = normalizeEvaluation({ score: 90, styleCheck: { antiqueRisk: 3, chineseCue: true, keptCues: ["缩进的腿足"] } }, "p", [], { style: "newChinese" });
  assert.equal(good.score, 90);
  assert.equal(good.styleCheck.tooGeneric, false);
});

test("new Chinese prompts get a form move, and a material swap alone is sent back", () => {
  const guarded = guardPrompt("contemporary new Chinese furniture design, chair", { style: "newChinese", modernity: 60, cueText: "新中式茶室里的主人椅" });
  assert.match(guarded.prompt, /design move: /);
  assert.ok(guarded.move && guarded.move.id.startsWith("move-"));
  assert.notEqual(guarded.move.id, "move-material-contrast");
  const traditional = guardPrompt("contemporary new Chinese furniture design, chair", { style: "newChinese", modernity: 20, cueText: "新中式主人椅" });
  assert.doesNotMatch(traditional.prompt, /design move: /);
  assert.equal(traditional.cues.length, 2);

  const { MATERIAL_SWAP_SCORE_CAP } = require("../src/providers/visionModel");
  const swapped = normalizeEvaluation({ score: 92, styleCheck: { antiqueRisk: 10, chineseCue: true, keptCues: ["圈椅线"], materialSwapOnly: true } }, "p", [], { style: "newChinese" });
  assert.equal(swapped.score, MATERIAL_SWAP_SCORE_CAP);
  assert.equal(swapped.decision, "revise");
  assert.match(swapped.problems[0], /只是换了材料/);
});
