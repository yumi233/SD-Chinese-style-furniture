// Turns the user's request into a structured design brief before anything is
// retrieved or generated. Rule based on purpose: it is deterministic, needs no
// extra model call, and every locked item can be shown to the user and checked
// by the reviewer. Text in the request is treated as design data only.
const { CONCEPTS, MATERIAL_CONCEPTS, conceptLabel, expandProhibited, findZhConcepts } = require("./concepts");

// Priority used everywhere a conflict is resolved.
const PRIORITY = ["用户明确要求", "本任务锁定方案", "参考案例", "风格预设", "模型自由发挥"];

const FURNITURE_TYPES = [
  { id: "diningChair", label: "餐椅", en: "dining chair", family: "seat", zh: ["餐椅"] },
  { id: "barStool", label: "吧台椅", en: "bar stool", family: "seat", zh: ["吧台椅", "吧椅", "高脚凳"] },
  { id: "loungeChair", label: "休闲椅", en: "lounge chair", family: "seat", zh: ["躺椅", "休闲椅", "贵妃椅", "摇椅"] },
  { id: "armchair", label: "扶手椅", en: "armchair", family: "seat", zh: ["扶手椅", "圈椅", "官帽椅", "玫瑰椅", "主人椅"] },
  { id: "officeChair", label: "办公椅", en: "desk chair", family: "seat", zh: ["办公椅", "书椅"] },
  { id: "chair", label: "椅子", en: "chair", family: "seat", zh: ["单椅", "椅子", "椅"] },
  { id: "sofa", label: "沙发", en: "sofa", family: "seat", zh: ["沙发"] },
  { id: "bench", label: "长凳", en: "bench", family: "bench", zh: ["长凳", "条凳", "长椅"] },
  { id: "stool", label: "凳子", en: "stool", family: "bench", zh: ["方凳", "圆凳", "凳子", "凳"] },
  { id: "drumStool", label: "坐墩", en: "drum stool", family: "stool", zh: ["坐墩", "鼓墩", "绣墩", "墩"] },
  { id: "teaTable", label: "茶桌", en: "tea table", family: "table", zh: ["茶桌", "茶台", "茶几"] },
  { id: "sideTable", label: "边几", en: "side table", family: "table", zh: ["边几", "角几", "边桌"] },
  { id: "diningTable", label: "餐桌", en: "dining table", family: "table", zh: ["餐桌"] },
  { id: "desk", label: "书桌", en: "desk", family: "table", zh: ["书桌", "办公桌", "写字台", "电脑桌"] },
  { id: "console", label: "条案", en: "console table", family: "table", zh: ["条案", "平头案", "翘头案", "玄关桌", "案"] },
  { id: "table", label: "桌子", en: "table", family: "table", zh: ["桌子", "桌", "几", "台"] },
  { id: "nightstand", label: "床头柜", en: "nightstand", family: "cabinet", zh: ["床头柜"] },
  { id: "bookshelf", label: "书架", en: "bookshelf", family: "cabinet", zh: ["书架", "书柜", "架格"] },
  { id: "cabinet", label: "柜子", en: "cabinet", family: "cabinet", zh: ["玄关柜", "电视柜", "衣柜", "收纳柜", "边柜", "柜子", "柜"] },
  { id: "screen", label: "屏风", en: "folding screen", family: "screen", zh: ["屏风", "隔断"] },
  { id: "daybed", label: "罗汉床", en: "daybed", family: "bed", zh: ["罗汉床", "榻"] },
  { id: "bed", label: "床", en: "bed", family: "bed", zh: ["床架", "床"] },
];

