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
  {
    id: "contemporary-circle-chair",
    form: "圈椅",
    title: "薄截面连续曲木圈椅",
    titleTw: "薄截面連續曲木圈椅",
    titleEn: "Continuous bentwood circle chair",
    category: "当代转译",
    keywords: ["明式", "圈椅", "扶手", "靠背", "椅", "曲木", "餐椅", "chair"],
    teachingPoint: "拿掉明式圈椅的雕花和厚重鹅脖，改用整根白橡木弯出连续扶手，截面收薄后轮廓立刻变轻，再配可拆洗织物坐垫。",
    teachingPointTw: "拿掉明式圈椅的雕花和厚重鵝脖，改用整根白橡木彎出連續扶手，截面收薄後輪廓立刻變輕，再配可拆洗織物坐墊。",
    teachingPointEn: "Skip the Ming carvings and thick posts: steam-bend one white oak piece into a continuous arm, slim the profile, and add a removable fabric cushion.",
    designPrinciples: ["连续曲木", "薄截面", "哑光白橡木", "可拆织物座面"],
    commonIssues: ["人工包浆", "扶手过厚", "繁复雕花"],
  },
  {
    id: "contemporary-recessed-leg-table",
    form: "案",
    title: "把腿往里收的当代长案",
    titleTw: "把腿往裡收的當代長案",
    titleEn: "Recessed-leg contemporary long table",
    category: "当代转译",
    keywords: ["案", "长案", "书案", "茶案", "夹头榫", "桌", "table"],
    teachingPoint: "沿用夹头榫稳住平直案面，但把四条腿往桌面内侧缩进一截，坐下时膝盖不被挡住，侧面看像桌板轻轻浮起来一样。",
    teachingPointTw: "沿用夾頭榫穩住平直案面，但把四條腿往桌面內側縮進一截，坐下時膝蓋不會被擋住，側面看像桌板輕輕浮起來一樣。",
    teachingPointEn: "Bridle-joint stability meets a crisp flat top, while legs set inward clear your knees and make the tabletop look like it floats from the side.",
    designPrinciples: ["腿足内收", "夹头榫", "平直案面", "新木哑光", "留膝空间"],
    commonIssues: ["开裂漆面", "仿古纹饰", "腿足连接悬空"],
  },
  {
    id: "contemporary-rounded-cabinet",
    form: "圆角柜",
    title: "把门做平的极简圆角柜",
    titleTw: "把門做平的極簡圓角櫃",
    titleEn: "Flush-door minimalist rounded cabinet",
    category: "当代转译",
    keywords: ["柜", "圆角柜", "对开门", "格栅门", "收纳", "cabinet"],
    teachingPoint: "留住圆角柜柔和的圆润立柱，把厚门框和铜合页换成平齐整板与内嵌隐藏拉手，立面一片干净，内部改成模块化格层。",
    teachingPointTw: "留住圓角櫃柔和的圓潤立柱，把厚門框和銅鉸鏈換成平齊整板與內嵌隱藏拉手，立面一片乾淨，內部改成模組化隔層。",
    teachingPointEn: "Keep the soft rounded corner posts while trading heavy frames and brass hardware for flush panels, recessed pulls, and clean modular storage inside.",
    designPrinciples: ["圆角立柱", "简化门框", "平整饰面", "隐藏拉手", "模块收纳"],
    commonIssues: ["褪色饰面", "陈列台", "五金堆叠"],
  },
];

function getReferenceCases() {
  return REFERENCE_CASES.map(publicCase);
}

function matchReferenceCases(text, limit = 3, fallback = true) {
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

  return scored.length || !fallback ? scored : REFERENCE_CASES.filter(item => item.form).slice(0, limit).map(publicCase);
}

function formatReferenceContext(cases) {
  return (cases || [])
    .map((item) => {
      const principles = (item.designPrinciples || []).join("；");
      const issues = (item.commonIssues || []).join("；");
      const teachingPoint = item.teachingPoint ? `${item.teachingPoint} ` : "";
      return `${item.title}（${item.category}）：${teachingPoint}评价要点：${principles}。常见问题：${issues}。`;
    })
    .join("\n");
}

function publicCase(item) {
  const { keywords, form, ...publicFields } = item;
  return publicFields;
}

module.exports = {
  getReferenceCases,
  matchReferenceCases,
  formatReferenceContext,
};
