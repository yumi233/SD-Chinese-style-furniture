// "Continue refining" works on the previous image: the change request is
// turned into an explicit modification scope, and everything the user did not
// mention is listed as locked so the reviewer can check it stayed the same.
const COMPONENTS = [
  { id: "backrest", label: "靠背", en: "backrest", zh: ["靠背", "背板", "椅背"] },
  { id: "toprail", label: "搭脑", en: "top rail", zh: ["搭脑", "椅圈"] },
  { id: "armrest", label: "扶手", en: "armrests", zh: ["扶手"] },
  { id: "seat", label: "座面与坐垫", en: "seat and cushion", zh: ["坐垫", "座面", "座板", "椅面", "垫子"] },
  { id: "legs", label: "腿足", en: "legs", zh: ["腿足", "椅腿", "桌腿", "腿", "足"] },
  { id: "stretcher", label: "横枨", en: "stretchers", zh: ["横枨", "枨", "拉档"] },
  { id: "top", label: "台面", en: "top surface", zh: ["桌面", "台面", "面板"] },
  { id: "apron", label: "牙板", en: "apron", zh: ["牙板", "牙条", "牙子"] },
  { id: "doors", label: "柜门与抽屉", en: "doors and drawers", zh: ["柜门", "门板", "抽屉"] },
  { id: "color", label: "颜色", en: "colours", zh: ["颜色", "色彩", "配色", "黑色", "白色", "米色", "灰色", "绿色", "红色"] },
  { id: "material", label: "材质", en: "materials", zh: ["材质", "材料", "木头", "金属", "亚麻", "皮革", "藤", "竹", "石材", "玻璃"] },
  { id: "proportion", label: "比例尺寸", en: "proportions", zh: ["比例", "尺寸", "高度", "宽度", "更高", "更矮", "更宽", "更窄", "更薄", "更厚", "更细", "更粗"] },
  { id: "background", label: "背景与场景", en: "background and setting", zh: ["背景", "场景", "环境", "房间"] },
  { id: "camera", label: "视角与构图", en: "camera angle and composition", zh: ["视角", "角度", "构图", "镜头"] },
];

// What stays locked unless the request names it.
const DEFAULT_KEEP = ["silhouette", "materials", "colours", "proportions", "camera angle and composition", "background and setting"];

const KEEP_WORDS = /(保留|保持|不变|别动|不要动|维持)/;
// Parts worth naming in the "keep unchanged" list for each furniture family.
const FAMILY_PARTS = {
  seat: ["backrest", "toprail", "armrest", "seat", "legs", "stretcher"],
  bench: ["seat", "legs", "stretcher", "backrest"],
  stool: ["seat", "legs"],
  table: ["top", "legs", "apron", "stretcher"],
  cabinet: ["top", "doors", "legs"],
  screen: ["legs"],
  bed: ["backrest", "seat", "legs"],
};

function parseEdit(text, { family } = {}) {
  const request = String(text || "").replace(/^基于上一版继续细化[:：]?/, "").trim();
  const clauses = request.split(/[，,。；;\n]+/).map((part) => part.trim()).filter(Boolean);
  const scope = [];
  const touched = new Set();
  const kept = [];
  for (const clause of clauses) {
    if (KEEP_WORDS.test(clause)) {
      kept.push(clause);
      continue;
    }
    const components = COMPONENTS.filter((component) => component.zh.some((term) => clause.includes(term)));
    for (const component of components) touched.add(component.id);
    scope.push(clause);
  }
  const touchedEn = COMPONENTS.filter((component) => touched.has(component.id));
  // A request that changes one part keeps the global aspects it did not name.
  const keep = DEFAULT_KEEP.filter((aspect) => {
    if (aspect === "materials") return !touched.has("material") && !touched.has("seat");
    if (aspect === "colours") return !touched.has("color");
    if (aspect === "proportions") return !touched.has("proportion");
    if (aspect === "camera angle and composition") return !touched.has("camera");
    if (aspect === "background and setting") return !touched.has("background");
    return true;
  });
  const parts = FAMILY_PARTS[family] || COMPONENTS.map((component) => component.id);
  const untouchedParts = COMPONENTS.filter((component) => parts.includes(component.id) && !touched.has(component.id)).map((component) => component.en);
  return {
    request,
    scope,
    components: touchedEn.map((component) => ({ id: component.id, label: component.label })),
    keep: [...keep, ...untouchedParts.map((part) => `the ${part}`)],
    keepNotes: kept,
    labels: {
      scope: scope.length ? scope : ["按描述微调"],
      keep: ["整体轮廓", ...COMPONENTS.filter((component) => (parts.includes(component.id) || ["color", "material", "proportion", "background"].includes(component.id)) && !touched.has(component.id)).map((component) => component.label), ...(touched.has("camera") ? [] : ["视角与构图"])],
    },
  };
}

module.exports = {
  COMPONENTS,
  parseEdit,
};
