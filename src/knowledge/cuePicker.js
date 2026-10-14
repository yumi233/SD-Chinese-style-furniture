// Picks the traditional cue and form move for a design direction. Every choice
// respects the locked brief: a cue that needs something the user prohibited
// (a continuous armrest rail for an armless chair, timber brackets for an
// all-metal piece) is never offered. Keyword matching only reads the parts of
// the request that are not negated, and choices use a stable hash, so the same
// brief always gets the same direction.
const knowledge = require("./index");
const { getStylePack } = require("./stylePacks");
const { findEnConcepts, findZhConcepts } = require("../design/concepts");
const { stableHash } = require("../design/hash");

const BY_ID = new Map(knowledge.entries.map((entry) => [entry.id, entry]));
// Form moves that change shape, not just material. Material contrast alone made
// results look like "the old chair in a new material", and subtraction alone
// pushed tables and benches towards generic catalogue furniture.
const MOVES = knowledge.entries.filter((entry) => entry.kind === "method" && Array.isArray(entry.fits) && !["move-material-contrast", "move-subtract"].includes(entry.id));

// Cues are listed strongest first. "Strong" means an ordinary viewer reads it as
// Chinese without being told (arched stretcher, hoof feet, lattice, cracked ice);
// subtle cues such as recessed legs or a waist shadow line read as plain modern
// design, so they only appear as a second cue (偏传统) via `extra`.
// The family named earliest in the brief wins ("边几，配沙发" is a table); on a
// tie the longer keyword wins ("吧台椅" is a seat, not a table).
const FAMILIES = [
  { name: "screen", keywords: ["屏风", "隔断", "screen", "divider"], cues: ["gene-lattice", "gene-ice-crack"] },
  { name: "stool", keywords: ["坐墩", "鼓墩", "绣墩", "墩", "drum stool"], cues: ["form-drum-stool", "gene-lattice"] },
  { name: "cabinet", keywords: ["柜", "书架", "架", "门板", "收纳", "cabinet", "shelf", "wardrobe", "console", "nightstand"], cues: ["gene-lattice", "gene-ice-crack", "motif-partition-door", "form-round-corner-cabinet"], extra: ["gene-horse-hoof-foot", "gene-waist"] },
  { name: "table", keywords: ["桌", "案", "几", "台", "table", "desk"], cues: ["gene-humpback-stretcher", "gene-horse-hoof-foot", "form-everted-end-table", "gene-spandrel"], extra: ["gene-recessed-legs", "gene-waist"] },
  { name: "seat", keywords: ["吧台椅", "椅", "躺椅", "沙发", "chair", "sofa"], cues: ["gene-continuous-rail", "gene-humpback-stretcher", "form-official-hat-chair", "form-lamp-hanger-chair"], extra: ["gene-recessed-legs"] },
  { name: "bench", keywords: ["长凳", "凳", "bench", "stool"], cues: ["gene-humpback-stretcher", "gene-horse-hoof-foot", "motif-beauty-rail"], extra: ["gene-recessed-legs"] },
];

// Contemporary Song-inspired furniture has its own vocabulary: thin round
// members, plain tops without a waist, gentle splay. It is not a Ming or Qing
// reproduction, so it does not borrow the Ming cue lists above.
const SONG_FAMILIES = {
  seat: { cues: ["song-lamp-hanger-back", "song-slender-round-members"], extra: ["song-woven-seat"] },
  bench: { cues: ["song-slender-round-members", "song-plain-top"], extra: ["song-woven-seat"] },
  table: { cues: ["song-plain-top", "song-slender-round-members", "song-clasping-legs"], extra: [] },
  cabinet: { cues: ["song-plain-panels", "song-slender-round-members"], extra: [] },
  screen: { cues: ["song-painted-screen-frame", "song-plain-panels"], extra: [] },
  stool: { cues: ["song-woven-seat", "song-slender-round-members"], extra: [] },
  bed: { cues: ["song-plain-top", "song-slender-round-members"], extra: [] },
  other: { cues: ["song-slender-round-members"], extra: [] },
};
const SONG_MOVES = ["move-stretch", "move-gap-rhythm", "move-straight-curve", "move-monolithic", "move-landscape-layering", "move-line-drawing"];

// Beds and daybeds keep their enclosure; nightstands are cabinets.
function familyFor(text) {
  const normalized = String(text || "").toLowerCase();
  if (normalized.includes("床头柜")) return FAMILIES.find((family) => family.name === "cabinet");
  if (/罗汉床|榻|床|daybed/.test(normalized)) return { name: "bed", cues: ["form-luohan-bed", "gene-lattice"] };
  let best = null;
  for (const family of FAMILIES) {
    for (const keyword of family.keywords) {
      const index = normalized.indexOf(keyword.toLowerCase());
      if (index === -1) continue;
      if (!best || index < best.index || (index === best.index && keyword.length > best.length)) {
        best = { family, index, length: keyword.length };
      }
    }
  }
  return best?.family || { name: "other", cues: ["gene-exposed-joinery", "gene-continuous-rail"] };
}

