const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createImageGateway } = require("../src/imageGateway");
const { GenerationTasks } = require("../src/generationTasks");
const { HistoryStore } = require("../src/historyStore");
const { DesignSessionStore } = require("../src/designSessions");
const { UserReferenceStore } = require("../src/userReferences");

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const ALICE = { id: "alice-account", isAdmin: false };
const BOB = { id: "bob-account", isAdmin: false };

async function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "musheng-design-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const calls = { generations: [], edits: [] };
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks);
    if (req.url === "/v1/images/generations") calls.generations.push(JSON.parse(raw.toString("utf8")));
    else if (req.url === "/v1/images/edits") calls.edits.push(raw.toString("utf8"));
    else {
      res.statusCode = 404;
      return res.end();
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ data: [{ b64_json: PNG }] }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/v1`;
  const historyStore = new HistoryStore({ rootDir: path.join(root, "history") });
  const designSessions = new DesignSessionStore({ rootDir: path.join(root, "history", "sessions") });
  const userReferences = new UserReferenceStore({ rootDir: path.join(root, "refs") });
  const gateway = createImageGateway({
    defaultEngine: "imageModel", auto1111BaseUrl: "", comfyBaseUrl: "", textModelEnabled: false,
    imageModelBaseUrl: base, imageModelApiKey: "k", imageModelName: "image-model", visionModelBaseUrl: "", visionModelName: "",
  }, { userReferences });
  const tasks = new GenerationTasks({ rootDir: path.join(root, "tasks"), gateway, historyStore, safeError: (error) => error, designSessions, userReferences });
  let counter = 0;
  const run = async (user, body) => {
    counter += 1;
    const task = tasks.create({ mode: "normal", engine: "imageModel", requestId: `request-${String(counter).padStart(12, "0")}`, prompt: body.originalPrompt || "furniture", ...body }, user);
    const finished = await tasks.waitForCompletion(task.id, user.id);
    assert.equal(finished.status, "completed", finished.message);
    return finished;
  };
  return { calls, historyStore, designSessions, userReferences, tasks, run };
}

test("versions keep the locked direction: another version varies it, a new direction re-picks it", async (t) => {
  const { calls, designSessions, historyStore, run } = await setup(t);
  const first = await run(ALICE, { originalPrompt: "一把无扶手的新中式餐椅，全金属，不要木头", style: "newChinese" });
  const sessionId = first.result.session.id;
  let session = designSessions.get(sessionId, ALICE.id);
  assert.equal(session.versions.length, 1);
  assert.equal(session.brief.furniture.id, "diningChair");
  const record = historyStore.get(first.result.historyRecord.id);
  assert.equal(record.design.brief.requirements[0].label, "家具类型：餐椅");
  assert.equal(record.design.model.model, "image-model");

  const variation = await run(ALICE, { action: "variation", sessionId, originalPrompt: "一把无扶手的新中式餐椅，全金属，不要木头" });
  session = designSessions.get(sessionId, ALICE.id);
  assert.equal(session.versions[1].direction.id, session.versions[0].direction.id);
  assert.equal(session.versions[1].direction.variation, 1);
  assert.match(calls.generations[1].prompt, /controlled variation: /);
  assert.equal(calls.generations[1].prompt.replace(/, controlled variation: [^,\n]+/, ""), calls.generations[0].prompt);

  await run(ALICE, { action: "newDirection", sessionId, originalPrompt: "一把无扶手的新中式餐椅，全金属，不要木头" });
  session = designSessions.get(sessionId, ALICE.id);
  const [original, , explored] = session.versions.map((version) => version.direction);
  assert.notEqual(explored.id, original.id);
  const before = [...original.expression.cues.map((cue) => cue.id), original.move?.id];
  assert.ok(!explored.expression.cues.some((cue) => before.includes(cue.id)));
  assert.notEqual(explored.move?.id, original.move?.id);
  // The new direction still respects the locked brief.
  assert.ok(!explored.expression.cues.some((cue) => ["gene-continuous-rail", "form-official-hat-chair"].includes(cue.id)));
});

test("continue refining edits the previous image, names the scope and lets the newer request win", async (t) => {
  const { calls, designSessions, run } = await setup(t);
  const first = await run(ALICE, { originalPrompt: "一把无扶手的新中式餐椅，全金属，不要木头", style: "newChinese" });
  const sessionId = first.result.session.id;
  const refined = await run(ALICE, { action: "refine", sessionId, changeRequest: "保留这把椅子，背板更薄，坐垫换成亚麻", originalPrompt: "一把无扶手的新中式餐椅，全金属，不要木头" });
  assert.equal(calls.edits.length, 1, "refinement uses the edit endpoint, not a fresh generation");
  const body = calls.edits[0];
  assert.match(body, /name="image\[\]"/);
  assert.match(body, /edit the attached previous version: change only 背板更薄; 坐垫换成亚麻/);
  assert.match(body, /previous version to edit/);
  const session = designSessions.get(sessionId, ALICE.id);
  const version = session.versions.at(-1);
  assert.equal(version.kind, "refine");
  assert.equal(version.parentVersion, 1);
  assert.deepEqual(version.edit.scope, ["背板更薄", "坐垫换成亚麻"]);
  assert.ok(version.edit.keep.includes("腿足"));
  assert.ok(!version.edit.keep.includes("柜门与抽屉"), "only parts a chair has");
  assert.ok(!version.edit.keep.includes("扶手"), "an armless chair has no armrests to keep");
  assert.doesNotMatch(body.split("\nAvoid:")[0], /keep[^\n]*armrests/, "never asks to keep prohibited parts");
  // "全金属" had ruled out cushions and fabric; the explicit request overrides that.
  assert.ok(!session.brief.prohibitions.some((item) => ["upholstery", "fabric"].includes(item.concept)));
  assert.ok(session.brief.requirements.some((item) => item.concept === "fabric"));
  assert.ok(session.brief.prohibitions.some((item) => item.concept === "wood"));
  // The linen seat is an exception to "全金属", not a violation of it.
  const metal = session.brief.requirements.find((item) => item.concept === "metal");
  assert.equal(metal.exclusive, false);
  assert.equal(metal.label, "材料：除软包坐垫、织物外全金属");
  assert.doesNotMatch(body, /made entirely of metal/);
  // "这把椅子" in the change request does not drop the locked furniture type.
  assert.equal(session.brief.requirements.find((item) => item.kind === "furniture")?.value, "diningChair");
  assert.ok(refined.result.design.references.some((item) => item.kind === "previous"));
  assert.deepEqual(refined.result.design.edit.scope, ["背板更薄", "坐垫换成亚麻"]);
  assert.equal(refined.result.design.sentImages[0].kind, "previous");
});

test("a reference that conflicts with the brief is narrowed to the purposes it can still serve", async (t) => {
  const { calls, userReferences, run } = await setup(t);
  const reference = userReferences.add(ALICE.id, { filename: "胡桃木椅子.png", mimeType: "image/png", data: PNG });
  assert.deepEqual(reference.materials, ["wood"]);
  assert.ok(reference.purposes.includes("material") && reference.purposes.includes("silhouette"));
  assert.equal(reference.annotation.source, "auto");
  const finished = await run(ALICE, { originalPrompt: "一把无扶手的新中式餐椅，全金属，不要木头", references: [{ id: reference.id, purposes: ["silhouette", "material"] }] });
  const { design } = finished.result;
  assert.match(design.referenceAdjustments[0].change, /材质（木材）与禁止项冲突/);
  assert.equal(design.sentImages.length, 1);
  assert.equal(design.sentImages[0].purpose, "silhouette and proportion only");
  assert.match(calls.edits[0], /1\. silhouette and proportion only/);

  // The user corrects the annotation; then only the material use remains and it is dropped.
  userReferences.update(ALICE.id, reference.id, { purposes: ["material"] });
  assert.equal(userReferences.get(ALICE.id, reference.id).annotation.source, "user");
  const second = await run(ALICE, { originalPrompt: "一把无扶手的新中式餐椅，全金属，不要木头", references: [{ id: reference.id }] });
  assert.equal(second.result.design.sentImages.length, 0);
  assert.match(second.result.design.referenceAdjustments.at(-1).change, /本次未使用/);
});

test("uploads, sessions and versions are private to their account", async (t) => {
  const { tasks, userReferences, run, designSessions } = await setup(t);
  const reference = userReferences.add(ALICE.id, { filename: "chair.png", mimeType: "image/png", data: PNG });
  assert.equal(userReferences.list(BOB.id).length, 0);
  assert.equal(userReferences.get(BOB.id, reference.id), null);
  const finished = await run(BOB, { originalPrompt: "新中式边几", references: [{ id: reference.id, purposes: ["silhouette"] }] });
  assert.equal(finished.result.design.sentImages.length, 0, "another account's upload is never used");
  const sessionId = finished.result.session.id;
  assert.equal(designSessions.get(sessionId, ALICE.id), null);
  assert.throws(() => tasks.create({ mode: "normal", engine: "imageModel", requestId: "request-cross-account-1", action: "refine", sessionId, changeRequest: "更薄", prompt: "x" }, ALICE), (error) => error.statusCode === 404);
  assert.throws(() => userReferences.add(ALICE.id, { filename: "x.png", mimeType: "image/png", data: Buffer.from("not a png").toString("base64") }), (error) => error.statusCode === 415);
});

test("a core contradiction is returned for clarification and can be resolved", async (t) => {
  const { tasks, run } = await setup(t);
  assert.throws(() => tasks.create({ mode: "normal", engine: "imageModel", requestId: "request-conflict-0001", prompt: "无扶手的圈椅", originalPrompt: "无扶手的圈椅" }, ALICE), (error) => {
    assert.equal(error.statusCode, 422);
    assert.deepEqual(error.details.clarification.map((item) => item.concept).sort(), ["armrest", "horseshoeBack"]);
    return true;
  });
  const finished = await run(ALICE, { originalPrompt: "无扶手的圈椅", conflictResolution: { armrest: "prohibit", horseshoeBack: "prohibit" } });
  assert.ok(finished.result.design.brief.prohibitions.some((item) => item.concept === "armrest"));
});

test("restoring an earlier version makes it the base for the next refinement", async (t) => {
  const { designSessions, run } = await setup(t);
  const first = await run(ALICE, { originalPrompt: "新中式茶桌" });
  const sessionId = first.result.session.id;
  await run(ALICE, { action: "variation", sessionId, originalPrompt: "新中式茶桌" });
  assert.equal(designSessions.get(sessionId, ALICE.id).activeVersion, 2);
  designSessions.restore(sessionId, ALICE.id, 1);
  assert.equal(designSessions.get(sessionId, ALICE.id).activeVersion, 1);
  const refined = await run(ALICE, { action: "refine", sessionId, changeRequest: "桌面更薄", originalPrompt: "新中式茶桌" });
  assert.equal(designSessions.get(sessionId, ALICE.id).versions.at(-1).parentVersion, 1);
  assert.equal(refined.status, "completed");
});
