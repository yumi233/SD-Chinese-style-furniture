const REFERENCE_CASES = [
  {
    id: "ming-circle-chair",
    title: "明式圈椅",
    category: "经典形制",
    keywords: ["明式", "圈椅", "扶手", "靠背", "椅"],
    teachingPoint: "用连续扶手、克制曲线和轻巧比例说明明式家具的结构美学。",
    designPrinciples: ["比例轻盈", "扶手与靠背连续", "榫卯节点清晰", "装饰克制"],
    commonIssues: ["扶手过厚", "靠背角度失真", "椅腿比例笨重", "雕花堆叠"],
    source: "课程内置参考：明式家具形制与比例规律",
  },
  {
    id: "official-hat-chair",
    title: "官帽椅",
    category: "经典形制",
    keywords: ["官帽椅", "椅", "搭脑", "扶手", "明式"],
    teachingPoint: "通过搭脑、扶手和腿足关系训练学生识别传统座椅的结构秩序。",
    designPrinciples: ["搭脑突出但不过分夸张", "扶手转折自然", "腿足垂直稳定", "构件关系清楚"],
    commonIssues: ["搭脑像现代靠枕", "扶手悬浮", "腿足不承重", "构件穿插错误"],
    source: "课程内置参考：传统座椅构件识别",
  },
  {
    id: "luohan-bed",
    title: "罗汉床",
    category: "空间家具",
    keywords: ["罗汉床", "榻", "床", "茶室", "书房"],
    teachingPoint: "用于分析围子、榻面和空间陈设之间的尺度关系。",
    designPrinciples: ["围子层次明确", "榻面比例舒展", "陈设留白", "适合会客或休憩场景"],
    commonIssues: ["围子像沙发靠背", "尺度过大", "纹样过密", "空间用途不明确"],
    source: "课程内置参考：中式空间家具尺度关系",
  },
  {
    id: "mortise-tenon",
    title: "榫卯结构",
    category: "工艺结构",
    keywords: ["榫卯", "结构", "连接", "木作", "工艺"],
    teachingPoint: "把 AI 生成结果转化为结构观察任务，检查连接是否可制造、可承重。",
    designPrinciples: ["连接位置合理", "构件受力连续", "节点不过度装饰", "结构与造型一致"],
    commonIssues: ["连接悬空", "构件穿模", "节点无法加工", "装饰掩盖结构"],
    source: "课程内置参考：木作连接与结构合理性",
  },
  {
    id: "wood-material",
    title: "木材与表面工艺",
    category: "材料工艺",
    keywords: ["黑胡桃木", "胡桃木", "红木", "木纹", "材质", "髹漆"],
    teachingPoint: "训练学生判断木纹、色泽、反光和工艺表达是否可信。",
    designPrinciples: ["木纹方向符合构件", "表面反光克制", "色泽与木种一致", "材料表达服务结构"],
    commonIssues: ["木纹方向混乱", "塑料感反光", "材质与形制冲突", "纹理过度锐化"],
    source: "课程内置参考：中式家具材料与表面处理",
  },
  {
    id: "tea-room-scene",
    title: "茶室与书房场景",
    category: "应用场景",
    keywords: ["茶室", "书房", "公寓", "空间", "陈设", "留白"],
    teachingPoint: "把单件家具放入真实教学任务，评估它是否适配使用人群和空间功能。",
    designPrinciples: ["动线清楚", "家具尺度适配空间", "陈设不过度抢戏", "文化氛围与功能统一"],
    commonIssues: ["场景喧宾夺主", "尺度不匹配", "用户需求缺失", "符号化堆砌"],
    source: "课程内置参考：中式家具空间应用",
  },
];

function getReferenceCases() {
  return REFERENCE_CASES.map(({ keywords, ...publicCase }) => ({ ...publicCase }));
}

function matchReferenceCases(text, limit = 3) {
  const normalized = String(text || "").toLowerCase();
  const scored = REFERENCE_CASES.map((item) => {
    const score = item.keywords.reduce((total, keyword) => {
      return normalized.includes(String(keyword).toLowerCase()) ? total + 1 : total;
    }, 0);
    return { item, score };
  })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ item }) => publicCase(item));

  return scored.length ? scored : REFERENCE_CASES.slice(0, limit).map(publicCase);
}

function formatReferenceContext(cases) {
  return (cases || [])
    .map((item) => {
      const principles = (item.designPrinciples || []).join("；");
      const issues = (item.commonIssues || []).join("；");
      return `${item.title}（${item.category}）：${item.teachingPoint} 评价要点：${principles}。常见问题：${issues}。`;
    })
    .join("\n");
}

function publicCase(item) {
  const { keywords, ...publicFields } = item;
  return { ...publicFields };
}

module.exports = {
  getReferenceCases,
  matchReferenceCases,
  formatReferenceContext,
};
