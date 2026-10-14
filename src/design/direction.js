// A design direction is the locked proposal for a task: how Chinese (or Song)
// character is expressed, which form move shapes the piece, which materials it
// uses and which style pack (if any) sets the visual language. It is derived
// from the brief alone with a stable hash, so regenerating with the same
// parameters always rebuilds the same direction, and it is stored with the
// session so later versions reuse it instead of re-deriving it from prompt text.
const { getStyleProfile, describeModernity, normalizeModernity } = require("../knowledge/styleProfiles");
const { getStylePack, listStylePacks } = require("../knowledge/stylePacks");
const { applicablePack, entryConcepts, familyFor, pickCues, pickMove } = require("../knowledge/cuePicker");
const { conceptLabel, findEnConcepts } = require("./concepts");
const { stableHash } = require("./hash");

// Chinese character does not need a traditional symbol: proportion, line,
// component relationships and empty space can carry it.
const PROPORTION_EXPRESSION = {
  newChinese: "contemporary Chinese character expressed through proportion, slender line work, clear component relationships and generous negative space, no traditional symbol required",
  song: "Song character expressed through slender members, plain surfaces, a thin top and quiet proportions, no ornament",
};

const DEFAULT_MATERIALS = {
  newChinese: ["light solid wood", "one contemporary material such as powder-coated steel or linen"],
  song: ["light natural wood with a matte finish", "a fine rattan or bamboo weave"],
  ming: ["natural hardwood with a soft waxed sheen"],
  zen: ["natural wood", "linen and stone"],
};

// Controlled variations for "generate another version": the direction stays,
// only one of these presentation or secondary-detail aspects changes.
const VARIATIONS = [
  "a different camera angle and lighting while keeping the same design",
  "slightly different proportions of secondary members within the same design language",
  "a different scale of the accent detail within the same design language",
  "a different interior setting for the same piece",
];

function directionSeed(brief, style, pack, level) {
  return [brief.source.toLowerCase(), style, pack || "", level].join("|");
}

function hardProhibitions(brief) {
  return brief.prohibitions.filter((entry) => entry.strength === "hard").map((entry) => entry.concept);
}

// Drops comma-separated parts of a recipe that would put a prohibited concept
// into the image ("paired with warm solid wood" for an all-metal piece).
function filterPhrase(text, prohibited) {
  const banned = new Set(prohibited);
  const kept = [];
  const dropped = [];
  for (const part of String(text || "").split(/,\s*/).map((item) => item.trim()).filter(Boolean)) {
    const hit = findEnConcepts(part).positive.find((concept) => banned.has(concept));
    (hit ? dropped : kept).push(hit ? { text: part, concept: hit } : part);
  }
  return { text: kept.join(", "), dropped };
}

function chooseMaterials(brief, style, pack) {
  const locked = brief.requirements.filter((entry) => entry.kind === "material");
  if (locked.length) {
    return { source: "user", items: locked.map((entry) => (entry.exclusive ? `made entirely of ${entry.en}` : entry.en)), labels: locked.map((entry) => entry.label) };
  }
  const prohibited = hardProhibitions(brief);
  const packMaterials = getStylePack(pack)?.materials;
  const defaults = (packMaterials || DEFAULT_MATERIALS[style] || DEFAULT_MATERIALS.newChinese).map((item) => filterPhrase(item, prohibited).text).filter(Boolean);
  if (!defaults.length && prohibited.includes("wood")) defaults.push("metal");
  return { source: packMaterials ? "pack" : "default", items: defaults, labels: defaults };
}

// A refinement can change the locked materials ("坐垫换成皮革"); the kept
// direction must describe them the way the updated brief does.
function refreshMaterials(direction, brief) {
  return { ...direction, materials: chooseMaterials(brief, direction.style, direction.pack) };
}

// A style the user wrote ("宋式书桌") outranks the preset picked in the panel;
// the more specific one wins when several are written ("新中式宋式").
const STATED_STYLE_ORDER = ["song", "ming", "zen", "newChinese"];
function statedStyle(brief, preset) {
  const stated = (brief.styles || []).filter((item) => item.source === "user").map((item) => item.id);
  return STATED_STYLE_ORDER.find((id) => stated.includes(id)) || preset;
}

