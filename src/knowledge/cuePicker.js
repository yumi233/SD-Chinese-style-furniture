// Picks the concrete traditional cue a new Chinese piece must keep. A vague
// "keep one Chinese cue" let tables and cabinets come out as generic modern
// furniture, so each furniture family gets cues that suit its construction.
const knowledge = require("./index");
const { getStylePack } = require("./stylePacks");

const BY_ID = new Map(knowledge.entries.map((entry) => [entry.id, entry]));
// Form moves that change shape, not just material; material contrast alone is
// what made results look like "the old chair in a new material".
// Subtraction is left out too: on its own it pushed tables and benches towards
// generic catalogue furniture.
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
  { name: "seat", keywords: ["吧台椅", "椅", "躺椅", "沙发", "chair", "sofa"], cues: ["gene-continuous-rail", "gene-humpback-stretcher", "form-official-hat-chair"], extra: ["gene-recessed-legs"] },
  { name: "bench", keywords: ["长凳", "凳", "bench", "stool"], cues: ["gene-humpback-stretcher", "gene-horse-hoof-foot", "motif-beauty-rail"], extra: ["gene-recessed-legs"] },
];

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

// 偏传统 keeps two cues, otherwise one. A cue the brief already names comes
// first; otherwise the brief's text picks a stable starting cue, so different
// briefs in one family do not all get the same detail.
// Motifs from a style pack (moon gate, lacquer box...) suit these families even
// when the family's own cue list does not name them.
const MOTIF_FAMILIES = ["cabinet", "screen", "table", "stool", "bench", "other"];

function pickCues(text, { count = 1, pack } = {}) {
  const normalized = String(text || "").toLowerCase();
  const family = familyFor(normalized);
  const stylePack = getStylePack(pack);
  if (stylePack) {
    const allowed = new Set([...family.cues, ...(family.extra || [])]);
    const fromPack = stylePack.cues
      .map((id) => BY_ID.get(id))
      .filter((entry) => entry && (allowed.has(entry.id) || (entry.kind === "motif" && MOTIF_FAMILIES.includes(family.name))));
    if (fromPack.length) {
      const rest = family.cues.map((id) => BY_ID.get(id)).filter((entry) => entry && !fromPack.includes(entry));
      return { family: family.name, cues: [...fromPack, ...rest].slice(0, count).map(toCue) };
    }
  }
  const strong = family.cues.map((id) => BY_ID.get(id)).filter(Boolean);
  const extra = (family.extra || []).map((id) => BY_ID.get(id)).filter(Boolean);
  const cues = [...strong, ...extra];
  const named = strong.filter((entry) => entry.keywords.some((keyword) => normalized.includes(keyword.toLowerCase()) && !["桌", "柜", "椅", "凳", "案", "腿"].includes(keyword)));
  const rest = strong.filter((entry) => !named.includes(entry));
  const offset = rest.length ? [...normalized].reduce((sum, char) => sum + char.codePointAt(0), 0) % rest.length : 0;
  const ordered = [...named, ...rest.slice(offset), ...rest.slice(0, offset), ...extra.filter((entry) => !named.includes(entry))];
  return {
    family: family.name,
    cues: ordered.slice(0, count).map(toCue),
  };
}

function toCue(entry) {
  return { id: entry.id, title: entry.title, hint: entry.promptHints[0] || entry.title };
}

// One form move per brief, suited to its furniture family. A move the brief
// already names comes first; otherwise the brief's text picks a stable one.
function pickMove(text, { pack } = {}) {
  const normalized = String(text || "").toLowerCase();
  const family = familyFor(normalized).name;
  const stylePack = getStylePack(pack);
  if (stylePack) {
    const fromPack = stylePack.moves.map((id) => BY_ID.get(id)).find((entry) => entry?.fits?.includes(family) || entry?.fits?.includes("other"));
    if (fromPack) return { id: fromPack.id, title: fromPack.title, hint: fromPack.promptHints[0] || fromPack.title };
  }
  const pool = MOVES.filter((entry) => entry.fits.includes(family) || entry.fits.includes("other") && family === "other");
  if (!pool.length) return null;
  const named = pool.find((entry) => entry.keywords.some((keyword) => keyword.length > 1 && normalized.includes(keyword.toLowerCase())));
  const offset = [...normalized].reduce((sum, char) => sum * 31 + char.codePointAt(0), 7) >>> 0;
  const entry = named || pool[offset % pool.length];
  return { id: entry.id, title: entry.title, hint: entry.promptHints[0] || entry.title };
}

// The pack only applies to furniture it suits: 宋式素器 on a desk, for example,
// came out as generic rounded furniture. Returns the pack id or "".
function applicablePack(id, text) {
  const pack = getStylePack(id);
  return pack && pack.fits.includes(familyFor(text).name) ? pack.id : "";
}

module.exports = {
  applicablePack,
  familyFor,
  pickCues,
  pickMove,
};
