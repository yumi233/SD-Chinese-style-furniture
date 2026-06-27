const RUBRIC_LABELS = {
  cultureAccuracy: "文化准确性",
  structureReasoning: "结构合理性",
  materialCraft: "材料工艺",
  designInnovation: "设计创新",
  sceneFit: "场景适配",
  aiUsage: "AI 使用规范",
};

function buildCompetitionReport(record) {
  const bestEvaluation = record.bestEvaluation || bestRound(record)?.evaluation || {};
  const referenceCases = record.referenceCases || [];
  const compliance = record.compliance || {};

  return [
    `# ${record.title || "中式家具 AI 教学智能体作品说明"}`,
    "",
    "## 作品概述",
    `本作品面向中式家具设计教学与实训场景，围绕“${record.originalPrompt || record.finalPrompt || "中式家具方案设计"}”开展生成、评价、反馈与再设计。系统通过图像生成模型、视觉评审模型和中式家具案例知识库，帮助学生把自然语言设计目标转化为可视化方案，并理解其中的形制、结构、材料和空间适配问题。`,
    "",
    "## 痛点问题与应用场景",
    "- 学生在中式家具学习中容易停留在风格模仿，难以同步判断比例、榫卯、材料和空间功能。",
    "- 传统作业反馈周期较长，教师难以及时给出多轮结构化修改建议。",
    "- 本智能体适用于中式家具设计、家具史、木作工艺、室内陈设和数字设计表达等课程。",
    "",
    "## 智能体设计",
    "- 设计目标解析：提取家具类型、材料、空间、风格和约束条件。",
    "- 方案生成：调用本地图像模型或图像大模型生成候选方案。",
    "- 教学评价：按文化准确性、结构合理性、材料工艺、设计创新、场景适配、AI 使用规范进行评分。",
    "- 学习反馈：输出优点、问题和下一轮修改建议，支持学生继续迭代。",
    "- 历史沉淀：保存生成轮次、评分、图片和 Prompt，便于课堂复盘和作品提交。",
    "",
    "## 核心功能与技术架构",
    `- 生成引擎：${formatList(record.engines || [record.engine]).join("、") || "未记录"}`,
    `- 生成轮次：${record.rounds?.length || 0} 轮`,
    `- 目标评分：${record.targetScore || "未设置"}；最佳评分：${record.bestScore ?? "未评分"}`,
    `- 最终 Prompt：${record.finalPrompt || "未记录"}`,
    "",
    "## 教学评价 Rubric",
    ...formatRubric(bestEvaluation.rubric),
    "",
    "## 学习反馈与改进建议",
    ...formatFeedback(bestEvaluation.learningFeedback, bestEvaluation),
    "",
    "## 案例知识库依据",
    ...(referenceCases.length
      ? referenceCases.map(
          (item) =>
            `- ${item.title}（${item.category}）：${item.teachingPoint} 参考要点：${formatList(item.designPrinciples).join("；")}`,
        )
      : ["- 本次记录未保存匹配案例，可在课堂中补充对应的形制、工艺或空间案例。"]),
    "",
    "## 合规与来源标注",
    `- AI 生成内容标识：${compliance.aiDisclosure || "本作品包含 AI 生成内容，提交时应明示标识。"}`,
    `- 素材/来源说明：${compliance.sourceNote || "未使用外部素材；如补充图片、视频或公开数据，应在提交材料中标注来源和用途。"}`,
    `- 模型使用记录：${formatList(compliance.modelUse).join("；") || "生成与评审模型由服务端记录，密钥不进入浏览器。"}`,
    "",
    "## 应用效果与创新点",
    "- 将“生成图片”升级为“生成-评价-反馈-再设计”的课堂闭环。",
    "- 以中式家具知识库约束生成与评价，减少单纯风格化和符号化输出。",
    "- 输出可复盘的评分与修改记录，便于教师检查学生的 AI 使用过程和设计判断。",
  ].join("\n");
}

