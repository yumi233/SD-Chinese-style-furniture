const assert = require("node:assert/strict");
const test = require("node:test");
const { buildCompetitionReport, buildDemoScript } = require("../src/reportBuilder");

test("competition report and demo script include teaching evidence", () => {
  const record = {
    title: "明式圈椅教学任务",
    type: "agent",
    originalPrompt: "设计一张适合年轻人公寓的明式圈椅",
    finalPrompt: "final prompt",
    engines: ["automatic1111"],
    targetScore: 85,
    bestScore: 91,
    bestRound: 1,
    referenceCases: [
      {
        title: "明式圈椅",
        category: "经典形制",
        teachingPoint: "观察连续扶手、轻巧比例和克制装饰。",
        designPrinciples: ["比例轻盈", "榫卯清晰"],
      },
    ],
    compliance: {
      aiDisclosure: "本作品图像由生成式 AI 辅助生成。",
      sourceNote: "参考课程案例库。",
      modelUse: ["生成引擎：automatic1111", "视觉评审模型：vision-model"],
    },
    bestEvaluation: {
      score: 91,
      rubric: {
        cultureAccuracy: 92,
        structureReasoning: 90,
        materialCraft: 89,
        designInnovation: 86,
        sceneFit: 91,
        aiUsage: 95,
      },
      learningFeedback: {
        strengths: ["比例关系清楚"],
        issues: ["场景尺度还可细化"],
        nextSteps: ["补充空间尺度参照"],
      },
    },
    rounds: [{ round: 1, evaluation: { score: 91 } }],
  };

  const report = buildCompetitionReport(record);
  assert.match(report, /教学评价 Rubric/);
  assert.match(report, /文化准确性：92/);
  assert.match(report, /比例关系清楚/);
  assert.match(report, /明式圈椅/);
  assert.match(report, /生成式 AI/);

  const demo = buildDemoScript(record);
  assert.match(demo, /演示视频文案/);
  assert.match(demo, /最佳评分为 91/);
  assert.match(demo, /补充空间尺度参照/);
});
