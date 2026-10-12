// Retrieval over the built-in design knowledge base (src/knowledge/entries.json).
// Matching is keyword based and filtered by style; for the new Chinese style the
// result always mixes a traditional cue, a translation method, a contemporary
// material and an anti-pattern so the text model and the reviewer see both what
// to aim for and what "too antique" looks like.
const knowledge = require("./knowledge");
const { DEFAULT_STYLE } = require("./knowledge/styleProfiles");
const { pickCues, pickMove } = require("./knowledge/cuePicker");

const KIND_LABELS = {
  form: "经典形制",
  gene: "传统基因",
  method: "转译手法",
  material: "材料搭配",
  scene: "应用场景",
  ergonomics: "尺度规范",
  antiPattern: "常见反例",
  motif: "跨界母题",
  case: "研究与案例",
};

const QUOTAS = {
  newChinese: ["gene", "method", "motif", "material", "antiPattern"],
  ming: ["form", "gene"],
  song: ["material", "scene"],
  zen: ["material", "scene"],
};

const ENTRIES = knowledge.entries;

function entriesForStyle(style) {
  return ENTRIES.filter((entry) => entry.styles.includes(style));
}

function scoreEntry(entry, text) {
  return entry.keywords.reduce((total, keyword) => {
    return text.includes(String(keyword).toLowerCase()) ? total + 1 : total;
  }, 0);
}

function retrieveKnowledge(text, { style = DEFAULT_STYLE, limit = 7 } = {}) {
  const normalized = String(text || "").toLowerCase();
  const pool = entriesForStyle(style);
  const ranked = pool
    .map((entry, order) => ({ entry, score: scoreEntry(entry, normalized), order }))
    .sort((a, b) => b.score - a.score || a.order - b.order);

  const picked = [];
  const take = (item) => {
    if (item && !picked.includes(item.entry) && picked.length < limit) {
      picked.push(item.entry);
    }
  };

  // For new Chinese, the cue and form move the prompt guard will use come first,
  // so the text model and reviewer read about the same choices.
  if (style === "newChinese") {
    const ids = [pickCues(normalized).cues[0]?.id, pickMove(normalized)?.id].filter(Boolean);
    ranked.filter((item) => ids.includes(item.entry.id)).forEach(take);
  }
  // Matched entries next, then fill required kinds so every context is balanced.
  const quotas = QUOTAS[style] || [];
  const room = () => limit - picked.length - quotas.filter((kind) => !picked.some((entry) => entry.kind === kind)).length;
  for (const item of ranked.filter((candidate) => candidate.score > 0 && candidate.entry.kind !== "case")) {
    if (room() <= 0) break;
    if (!quotas.includes(item.entry.kind) || !picked.some((entry) => entry.kind === item.entry.kind)) take(item);
  }
  for (const kind of quotas) {
    if (!picked.some((entry) => entry.kind === kind)) {
      take(ranked.find((item) => item.entry.kind === kind));
    }
  }
  ranked.filter((item) => item.score > 0).forEach(take);

  return picked.map(publicCase);
}

function getReferenceCases({ style } = {}) {
  const pool = style ? entriesForStyle(style) : ENTRIES;
  return pool.filter((entry) => entry.kind !== "ergonomics").map(publicCase);
}

// Kept for callers that only pass text.
function matchReferenceCases(text, limit = 6, style = DEFAULT_STYLE) {
  return retrieveKnowledge(text, { style, limit });
}

// Context for the reviewer: what to check and which mistakes are typical.
function formatReferenceContext(cases) {
  return (cases || [])
    .map((item) => {
      const principles = (item.designPrinciples || []).join("；");
      const issues = (item.commonIssues || []).join("；");
      return `[${item.category}] ${item.title}：${item.teachingPoint}${principles ? ` 评价要点：${principles}。` : ""}${issues ? ` 常见问题：${issues}。` : ""}`;
    })
    .join("\n");
}

// Context for the prompt writer: concrete English phrases to use and to avoid.
function formatPromptContext(cases) {
  return (cases || [])
    .map((item) => {
      const use = (item.promptHints || []).join("; ");
      const avoid = (item.avoidHints || []).join("; ");
      return `[${item.category}] ${item.title}: ${item.teachingPoint}${use ? ` Use: ${use}.` : ""}${avoid ? ` Avoid: ${avoid}.` : ""}`;
    })
    .join("\n");
}

function publicCase(entry) {
  return {
    id: entry.id,
    kind: entry.kind,
    styles: entry.styles,
    title: entry.title,
    category: KIND_LABELS[entry.kind] || entry.kind,
    teachingPoint: entry.summary,
    designPrinciples: entry.reviewPoints,
    commonIssues: entry.commonIssues,
    promptHints: entry.promptHints,
    avoidHints: entry.avoidHints,
    sources: entry.sources,
    source: entry.sources.length
      ? entry.sources.map((source) => source.title).join("；")
      : "木生课程整理",
  };
}

module.exports = {
  KIND_LABELS,
  getReferenceCases,
  retrieveKnowledge,
  matchReferenceCases,
  formatReferenceContext,
  formatPromptContext,
};
