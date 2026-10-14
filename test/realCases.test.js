const assert = require("node:assert/strict");
const test = require("node:test");
const library = require("../src/references/realCases.json");
const { matchCases } = require("../src/references/realCases");
const { parseBrief } = require("../src/design/brief");
const { establishDirection } = require("../src/design/direction");
const { CONCEPTS } = require("../src/design/concepts");

const BASIS = new Set(["source", "visible", "inferred", "unknown"]);

test("every real case cites a source and labels the basis of each fact", () => {
  assert.ok(library.cases.length >= 30, `${library.cases.length} cases`);
  const ids = new Set();
  for (const item of library.cases) {
    assert.ok(!ids.has(item.id), item.id);
    ids.add(item.id);
    assert.ok(item.sources.length >= 1, `${item.id} needs a source`);
    for (const source of item.sources) assert.match(source.url, /^https:\/\//, item.id);
    assert.ok(["seat", "bench", "stool", "table", "cabinet", "screen", "bed"].includes(item.family), item.id);
    for (const material of item.materials) {
      assert.ok(BASIS.has(material.basis), `${item.id} material basis`);
      if (material.concept) assert.ok(CONCEPTS[material.concept], `${item.id} concept ${material.concept}`);
    }
    assert.ok(BASIS.has(item.dimensions.basis), `${item.id} dimension basis`);
    for (const fact of item.structure) assert.ok(BASIS.has(fact.basis), `${item.id} structure basis`);
    assert.ok(Array.isArray(item.unknowns), item.id);
    // Case images are links only; nothing is downloaded or sent to a model.
    assert.equal(item.imagePolicy, "link-only", item.id);
    assert.ok(item.referenceValue && item.applicability, item.id);
  }
  for (const item of library.historical) assert.ok(["CC0", "link-only"].includes(item.license), item.id);
});

test("case retrieval matches the furniture family and narrows conflicting materials to shape", () => {
  const metal = parseBrief("一把无扶手的新中式餐椅，全金属，不要木头", { style: "newChinese" });
  const matches = matchCases(metal, establishDirection(metal, { style: "newChinese" }), { limit: 3 });
  assert.equal(matches.length, 3);
  assert.ok(matches.every((item) => library.cases.find((entry) => entry.id === item.id).family === "seat"));
  // A metal case ranks first for an all-metal brief.
  assert.ok(library.cases.find((entry) => entry.id === matches[0].id).materials.some((material) => material.concept === "metal"));
  for (const item of matches) {
    const wooden = library.cases.find((entry) => entry.id === item.id).materials.some((material) => material.concept === "wood");
    if (wooden) {
      assert.ok(!item.purposes.includes("material"));
      assert.match(item.contribution, /只参考轮廓与结构/);
    }
  }
  const table = parseBrief("当代宋式茶桌", { style: "song" });
  const tableMatches = matchCases(table, establishDirection(table, { style: "song" }), { limit: 3 });
  assert.ok(tableMatches.length >= 1);
  assert.ok(tableMatches.every((item) => library.cases.find((entry) => entry.id === item.id).family === "table"));
});
