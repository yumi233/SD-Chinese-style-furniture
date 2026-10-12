const { getStyleProfile, describeModernity, normalizeModernity } = require("./styleProfiles");
const { pickCues, pickMove } = require("./cuePicker");
const { getStylePack } = require("./stylePacks");

const CUE_MARKER = "clearly recognisable traditional chinese cue";
const MOVE_MARKER = "design move";
const PACK_MARKER = "style pack";

// Keeps prompts on-style across agent rounds. Reviewers and text models tend to
// drift back towards "Chinese furniture = antique"; the guard strips terms the
// style bans and re-attaches the style anchor if a rewrite dropped it.
function guardPrompt(prompt, { style, modernity, cueText, stylePack } = {}) {
  const profile = getStyleProfile(style);
  let text = String(prompt || "");
  const removed = [];
  for (const pattern of profile.banned) {
    text = text.replace(pattern, (match) => {
      removed.push(match);
      return "";
    });
  }
  text = tidy(text);

  if (!profile.anchorPattern.test(text)) {
    const parts = [profile.anchor];
    if (profile.checksAntique) {
      parts.push(describeModernity(normalizeModernity(modernity)).hint);
    }
    text = tidy(`${parts.join(", ")}, ${text}`);
  }

  // New Chinese must keep a concrete, visible cue; without one, tables and
  // cabinets came out as generic modern furniture.
  let cues = [];
  let move = null;
  if (profile.checksAntique) {
    const level = normalizeModernity(modernity);
    const pack = getStylePack(stylePack);
    cues = pickCues(cueText || text, { count: describeModernity(level).genes, pack: pack?.id }).cues;
    const lower = text.toLowerCase();
    if (cues.length && !lower.includes(CUE_MARKER) && !cues.some((cue) => lower.includes(cue.hint.toLowerCase()))) {
      text = tidy(`${text}, ${CUE_MARKER}: ${cues.map((cue) => cue.hint).join(" and ")}, reinterpreted through form and proportion rather than material alone`);
    }
    // A form move keeps "new" from meaning "the old shape in a new material".
    // 偏传统 stays close to the archetype, so it gets no move.
    if (level >= 35) {
      move = pickMove(cueText || text, { pack: pack?.id });
      if (move && !text.toLowerCase().includes(MOVE_MARKER)) {
        text = tidy(`${text}, ${MOVE_MARKER}: ${move.hint}`);
      }
    }
    if (pack && !text.toLowerCase().includes(PACK_MARKER)) {
      text = tidy(`${text}, ${PACK_MARKER} ${pack.title}: ${pack.recipe}`);
    }
  }

  return { prompt: text, removed, cues, move };
}

// Adds the style's negative terms to the user's negative prompt without duplicates.
function mergeNegativePrompt(negativePrompt, style, stylePack) {
  const profile = getStyleProfile(style);
  const pack = profile.checksAntique ? getStylePack(stylePack) : null;
  const existing = String(negativePrompt || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const seen = new Set(existing.map((item) => item.toLowerCase()));
  for (const term of [...profile.negative, ...(pack?.avoid || [])]) {
    if (!seen.has(term.toLowerCase())) {
      existing.push(term);
      seen.add(term.toLowerCase());
    }
  }
  return existing.join(", ");
}

function tidy(text) {
  return text
    .replace(/\s+/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/,(\s*,)+/g, ",")
    .replace(/^[\s,]+|[\s,]+$/g, "")
    .trim();
}

module.exports = {
  guardPrompt,
  mergeNegativePrompt,
};