// Concepts an entry's own prompt phrase would put into the image.
const conceptCache = new Map();
function entryConcepts(entry) {
  if (!conceptCache.has(entry.id)) {
    const english = findEnConcepts((entry.promptHints || []).join(", ")).positive;
    const chinese = findZhConcepts(entry.title || "").map((found) => found.id);
    conceptCache.set(entry.id, new Set([...english, ...chinese]));
  }
  return conceptCache.get(entry.id);
}

function allowedBy(prohibited) {
  const banned = new Set(prohibited || []);
  return (entry) => entry && ![...entryConcepts(entry)].some((concept) => banned.has(concept));
}

// Motifs from a style pack (moon gate, lacquer box...) suit these families even
// when the family's own cue list does not name them.
const MOTIF_FAMILIES = ["cabinet", "screen", "table", "stool", "bench", "other"];

// 偏传统 keeps two cues, otherwise one. A cue the brief names comes first;
// otherwise a stable hash of `seedKey` picks the starting cue, so different
// briefs in one family do not all get the same detail.
function pickCues(text, { count = 1, pack, prohibited = [], style, seedKey, exclude = [] } = {}) {
  const normalized = String(text || "").toLowerCase();
  const family = familyFor(normalized);
  const allowed = allowedBy(prohibited);
  const notExcluded = (entry) => !exclude.includes(entry.id);
  const lists = style === "song" ? SONG_FAMILIES[family.name] || SONG_FAMILIES.other : family;
  const strong = (lists.cues || []).map((id) => BY_ID.get(id)).filter(allowed).filter(notExcluded);
  const extra = (lists.extra || []).map((id) => BY_ID.get(id)).filter(allowed).filter(notExcluded);
  const stylePack = getStylePack(pack);
  if (stylePack) {
    const familyIds = new Set([...(lists.cues || []), ...(lists.extra || [])]);
    const fromPack = stylePack.cues
      .map((id) => BY_ID.get(id))
      .filter((entry) => entry && allowed(entry) && notExcluded(entry) && (familyIds.has(entry.id) || (entry.kind === "motif" && MOTIF_FAMILIES.includes(family.name))));
    if (fromPack.length) {
      return { family: family.name, cues: [...fromPack, ...strong.filter((entry) => !fromPack.includes(entry))].slice(0, count).map(toCue) };
    }
  }
  const named = strong.filter((entry) => entry.keywords.some((keyword) => normalized.includes(keyword.toLowerCase()) && !["桌", "柜", "椅", "凳", "案", "腿"].includes(keyword)));
  const rest = strong.filter((entry) => !named.includes(entry));
  const offset = rest.length ? stableHash(seedKey ?? normalized) % rest.length : 0;
  const ordered = [...named, ...rest.slice(offset), ...rest.slice(0, offset), ...extra.filter((entry) => !named.includes(entry))];
  return { family: family.name, cues: ordered.slice(0, count).map(toCue) };
}

function toCue(entry) {
  return { id: entry.id, title: entry.title, hint: entry.promptHints[0] || entry.title };
}

// One form move per direction, suited to its furniture family.
function pickMove(text, { pack, prohibited = [], style, seedKey, exclude = [] } = {}) {
  const normalized = String(text || "").toLowerCase();
  const family = familyFor(normalized).name;
  const allowed = allowedBy(prohibited);
  const fits = (entry) => entry?.fits?.includes(family) || entry?.fits?.includes("other");
  const stylePack = getStylePack(pack);
  if (stylePack) {
    const fromPack = stylePack.moves.map((id) => BY_ID.get(id)).find((entry) => fits(entry) && allowed(entry) && !exclude.includes(entry.id));
    if (fromPack) return toCue(fromPack);
  }
  const base = style === "song" ? SONG_MOVES.map((id) => BY_ID.get(id)).filter(Boolean) : MOVES;
  const pool = base.filter((entry) => (entry.fits.includes(family) || (entry.fits.includes("other") && family === "other")) && allowed(entry) && !exclude.includes(entry.id));
  if (!pool.length) return null;
  const named = pool.find((entry) => entry.keywords.some((keyword) => keyword.length > 1 && normalized.includes(keyword.toLowerCase())));
  return toCue(named || pool[stableHash(seedKey ?? normalized) % pool.length]);
}

// The pack only applies to furniture it suits: 宋式素器 on a desk, for example,
// came out as generic rounded furniture. Returns the pack id or "".
function applicablePack(id, text) {
  const pack = getStylePack(id);
  return pack && pack.fits.includes(familyFor(text).name) ? pack.id : "";
}

module.exports = {
  applicablePack,
  entryConcepts,
  familyFor,
  pickCues,
  pickMove,
};
