const assert = require("node:assert/strict");
const test = require("node:test");
const catalog = require("../src/lib/designCatalog.json");
const { designReferences, referenceNotes, SPACE_DIRECTION } = require("../src/lib/designRetrieval");
const { buildPromptPackage } = require("../src/providers/codexCli");
const { normalizeLiveEvaluation } = require("../src/providers/visionModel");

test("source notes stay in the intended design domain and omit local collection records", () => {
  for (const [text, kind, expected] of [
    ["设计一间新中式茶室，临水借景", "space", "seed-08"],
    ["给一间茶室设计一把圈椅", "product", "wudai-chair"],
    ["茶室裡用的濕泡茶桌", "product", "brace"],
    ["Tea room interior with a skylight", "space", "fuzhou"],
    ["双人并坐，中间留个中央几", "product", "pair-02"],
    ["木制茶柜收茶饼", "product", "wudai-cabinet"],
    ["statistics homework", "product", null],
    ["茶桌，不用参考库", "product", null],
  ]) {
    const { kind: actual, matches } = designReferences(text);
    assert.equal(actual, kind, text);
    assert.ok(expected ? matches.some(r => r.id === expected) : matches.length === 0, text);
    assert.ok(matches.every(r => r.kind === kind));
  }
  for (const row of catalog) {
    assert.deepEqual(Object.keys(row).sort(), ["forms", "id", "keywords", "kind", "principle", "source", "title"]);
    assert.match(row.source, /^https:\/\//);
  }
  assert.equal(referenceNotes([]), "");
});

test("space instructions and spatial review survive the final provider boundary", () => {
  const pkg = JSON.parse(buildPromptPackage({ prompt: "有天井的茶室", isSpace: true }, {}, [{ role: "parent", title: "上一版" }]));
  assert.equal(pkg.designDirection, SPACE_DIRECTION);
  assert.doesNotMatch(JSON.stringify(pkg), /pure white|white-background/);
  const evaluation = normalizeLiveEvaluation({ score: 90, decision: "pass", antiqueLook: false,
    highlight: "庭院引光", highlightEvidence: { position: "进深处", formChange: "开天井", visibleUse: "照亮茶席" },
    productPresentation: { whiteBackdrop: false, propFree: false, furnitureFullyVisible: false } }, "茶室", [], "cn", true);
  assert.equal(evaluation.decision, "pass");
  assert.equal(evaluation.evaluationFailed, undefined);
});