const EN_FURNITURE = [
  { id: "diningChair", pattern: /\bdining chairs?\b/i },
  { id: "barStool", pattern: /\bbar stools?\b/i },
  { id: "loungeChair", pattern: /\blounge chairs?\b/i },
  { id: "armchair", pattern: /\barmchairs?\b/i },
  { id: "chair", pattern: /\bchairs?\b/i },
  { id: "bench", pattern: /\bbench(es)?\b/i },
  { id: "stool", pattern: /\bstools?\b/i },
  { id: "teaTable", pattern: /\b(tea|coffee) tables?\b/i },
  { id: "sideTable", pattern: /\bside tables?\b/i },
  { id: "diningTable", pattern: /\bdining tables?\b/i },
  { id: "desk", pattern: /\bdesks?\b/i },
  { id: "table", pattern: /\btables?\b/i },
  { id: "cabinet", pattern: /\b(cabinet|sideboard|wardrobe)s?\b/i },
  { id: "bookshelf", pattern: /\b(book ?shel(f|ves)|shelving)\b/i },
  { id: "screen", pattern: /\b(folding )?screens?\b/i },
  { id: "bed", pattern: /\b(day)?beds?\b/i },
];

// Longest triggers first. Single characters (无, 非) only count when a known
// concept follows, so "无论" or "非常" are never read as prohibitions.
const ZH_NEGATIONS = ["不要像", "不能像", "别像", "不像", "尽量不要", "最好不要", "不要用", "不要有", "不要", "不能有", "不能用", "不需要", "不用", "不带", "不含", "不加", "别用", "别要", "避免", "禁止", "去掉", "去除", "拒绝", "无需", "没有", "无", "非"];
const WEAK_NEGATIONS = new Set(["无", "非"]);
const SOFT_PREFIX = /(尽量|最好|可以的话)$/;
const SCOPE_STOP = /[的地，,。；;！!？?\n]|但|而且|并且|同时|然后/;
const EN_NEGATION = /\b(no|without|not|avoid|free of|non-)\s+([a-z][a-z\s-]{1,40})/gi;
const EN_LESS = [
  { pattern: /\barmless\b/i, concept: "armrest" },
  { pattern: /\bbackless\b/i, concept: "backrest" },
];

const EXCLUSIVE_MATERIAL = [
  { concept: "metal", pattern: /(全|纯|全部|只用|仅用|只有|通体)\s*(是|用|为|使用)?\s*(金属|不锈钢|钢|铝|铜)|all[- ]metal|entirely (of |in )?metal|made (entirely |only )?of metal|only metal/i },
  { concept: "wood", pattern: /(全|纯|全部|只用|仅用|通体)\s*(是|用|为|使用)?\s*(实木|木材|木头|木)|all[- ]wood(en)?|solid wood only|entirely (of |in )?wood/i },
  { concept: "bamboo", pattern: /(全|纯|只用)\s*(是|用)?\s*竹|all[- ]bamboo/i },
];

const COLORS = ["黑色", "白色", "米色", "米白", "灰色", "墨色", "朱红", "红色", "绿色", "青色", "蓝色", "黄色", "棕色", "原木色", "浅色", "深色", "黛青", "暖灰"];
const SCENES = ["年轻人公寓", "公寓", "茶室", "书房", "客厅", "餐厅", "卧室", "办公室", "联合办公", "酒店", "民宿", "咖啡", "茶饮店", "阳台", "户外", "儿童房", "宿舍", "玄关"];
const STYLE_WORDS = [
  { id: "newChinese", zh: ["新中式", "当代中式", "现代中式"] },
  { id: "song", zh: ["当代宋式", "宋式", "宋韵", "宋代", "宋风"] },
  { id: "ming", zh: ["明式"] },
  { id: "zen", zh: ["禅意", "侘寂"] },
  { id: "minimal", zh: ["极简", "简约"] },
];
const FEATURE_POSITIVE = [
  { concept: "armrest", pattern: /(带|有|加|需要)\s*扶手|扶手椅|with arm ?rests|with arms/i },
  { concept: "backrest", pattern: /(带|有|需要)\s*靠背|高靠背|with a backrest/i },
];
const DIMENSION = /(座高|座面高|扶手高|桌高|高度|高|长度|长|宽度|宽|深度|深|直径)\s*(约|大约|不超过|不低于)?\s*(\d+(?:\.\d+)?)\s*(mm|毫米|cm|厘米|公分|m|米)(?![a-z])/gi;
const SEATS = /(\d+|[一二两三四五六七八])\s*人(座|位|用|桌)?/;

