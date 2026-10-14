// Chooses what goes into a generation as reference: the user's own uploads
// (with the purpose they chose), real furniture cases from the library (text
// only, never as images unless storing them is permitted), and AI concept
// images of a style pack. Each kind is labelled so an AI concept image is
// never presented as evidence of a real product, material or method. A
// reference whose purpose conflicts with the brief is narrowed or dropped, and
// the adjustment is reported instead of sending contradictory instructions.
const { matchCases } = require("../references/realCases");
const { conceptLabel } = require("./concepts");
const { PURPOSES } = require("../userReferences");

const MAX_IMAGES = 3;

const PURPOSE_EN = {
  silhouette: "silhouette and proportion only",
  material: "material and surface appearance only",
  structure: "structure and joints only",
  atmosphere: "atmosphere, light and setting only",
};

function selectReferences({ brief, direction, ownerId, selections = [], userReferences, styleReferences, engine, baseImage }) {
  const prohibited = new Set(brief.prohibitions.filter((entry) => entry.strength === "hard").map((entry) => entry.concept));
  const images = [];
  const used = [];
  const adjustments = [];
  const notes = [];
  if (baseImage) {
    images.push({ ...baseImage, purpose: "previous version to edit: keep everything the request does not change", kind: "previous" });
    used.push({ id: baseImage.id || "previous", kind: "previous", title: baseImage.title === "previous round" ? "上一轮图片" : "上一版图片", purposes: ["silhouette", "material", "structure", "atmosphere"], contribution: "作为底图：只改这次要求的部分" });
  }

  for (const selection of selections.slice(0, 6)) {
    const stored = userReferences?.get(ownerId, selection.id);
    if (!stored) continue;
    let purposes = (selection.purposes?.length ? selection.purposes : stored.purposes || []).filter((purpose) => PURPOSES[purpose]);
    const clashing = (stored.materials || []).filter((material) => prohibited.has(material));
    if (clashing.length && purposes.includes("material")) {
      purposes = purposes.filter((purpose) => purpose !== "material");
      adjustments.push({ id: stored.id, title: stored.title, change: `参考的材质（${clashing.map(conceptLabel).join("、")}）与禁止项冲突，只保留${purposes.map((purpose) => PURPOSES[purpose]).join("、") || "无"}用途` });
    }
    if (!purposes.length) {
      adjustments.push({ id: stored.id, title: stored.title, change: "没有剩余可用的用途，本次未使用" });
      continue;
    }
    if (stored.kind === "image") {
      if (images.length >= MAX_IMAGES) {
        adjustments.push({ id: stored.id, title: stored.title, change: "超过单次可附图片数（3 张），本次未使用" });
        continue;
      }
      const image = userReferences.readImage(ownerId, stored.id);
      if (!image) continue;
      images.push({ ...image, purpose: purposes.map((purpose) => PURPOSE_EN[purpose]).join("; "), kind: "user" });
    } else if (stored.textPreview) {
      notes.push({ id: stored.id, title: stored.title, text: stored.textPreview.slice(0, 600) });
    }
    used.push({ id: stored.id, kind: "user", title: stored.title, purposes, contribution: purposes.map((purpose) => PURPOSES[purpose]).join("、") });
  }

  const cases = matchCases(brief, direction, { limit: 3 });
  for (const item of cases) {
    used.push({ id: item.id, kind: "realCase", title: item.title, purposes: item.purposes, contribution: item.contribution, source: item.sourceLinks?.[0] || null });
  }

  if (direction.pack && styleReferences && engine === "codexCli") {
    const room = MAX_IMAGES - images.length;
    if (room > 0) {
      const concepts = styleReferences.pick(direction.pack, { family: direction.family, count: Math.min(2, room), seedText: brief.source });
      for (const concept of concepts) {
        images.push({ ...concept, purpose: "visual language of the style pack only; an AI concept image, not a real product", kind: "aiConcept" });
        used.push({ id: concept.id, kind: "aiConcept", title: concept.title, purposes: ["atmosphere"], contribution: `风格包「${direction.packTitle}」的视觉语言（AI 生成概念图，不代表真实产品或工艺）` });
      }
    }
  }
  return { images: images.slice(0, MAX_IMAGES), used, adjustments, notes };
}

module.exports = {
  PURPOSE_EN,
  selectReferences,
};