function establishDirection(brief, { style: preset = "newChinese", stylePack = "", modernity, variation = 0, exclude = [], mode = "auto" } = {}) {
  const style = statedStyle(brief, preset);
  const profile = getStyleProfile(style);
  const level = normalizeModernity(modernity);
  const text = brief.positiveText || brief.source;
  const prohibited = hardProhibitions(brief);
  const pack = style === "newChinese" ? applicablePack(stylePack, text) : "";
  const packDef = getStylePack(pack);
  const seedKey = `${directionSeed(brief, style, pack, level)}${exclude.length ? `|x:${[...exclude].sort().join(",")}` : ""}`;
  const rationale = [];
  if (style !== preset) rationale.push(`风格：需求写明「${profile.label}」，优先于面板预设「${getStyleProfile(preset).label}」`);

  let cues = [];
  if (profile.checksAntique && mode !== "proportion") {
    cues = pickCues(text, { count: describeModernity(level).genes, pack, prohibited, style, seedKey, exclude }).cues;
  }
  const expression = cues.length
    ? { kind: "technique", cues, hint: cues.map((cue) => cue.hint).join(" and ") }
    : profile.checksAntique
      ? { kind: "proportion", cues: [], hint: PROPORTION_EXPRESSION[style] || PROPORTION_EXPRESSION.newChinese }
      : { kind: "none", cues: [], hint: "" };
  if (expression.kind === "technique") rationale.push(`传统手法：${cues.map((cue) => cue.title).join("、")}（可选的点睛手法，以形体与比例转译）`);
  else if (profile.checksAntique) rationale.push(mode === "proportion" ? "不使用传统符号，靠比例、线条与留白表达" : "没有与需求兼容的传统手法，改为靠比例、线条与留白表达");

  const move = profile.checksAntique && level >= 35 ? pickMove(text, { pack, prohibited, style, seedKey, exclude }) : null;
  if (move) rationale.push(`形体手法：${move.title}`);

  let recipe = "";
  if (packDef) {
    const filtered = filterPhrase(packDef.recipe, prohibited);
    recipe = filtered.text;
    rationale.push(`风格包：${packDef.title}${filtered.dropped.length ? `（已去掉与“禁止：${filtered.dropped.map((item) => conceptLabel(item.concept)).join("、")}”冲突的配方部分）` : ""}`);
  }

  const materials = chooseMaterials(brief, style, pack);
  rationale.push(materials.source === "user" ? `材料：遵循你的要求（${materials.labels.join("、")}）` : `材料：未指定，推荐 ${materials.items.join(" + ")}`);
  if (prohibited.length) rationale.push(`已排除：${[...new Set(prohibited)].map(conceptLabel).join("、")}`);

  const variationIndex = Math.max(0, Math.floor(Number(variation) || 0));
  return {
    id: `dir-${stableHash(seedKey).toString(36)}`,
    style,
    styleLabel: profile.label,
    family: familyFor(text).name,
    pack,
    packTitle: packDef?.title || "",
    packRecipe: recipe,
    modernity: level,
    balance: profile.checksAntique ? describeModernity(level).hint : "",
    expression,
    move,
    materials,
    variation: variationIndex,
    variationHint: variationIndex ? VARIATIONS[(variationIndex - 1) % VARIATIONS.length] : "",
    excluded: [...exclude],
    rationale,
  };
}

// Same direction, one controlled change: used by "generate another version".
function nextVariation(direction) {
  const variation = (direction.variation || 0) + 1;
  return { ...direction, variation, variationHint: VARIATIONS[(variation - 1) % VARIATIONS.length] };
}

// Re-picks the method for "explore a new direction": the previous cues, move
// and pack are excluded so the new direction is genuinely different.
function exploreDirection(brief, previous, options = {}) {
  const exclude = [...(previous.excluded || []), ...previous.expression.cues.map((cue) => cue.id), ...(previous.move ? [previous.move.id] : [])];
  const otherPack = previous.pack ? "" : options.stylePack || "";
  return establishDirection(brief, { ...options, style: previous.style, modernity: previous.modernity, stylePack: otherPack, exclude });
}

// Three clearly different directions for a user without a starting idea: the
// best match first, then a style-pack direction, then a proportion-only one.
function proposeDirections(brief, { style = "newChinese", stylePack = "", modernity } = {}) {
  const first = establishDirection(brief, { style, stylePack, modernity });
  const directions = [{ ...first, title: "最贴合需求", summary: summarize(first) }];
  const text = brief.positiveText || brief.source;
  const prohibited = hardProhibitions(brief);
  if (style === "newChinese") {
    const family = familyFor(text).name;
    const pack = listStylePacks()
      .filter((candidate) => candidate.id !== first.pack && candidate.fits.includes(family))
      .map((candidate) => getStylePack(candidate.id))
      .find((candidate) => !filterPhrase(candidate.recipe, prohibited).dropped.length || filterPhrase(candidate.recipe, prohibited).text);
    if (pack) {
      const second = establishDirection(brief, { style, stylePack: pack.id, modernity });
      directions.push({ ...second, title: `风格包 · ${pack.title}`, summary: summarize(second) });
    }
  }
  const exclude = [...first.expression.cues.map((cue) => cue.id), ...(first.move ? [first.move.id] : []), ...(directions[1]?.move ? [directions[1].move.id] : [])];
  const third = establishDirection(brief, { style, modernity, mode: "proportion", exclude });
  directions.push({ ...third, title: "比例与留白（不用传统符号）", summary: summarize(third) });
  if (directions.length < 3) {
    const extra = establishDirection(brief, { style, modernity, exclude: [...exclude, ...third.excluded, ...(third.move ? [third.move.id] : [])] });
    directions.splice(1, 0, { ...extra, title: "另一种传统手法", summary: summarize(extra) });
  }
  return directions.slice(0, 3);
}

function summarize(direction) {
  const parts = [];
  if (direction.expression.kind === "technique") parts.push(`以「${direction.expression.cues.map((cue) => cue.title).join("、")}」点睛`);
  else parts.push("不用传统符号，靠比例、线条与留白");
  if (direction.move) parts.push(`形体手法「${direction.move.title}」`);
  if (direction.packTitle) parts.push(`风格包「${direction.packTitle}」`);
  parts.push(`材料：${direction.materials.labels.join("、")}`);
  return parts.join("；");
}

// Knowledge entries a direction is built from, for "references used".
function directionEntryIds(direction) {
  return [...direction.expression.cues.map((cue) => cue.id), ...(direction.move ? [direction.move.id] : [])];
}

module.exports = {
  PROPORTION_EXPRESSION,
  VARIATIONS,
  directionEntryIds,
  entryConcepts,
  establishDirection,
  exploreDirection,
  filterPhrase,
  nextVariation,
  proposeDirections,
  refreshMaterials,
};