function parseBrief(text, { style, presetLabel, references = [] } = {}) {
  const source = String(text || "").replace(/\s+/g, " ").trim();
  const negations = findNegations(source);
  const masked = maskRanges(source, negations.map((item) => item.range));

  const furniture = detectFurniture(masked);
  const exclusive = EXCLUSIVE_MATERIAL.find((item) => item.pattern.test(masked)) || null;

  const required = new Map();
  const prohibited = new Map();
  const addRequired = (concept, detail) => !required.has(concept) && required.set(concept, detail);
  const addProhibited = (concept, detail) => !prohibited.has(concept) && prohibited.set(concept, detail);

  for (const item of negations) {
    for (const concept of item.concepts) addProhibited(concept, { phrase: item.phrase, strength: item.soft ? "soft" : "hard", origin: "user" });
  }
  const userBans = [...prohibited.keys()];
  for (const concept of expandProhibited(userBans)) {
    if (prohibited.has(concept)) continue;
    const sources = (CONCEPTS[concept].implies || []).filter((implied) => userBans.includes(implied));
    const because = sources.map(conceptLabel).join("、");
    // The user's own words ("无扶手"), so a clarification never reads "keep 扶手".
    addProhibited(concept, { phrase: "", strength: "hard", origin: "derived", because, from: sources, sourcePhrase: prohibited.get(sources[0])?.phrase || "" });
  }
  if (exclusive) {
    addRequired(exclusive.concept, { phrase: source.match(exclusive.pattern)?.[0] || "", exclusive: true });
    for (const other of MATERIAL_CONCEPTS.filter((id) => id !== exclusive.concept)) {
      addProhibited(other, { phrase: "", strength: "hard", origin: "derived", because: `全${conceptLabel(exclusive.concept)}` });
    }
  }
  for (const { id, term } of findZhConcepts(masked)) {
    if (["horseshoeBack", "officialHat"].includes(id) && furniture?.matchedTerm === term) continue;
    addRequired(id, { phrase: term });
  }
  for (const feature of FEATURE_POSITIVE) if (feature.pattern.test(masked)) addRequired(feature.concept, { phrase: masked.match(feature.pattern)[0] });
  // An armchair-type word (圈椅, 官帽椅) used as the furniture type implies arms.
  if (furniture?.id === "armchair") addRequired("armrest", { phrase: furniture.matchedTerm, origin: "derived" });
  if (furniture?.matchedTerm === "圈椅") addRequired("horseshoeBack", { phrase: "圈椅" });
  if (furniture?.matchedTerm === "官帽椅") addRequired("officialHat", { phrase: "官帽椅" });

  const conflicts = [];
  for (const [concept, detail] of required) {
    if (!prohibited.has(concept)) continue;
    const ban = prohibited.get(concept);
    // A derived ban (from 全金属) loses to an explicit request only when the
    // user wrote both; that is a real contradiction worth asking about.
    const requiredBy = detail.phrase || conceptLabel(concept);
    const prohibitedBy = ban.phrase || ban.sourcePhrase || ban.because || conceptLabel(concept);
    conflicts.push({
      concept,
      label: conceptLabel(concept),
      requiredBy,
      prohibitedBy,
      // "无扶手的圈椅" conflicts on both armrest and horseshoe back; it is one
      // question for the user, answered once for every concept in the group.
      group: `${requiredBy}|${prohibitedBy}`,
      blocking: ["material", "feature", "form"].includes(CONCEPTS[concept]?.group),
    });
  }
  for (const conflict of conflicts) required.delete(conflict.concept);

  const requirements = [];
  if (furniture) requirements.push(item("furniture", `家具类型：${furniture.label}`, { value: furniture.id, en: furniture.en, family: furniture.family }));
  for (const [concept, detail] of required) {
    const group = CONCEPTS[concept].group;
    const phrase = detail.phrase && detail.phrase !== conceptLabel(concept) ? `（${detail.phrase}）` : "";
    const label = detail.exclusive ? `材料：全${conceptLabel(concept)}` : group === "material" ? `材料：${detail.phrase || conceptLabel(concept)}` : `需要：${conceptLabel(concept)}${phrase}`;
    requirements.push(item(group === "material" ? "material" : "feature", label, { concept, exclusive: Boolean(detail.exclusive), en: CONCEPTS[concept].enTerm, derived: detail.origin === "derived" }));
  }
  for (const match of source.matchAll(DIMENSION)) {
    requirements.push(item("dimension", `尺寸：${match[0].replace(/\s+/g, "")}`, { value: match[0], visual: false }));
  }
  const seats = masked.match(SEATS);
  if (seats) requirements.push(item("quantity", `人数：${seats[0]}`, { value: seats[0] }));
  const color = COLORS.find((word) => masked.includes(word));
  if (color) requirements.push(item("color", `颜色：${color}`, { value: color, strength: "soft" }));
  const scene = SCENES.find((word) => masked.includes(word));
  if (scene) requirements.push(item("scene", `场景：${scene}`, { value: scene, strength: "soft" }));

  const prohibitions = [...prohibited].map(([concept, detail]) => item("prohibited", `禁止：${conceptLabel(concept)}${detail.origin === "derived" ? `（由“${detail.because}”推出）` : ""}`, {
    concept,
    en: CONCEPTS[concept].enTerm,
    strength: detail.strength,
    derived: detail.origin === "derived",
    ...(detail.from?.length ? { from: detail.from } : {}),
  }));
  const freeAvoid = negations.filter((neg) => !neg.concepts.length).map((neg) => neg.phrase);

  const styles = STYLE_WORDS.filter((word) => word.zh.some((term) => masked.includes(term))).map((word) => ({ id: word.id, source: "user" }));
  if (style && !styles.some((item) => item.id === style)) styles.push({ id: style, source: "preset", label: presetLabel || style });

  const hasMaterial = requirements.some((entry) => entry.kind === "material");
  const openAreas = [
    ...(hasMaterial ? [] : ["材料组合"]),
    ...(color ? [] : ["颜色"]),
    "细部与传统手法",
    "比例推敲",
    ...(scene ? [] : ["场景"]),
  ];
  const assumptions = [
    ...(furniture ? [] : ["未识别到家具类型：按描述生成单件家具"]),
    ...(hasMaterial ? [] : ["材料未指定：由设计方向推荐"]),
    ...(color ? [] : ["颜色未指定：低饱和中性色"]),
    ...(scene ? [] : ["场景未指定：干净的当代室内或产品图"]),
    ...(requirements.some((entry) => entry.kind === "dimension") ? [] : ["尺寸未指定：常规人体尺度"]),
  ];

  return {
    version: 1,
    source,
    // The request with negated phrases blanked out, for keyword matching that
    // must not pick up "圈椅" from "不要像圈椅".
    positiveText: masked.replace(/\s+/g, " ").trim(),
    priority: PRIORITY,
    furniture: furniture ? { id: furniture.id, label: furniture.label, en: furniture.en, family: furniture.family } : null,
    requirements,
    prohibitions,
    avoid: freeAvoid,
    styles,
    openAreas,
    references: references.map(({ id, title, purposes }) => ({ id, title, purposes })),
    assumptions,
    conflicts,
    needsClarification: conflicts.some((conflict) => conflict.blocking),
  };
}

