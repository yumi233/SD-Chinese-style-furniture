// Builds the final image prompt from the locked brief and design direction.
// Order follows the priority rule: the user's own words and locked
// requirements first, then the locked direction, then style presets, then
// presentation. Before anything is sent, every preset clause and negative term
// is checked against the brief and conflicting ones are removed, so the model
// never receives contradictory instructions.
const { getStyleProfile } = require("../knowledge/styleProfiles");
const { getStylePack } = require("../knowledge/stylePacks");
const { briefPromptLines, promptSource } = require("./brief");
const { conceptLabel, findEnConcepts } = require("./concepts");
const { filterPhrase } = require("./direction");

const CJK = /[㐀-鿿]/;
// Clauses written by an earlier run of this composer (or the old prompt guard).
// They are rebuilt from the locked direction every time instead of being
// carried over, which is what made regenerations disagree.
const SYSTEM_MARKERS = [
  /^locked requirements/i,
  /^clearly recognisable traditional chinese cue/i,
  /^traditional technique/i,
  /^design move/i,
  /^style pack/i,
  /^materials:/i,
  /^controlled variation/i,
  /^corrections for this version/i,
  /^edit the attached previous version/i,
  /^contemporary chinese character expressed/i,
  /^song character expressed/i,
  /^reinterpreted through form and proportion/i,
];

function splitClauses(text) {
  return String(text || "")
    .replace(/\([^)]*\)/g, " ")
    .split(/,\s*|;\s*|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function isSystemClause(clause, profile) {
  if (SYSTEM_MARKERS.some((pattern) => pattern.test(clause))) return true;
  return clause.toLowerCase() === profile.anchor.toLowerCase();
}

// Positive clauses from a draft (the page's prompt or a text model rewrite):
// user text is dropped (the brief carries it), system clauses are rebuilt,
// banned style words are stripped and anything conflicting with a prohibition
// is removed and reported.
function cleanDraft(draft, { profile, prohibited, systemClauses = new Set() }) {
  const removed = [];
  const kept = [];
  const seen = new Set();
  for (const raw of splitClauses(draft)) {
    if (CJK.test(raw) || isSystemClause(raw, profile) || systemClauses.has(raw.toLowerCase())) continue;
    let clause = raw;
    for (const pattern of profile.banned) clause = clause.replace(pattern, "").trim();
    clause = clause.replace(/\s{2,}/g, " ").replace(/^[,\s]+|[,\s]+$/g, "");
    if (!clause) continue;
    const hit = findEnConcepts(clause).positive.find((concept) => prohibited.has(concept));
    if (hit) {
      removed.push({ text: raw, reason: `与“禁止：${conceptLabel(hit)}”冲突` });
      continue;
    }
    const key = clause.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      kept.push(clause);
    }
  }
  return { kept, removed };
}

function composePrompt({ brief, direction, draft = "", negativeDraft = "", corrections = [], edit = null }) {
  const profile = getStyleProfile(direction.style);
  const prohibited = new Set(brief.prohibitions.filter((entry) => entry.strength === "hard").map((entry) => entry.concept));
  const required = new Set(brief.requirements.map((entry) => entry.concept).filter(Boolean));
  const banned = [...prohibited];
  // System parts are filtered too: a preset hint such as "pair wood with one
  // contemporary material" must not reach an all-metal brief.
  const safe = (text) => filterPhrase(text, banned).text;

  const locked = briefPromptLines(brief);
  const system = [];
  if (locked.length) system.push(`locked requirements (highest priority, override any style preference): ${locked.join("; ")}`);
  system.push(profile.anchor);
  if (direction.balance && safe(direction.balance)) system.push(safe(direction.balance));
  if (direction.expression.kind === "technique") {
    system.push(`traditional technique (optional accent): ${safe(direction.expression.hint)}`, "reinterpreted through form and proportion rather than material alone");
  } else if (direction.expression.hint) {
    system.push(safe(direction.expression.hint));
  }
  if (direction.move && safe(direction.move.hint)) system.push(`design move: ${safe(direction.move.hint)}`);
  if (direction.pack && direction.packRecipe) system.push(`style pack ${direction.packTitle}: ${safe(direction.packRecipe)}`);
  if (direction.materials?.items?.length) system.push(`materials: ${direction.materials.items.join(" with ")}`);
  // The user's own words are added once, so a draft that repeats them (an
  // English request, or the previous prompt on regeneration) is not doubled.
  const source = promptSource(brief);
  const systemClauses = new Set([...system, brief.source, source].flatMap((section) => splitClauses(section)).map((clause) => clause.toLowerCase()));
  const { kept, removed } = cleanDraft(draft, { profile, prohibited, systemClauses });

  const sections = [];
  if (source) sections.push(source);
  sections.push(...system, ...kept);
  if (direction.variationHint) sections.push(`controlled variation: ${direction.variationHint}`);
  const fixes = corrections.slice(0, 2).map((item, index) => `${index + 1}) ${item.instruction || item.issue}`);
  if (fixes.length) sections.push(`corrections for this version: ${fixes.join(" ")}`);
  if (edit) {
    // Never ask to "keep" something the brief prohibits (the armrests of an armless chair).
    const keep = edit.keep.filter((aspect) => !findEnConcepts(aspect).positive.some((concept) => prohibited.has(concept)));
    sections.push(`edit the attached previous version: change only ${edit.scope.join("; ") || "what the request asks"}; keep everything else unchanged, including ${keep.join(" and ")}`);
  }

  const negative = composeNegative({ brief, direction, negativeDraft, required });
  // Final check: nothing positive may still name a prohibited concept.
  const conflicts = sections
    .filter((section) => !CJK.test(section) && !/^locked requirements/i.test(section))
    .map((section) => ({ section, hits: findEnConcepts(section).positive.filter((concept) => prohibited.has(concept)) }))
    .filter((item) => item.hits.length);

  return {
    prompt: sections.join(", "),
    negativePrompt: negative.terms.join(", "),
    removed: [...removed, ...negative.removed],
    conflicts,
    lockedLines: locked,
  };
}

function composeNegative({ brief, direction, negativeDraft, required }) {
  const profile = getStyleProfile(direction.style);
  const pack = getStylePack(direction.pack);
  const candidates = [
    ...String(negativeDraft || "").split(",").map((term) => term.trim()).filter(Boolean),
    ...profile.negative,
    ...(pack?.avoid || []),
    ...brief.prohibitions.map((entry) => entry.en).filter(Boolean),
  ];
  const terms = [];
  const removed = [];
  const seen = new Set();
  for (const term of candidates) {
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    // A preset may not forbid what the user asked for ("heavy dark rosewood"
    // when the brief requires rosewood).
    const hit = findEnConcepts(term).positive.find((concept) => required.has(concept));
    if (hit) {
      removed.push({ text: term, reason: `负面词与“${conceptLabel(hit)}”要求冲突` });
      continue;
    }
    terms.push(term);
  }
  return { terms, removed };
}

module.exports = {
  cleanDraft,
  composeNegative,
  composePrompt,
  splitClauses,
};
