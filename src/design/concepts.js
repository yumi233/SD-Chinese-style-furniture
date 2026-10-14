// Shared vocabulary for design constraints. The same concepts are detected in
// the user's (mostly Chinese) brief and in the English prompt clauses the
// studio adds, so a style preset can be checked against what the user locked.

const CONCEPTS = {
  armrest: {
    label: "扶手",
    group: "feature",
    zh: ["扶手"],
    en: /\b(arm ?rests?|arms|armchairs?)\b/i,
    enTerm: "armrests",
  },
  horseshoeBack: {
    label: "圈椅式椅圈",
    group: "form",
    zh: ["圈椅", "椅圈", "马蹄形"],
    en: /\b(horseshoe|round-?back(ed)?|continuous (curved |bent )?(top )?rail)\b/i,
    enTerm: "horseshoe-back round chair rail",
    implies: ["armrest"],
  },
  officialHat: {
    label: "官帽椅形制",
    group: "form",
    zh: ["官帽椅"],
    en: /\b(official'?s? ?hat|yoke(-shaped)? top rail)\b/i,
    enTerm: "official's hat chair form",
    implies: ["armrest"],
  },
  backrest: {
    label: "靠背",
    group: "feature",
    zh: ["靠背"],
    en: /\bback ?rests?\b/i,
    enTerm: "backrest",
  },
  wood: {
    label: "木材",
    group: "material",
    zh: ["黑胡桃木", "胡桃木", "白蜡木", "实木", "木材", "木头", "木质", "原木", "黑胡桃", "胡桃", "橡木", "白蜡", "榆木", "樱桃木", "柚木", "红木", "黄花梨", "紫檀", "鸡翅木", "枫木", "松木", "木纹", "木"],
    en: /\b(wood|wooden|woodwork(ing)?|walnut|oak|ash(wood)?(?!\s*gr[ae]y)|timber|hardwood|plywood|elm|rosewood|maple|cherry ?wood|teak|huanghuali|zitan|veneer)\b/i,
    enTerm: "wood",
  },
  metal: {
    label: "金属",
    group: "material",
    zh: ["金属", "不锈钢", "钢管", "钢", "铝合金", "铝", "黄铜", "铜", "铸铁", "铁", "钛"],
    en: /\b(metal|metallic|steel|stainless|alumin(i)?um|brass|bronze|copper|iron|titanium|chrome|powder[- ]coat(ed)?)\b/i,
    enTerm: "metal",
  },
  bamboo: { label: "竹", group: "material", zh: ["竹编", "竹子", "竹"], en: /\bbamboo\b/i, enTerm: "bamboo" },
  rattan: { label: "藤", group: "material", zh: ["藤编", "藤"], en: /\b(rattan|wicker|cane)\b/i, enTerm: "rattan" },
  stone: {
    label: "石材",
    group: "material",
    zh: ["石材", "大理石", "岩板", "水磨石", "洞石", "微水泥"],
    en: /\b(stone|marble|travertine|terrazzo|granite|microcement|concrete)\b/i,
    enTerm: "stone",
  },
  glass: { label: "玻璃", group: "material", zh: ["玻璃"], en: /\bglass\b/i, enTerm: "glass" },
  upholstery: {
    label: "软包坐垫",
    group: "material",
    zh: ["软包", "坐垫", "靠垫", "布艺", "海绵"],
    en: /\b(cushions?|upholster(y|ed)|padded|pads?)\b/i,
    enTerm: "cushion or upholstery",
  },
  fabric: { label: "织物", group: "material", zh: ["亚麻", "羊毛", "棉麻", "织物"], en: /\b(linen|fabric|wool|textile|boucl[eé])\b/i, enTerm: "fabric" },
  leather: { label: "皮革", group: "material", zh: ["皮革", "真皮"], en: /\bleather\b/i, enTerm: "leather" },
  lacquer: { label: "漆面", group: "finish", zh: ["大漆", "漆面", "烤漆"], en: /\blacquer(ed)?\b/i, enTerm: "lacquer" },
  carving: { label: "雕花", group: "ornament", zh: ["雕花", "雕刻", "浮雕"], en: /\b(carv(ed|ing)|ornate|ornament(al|ation)?)\b/i, enTerm: "carving and ornament" },
  lattice: { label: "格栅棂格", group: "ornament", zh: ["格栅", "棂格", "窗棂"], en: /\b(lattice|slatted|slats?|battens?)\b/i, enTerm: "lattice" },
  symbolMotif: { label: "龙凤祥云等符号", group: "ornament", zh: ["龙凤", "龙纹", "祥云", "回纹"], en: /\b(dragon|phoenix|cloud scroll|fret pattern)\b/i, enTerm: "dragon, phoenix and cloud motifs" },
  antique: { label: "仿古做旧", group: "style", zh: ["仿古", "古董", "做旧"], en: /\b(antique|replica|aged patina|patina)\b/i, enTerm: "antique replica" },
};

const MATERIAL_CONCEPTS = Object.entries(CONCEPTS).filter(([, concept]) => concept.group === "material").map(([id]) => id);

// Words that contain a concept character but mean something else.
const FALSE_FRIENDS = ["木生", "积木", "麻木", "苗木", "木讷", "石大宇", "调皮", "皮肤"];

function maskFalseFriends(text) {
  let masked = String(text || "");
  for (const word of FALSE_FRIENDS) masked = masked.split(word).join("\u0000".repeat(word.length));
  return masked;
}

// Concept ids whose Chinese terms appear in the text, longest terms first so
// "胡桃木" is read once as wood.
function findZhConcepts(text) {
  let rest = maskFalseFriends(text);
  const found = [];
  const terms = Object.entries(CONCEPTS)
    .flatMap(([id, concept]) => concept.zh.map((term) => ({ id, term })))
    .sort((a, b) => b.term.length - a.term.length);
  for (const { id, term } of terms) {
    let index = rest.indexOf(term);
    while (index !== -1) {
      found.push({ id, term, index });
      rest = `${rest.slice(0, index)}${"\u0000".repeat(term.length)}${rest.slice(index + term.length)}`;
      index = rest.indexOf(term, index + term.length);
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

// Concepts an English prompt clause asks for. A clause that names a concept only
// to exclude it ("no armrests", "without wood") does not ask for it.
const EN_NEGATION = /\b(no|without|not|never|avoid(ing)?|free of|non|minus|except|remove|removing|eliminate|delete|drop)\b/i;

function findEnConcepts(text) {
  const clause = String(text || "");
  const positive = [];
  const negative = [];
  for (const [id, concept] of Object.entries(CONCEPTS)) {
    const pattern = new RegExp(concept.en.source, "gi");
    let match = pattern.exec(clause);
    while (match) {
      const before = clause.slice(Math.max(0, match.index - 40), match.index);
      const negated = EN_NEGATION.test(before.split(/[,;.]/).pop() || "");
      (negated ? negative : positive).push(id);
      match = pattern.exec(clause);
    }
  }
  return { positive: [...new Set(positive)], negative: [...new Set(negative)] };
}

// A prohibition also excludes concepts that cannot exist without it: a
// horseshoe-back chair always has arms, so "no armrests" excludes it too.
function expandProhibited(ids) {
  const result = new Set(ids);
  for (const [id, concept] of Object.entries(CONCEPTS)) {
    if ((concept.implies || []).some((implied) => result.has(implied))) result.add(id);
  }
  return [...result];
}

function conceptLabel(id) {
  return CONCEPTS[id]?.label || id;
}

module.exports = {
  CONCEPTS,
  MATERIAL_CONCEPTS,
  conceptLabel,
  expandProhibited,
  findEnConcepts,
  findZhConcepts,
  maskFalseFriends,
};