function item(kind, label, extra = {}) {
  return { id: `${kind}:${extra.concept || extra.value || label}`, kind, label, strength: extra.strength || "hard", visual: extra.visual !== false, ...extra };
}

function findNegations(text) {
  const results = [];
  const taken = [];
  for (const { pattern, concept } of EN_LESS) {
    const match = text.match(pattern);
    if (match) results.push({ phrase: match[0], concepts: [concept], soft: false, range: [match.index, match.index + match[0].length] });
  }
  const english = text.matchAll(EN_NEGATION);
  for (const match of english) {
    const scope = match[2].split(/\b(and|or|but|with)\b/)[0];
    const concepts = conceptsInEnglish(scope);
    if (concepts.length) results.push({ phrase: match[0].trim(), concepts, soft: false, range: [match.index, match.index + match[0].length] });
  }
  for (const trigger of ZH_NEGATIONS) {
    let index = text.indexOf(trigger);
    while (index !== -1) {
      const start = index;
      const end = start + trigger.length;
      if (!taken.some(([a, b]) => start < b && end > a)) {
        const after = text.slice(end);
        const stop = after.search(SCOPE_STOP);
        const scope = (stop === -1 ? after : after.slice(0, stop)).slice(0, 24);
        const concepts = [...new Set(scopeConcepts(scope))];
        const weak = WEAK_NEGATIONS.has(trigger);
        if (concepts.length || (!weak && scope.trim())) {
          const soft = trigger.startsWith("尽量") || trigger.startsWith("最好") || SOFT_PREFIX.test(text.slice(0, start));
          const scopeEnd = end + scope.length;
          taken.push([start, scopeEnd]);
          results.push({ phrase: text.slice(start, scopeEnd), concepts, soft, range: [start, scopeEnd] });
        }
      }
      index = text.indexOf(trigger, end);
    }
  }
  return results;
}

