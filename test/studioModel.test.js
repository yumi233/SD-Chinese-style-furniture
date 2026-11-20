const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../public/js/studio/model.js"), "utf8");
const modulePromise = import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const record = (id, parentId = null, rounds = []) => ({ id, parentId, type: rounds.length ? "agent" : "generation", createdAt: id, images: [{ url: "/a.png" }], rounds });
test("legacy pending edits and saved children use the first stored image, including multi-image and multi-round parents", async () => {
  const { parentVersion, versionNodes } = await modulePromise;
  const images = [{ url: "/1.png" }, { url: "/2.png" }];
  const rounds = images.map((image, index) => ({ round: index + 1, image }));
  for (const [parent, expected] of [
    [{ ...record("a"), images }, "a:0"],
    [{ ...record("a", null, rounds), images, bestRound: 2 }, "a:0"],
    [{ ...record("a", null, [{ round: 0, image: null }, ...rounds]), images, bestRound: 2 }, "a:1"],
  ]) {
    const nodes = versionNodes([record("b", "a"), parent]);
    assert.equal(parentVersion(nodes, { parentId: "a" }).key, expected);
    assert.equal(nodes.at(-1).parentKey, expected);
    if (parent.type === "agent") assert.equal(nodes[1].parentKey, "a:0");
    assert.deepEqual(nodes.map(node => node.version), nodes.map((_node, i) => i + 1));
  }
});
test("region locations use normalized bounds and modification preserves parent and locked intent", async () => {
  const { regionDescription, generationPayload } = await modulePromise;
  assert.equal(regionDescription({ x: 0, y: 0, width: .2, height: .2 }), "上左区域");
  assert.equal(regionDescription({ x: .8, y: .4, width: .1, height: .1 }), "中右区域");
  const payload = generationPayload({ description: "左侧扶手再薄一点", parent: { historyId: "server-id", key: "local-round:2", record: { originalPrompt: "黑胡桃圈椅" } }, memory: ["保留靠背弧线"], settings: { mode: "agent", englishPrompt: "Ming chair", constraints: "榫卯连接", maxRounds: 3 } });
  assert.equal(payload.parentId, "server-id");
  for (const text of ["黑胡桃圈椅", "左侧扶手再薄一点", "保留靠背弧线", "榫卯连接", "Ming chair"]) assert.ok(payload.prompt.includes(text));
  assert.equal(payload.maxRounds, 3);
  const initial = generationPayload({ description: "新作品" });
  assert.equal(initial.parentId, undefined);
  assert.equal(initial.style, "newChinese");
  assert.equal(generationPayload({ description: "旧方案", settings: { style: "ming" } }).style, "ming");
});
test("studio starts in New Chinese and renders contemporaneity as a review dimension", async () => {
  const { generationPayload, DIMENSIONS } = await modulePromise;
  assert.equal(generationPayload({ description: "新作品" }).style, "newChinese");
  assert.equal(generationPayload({ description: "新作品", settings: { style: "ming" } }).style, "ming");
  assert.deepEqual(DIMENSIONS.find(([key]) => key === "contemporaneity"), ["contemporaneity", "当代感"]);
  assert.match(fs.readFileSync(path.join(__dirname, "../public/studio.html"), "utf8"), /<option value="newChinese" selected\b/);
});
test("family traversal tolerates missing and cyclic parents and layout never overlaps cards", async () => {
  const { familyRecords, versionNodes, layoutNodes } = await modulePromise;
  const records = [record("a", "b"), record("b", "a"), record("c", "gone"), record("d", "a")];
  assert.deepEqual(familyRecords(records, "a").map(item => item.id), ["a", "b", "d"]);
  const nodes = versionNodes(records); const positions = layoutNodes(nodes);
  assert.equal(new Set([...positions.values()].map(p => `${p.x},${p.y}`)).size, nodes.length);
  assert.equal(nodes.find(node => node.historyId === "c").parentKey, null);
});
test("missing scores stay unreviewed and untrusted strings are escaped", async () => {
  const { score, escapeHtml, suggestions } = await modulePromise;
  assert.equal(score(null), null); assert.equal(score(undefined), null); assert.equal(score("bad"), null); assert.equal(score(108), 100);
  assert.equal(escapeHtml('<img src="x" onerror="alert(1)">'), "&lt;img src=&quot;x&quot; onerror=&quot;alert(1)&quot;&gt;");
  assert.deepEqual(suggestions({ suggestion: "薄一点", problems: ["薄一点", "保留比例"], learningFeedback: { nextSteps: ["收细椅腿"] } }), ["收细椅腿", "薄一点", "保留比例"]);
});
test("older review records render from the stored evaluation without new fields", async () => {
  const { versionNodes, suggestions } = await modulePromise;
  const legacyReview = { score: 89, suggestion: "保留靠背弧线" };
  const [node] = versionNodes([record("legacy", null, [{ round: 1, image: { url: "/old.png" }, evaluation: legacyReview }])]);
  assert.deepEqual(node.evaluation, legacyReview);
  assert.deepEqual(suggestions(node.evaluation), [legacyReview.suggestion]);
  assert.equal(node.image.url, "/old.png");
});

test("parallel history cards show the selected image's prompt and keep legacy fallbacks", async () => {
  const { versionNodes } = await modulePromise;
  const history = { id: "record", createdAt: "record", finalPrompt: "legacy prompt", images: [
    { url: "/chair.png", prompt: "fixed oak chair" },
    { url: "/table.png", prompt: "enhanced walnut table" },
    { url: "/unknown.png", prompt: "" },
    { url: "/legacy.png" },
  ] };
  assert.deepEqual(versionNodes([history]).map(node => node.prompt), ["fixed oak chair", "enhanced walnut table", "", "legacy prompt"]);
});
test("the chosen image index survives payload creation and history reload", async () => {
  const { generationPayload, parentVersion, versionNodes } = await modulePromise;
  for (const parent of [
    { ...record("a"), images: [{ url: "/first.png" }, { url: "/second.png" }] },
    { ...record("a", null, [1, 2].map(round => ({ round, image: { url: `/${round}.png` } }))), bestRound: 1 },
  ]) {
    const [, second] = versionNodes([parent]);
    const payload = generationPayload({ description: "edit", parent: second });
    assert.equal(payload.parentImageIndex, 1);
    const nodes = versionNodes(JSON.parse(JSON.stringify([parent, { ...record("b"), ...payload }])));
    assert.equal(nodes.at(-1).parentKey, second.key);
    assert.equal(parentVersion(nodes, payload).key, second.key);
  }
});
