// Real contemporary Chinese and Song-inspired furniture cases (tables and
// chairs first). Every case cites its source. Facts carry a basis:
//   source   stated by the cited source
//   visible  observed in the source's own images
//   inferred our inference, to be checked
//   unknown  not established
// Images are kept as links unless storing them is permitted (CC0 museum
// images); case images are never sent to a model as generation input.
const library = require("./realCases.json");

const CASES = library.cases;

function listCases({ category, style } = {}) {
  return CASES.filter((item) => (!category || item.family === category) && (!style || item.styles.includes(style)));
}

function getCase(id) {
  return CASES.find((item) => item.id === id) || null;
}

function materialsOf(item) {
  return (item.materials || []).map((entry) => entry.concept).filter(Boolean);
}

// Cases that suit the furniture family, style and material constraints of a
// brief, with what each one contributes. A case whose material is prohibited
// still helps with silhouette or structure, so it is kept for those purposes.
function matchCases(brief, direction, { limit = 3 } = {}) {
  const family = direction?.family || brief.furniture?.family;
  const style = direction?.style || "newChinese";
  const prohibited = new Set(brief.prohibitions.filter((entry) => entry.strength === "hard").map((entry) => entry.concept));
  const required = new Set(brief.requirements.filter((entry) => entry.kind === "material").map((entry) => entry.concept));
  const scored = CASES.map((item) => {
    const materials = materialsOf(item);
    let score = 0;
    if (item.family === family) score += 4;
    else if (item.categoryGroup && item.categoryGroup === brief.furniture?.id) score += 2;
    if (item.styles.includes(style)) score += 3;
    for (const material of materials) if (required.has(material)) score += 2;
    const clash = materials.filter((material) => prohibited.has(material));
    const purposes = (item.purposes || ["silhouette"]).filter((purpose) => !(purpose === "material" && clash.length));
    return { item, score, purposes, clash };
  }).filter((entry) => entry.score >= 4 && entry.purposes.length);
  return scored
    .sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id))
    .slice(0, limit)
    .map(({ item, purposes, clash }) => ({
      id: item.id,
      title: item.title,
      designer: item.designer,
      purposes,
      contribution: `${item.referenceValue}${clash.length ? "（材质与本次禁止项冲突，只参考轮廓与结构）" : ""}`,
      sourceLinks: item.sources,
    }));
}

module.exports = {
  CASES,
  getCase,
  listCases,
  matchCases,
};