// Concepts negated inside a scope. A furniture word that follows a feature
// ("无扶手餐椅") keeps being the furniture type; only the feature is negated.
function scopeConcepts(scope) {
  const concepts = findZhConcepts(scope).map((found) => found.id);
  return concepts;
}

function conceptsInEnglish(scope) {
  return Object.entries(CONCEPTS).filter(([, concept]) => concept.en.test(scope)).map(([id]) => id);
}

function maskRanges(text, ranges) {
  let result = text;
  for (const [start, end] of ranges) result = `${result.slice(0, start)}${" ".repeat(end - start)}${result.slice(end)}`;
  return result;
}

function detectFurniture(text) {
  let best = null;
  for (const type of FURNITURE_TYPES) {
    for (const term of type.zh) {
      const index = text.indexOf(term);
      if (index === -1) continue;
      if (!best || index < best.index || (index === best.index && term.length > best.term.length)) best = { type, term, index };
    }
  }
  if (!best) {
    for (const { id, pattern } of EN_FURNITURE) {
      const match = text.match(pattern);
      if (match && (!best || match.index < best.index)) best = { type: FURNITURE_TYPES.find((type) => type.id === id), term: match[0], index: match.index };
    }
  }
  return best ? { ...best.type, matchedTerm: best.term } : null;
}

