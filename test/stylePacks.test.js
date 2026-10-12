const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const knowledge = require("../src/knowledge");
const { listStylePacks, getStylePack } = require("../src/knowledge/stylePacks");
const { guardPrompt, mergeNegativePrompt } = require("../src/knowledge/promptGuard");
const { pickCues, pickMove } = require("../src/knowledge/cuePicker");
const { normalizeGenerateRequest } = require("../src/lib/requestNormalizer");
const { StyleReferenceStore } = require("../src/styleReferences");
const { buildPromptPackage } = require("../src/providers/codexCli");

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d4a0d00000000049454e44ae426082", "hex");

test("every style pack points at existing cues and moves", () => {
  const ids = new Set(knowledge.entries.map((entry) => entry.id));
  const packs = require("../src/knowledge/stylePacks.json").packs;
  assert.ok(packs.length >= 5);
  for (const pack of packs) {
    for (const id of [...pack.cues, ...pack.moves]) assert.ok(ids.has(id), `${pack.id} -> ${id}`);
    assert.ok(pack.recipe && pack.checklist.length, pack.id);
  }
  assert.deepEqual(Object.keys(listStylePacks()[0]).sort(), ["checklist", "fits", "id", "summary", "title"]);
});

test("a style pack steers the cue, move, recipe and negatives", () => {
  assert.equal(pickCues("新中式玄关柜", { pack: "garden-void" }).cues[0].id, "motif-moon-gate");
  assert.equal(pickMove("新中式玄关柜", { pack: "garden-void" }).id, "move-negative-space");
  assert.equal(pickMove("新中式椅子", { pack: "steel-line" }).id, "move-line-drawing");
  // A pack cue that does not suit the furniture falls back to the family's own cue.
  assert.equal(pickCues("新中式椅子", { pack: "garden-void" }).cues[0].id, pickCues("新中式椅子").cues[0].id);
  const guarded = guardPrompt("contemporary new Chinese furniture design, chair", { style: "newChinese", cueText: "新中式椅子", stylePack: "steel-line" });
  assert.match(guarded.prompt, new RegExp(`style pack 钢木细线: ${getStylePack("steel-line").recipe.slice(0, 30)}`));
  assert.match(mergeNegativePrompt("", "newChinese", "steel-line"), /chunky frames/);
  assert.doesNotMatch(mergeNegativePrompt("", "ming", "steel-line"), /chunky frames/);
});

test("style packs only apply to new Chinese requests", () => {
  assert.equal(normalizeGenerateRequest({ prompt: "x", style: "newChinese", stylePack: "song-vessel" }).stylePack, "song-vessel");
  assert.equal(normalizeGenerateRequest({ prompt: "x", style: "ming", stylePack: "song-vessel" }).stylePack, "");
  assert.equal(normalizeGenerateRequest({ prompt: "x", style: "newChinese", stylePack: "nope" }).stylePack, "");
});

test("reference store reads curated images from its own directory only", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "musheng-refs-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, "steel-line"));
  fs.writeFileSync(path.join(dir, "steel-line", "a.png"), PNG);
  fs.writeFileSync(path.join(dir, "steel-line", "b.png"), PNG);
  fs.writeFileSync(path.join(dir, "outside.txt"), "x");
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ images: [
    { id: "a", pack: "steel-line", title: "A", file: "steel-line/a.png", family: "table" },
    { id: "b", pack: "steel-line", title: "B", file: "steel-line/b.png", family: "seat" },
    { id: "escape", pack: "steel-line", title: "E", file: "../../etc/passwd" },
    { id: "text", pack: "steel-line", title: "T", file: "outside.txt" },
  ] }));
  const store = new StyleReferenceStore({ rootDir: dir });
  assert.deepEqual(store.countByPack(), { "steel-line": 4 });
  const picked = store.pick("steel-line", { family: "seat", count: 3 });
  assert.equal(picked[0].id, "b");
  assert.deepEqual(picked.map((image) => image.id).sort(), ["a", "b"]);
  assert.equal(picked[0].mimeType, "image/png");
  assert.deepEqual(new StyleReferenceStore({ rootDir: path.join(dir, "missing") }).pick("steel-line"), []);
});

test("Codex brief carries the style pack direction", () => {
  const input = JSON.parse(buildPromptPackage({ prompt: "chair", styleGuidance: { anchor: "a", avoid: [], stylePack: "钢木细线: thin steel" } }, {}, [{ title: "ref" }]));
  assert.equal(input.styleGuidance.stylePack, "钢木细线: thin steel");
  assert.match(input.task, /follow the stylePack direction/);
  assert.equal(input.visualReferences.length, 1);
});

test("approving candidates copies them into the reference set with a manifest entry", (t) => {
  const { approve } = require("../scripts/styleReferences");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "musheng-approve-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "candidates", "song-vessel"), { recursive: true });
  fs.writeFileSync(path.join(root, "candidates", "song-vessel", "03.png"), PNG);
  fs.writeFileSync(path.join(root, "candidates", "song-vessel", "03.json"), JSON.stringify({ brief: "新中式坐墩", family: "stool" }));
  approve({ pack: "song-vessel", from: path.join(root, "candidates"), to: path.join(root, "refs"), files: ["3"] });
  approve({ pack: "song-vessel", from: path.join(root, "candidates"), to: path.join(root, "refs"), files: ["03"] });
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "refs", "manifest.json"), "utf8"));
  assert.equal(manifest.images.length, 1);
  assert.deepEqual(manifest.images[0], { id: "song-vessel-03", pack: "song-vessel", title: "新中式坐墩", file: "song-vessel/03.png", family: "stool", source: "木生生成，人工精选", license: "项目自有" });
  assert.equal(new StyleReferenceStore({ rootDir: path.join(root, "refs") }).pick("song-vessel", { family: "stool" })[0].id, "song-vessel-03");
});

test("a style pack is dropped for furniture it does not suit", () => {
  const { applicablePack } = require("../src/knowledge/cuePicker");
  assert.equal(applicablePack("song-vessel", "新中式坐墩"), "song-vessel");
  assert.equal(applicablePack("song-vessel", "新中式儿童书桌椅"), "");
  assert.equal(applicablePack("garden-void", "新中式玄关柜"), "garden-void");
  assert.equal(applicablePack("brush-gesture", "新中式衣柜门板"), "");
  assert.equal(applicablePack("nope", "新中式坐墩"), "");
  for (const pack of require("../src/knowledge/stylePacks.json").packs) assert.ok(pack.fits.length, pack.id);
});
