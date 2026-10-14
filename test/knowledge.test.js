const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const knowledge = require("../src/knowledge");
const { STYLE_PROFILES } = require("../src/knowledge/styleProfiles");
const { retrieveKnowledge, getReferenceCases, KIND_LABELS } = require("../src/referenceKnowledge");
const { pickCues, pickMove } = require("../src/knowledge/cuePicker");
const { checklistItems, parseBrief } = require("../src/design/brief");
const { establishDirection } = require("../src/design/direction");
const { composeNegative, composePrompt } = require("../src/design/composer");
const { normalizeCriteria, STYLE_FAIL_SCORE_CAP } = require("../src/design/evaluation");
const { stableHash } = require("../src/design/hash");
const { createImageGateway } = require("../src/imageGateway");
const { rowFromResult, summarize } = require("../scripts/evalStyle");

function passing(brief, style = {}) {
  return {
    requirements: checklistItems(brief).map((item) => ({ id: item.id, status: "pass", evidence: "可见" })),
    style: { status: "pass", evidence: "x", antiqueRisk: 10, materialSwapOnly: false, ...style },
    plausibility: { status: "pass", evidence: "x" },
    score: 90,
  };
}

test("knowledge entries are complete, unique, cite https sources and say whether they are sourced", () => {
  const ids = new Set();
  for (const entry of knowledge.entries) {
    assert.ok(!ids.has(entry.id), `duplicate id ${entry.id}`);
    ids.add(entry.id);
    assert.ok(KIND_LABELS[entry.kind], `${entry.id} has unknown kind ${entry.kind}`);
    assert.ok(entry.title && entry.summary, `${entry.id} needs a title and summary`);
    assert.ok(entry.keywords.length > 0, `${entry.id} needs keywords`);
    for (const style of entry.styles) assert.ok(STYLE_PROFILES[style], `${entry.id} has unknown style ${style}`);
    for (const source of entry.sources) assert.match(source.url, /^https:\/\//, `${entry.id} source must be https`);
    assert.ok(["sourced", "heuristic"].includes(entry.evidence), entry.id);
    // An unsourced entry is labelled a heuristic, never presented as fact.
    if (!entry.sources.length) assert.equal(entry.evidence, "heuristic", entry.id);
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
  assert.ok(cases.length <= 7);
  assert.ok(getReferenceCases({ style: "ming" }).every((item) => item.styles.includes("ming")));
});

test("issue 1: a negated or prohibited feature never becomes the required cue", () => {
  const brief = parseBrief("一把无扶手的新中式餐椅，不要像圈椅", { style: "newChinese" });
  assert.deepEqual(brief.prohibitions.map((item) => item.concept).sort(), ["armrest", "horseshoeBack", "officialHat"]);
  assert.doesNotMatch(brief.positiveText, /圈椅/);
  for (let variation = 0; variation < 8; variation += 1) {
    const direction = establishDirection(parseBrief(`一把无扶手的新中式餐椅，不要像圈椅，第${variation}版`, { style: "newChinese" }), { style: "newChinese" });
    const ids = direction.expression.cues.map((cue) => cue.id);
    assert.ok(!ids.includes("gene-continuous-rail") && !ids.includes("form-official-hat-chair"), ids.join());
  }
  // Without the negation the same words do pick the rail.
  assert.equal(pickCues("新中式圈椅").cues[0].id, "gene-continuous-rail");
});

test("issue 2: regenerating rebuilds the same prompt and the same cues from the locked direction", () => {
  const brief = parseBrief("新中式边几，配沙发使用", { style: "newChinese" });
  const direction = establishDirection(brief, { style: "newChinese" });
  const first = composePrompt({ brief, direction, draft: "side table, high resolution" });
  const again = composePrompt({ brief, direction: establishDirection(brief, { style: "newChinese" }), draft: first.prompt });
  assert.equal(again.prompt, first.prompt);
  assert.equal(first.prompt.match(/traditional technique/g).length, 1);
  assert.ok(first.prompt.includes(direction.expression.hint));
});

test("issue 3: method selection uses a stable hash that does not overflow on long prompts", () => {
  const long = `新中式长凳${"，适合年轻人公寓".repeat(80)}`;
  assert.ok(Number.isFinite(stableHash(long)) && stableHash(long) > 0);
  const moves = new Set();
  for (let index = 0; index < 30; index += 1) moves.add(pickMove(`${long}${index}`, { seedKey: `${long}${index}` }).id);
  assert.ok(moves.size >= 3, `only ${moves.size} distinct moves`);
  assert.equal(stableHash("同样的需求"), stableHash("同样的需求"));
});

test("issue 4: missing style-check fields make the evaluation incomplete, never a pass", () => {
  const brief = parseBrief("新中式茶桌", { style: "newChinese" });
  const full = passing(brief);
  assert.equal(normalizeCriteria(full, { brief, style: "newChinese" }).status, "pass");
  const { antiqueRisk, ...styleWithoutRisk } = full.style;
  for (const raw of [{ score: 95 }, { ...full, style: styleWithoutRisk }, { ...full, style: undefined }, { ...full, plausibility: undefined }, { ...full, requirements: [] }]) {
    const evaluation = normalizeCriteria(raw, { brief, style: "newChinese" });
    assert.equal(evaluation.status, "incomplete");
    assert.notEqual(evaluation.decision, "pass");
  }
  assert.equal(normalizeCriteria({ ...full, style: styleWithoutRisk }, { brief, style: "newChinese" }).styleCheck.antiqueRisk, null);
});

test("issue 5: the evaluation summary separates failures and never reads unknown risk as zero", () => {
  const unknown = rowFromResult("a", { rounds: [{ evaluation: { evaluationFailed: true } }], bestEvaluation: null, bestScore: null });
  const incomplete = rowFromResult("b", { rounds: [{ evaluation: { status: "incomplete", styleCheck: { antiqueRisk: null } } }], bestEvaluation: { status: "incomplete", styleCheck: { antiqueRisk: null } } });
  const antique = rowFromResult("c", { rounds: [{ evaluation: { status: "revise", styleCheck: { antiqueRisk: 75 } } }], bestEvaluation: { status: "revise", styleCheck: { antiqueRisk: 75 }, counts: { requirementViolations: 0, styleMismatch: true } }, bestScore: 70 });
  const violation = rowFromResult("d", { rounds: [{ evaluation: { status: "fail", styleCheck: { antiqueRisk: 10 } } }], bestEvaluation: { status: "fail", styleCheck: { antiqueRisk: 10 }, counts: { requirementViolations: 2, styleMismatch: false } }, bestScore: 60 });
  const summary = summarize([unknown, incomplete, antique, violation, { brief: "e", error: "timeout" }]);
  assert.equal(summary.generationFailures, 1);
  assert.equal(summary.evaluationFailures, 1);
  assert.equal(summary.incompleteEvaluations, 1);
  assert.equal(summary.requirementViolations, 1);
  assert.equal(summary.styleMismatches, 1);
  assert.equal(summary.unknownRisk, 2);
  assert.equal(summary.knownRisk, 2);
  assert.equal(summary.firstAntiqueRate, 0.5, "rate over the two rows with a known risk");
  assert.equal(summarize([unknown, incomplete]).firstAntiqueRate, null, "no known risk means no rate, not 0%");
});

test("drafts lose banned style words and anything that conflicts with the brief", () => {
  const brief = parseBrief("新中式单椅，全金属，不要木头", { style: "newChinese" });
  const direction = establishDirection(brief, { style: "newChinese" });
  const result = composePrompt({ brief, direction, draft: "Ming-style antique armchair, ornately carved back, dragon motif, light ash, walnut seat, high resolution" });
  const draftPart = result.prompt.split(", ").slice(-6).join(", ");
  assert.doesNotMatch(draftPart, /antique|Ming-style|ornately carved/i);
  assert.ok(result.removed.some((item) => /walnut/.test(item.text)));
  assert.equal(result.prompt.match(/contemporary new Chinese furniture design/g).length, 1);
  assert.deepEqual(result.conflicts, []);
  // The Ming style keeps its own vocabulary.
  const ming = parseBrief("明式椅子", { style: "ming" });
  assert.match(composePrompt({ brief: ming, direction: establishDirection(ming, { style: "ming" }), draft: "Ming-style chair" }).prompt, /Ming-style chair/);
});

test("style negatives are merged once, and a preset may not forbid what the user asked for", () => {
  const brief = parseBrief("新中式红木茶桌", { style: "newChinese" });
  const direction = establishDirection(brief, { style: "newChinese" });
  const negative = composeNegative({ brief, direction, negativeDraft: "blurry, Antique", required: new Set(["wood"]) });
  assert.equal(negative.terms.filter((term) => term.toLowerCase() === "antique").length, 1);
  assert.ok(!negative.terms.includes("heavy dark rosewood"));
  assert.ok(negative.removed.some((item) => item.text === "heavy dark rosewood"));
});

test("antique drift, a material swap or a style failure send the result back", () => {
  const brief = parseBrief("新中式茶桌", { style: "newChinese" });
  for (const style of [{ antiqueRisk: 75 }, { materialSwapOnly: true }, { status: "fail", evidence: "像普通现代家具" }]) {
    const evaluation = normalizeCriteria(passing(brief, style), { brief, style: "newChinese" });
    assert.equal(evaluation.status, "revise");
    assert.ok(evaluation.score <= STYLE_FAIL_SCORE_CAP);
  }
  const ming = parseBrief("明式椅子", { style: "ming" });
  const evaluation = normalizeCriteria({ ...passing(ming), style: { status: "pass", evidence: "x" } }, { brief: ming, style: "ming" });
  assert.equal(evaluation.status, "pass");
  assert.equal(evaluation.styleCheck, null);
});

test("each furniture family gets a concrete traditional cue, and a symbol is optional", () => {
  assert.equal(pickCues("新中式边几，配沙发使用").family, "table");
  assert.equal(pickCues("新中式吧台椅，用在茶饮店").family, "seat");
  assert.equal(pickCues("新中式床头柜，胡桃木").family, "cabinet");
  assert.equal(pickCues("新中式长凳").family, "bench");
  assert.equal(pickCues("新中式官帽椅的当代版本").cues[0].id, "form-official-hat-chair");
  for (const brief of ["新中式茶桌", "新中式边几", "新中式书桌", "新中式长凳", "新中式休闲躺椅"]) {
    assert.ok(!["gene-recessed-legs", "gene-waist"].includes(pickCues(brief).cues[0].id), brief);
  }
  assert.equal(pickCues("新中式茶室里的主人椅", { count: 2 }).cues.length, 2);
  const brief = parseBrief("新中式茶桌", { style: "newChinese" });
  const proportionOnly = establishDirection(brief, { style: "newChinese", mode: "proportion" });
  assert.equal(proportionOnly.expression.kind, "proportion");
  assert.match(composePrompt({ brief, direction: proportionOnly }).prompt, /no traditional symbol required/);
  const traditional = establishDirection(parseBrief("新中式主人椅"), { style: "newChinese", modernity: 20 });
  assert.equal(traditional.expression.cues.length, 2);
  assert.equal(traditional.move, null);
  assert.ok(establishDirection(parseBrief("新中式主人椅"), { style: "newChinese", modernity: 60 }).move.id.startsWith("move-"));
});

test("the text model and the reviewer get the brief; a rewrite cannot reintroduce prohibited items", async (t) => {
  const chats = [];
  const generations = [];
  const server = http.createServer(async (req, res) => {
    const body = await readJson(req);
    if (req.url === "/v1/chat/completions") {
      chats.push(body);
      const isVision = Array.isArray(body.messages[1].content);
      if (!isVision) return sendJson(res, { choices: [{ message: { content: "antique replica walnut armchair with armrests, light ash, high resolution" } }] });
      const brief = parseBrief("一把无扶手的新中式餐椅，全金属，不要木头", { style: "newChinese" });
      return sendJson(res, { choices: [{ message: { content: JSON.stringify(passing(brief)) } }] });
    }
    if (req.url === "/v1/images/generations") {
      generations.push(body);
      return sendJson(res, { data: [{ b64_json: "aW1n" }] });
    }
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

  const result = await gateway.runAgent({ originalPrompt: "一把无扶手的新中式餐椅，全金属，不要木头", prompt: "dining chair", style: "newChinese", modernity: 80, maxRounds: 2, targetScore: 85 });

  const [textCall, visionCall] = chats;
  assert.match(textCall.messages[1].content, /Design knowledge:/);
  assert.match(visionCall.messages[0].content, /a traditional symbol is optional/);
  assert.deepEqual(JSON.parse(visionCall.messages[1].content[0].text).checklist.map((item) => item.id), checklistItems(parseBrief("一把无扶手的新中式餐椅，全金属，不要木头", { style: "newChinese" })).map((item) => item.id));
  assert.equal(result.stopReason, "passed");
  const prompt = generations[0].prompt.split("\nAvoid:")[0];
  assert.doesNotMatch(prompt, /antique|replica|walnut|light ash|with armrests/i);
  assert.ok(result.design.removedFromPrompt.some((item) => /armrests/.test(item.text)));
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

test("a style the user writes outranks the panel preset", () => {
  const brief = parseBrief("宋式书桌，清瘦简洁，不要明清家具的雕花和做旧", { style: "newChinese" });
  const direction = establishDirection(brief, { style: "newChinese", modernity: 60 });
  assert.equal(direction.style, "song");
  assert.match(direction.rationale[0], /需求写明「当代宋式」，优先于面板预设「新中式」/);
  const { prompt } = composePrompt({ brief, direction, draft: "" });
  assert.match(prompt, /contemporary Song-inspired furniture/);
  // Without a written style the preset still applies.
  assert.equal(establishDirection(parseBrief("书桌", { style: "newChinese" }), { style: "newChinese" }).style, "newChinese");
});

test("a negation reaches past a modifying 的 to what it bans", () => {
  const brief = parseBrief("宋式茶几，不要宫廷家具的雕刻和仿古效果", { style: "newChinese" });
  const banned = brief.prohibitions.map((item) => item.concept);
  assert.ok(banned.includes("carving") && banned.includes("antique"), "carving and the aged look are banned");
  assert.ok(!brief.requirements.some((item) => ["carving", "antique"].includes(item.concept)), "never required");
  const { prompt } = composePrompt({ brief, direction: establishDirection(brief, { style: "newChinese" }), draft: "" });
  assert.doesNotMatch(prompt, /must have (carving|antique)/);
  assert.match(prompt, /no carving and ornament; no antique replica/);
  // "的" still ends the ban once it has named something.
  assert.ok(parseBrief("无扶手的圈椅").needsClarification);
  assert.deepEqual(parseBrief("不要木头的质感，全金属").prohibitions.filter((item) => !item.derived).map((item) => item.concept), ["wood"]);
});

test("asking for proportion only rules out traditional techniques and motifs", () => {
  const brief = parseBrief("新中式边柜，不要传统纹样，只用比例表达", { style: "newChinese" });
  assert.ok(brief.prohibitions.some((item) => item.concept === "symbolMotif"));
  assert.equal(brief.expression, "proportion");
  const direction = establishDirection(brief, { style: "newChinese", modernity: 60 });
  assert.equal(direction.expression.kind, "proportion");
  assert.equal(direction.expression.cues.length, 0);
  assert.match(direction.rationale[0], /只靠比例、线条与留白/);
  const { prompt } = composePrompt({ brief, direction, draft: "" });
  assert.doesNotMatch(prompt, /traditional technique/);
  assert.equal(establishDirection(parseBrief("新中式边柜"), { style: "newChinese", modernity: 60 }).expression.kind, "technique");
});