// The user's answer to a clarification: for each conflicting concept,
// "require" keeps the requirement and drops the prohibition, "prohibit" keeps
// the prohibition. Unanswered conflicts stay open.
function resolveConflicts(brief, resolution = {}) {
  let requirements = [...brief.requirements];
  let prohibitions = [...brief.prohibitions];
  let furniture = brief.furniture;
  const assumptions = [...(brief.assumptions || [])];
  const remaining = [];
  const resolved = [];
  for (const conflict of brief.conflicts || []) {
    const choice = resolution[conflict.concept];
    if (choice === "require") {
      // Keeping "圈椅" also lifts the bans that were only derived from "无扶手".
      prohibitions = prohibitions.filter((entry) => entry.concept !== conflict.concept && !(entry.derived && entry.from?.includes(conflict.concept)));
      const group = CONCEPTS[conflict.concept]?.group;
      requirements.push(item(group === "material" ? "material" : "feature", `${group === "material" ? "材料" : "需要"}：${conflict.label}（已确认）`, { concept: conflict.concept, en: CONCEPTS[conflict.concept].enTerm }));
      resolved.push({ ...conflict, choice });
    } else if (choice === "prohibit") {
      resolved.push({ ...conflict, choice });
    } else {
      remaining.push(conflict);
    }
  }
  // An armchair-type word (圈椅, 官帽椅) with its arms ruled out is a plain chair;
  // never send "armchair, no armrests".
  if (furniture?.id === "armchair" && prohibitions.some((entry) => entry.concept === "armrest" && entry.strength === "hard")) {
    const chair = FURNITURE_TYPES.find((type) => type.id === "chair");
    furniture = { id: chair.id, label: chair.label, en: chair.en, family: chair.family };
    requirements = requirements.map((entry) => (entry.kind === "furniture" ? item("furniture", `家具类型：${chair.label}`, { value: chair.id, en: chair.en, family: chair.family }) : entry));
    assumptions.push(`按「${resolved.find((entry) => entry.concept === "armrest")?.prohibitedBy || "无扶手"}」，家具类型按${chair.label}处理`);
  }
  return { ...brief, furniture, requirements, prohibitions, assumptions, conflicts: remaining, resolved: [...(brief.resolved || []), ...resolved], needsClarification: remaining.some((conflict) => conflict.blocking) };
}

// The user's text as confirmed. After "按「圈椅」" the words "无扶手" no longer
// apply; after "按「无扶手」" the type word 圈椅 reads as the plain chair it
// became. Unresolved text is returned unchanged.
function promptSource(brief) {
  let text = String(brief.source || "");
  for (const entry of brief.resolved || []) {
    if (entry.choice === "require" && entry.prohibitedBy) text = text.split(`${entry.prohibitedBy}的`).join("").split(entry.prohibitedBy).join("");
    const isTypeWord = FURNITURE_TYPES.some((type) => type.zh.includes(entry.requiredBy));
    if (entry.choice === "prohibit" && isTypeWord && brief.furniture && entry.requiredBy !== brief.furniture.label) text = text.split(entry.requiredBy).join(brief.furniture.label);
  }
  return text.replace(/^[的，,、\s]+/, "").replace(/([，,、])[\s的]+/g, "$1").trim() || String(brief.source || "");
}

// Locked items as short English lines for the image prompt.
function briefPromptLines(brief) {
  const lines = [];
  if (brief.furniture) lines.push(`furniture type: ${brief.furniture.en}`);
  for (const entry of brief.requirements) {
    if (entry.kind === "material") lines.push(entry.exclusive ? `made entirely of ${entry.en}` : `material: ${entry.en}`);
    else if (entry.kind === "feature") lines.push(`must have ${entry.en}`);
    else if (entry.kind === "quantity") lines.push(`for ${entry.value.replace(/[^0-9一二两三四五六七八]/g, "")} people`);
  }
  for (const entry of brief.prohibitions.filter((ban) => ban.strength === "hard")) lines.push(`no ${entry.en}`);
  return lines;
}

// Items the reviewer must answer one by one.
function checklistItems(brief) {
  return [...brief.requirements, ...brief.prohibitions].map((entry) => ({
    id: entry.id,
    label: entry.label,
    kind: entry.kind,
    concept: entry.concept || null,
    en: entry.en || "",
    exclusive: Boolean(entry.exclusive),
    strength: entry.strength,
    visual: entry.visual !== false,
  }));
}

module.exports = {
  FURNITURE_TYPES,
  PRIORITY,
  briefPromptLines,
  checklistItems,
  parseBrief,
  resolveConflicts,
  promptSource,
};
