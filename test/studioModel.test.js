const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../public/js/studio/model.js"), "utf8");
const modulePromise = import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const record = (id, parentId = null, rounds = []) => ({ id, parentId, type: rounds.length ? "agent" : "generation", createdAt: id, images: [{ url: "/a.png" }], rounds });
test("round cards link to each other, descendants link to the server's best round", async () => {
  const { versionNodes } = await modulePromise;
  const parent = { ...record("a", null, [1, 2].map(round => ({ round, image: { url: `/${round}.png` } }))), bestRound: 1 };
  const nodes = versionNodes([record("b", "a"), parent]);
  assert.equal(nodes[1].parentKey, "a:0");
  assert.equal(nodes[2].parentKey, "a:0");
  assert.deepEqual(nodes.map(node => node.version), [1, 2, 3]);
  assert.deepEqual(nodes.map(node => node.historyId), ["a", "a", "b"]);
});
test("region locations use normalized bounds and modification preserves parent and locked intent", async () => {
  const { regionDescription, generationPayload } = await modulePromise;
  assert.equal(regionDescription({ x: 0, y: 0, width: .2, height: .2 }), "上左区域");
  assert.equal(regionDescription({ x: .8, y: .4, width: .1, height: .1 }), "中右区域");
  const payload = generationPayload({ description: "左侧扶手再薄一点", parent: { historyId: "server-id", key: "local-round:2", record: { originalPrompt: "黑胡桃圈椅" } }, memory: ["保留靠背弧线"], settings: { mode: "agent", englishPrompt: "Ming chair", constraints: "榫卯连接", maxRounds: 3 } });
  assert.equal(payload.parentId, "server-id");
  for (const text of ["黑胡桃圈椅", "左侧扶手再薄一点", "保留靠背弧线", "榫卯连接", "Ming chair"]) assert.ok(payload.prompt.includes(text));
  assert.equal(payload.maxRounds, 3);
  assert.equal(generationPayload({ description: "新作品" }).parentId, undefined);
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