function buildDemoScript(record) {
  const evaluation = record.bestEvaluation || bestRound(record)?.evaluation || {};
  const feedback = normalizeFeedback(evaluation.learningFeedback, evaluation);
  const cases = record.referenceCases || [];

  return [
    `# ${record.title || "木生 AI 教学智能体"}演示视频文案`,
    "",
    "## 0:00-0:20 场景与痛点",
    "在中式家具设计课程中，学生需要同时理解形制比例、榫卯结构、材料工艺和空间应用。传统作业往往反馈周期长，学生很难在一次练习中完成多轮修改。",
    "",
    "## 0:20-0:55 输入教学任务",
    `教师或学生输入设计目标：“${record.originalPrompt || record.finalPrompt || "中式家具设计任务"}”。系统自动解析家具类型、材料、空间和设计约束，并生成适合图像模型的 Prompt。`,
    "",
    "## 0:55-1:35 智能体生成与评价",
    `智能体完成 ${record.rounds?.length || 0} 轮生成，最佳评分为 ${record.bestScore ?? "未评分"} 分。评价维度包括文化准确性、结构合理性、材料工艺、设计创新、场景适配和 AI 使用规范。`,
    "",
    "## 1:35-2:20 学习反馈",
    `系统指出方案优点：${feedback.strengths.join("；") || "方案已形成可讨论基础"}。`,
    `系统指出待改进问题：${feedback.issues.join("；") || "暂无明显问题"}。`,
    `下一步建议：${feedback.nextSteps.join("；") || "继续围绕结构、材料和场景细化"}。`,
    "",
    "## 2:20-2:45 案例知识库",
    cases.length
      ? `本次匹配的参考案例包括：${cases.map((item) => item.title).join("、")}，用于解释设计依据和常见错误。`
      : "系统内置明式圈椅、官帽椅、罗汉床、榫卯、材料工艺和茶室/书房等参考案例。",
    "",
    "## 2:45-3:00 总结",
    "木生 AI 不只生成效果图，还把生成过程转化为可评价、可反馈、可复盘的教学活动，帮助学生提升中式家具设计判断与规范使用 AI 的能力。",
  ].join("\n");
}

function formatRubric(rubric = {}) {
  return Object.entries(RUBRIC_LABELS).map(([key, label]) => {
    const value = Number.isFinite(Number(rubric[key])) ? Number(rubric[key]) : "--";
    return `- ${label}：${value} / 100`;
  });
}

function formatFeedback(rawFeedback, evaluation = {}) {
  const feedback = normalizeFeedback(rawFeedback, evaluation);
  return [
    `- 符合规律：${feedback.strengths.join("；") || "待课堂评审补充"}`,
    `- 不合理之处：${feedback.issues.join("；") || "暂未发现明显问题"}`,
    `- 下一步修改：${feedback.nextSteps.join("；") || evaluation.suggestion || "继续围绕课程目标细化"}`,
  ];
}

function normalizeFeedback(rawFeedback, evaluation = {}) {
  return {
    strengths: formatList(rawFeedback?.strengths || evaluation.strengths),
    issues: formatList(rawFeedback?.issues || evaluation.problems),
    nextSteps: formatList(rawFeedback?.nextSteps || evaluation.suggestion),
  };
}

function formatList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  const normalized = String(value || "").trim();
  return normalized ? [normalized] : [];
}

function bestRound(record) {
  if (!record?.rounds?.length) {
    return null;
  }
  return (
    record.rounds.find((round) => round.round === record.bestRound) ||
    record.rounds.reduce((best, item) => {
      const bestScore = Number(best?.evaluation?.score || 0);
      const itemScore = Number(item?.evaluation?.score || 0);
      return itemScore > bestScore ? item : best;
    }, record.rounds[0])
  );
}

module.exports = {
  RUBRIC_LABELS,
  buildCompetitionReport,
  buildDemoScript,
};
