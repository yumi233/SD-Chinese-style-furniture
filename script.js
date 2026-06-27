const styleTemplates = {
  ming:
    "Ming-style Chinese furniture, horseshoe-back armchair, mortise and tenon joinery, walnut wood texture, restrained proportions, elegant silhouette, premium studio photography",
  newChinese:
    "new Chinese furniture design, contemporary oriental aesthetics, warm wood grain, stone and wood pairing, soft layered lighting, refined interior styling",
  song:
    "Song dynasty aesthetics, calm tea room, subtle texture, light ink-like palette, minimal composition, quiet spatial rhythm, poetic atmosphere",
  zen:
    "zen interior scene, natural wood, linen and stone materials, meditative composition, diffused daylight, calm and airy atmosphere, contemplative mood",
};

const styleLabels = {
  ming: "\u660e\u5f0f\u5bb6\u5177",
  newChinese: "\u65b0\u4e2d\u5f0f",
  song: "\u5b8b\u97f5",
  zen: "\u7985\u610f\u7a7a\u95f4",
};

const qualityMap = {
  standard: "clean furniture form, clear structure",
  hd: "ultra detailed wood grain, high resolution, refined craftsmanship",
  ultra: "extremely detailed joinery, premium material texture, showroom-grade rendering",
};

const qualityLabels = {
  standard: "\u666e\u901a",
  hd: "\u9ad8\u6e05",
  ultra: "\u8d85\u7cbe\u7ec6",
};
const defaultSizeValue = "16:9-720p";

const sizePresets = {
  "16:9-720p": { label: "16:9 720p", resolution: "1280 × 720", width: 1280, height: 720 },
  "16:9-1080p": { label: "16:9 1080p", resolution: "1920 × 1080", width: 1920, height: 1080 },
  "4:3-720p": { label: "4:3 720p", resolution: "960 × 720", width: 960, height: 720 },
  "4:3-1080p": { label: "4:3 1080p", resolution: "1440 × 1080", width: 1440, height: 1080 },
  512: { label: "512 × 512", resolution: "512 × 512", width: 512, height: 512 },
  768: { label: "768 × 768", resolution: "768 × 768", width: 768, height: 768 },
  1024: { label: "1024 × 1024", resolution: "1024 × 1024", width: 1024, height: 1024 },
  1536: { label: "1536 × 1536", resolution: "1536 × 1536", width: 1536, height: 1536 },
};

const engineLabels = {
  textModel: "文字大模型",
  automatic1111: "Stable Diffusion WebUI",
  comfyui: "ComfyUI",
  imageModel: "图像大模型",
  "automatic1111+imageModel": "SD WebUI + 图像大模型",
  "comfyui+imageModel": "ComfyUI + 图像大模型",
};

const rubricLabels = {
  cultureAccuracy: "文化准确性",
  structureReasoning: "结构合理性",
  materialCraft: "材料工艺",
  designInnovation: "设计创新",
  sceneFit: "场景适配",
  aiUsage: "AI 使用规范",
};

const rerollVariants = [
  {
    key: "same",
    label: "\u540c\u53c2\u6570\u91cd\u8dd1",
    promptSuffix: "",
    moodDelta: 0,
  },
  {
    key: "angle",
    label: "\u6362\u4e2a\u89d2\u5ea6",
    promptSuffix: "alternate camera angle, slightly changed perspective, refined product framing",
    moodDelta: 4,
  },
  {
    key: "lighting",
    label: "\u66f4\u5f3a\u5149\u5f71",
    promptSuffix: "stronger light contrast, richer shadow layering, more dramatic atmosphere",
    moodDelta: 10,
  },
  {
    key: "minimal",
    label: "\u66f4\u514b\u5236\u9648\u8bbe",
    promptSuffix: "cleaner staging, more negative space, reduced surrounding props, minimalist styling",
    moodDelta: -8,
  },
];

const translationDictionary = [
  ["中式家具", "Chinese furniture"],
  ["新中式", "new Chinese style"],
  ["明式", "Ming style"],
  ["宋韵", "Song dynasty aesthetic"],
  ["禅意", "zen atmosphere"],
  ["圈椅", "round-back armchair"],
  ["官帽椅", "official hat chair"],
  ["罗汉床", "daybed"],
  ["茶桌", "tea table"],
  ["茶室", "tea room"],
  ["边几", "side table"],
  ["条案", "console table"],
  ["木作", "wood craftsmanship"],
  ["榫卯结构", "mortise and tenon joinery"],
  ["榫卯", "mortise and tenon"],
  ["黑胡桃木", "black walnut wood"],
  ["胡桃木", "walnut wood"],
  ["红木", "rosewood"],
  ["原木", "natural wood"],
  ["木纹细节", "detailed wood grain"],
  ["产品摄影", "product photography"],
  ["产品定妆图", "hero product shot"],
  ["室内设计", "interior design"],
  ["极简", "minimalist"],
  ["留白", "negative space"],
  ["留白克制", "restrained negative space"],
  ["素雅", "elegant and understated"],
  ["高级感", "premium aesthetic"],
  ["高级产品摄影", "high-end product photography"],
  ["工作室打光", "studio lighting"],
  ["自然光影", "natural light and shadow"],
  ["晨光", "morning sunlight"],
  ["晨光斜照", "diagonal morning sunlight"],
  ["斜照", "diagonal sunlight"],
  ["柔和光线", "soft lighting"],
  ["暖色调", "warm tone"],
  ["暖光", "warm lighting"],
  ["阴影层次", "layered shadows"],
  ["干净背景", "clean background"],
  ["米白墙面", "neutral beige wall"],
  ["空间陈设", "interior styling"],
  ["简洁构图", "clean composition"],
  ["构图", "composition"],
  ["真实材质", "realistic material texture"],
  ["真实纹理", "realistic texture"],
  ["写实", "photorealistic"],
  ["超精细", "ultra detailed"],
  ["高清", "high resolution"],
  ["单品", "single furniture piece"],
  ["一把椅子", "single chair"],
  ["一张椅子", "single chair"],
  ["一张桌子", "single table"],
  ["展示图", "showcase render"],
  ["渲染图", "rendered image"],
  ["背景墙", "background wall"],
  ["米色墙面", "beige wall"],
  ["地面", "flooring"],
];

const negativeTemplate =
  "deformed structure, wrong proportions, broken joints, unrealistic chair, extra legs, asymmetry, distorted geometry, plastic texture, low quality, blurry, noisy, overexposed, oversaturated, cartoon, CGI look, fake wood, cluttered background, messy scene, too many objects";

const uiText = {
  generating: "\u751f\u6210\u4e2d",
  completed: "\u5df2\u751f\u6210",
  failed: "\u751f\u6210\u5931\u8d25",
  loadingTitle: "正在调用家具图像生成引擎",
  loadingDesc:
    "后端会先执行可选的文字模型增强，再转发到当前选择的一个或多个图像引擎。",
  idleTitle: "\u7b49\u5f85\u4e0b\u4e00\u6b21\u751f\u6210",
  idleDesc:
    "\u70b9\u51fb\u4e0a\u65b9\u6309\u94ae\u540e\uff0c\u8fd9\u91cc\u4f1a\u663e\u793a\u672c\u5730\u6a21\u578b\u7684\u751f\u6210\u8fdb\u5ea6\u3002",
  zoom: "\u653e\u5927",
  download: "\u4e0b\u8f7d",
  reroll: "\u518d\u6765\u4e00\u7248",
  rerollMenu: "\u53d8\u5316\u65b9\u5f0f",
  refinePrefix: "\u57fa\u4e8e\u4e0a\u4e00\u7248\u7ee7\u7eed\u7ec6\u5316\uff1a",
  configSaved: "\u5df2\u4fdd\u5b58",
  configSaving: "\u4fdd\u5b58\u4e2d",
};

const apiBase =
  window.location.protocol === "file:"
    ? "http://127.0.0.1:3000/api"
    : `${window.location.origin}/api`;

const input = document.getElementById("promptInput");
const originalPromptView = document.getElementById("originalPromptView");
const translatedPromptView = document.getElementById("translatedPrompt");
const enhancedPrompt = document.getElementById("enhancedPrompt");
const negativePrompt = document.getElementById("negativePrompt");
const sourceNoteInput = document.getElementById("sourceNoteInput");
const aiDisclosureSelect = document.getElementById("aiDisclosureSelect");
const styleChips = document.getElementById("styleChips");
const qualitySegment = document.getElementById("qualitySegment");
const sizeSegment = document.getElementById("sizeSegment");
const moodRange = document.getElementById("moodRange");
const moodValue = document.getElementById("moodValue");
const generateButton = document.getElementById("generateButton");
const modelConfigButton = document.getElementById("modelConfigButton");
const galleryGrid = document.getElementById("galleryGrid");
const loadingCard = document.getElementById("loadingCard");
const statusChip = document.getElementById("generationStatus") || document.querySelector(".status-chip");
const refinePanel = document.getElementById("refinePanel");
const refineSummary = document.getElementById("refineSummary");
const refineButton = document.getElementById("refineButton");
const refinePreview = document.getElementById("refinePreview");
const refineMeta = document.getElementById("refineMeta");
const refineVersionLabel = document.getElementById("refineVersionLabel");
const clearPromptButton = document.getElementById("clearPromptButton");
const randomPromptButton = document.getElementById("randomPromptButton");
const promptCounter = document.querySelector(".counter");
const generationMode = document.getElementById("generationMode");
const agentSettings = document.getElementById("agentSettings");
const targetScoreSelect = document.getElementById("targetScore");
const maxAgentRoundsSelect = document.getElementById("maxAgentRounds");
const constraintCard = document.getElementById("constraintCard");
const mustHaveChips = document.getElementById("mustHaveChips");
const agentProcessStatus = document.getElementById("agentProcessStatus");
const agentPromptDiff = document.getElementById("agentPromptDiff");
const agentSummary = document.getElementById("agentSummary");
const agentChangeLog = document.getElementById("agentChangeLog");
const bestSolution = document.getElementById("bestSolution");
const bestSolutionMedia = document.getElementById("bestSolutionMedia");
const bestScoreBadge = document.getElementById("bestScoreBadge");
const bestSolutionTitle = document.getElementById("bestSolutionTitle");
const bestSolutionReason = document.getElementById("bestSolutionReason");
const cultureScore = document.getElementById("cultureScore");
const structureScore = document.getElementById("structureScore");
const craftScore = document.getElementById("craftScore");
const innovationScore = document.getElementById("innovationScore");
const sceneFitScore = document.getElementById("sceneFitScore");
const aiUsageScore = document.getElementById("aiUsageScore");
const learningStrengths = document.getElementById("learningStrengths");
const learningIssues = document.getElementById("learningIssues");
const learningNextSteps = document.getElementById("learningNextSteps");
const bestReferenceList = document.getElementById("bestReferenceList");
const bestComplianceList = document.getElementById("bestComplianceList");
const bestDownloadButton = document.getElementById("bestDownloadButton");
const bestRefineButton = document.getElementById("bestRefineButton");
const exportReportButton = document.getElementById("exportReportButton");
const exportDemoButton = document.getElementById("exportDemoButton");
const saveAgentProjectButton = document.getElementById("saveAgentProjectButton");
const currentResolution = document.getElementById("currentResolution");
const historyNavButton = document.getElementById("historyNavButton");
const historyCount = document.getElementById("historyCount");
const historyModal = document.getElementById("historyModal");
const historyGrid = document.getElementById("historyGrid");
const historyEmpty = document.getElementById("historyEmpty");
const refreshHistoryButton = document.getElementById("refreshHistoryButton");
const referenceCasesGrid = document.getElementById("referenceCasesGrid");
const configModal = document.getElementById("configModal");
const configStatus = document.getElementById("configStatus");
const engineSelect = document.getElementById("engineSelect");
const auto1111BaseUrlInput = document.getElementById("auto1111BaseUrlInput");
const auto1111ModelInput = document.getElementById("auto1111ModelInput");
const comfyBaseUrlInput = document.getElementById("comfyBaseUrlInput");
const comfyCheckpointInput = document.getElementById("comfyCheckpointInput");
const comfyWorkflowFileInput = document.getElementById("comfyWorkflowFileInput");
const textModelEnabledSelect = document.getElementById("textModelEnabledSelect");
const textModelBaseUrlInput = document.getElementById("textModelBaseUrlInput");
const textModelApiKeyInput = document.getElementById("textModelApiKeyInput");
const textModelNameInput = document.getElementById("textModelNameInput");
const imageModelBaseUrlInput = document.getElementById("imageModelBaseUrlInput");
const imageModelApiKeyInput = document.getElementById("imageModelApiKeyInput");
const imageModelNameInput = document.getElementById("imageModelNameInput");
const imageModelSizeInput = document.getElementById("imageModelSizeInput");
const visionModelBaseUrlInput = document.getElementById("visionModelBaseUrlInput");
const visionModelApiKeyInput = document.getElementById("visionModelApiKeyInput");
const visionModelNameInput = document.getElementById("visionModelNameInput");
const configCancelButton = document.getElementById("configCancelButton");
const configSaveButton = document.getElementById("configSaveButton");
const generationStore = new Map();
const lightbox = createLightbox();

let selectedStyle = "ming";
let selectedQuality = "hd";
let selectedSize = defaultSizeValue;
let lastGeneratedPrompt = "";
let refineHistory = [];
let selectedRefineIndex = 0;
let defaultEngine = "automatic1111";
let cardSequence = 0;
let currentConfig = null;
let selectedGenerationMode = "agent";
let bestAgentResult = null;
let historyRecords = [];
let referenceCases = [];

const inspirationPrompts = [
  "一张明式圈椅放在素雅茶室中，黑胡桃木，榫卯结构，晨光斜照，留白克制，高级产品摄影",
  "一张新中式茶桌置于米白色空间，温润胡桃木，石材茶盘，柔和自然光，极简陈设，品牌画册摄影",
  "一把官帽椅靠近竹影屏风，深色红木，细腻木纹，侧逆光，安静东方氛围，高端室内设计图",
  "一张罗汉床位于禅意书房，原木质感，亚麻坐垫，浅灰墙面，低饱和暖光，克制高级的产品渲染",
];

function composePrompt() {
  const basePrompt = input.value.trim();
  originalPromptView.value = basePrompt;
  renderRequirementChips(basePrompt);
  if (promptCounter) {
    promptCounter.textContent = `${Math.min(input.value.length, 1000)} / 1000`;
  }

  if (!basePrompt) {
    translatedPromptView.value = "";
    enhancedPrompt.value = "";
    return;
  }

  if (looksLikeStructuredPrompt(basePrompt)) {
    translatedPromptView.value = basePrompt;
    enhancedPrompt.value = basePrompt;
    return;
  }

  const translatedPrompt = containsChinese(basePrompt)
    ? translateChinesePrompt(basePrompt)
    : basePrompt;
  translatedPromptView.value = translatedPrompt;

  const moodTone =
    Number(moodRange.value) > 65
      ? "soft directional light, clearer atmosphere, restrained dramatic shadow"
      : "balanced studio light, restrained composition, product-focused framing";

  enhancedPrompt.value = [
    translatedPrompt,
    styleTemplates[selectedStyle],
    "single hero furniture piece, physically correct structure, refined woodworking detail, realistic material response",
    qualityMap[selectedQuality],
    moodTone,
  ]
    .filter(Boolean)
    .join(", ");

}

function renderRequirementChips(prompt) {
  if (!mustHaveChips) {
    return;
  }

  const candidates = [
    ["圈椅", "明式圈椅"],
    ["官帽椅", "官帽椅"],
    ["罗汉床", "罗汉床"],
    ["茶桌", "茶桌"],
    ["黑胡桃木", "黑胡桃木"],
    ["胡桃木", "胡桃木"],
    ["红木", "红木"],
    ["年轻人公寓", "年轻人公寓"],
    ["公寓", "公寓空间"],
    ["茶室", "茶室空间"],
    ["书房", "书房空间"],
    ["结构轻巧", "结构轻巧"],
    ["榫卯", "传统榫卯"],
    ["真实木纹", "真实木纹"],
    ["木纹", "真实木纹"],
    ["留白", "克制留白"],
  ];
  const chips = [];

  for (const [keyword, label] of candidates) {
    if (prompt.includes(keyword) && !chips.includes(label)) {
      chips.push(label);
    }
  }

  if (!chips.length && prompt.trim()) {
    chips.push(styleLabels[selectedStyle], "结构合理", "真实材质");
  }

  mustHaveChips.replaceChildren(
    ...chips.slice(0, 7).map((label) => {
      const chip = document.createElement("span");
      chip.textContent = label;
      return chip;
    }),
  );
}

function setGenerationMode(mode) {
  selectedGenerationMode = mode === "normal" ? "normal" : "agent";
  generationMode.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === selectedGenerationMode);
  });

  const agentMode = selectedGenerationMode === "agent";
  agentSettings.classList.toggle("hidden", !agentMode);
  constraintCard.classList.toggle("hidden", !agentMode);
  document.querySelector(".agent-process-card").classList.toggle("hidden", !agentMode);
  document.querySelector(".change-log-card").classList.toggle("hidden", !agentMode);
  generateButton.textContent = agentMode ? "✦ 启动智能体" : "✦ 生成图像";
}

function buildGenerationPayload(prompt = enhancedPrompt.value.trim()) {
  return {
    engine: defaultEngine,
    originalPrompt: input.value.trim(),
    prompt,
    enhancedPrompt: prompt,
    negativePrompt: negativePrompt.value.trim(),
    sourceNote: sourceNoteInput.value.trim(),
    aiDisclosure: aiDisclosureSelect.value,
    style: selectedStyle,
    quality: selectedQuality,
    size: selectedSize,
    mood: Number(moodRange.value),
  };
}

function resetAgentProcess() {
  document.querySelectorAll(".agent-step").forEach((step) => {
    step.classList.remove("active", "done", "failed");
    step.querySelector(".agent-step-status").textContent = "待执行";
    const result = step.querySelector(".agent-step-result");
    if (result) {
      result.classList.add("hidden");
    }
  });
  agentPromptDiff.classList.add("hidden");
  agentProcessStatus.textContent = "执行中";
  agentProcessStatus.classList.remove("idle", "success");
  agentSummary.innerHTML =
    "<span>迭代 <strong>0</strong> 轮</span><span>生成 <strong>0</strong> 张</span><span>最佳评分 <strong>--</strong></span>";
  agentChangeLog.innerHTML = [
    "<li><span>01</span><p>正在生成第一版家具方案</p></li>",
    "<li><span>02</span><p>等待结构与材质评审</p></li>",
    "<li><span>03</span><p>等待形成优化提示词</p></li>",
  ].join("");
}

function setAgentStep(stepNumber, state, details = {}) {
  const step = document.querySelector(`[data-agent-step="${stepNumber}"]`);
  if (!step) {
    return;
  }

  step.classList.remove("active", "done", "failed");
  step.classList.add(state);
  const status = step.querySelector(".agent-step-status");
  status.textContent =
    details.status || (state === "active" ? "执行中" : state === "done" ? "已完成" : "执行失败");

  const result = step.querySelector(".agent-step-result");
  if (result && details.score !== undefined) {
    result.classList.remove("hidden");
    result.querySelector(".agent-step-score").textContent = `${details.score} 分`;
    result.querySelector(".agent-step-note").textContent = details.note || "";
  }
}

function updateAgentSummary(rounds, imageCount, score) {
  agentSummary.innerHTML = [
    `<span>迭代 <strong>${rounds}</strong> 轮</span>`,
    `<span>生成 <strong>${imageCount}</strong> 张</span>`,
    `<span>最佳评分 <strong>${score || "--"}</strong></span>`,
  ].join("");
}

function updateBestSolution(result, evaluation, rounds) {
  bestAgentResult = { ...result, evaluation };
  bestSolution.classList.remove("hidden");
  bestScoreBadge.textContent = `${evaluation.score} / 100 ${
    evaluation.score >= Number(targetScoreSelect.value) ? "已达标" : "待优化"
  }`;
  bestScoreBadge.classList.remove("idle");
  bestScoreBadge.classList.toggle("success", evaluation.score >= Number(targetScoreSelect.value));

  bestSolutionMedia.className = `best-solution-media art ${result.fallbackClass || "art-one"}`;
  bestSolutionMedia.innerHTML = result.imageUrl
    ? `<img class="art-image" src="${result.imageUrl}" alt="智能体最佳家具方案" />`
    : "";
  if (result.imageUrl) {
    bestSolutionMedia.classList.add("has-image");
  }
  markImagesIn(bestSolutionMedia);

  bestSolutionTitle.textContent = `${styleLabels[selectedStyle]}教学优化方案`;
  bestSolutionReason.textContent =
    evaluation.suggestion ||
    (rounds > 1
      ? "经过教学 Rubric 评审和提示词修正，当前方案是本次任务中的最高分结果。"
      : "当前方案已完成教学 Rubric 与视觉模型评审。");
  renderRubricScores(evaluation.rubric || evaluation);
  renderLearningFeedback(evaluation.learningFeedback || {}, evaluation);
  renderReferenceEvidence(result.referenceCases || []);
  renderComplianceEvidence(result.compliance || buildCurrentCompliance(result));
}

function renderRubricScores(rubric = {}) {
  cultureScore.textContent = normalizedScore(rubric.cultureAccuracy ?? rubric.styleScore);
  structureScore.textContent = normalizedScore(rubric.structureReasoning ?? rubric.structureScore);
  craftScore.textContent = normalizedScore(rubric.materialCraft ?? rubric.materialScore);
  innovationScore.textContent = normalizedScore(rubric.designInnovation);
  sceneFitScore.textContent = normalizedScore(rubric.sceneFit ?? rubric.styleScore);
  aiUsageScore.textContent = normalizedScore(rubric.aiUsage);
}

function renderLearningFeedback(feedback = {}, evaluation = {}) {
  fillList(learningStrengths, feedback.strengths || evaluation.strengths, "已形成可讨论的设计方案");
  fillList(learningIssues, feedback.issues || evaluation.problems, "暂无明显问题，建议课堂复核结构细节");
  fillList(learningNextSteps, feedback.nextSteps || evaluation.suggestion, "继续围绕课程目标细化结构、材料与场景");
}

function renderReferenceEvidence(cases = []) {
  fillList(
    bestReferenceList,
    cases.map((item) => `${item.title}：${item.teachingPoint || item.category || "参考案例"}`),
    "未匹配到具体案例，可从案例知识库补充依据",
  );
}

function renderComplianceEvidence(compliance = {}) {
  const items = [
    compliance.aiDisclosure || aiDisclosureSelect.value,
    compliance.sourceNote ? `来源说明：${compliance.sourceNote}` : "来源说明：未填写外部素材来源",
    ...(compliance.modelUse || []),
  ];
  fillList(bestComplianceList, items, "已按默认规则记录 AI 生成内容标识");
}

function buildCurrentCompliance(result = {}) {
  const engine = result.engine || defaultEngine;
  return {
    sourceNote: sourceNoteInput.value.trim(),
    aiDisclosure: aiDisclosureSelect.value,
    modelUse: [`生成引擎：${engineLabels[engine] || engine}`],
  };
}

function normalizedScore(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(Math.round(numeric)) : "--";
}

function fillList(root, values, fallback) {
  const items = Array.isArray(values)
    ? values.map((item) => String(item || "").trim()).filter(Boolean)
    : String(values || "").trim()
      ? [String(values).trim()]
      : [];
  root.replaceChildren(
    ...(items.length ? items : [fallback]).map((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      return li;
    }),
  );
}
function evaluationNote(evaluation) {
  if (evaluation.problems?.length) {
    return evaluation.problems.slice(0, 2).join("；");
  }
  return evaluation.suggestion || "视觉模型未发现明显问题";
}

function renderAgentPromptDiff(evaluation) {
  const changes = [
    evaluation.suggestion,
    evaluation.revisedPrompt ? "已生成下一轮优化 Prompt" : "",
  ].filter(Boolean);

  agentPromptDiff.replaceChildren(
    ...changes.map((change) => {
      const span = document.createElement("span");
      span.textContent = `＋ ${change}`;
      return span;
    }),
  );
  agentPromptDiff.classList.toggle("hidden", changes.length === 0);
}

function renderAgentChangeLog(evaluation) {
  const changes = [
    ...(evaluation.problems || []).slice(0, 2).map((problem) => `修正：${problem}`),
    evaluation.suggestion ? `优化：${evaluation.suggestion}` : "",
  ].filter(Boolean);

  agentChangeLog.replaceChildren(
    ...(changes.length ? changes : ["视觉模型未提出额外修改"]).map((change, index) => {
      const item = document.createElement("li");
      const number = document.createElement("span");
      const text = document.createElement("p");
      number.textContent = String(index + 1).padStart(2, "0");
      text.textContent = change;
      item.append(number, text);
      return item;
    }),
  );
}

function renderAgentRoundCards(rounds) {
  for (const round of [...rounds].reverse()) {
    const imageUrl = round.image?.url || "";
    const sourceEngine = round.image?.engine || round.engines?.[0] || defaultEngine;
    const sourceLabel = engineLabels[sourceEngine] || sourceEngine;
    const fallbackClass = round.round % 2 === 0 ? "art-two" : "art-one";
    const subtitle = `第 ${round.round} 轮 · ${round.evaluation.score} 分 · ${sourceLabel}`;
    const card = makeResultCard({
      title: `${styleLabels[selectedStyle]}智能体方案`,
      subtitle,
      imageUrl,
      fallbackClass,
    });
    registerGeneratedCard(card, {
      ...buildGenerationPayload(round.prompt),
      engine: sourceEngine,
      prompt: round.prompt,
      enhancedPrompt: round.prompt,
    });
    galleryGrid.prepend(card);
  }
}

async function loadHistory(openAfterLoad = false) {
  refreshHistoryButton.disabled = true;
  try {
    const response = await fetch(`${apiBase}/history?limit=200`);
    const json = await response.json();
    if (!response.ok || !json.ok) {
      throw new Error(json.message || "历史记录读取失败");
    }
    historyRecords = Array.isArray(json.records) ? json.records : [];
    renderHistoryRecords();
    if (openAfterLoad) {
      historyModal.classList.remove("hidden");
    }
  } catch (error) {
    console.error(error);
    historyGrid.replaceChildren();
    historyGrid.classList.add("hidden");
    historyEmpty.classList.remove("hidden");
    historyEmpty.querySelector("strong").textContent = "历史记录读取失败";
    historyEmpty.querySelector("p").textContent = error.message;
    if (openAfterLoad) {
      historyModal.classList.remove("hidden");
    }
  } finally {
    refreshHistoryButton.disabled = false;
  }
}

function renderHistoryRecords() {
  historyCount.textContent = String(historyRecords.length);
  historyGrid.replaceChildren(...historyRecords.map(createHistoryCard));
  historyGrid.classList.toggle("hidden", historyRecords.length === 0);
  historyEmpty.classList.toggle("hidden", historyRecords.length > 0);
  if (!historyRecords.length) {
    historyEmpty.querySelector("strong").textContent = "还没有历史记录";
    historyEmpty.querySelector("p").textContent =
      "完成一次普通生成或智能体生成后，图片和参数会自动保存在这里。";
  }
}

function createHistoryCard(record) {
  const card = document.createElement("article");
  card.className = "history-item";
  card.dataset.historyId = record.id;

  const media = document.createElement("div");
  media.className = "history-image";
  const preview = getHistoryPreview(record);
  if (preview?.url) {
    const image = document.createElement("img");
    image.src = preview.url;
    image.alt = record.title || "历史家具方案";
    media.appendChild(image);
  }
  const type = document.createElement("span");
  type.className = "history-type";
  type.textContent = record.type === "agent" ? "智能体任务" : "普通生成";
  media.appendChild(type);
  if (record.bestScore !== null && record.bestScore !== undefined) {
    const score = document.createElement("span");
    score.className = "history-score";
    score.textContent = `${record.bestScore} 分`;
    media.appendChild(score);
  }

  const content = document.createElement("div");
  content.className = "history-content";
  const title = document.createElement("h4");
  title.textContent = record.title || "未命名家具方案";
  const prompt = document.createElement("p");
  prompt.textContent = record.originalPrompt || record.finalPrompt || "暂无描述";
  const meta = document.createElement("div");
  meta.className = "history-meta";
  const date = document.createElement("span");
  date.textContent = formatHistoryDate(record.createdAt);
  const details = document.createElement("span");
  details.textContent = `${styleLabels[record.style] || record.style || "家具方案"} · ${
    formatSizeLabel(record.size)
  }`;
  meta.append(date, details);

  const actions = document.createElement("div");
  actions.className = "history-actions";
  const restore = document.createElement("button");
  restore.type = "button";
  restore.dataset.historyAction = "restore";
  restore.textContent = "恢复到工作台";
  const report = document.createElement("button");
  report.type = "button";
  report.dataset.historyAction = "report";
  report.textContent = "导出说明";
  const demo = document.createElement("button");
  demo.type = "button";
  demo.dataset.historyAction = "demo";
  demo.textContent = "演示文案";
  const remove = document.createElement("button");
  remove.type = "button";
  remove.dataset.historyAction = "delete";
  remove.setAttribute("aria-label", "删除历史记录");
  remove.textContent = "×";
  actions.append(restore, report, demo, remove);
  content.append(title, prompt, meta, actions);
  card.append(media, content);
  markImagesIn(card);
  return card;
}

function getHistoryPreview(record) {
  if (record.type === "agent" && record.bestRound) {
    return record.rounds?.find((round) => round.round === record.bestRound)?.image || record.images?.[0];
  }
  return record.images?.[0] || null;
}

function formatHistoryDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "时间未知";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function registerHistoryRecord(record) {
  if (!record?.id) {
    return;
  }
  historyRecords = [record, ...historyRecords.filter((item) => item.id !== record.id)];
  renderHistoryRecords();
}

function closeHistoryModal() {
  historyModal.classList.add("hidden");
}

function restoreHistoryRecord(record) {
  if (!record) {
    return;
  }

  setGenerationMode(record.type === "agent" ? "agent" : "normal");
  input.value = record.originalPrompt || record.finalPrompt || "";
  sourceNoteInput.value = record.compliance?.sourceNote || "";
  setSelectValue(aiDisclosureSelect, record.compliance?.aiDisclosure || aiDisclosureSelect.value);

  if (styleLabels[record.style]) {
    selectedStyle = record.style;
    styleChips.querySelectorAll("button").forEach((button) => {
      button.classList.toggle("active", button.dataset.style === selectedStyle);
    });
  }
  if (qualityLabels[record.quality]) {
    selectedQuality = record.quality;
    setSegmentSelection(qualitySegment, selectedQuality);
  }
  if (record.size) {
    selectSize(record.size);
  }
  if (record.mood !== null && record.mood !== undefined) {
    moodRange.value = String(record.mood);
    moodValue.textContent = `${record.mood}%`;
  }

  composePrompt();
  if (record.finalPrompt) {
    enhancedPrompt.value = record.finalPrompt;
  }

  if (record.type === "agent" && record.rounds?.length) {
    renderAgentRoundCards(record.rounds);
    const preview = getHistoryPreview(record);
    if (preview && record.bestEvaluation) {
      updateBestSolution(
        {
          imageUrl: preview.url || "",
          fallbackClass: record.bestRound % 2 === 0 ? "art-two" : "art-one",
          historyId: record.id,
          referenceCases: record.referenceCases || [],
          compliance: record.compliance || null,
        },
        record.bestEvaluation,
        record.rounds.length,
      );
      renderAgentChangeLog(record.bestEvaluation);
      updateAgentSummary(record.rounds.length, record.images?.length || 0, record.bestScore);
    }
  } else {
    for (const image of [...(record.images || [])].reverse()) {
      const sourceLabel = engineLabels[image.engine] || image.engine || "历史记录";
      const card = makeResultCard({
        title: `${styleLabels[record.style] || "家具"}历史方案`,
        subtitle: `${qualityLabels[record.quality] || record.quality || "默认"} · ${
          formatSizeLabel(record.size)
        } · ${sourceLabel}`,
        imageUrl: image.url || "",
        fallbackClass: "art-one",
      });
      registerGeneratedCard(card, {
        ...buildGenerationPayload(record.finalPrompt),
        engine: image.engine || record.engine || defaultEngine,
        originalPrompt: record.originalPrompt,
        prompt: record.finalPrompt,
      });
      galleryGrid.prepend(card);
    }
  }

  const preview = getHistoryPreview(record);
  if (preview) {
    updateRefinePanel({
      promptText: record.originalPrompt || record.finalPrompt,
      imageUrl: preview.url || "",
      fallbackClass: "art-one",
      subtitle: `${record.type === "agent" ? "智能体" : "普通"}历史方案`,
    });
  }
  closeHistoryModal();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setSelectValue(select, value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return;
  }
  if (![...select.options].some((option) => option.value === normalized)) {
    const option = document.createElement("option");
    option.value = normalized;
    option.textContent = "自定义标识";
    select.appendChild(option);
  }
  select.value = normalized;
}

function setSegmentSelection(root, value) {
  root.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", button.dataset.value === String(value));
  });
}

async function downloadRecordExport(historyId, format = "report") {
  if (historyId) {
    const response = await fetch(`${apiBase}/history/${encodeURIComponent(historyId)}/report?format=${format}`);
    const json = await response.json();
    if (!response.ok || !json.ok) {
      throw new Error(json.message || "导出失败");
    }
    downloadTextFile(json.filename, json.content);
    return;
  }

  const fallback = buildClientExport(format);
  downloadTextFile(fallback.filename, fallback.content);
}

function buildClientExport(format = "report") {
  const evaluation = bestAgentResult?.evaluation || {};
  const compliance = bestAgentResult?.compliance || buildCurrentCompliance(bestAgentResult || {});
  const cases = bestAgentResult?.referenceCases || [];
  const title = input.value.trim().slice(0, 42) || "中式家具AI教学智能体";
  if (format === "demo") {
    return {
      filename: `${title}-演示文案.md`,
      content: [
        `# ${title}演示文案`,
        "",
        "## 场景痛点",
        "学生在中式家具设计学习中，需要同时判断形制、结构、材料和空间适配。",
        "",
        "## 智能体演示",
        `输入设计目标：${input.value.trim() || "未填写"}`,
        `系统生成方案并按教学 Rubric 评分，当前最佳评分：${evaluation.score ?? "--"}。`,
        "",
        "## 学习反馈",
        `符合规律：${listText(evaluation.learningFeedback?.strengths) || "等待评审"}`,
        `待改进：${listText(evaluation.learningFeedback?.issues || evaluation.problems) || "等待评审"}`,
        `下一步：${listText(evaluation.learningFeedback?.nextSteps || evaluation.suggestion) || "继续迭代"}`,
        "",
        "## 合规说明",
        compliance.aiDisclosure || aiDisclosureSelect.value,
      ].join("\n"),
    };
  }

  return {
    filename: `${title}-作品说明.md`,
    content: [
      `# ${title}作品说明`,
      "",
      "## 作品概述",
      `本作品面向中式家具设计教学，围绕“${input.value.trim() || "中式家具设计任务"}”形成生成、评价、反馈与再设计闭环。`,
      "",
      "## 教学评价 Rubric",
      ...Object.entries(rubricLabels).map(([key, label]) => `- ${label}：${normalizedScore(evaluation.rubric?.[key])} / 100`),
      "",
      "## 学习反馈",
      `- 符合规律：${listText(evaluation.learningFeedback?.strengths) || "等待评审"}`,
      `- 不合理之处：${listText(evaluation.learningFeedback?.issues || evaluation.problems) || "等待评审"}`,
      `- 下一步修改：${listText(evaluation.learningFeedback?.nextSteps || evaluation.suggestion) || "继续迭代"}`,
      "",
      "## 参考依据",
      ...(cases.length ? cases.map((item) => `- ${item.title}：${item.teachingPoint}`) : ["- 可从案例知识库补充明式圈椅、榫卯、材料工艺等依据。"]),
      "",
      "## 合规与来源",
      `- ${compliance.aiDisclosure || aiDisclosureSelect.value}`,
      `- 来源说明：${compliance.sourceNote || sourceNoteInput.value.trim() || "未填写外部素材来源"}`,
      `- 模型使用：${listText(compliance.modelUse) || "服务端模型网关记录"}`,
    ].join("\n"),
  };
}

function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  URL.revokeObjectURL(link.href);
  link.remove();
}

function listText(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean).join("；");
  }
  return String(value || "").trim();
}

async function loadReferenceCases() {
  try {
    const response = await fetch(`${apiBase}/reference-cases`);
    const json = await response.json();
    if (!response.ok || !json.ok) {
      throw new Error(json.message || "案例知识库读取失败");
    }
    referenceCases = Array.isArray(json.cases) ? json.cases : [];
  } catch (error) {
    console.warn("Reference cases unavailable.", error);
    referenceCases = fallbackReferenceCases();
  }
  renderReferenceCases();
}

function renderReferenceCases() {
  referenceCasesGrid.replaceChildren(
    ...referenceCases.map((item) => {
      const card = document.createElement("article");
      card.className = "reference-case";
      const title = document.createElement("strong");
      title.textContent = item.title;
      const meta = document.createElement("span");
      meta.textContent = item.category;
      const desc = document.createElement("p");
      desc.textContent = item.teachingPoint;
      const principles = document.createElement("small");
      principles.textContent = (item.designPrinciples || []).slice(0, 3).join(" / ");
      card.append(title, meta, desc, principles);
      return card;
    }),
  );
}

function fallbackReferenceCases() {
  return [
    {
      title: "明式圈椅",
      category: "经典形制",
      teachingPoint: "观察连续扶手、轻巧比例和克制装饰。",
      designPrinciples: ["比例轻盈", "榫卯清晰", "装饰克制"],
    },
    {
      title: "榫卯结构",
      category: "工艺结构",
      teachingPoint: "检查连接是否可制造、可承重。",
      designPrinciples: ["连接位置合理", "受力连续", "节点清楚"],
    },
    {
      title: "材料工艺",
      category: "材料表达",
      teachingPoint: "判断木纹、色泽和反光是否符合木作逻辑。",
      designPrinciples: ["木纹方向", "色泽一致", "表面克制"],
    },
  ];
}
async function deleteHistoryRecord(id) {
  const response = await fetch(`${apiBase}/history/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  const json = await response.json();
  if (!response.ok || !json.ok) {
    throw new Error(json.message || "删除历史记录失败");
  }
  historyRecords = historyRecords.filter((record) => record.id !== id);
  renderHistoryRecords();
}

function looksLikeStructuredPrompt(prompt) {
  const commaCount = (prompt.match(/,/g) || []).length;
  const englishWordCount = (prompt.match(/[A-Za-z][A-Za-z-]*/g) || []).length;
  return prompt.includes("<lora:") || commaCount >= 8 || englishWordCount >= 14;
}

function containsChinese(text) {
  return /[\u4e00-\u9fff]/.test(text);
}

function translateChinesePrompt(text) {
  let translated = text;

  for (const [source, target] of translationDictionary.sort((a, b) => b[0].length - a[0].length)) {
    translated = translated.replaceAll(source, target);
  }

  translated = translated
    .replace(/[，、；]/g, ", ")
    .replace(/[。]/g, "")
    .replace(/[：]/g, ": ")
    .replace(/[（）]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/,\s*,/g, ", ")
    .trim();

  if (containsChinese(translated)) {
    translated = translated
      .split(",")
      .map((segment) => segment.trim())
      .filter(Boolean)
      .map((segment) => (containsChinese(segment) ? segment.replace(/[\u4e00-\u9fff]+/g, "").trim() : segment))
      .filter(Boolean)
      .join(", ");
  }

  return translated || text;
}

function bindSegment(segmentRoot, onChange) {
  segmentRoot.addEventListener("click", (event) => {
    const target = event.target.closest("button");
    if (!target) {
      return;
    }

    segmentRoot.querySelectorAll("button").forEach((button) => {
      button.classList.remove("active");
    });
    target.classList.add("active");
    onChange(target.dataset.value);
    composePrompt();
  });
}

const imageOrientationClasses = ["is-landscape", "is-portrait", "is-square"];

function markImageOrientation(image) {
  if (!(image instanceof HTMLImageElement) || !image.naturalWidth || !image.naturalHeight) {
    return;
  }

  const container = image.closest(".best-solution-media, .history-image, .art, .lightbox-stage");
  if (!container) {
    return;
  }

  const ratio = image.naturalWidth / image.naturalHeight;
  const className = ratio >= 1.12 ? "is-landscape" : ratio <= 0.88 ? "is-portrait" : "is-square";
  container.classList.remove(...imageOrientationClasses);
  image.classList.remove(...imageOrientationClasses);
  container.classList.add(className);
  image.classList.add(className);
}

function markImagesIn(root = document) {
  root.querySelectorAll(".art-image, .history-image img, .lightbox-image").forEach((image) => {
    if (image.complete && image.naturalWidth) {
      markImageOrientation(image);
    }
  });
}
function renderArtMarkup(imageUrl, fallbackClass) {
  if (imageUrl) {
    return `
      <div class="art has-image">
        <img class="art-image" src="${imageUrl}" alt="Generated furniture concept" />
      </div>
    `;
  }

  return `<div class="art ${fallbackClass}"></div>`;
}

function buildRerollMenu() {
  return `
    <div class="reroll-group">
      <button data-action="reroll" type="button">${uiText.reroll}</button>
      <button data-action="toggle-reroll-menu" class="reroll-toggle" type="button" aria-label="${uiText.rerollMenu}">+</button>
      <div class="reroll-menu hidden">
        ${rerollVariants
          .map(
            (variant) =>
              `<button type="button" data-action="reroll-variant" data-variant="${variant.key}">${variant.label}</button>`,
          )
          .join("")}
      </div>
    </div>
  `;
}

function makeResultCard({ title, subtitle, imageUrl, fallbackClass }) {
  const card = document.createElement("article");
  card.className = "result-card";
  card.dataset.fallbackClass = fallbackClass;
  card.innerHTML = `
    ${renderArtMarkup(imageUrl, fallbackClass)}
    <div class="result-meta">
      <strong>${title}</strong>
      <p>${subtitle}</p>
    </div>
    <div class="result-actions">
      <button data-action="zoom" type="button">${uiText.zoom}</button>
      <button data-action="download" type="button">${uiText.download}</button>
      ${buildRerollMenu()}
    </div>
  `;
  markImagesIn(card);
  return card;
}

function registerGeneratedCard(card, payload) {
  cardSequence += 1;
  const cardId = `generated-${cardSequence}`;
  card.dataset.cardId = cardId;
  generationStore.set(cardId, payload);
}

function createLightbox() {
  const overlay = document.createElement("div");
  overlay.className = "lightbox hidden";
  overlay.innerHTML = `
    <div class="lightbox-backdrop" data-close="true"></div>
    <div class="lightbox-dialog">
      <button class="lightbox-close" type="button" data-close="true" aria-label="Close preview">x</button>
      <div class="lightbox-stage" id="lightboxStage"></div>
    </div>
  `;

  overlay.addEventListener("click", (event) => {
    if (event.target.dataset.close === "true") {
      closeLightbox();
    }
  });

  document.body.appendChild(overlay);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeLightbox();
      closeAllRerollMenus();
    }
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".reroll-group")) {
      closeAllRerollMenus();
    }
  });

  return overlay;
}

function openLightboxFromCard(card) {
  const stage = lightbox.querySelector("#lightboxStage");
  const image = card.querySelector(".art-image");
  const fallbackClass = card.dataset.fallbackClass || "art-one";

  if (image) {
    stage.innerHTML = `<img class="lightbox-image" src="${image.src}" alt="Preview" />`;
  } else {
    stage.innerHTML = `<div class="lightbox-fallback art ${fallbackClass}"></div>`;
  }

  markImagesIn(stage);
  lightbox.classList.remove("hidden");
}

function closeLightbox() {
  lightbox.classList.add("hidden");
}

function triggerDownload(card) {
  const image = card.querySelector(".art-image");
  if (!image) {
    loadingCard.querySelector("strong").textContent = "\u793a\u4f8b\u5361\u7247\u4e0d\u652f\u6301\u4e0b\u8f7d";
    loadingCard.querySelector("p").textContent =
      "\u8bf7\u5148\u751f\u6210\u4e00\u5f20\u771f\u5b9e\u7ed3\u679c\uff0c\u4e0b\u8f7d\u6309\u94ae\u4f1a\u76f4\u63a5\u4fdd\u5b58\u540e\u7aef\u8fd4\u56de\u7684\u56fe\u7247\u3002";
    return;
  }

  const link = document.createElement("a");
  link.href = image.src;
  link.download = `huazuo-${Date.now()}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function buildVariantPayload(payload, variantKey) {
  const variant = rerollVariants.find((item) => item.key === variantKey) || rerollVariants[0];
  if (variant.key === "same") {
    return { ...payload };
  }

  const promptWithVariant = [payload.prompt, variant.promptSuffix].filter(Boolean).join(", ");
  const originalPromptWithVariant = [payload.originalPrompt, variant.label].filter(Boolean).join(" · ");

  return {
    ...payload,
    prompt: promptWithVariant,
    enhancedPrompt: promptWithVariant,
    originalPrompt: originalPromptWithVariant,
    mood: clamp(Number(payload.mood || 62) + variant.moodDelta, 0, 100),
  };
}

async function rerollCard(card, variantKey = "same") {
  const cardId = card.dataset.cardId;
  const payload = cardId ? generationStore.get(cardId) : null;

  if (!payload) {
    loadingCard.querySelector("strong").textContent = "\u793a\u4f8b\u5361\u7247\u4e0d\u652f\u6301\u518d\u6765\u4e00\u7248";
    loadingCard.querySelector("p").textContent =
      "\u8bf7\u5148\u751f\u6210\u4e00\u5f20\u771f\u5b9e\u7ed3\u679c\uff0c\u65b0\u7684\u5361\u7247\u4f1a\u8bb0\u5f55\u53c2\u6570\u5e76\u652f\u6301\u91cd\u590d\u751f\u6210\u3002";
    return;
  }

  const nextPayload = buildVariantPayload(payload, variantKey);
  input.value = nextPayload.originalPrompt || nextPayload.prompt;
  composePrompt();
  await requestGeneration(nextPayload);
}

async function requestGeneration(requestPayload, options = {}) {
  setStatus(uiText.generating);
  setLoadingState(true);
  loadingCard.querySelector("strong").textContent = uiText.loadingTitle;
  loadingCard.querySelector("p").textContent = uiText.loadingDesc;

  try {
    const response = await fetch(`${apiBase}/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestPayload),
    });

    const json = await response.json();
    if (!response.ok || !json.ok) {
      throw new Error(json.message || "Generation failed");
    }
    registerHistoryRecord(json.historyRecord);

    const responseRequest = json.request || requestPayload;
    const images = json.images || [];
    const baseSubtitle = `${styleLabels[requestPayload.style]} \u00b7 ${qualityLabels[requestPayload.quality]} \u00b7 ${formatSizeLabel(responseRequest.size || requestPayload.size)}`;
    let primaryResult = null;

    if (json.promptPipeline?.textModelEnabled && json.promptPipeline.finalPrompt) {
      enhancedPrompt.value = json.promptPipeline.finalPrompt;
    }

    [...images].reverse().forEach((image, index) => {
      const sourceEngine = image.engine || responseRequest.engine || requestPayload.engine;
      const sourceLabel = engineLabels[sourceEngine] || sourceEngine;
      const subtitle = `${baseSubtitle} \u00b7 ${sourceLabel}`;
      const fallbackClass = Math.random() > 0.5 ? "art-one" : "art-two";
      const card = makeResultCard({
        title: `${styleLabels[requestPayload.style]}方案 · ${sourceLabel}`,
        subtitle,
        imageUrl: image.url || "",
        fallbackClass,
      });
      const replayPayload = {
        ...requestPayload,
        engine: sourceEngine,
        prompt: responseRequest.prompt || requestPayload.prompt,
        enhancedPrompt: responseRequest.prompt || requestPayload.enhancedPrompt,
      };

      registerGeneratedCard(card, replayPayload);
      galleryGrid.prepend(card);
      if (index === images.length - 1) {
        primaryResult = { imageUrl: image.url || "", fallbackClass, subtitle };
      }
    });

    if (!primaryResult) {
      throw new Error("生成完成但没有返回图像");
    }

    updateRefinePanel({
      promptText: requestPayload.originalPrompt || requestPayload.prompt,
      imageUrl: primaryResult.imageUrl,
      fallbackClass: primaryResult.fallbackClass,
      subtitle: primaryResult.subtitle,
    });
    setStatus(uiText.completed);
    loadingCard.querySelector("strong").textContent = uiText.idleTitle;
    loadingCard.querySelector("p").textContent = json.errors?.length
      ? `部分引擎未完成：${json.errors
          .map((item) => `${engineLabels[item.engine] || item.engine}：${item.message}`)
          .join("；")}`
      : uiText.idleDesc;
    return {
      primaryResult,
      imageCount: images.length,
      response: json,
    };
  } catch (error) {
    console.error(error);
    setStatus(uiText.failed);
    loadingCard.querySelector("strong").textContent = uiText.failed;
    loadingCard.querySelector("p").textContent = error.message;
    return null;
  } finally {
    if (!options.keepLoading) {
      setLoadingState(false);
    }
  }
}

async function runAgentGeneration() {
  const initialPrompt = enhancedPrompt.value.trim();
  if (!initialPrompt) {
    setStatus(uiText.failed);
    return;
  }

  const targetScore = Number(targetScoreSelect.value);
  const maxRounds = Number(maxAgentRoundsSelect.value);

  resetAgentProcess();
  setLoadingState(true);
  setAgentStep(1, "active", { status: "正在生成与评审" });
  loadingCard.querySelector("strong").textContent = "智能体正在生成并调用视觉模型";
  loadingCard.querySelector("p").textContent =
    "后端将自动完成出图、视觉评分、Prompt 修正和下一轮生成。";

  try {
    const response = await fetch(`${apiBase}/agent/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...buildGenerationPayload(initialPrompt),
        targetScore,
        maxRounds,
      }),
    });

    const json = await response.json();
    if (!response.ok || !json.ok) {
      throw new Error(json.message || "智能体执行失败");
    }
    registerHistoryRecord(json.historyRecord);

    const rounds = Array.isArray(json.rounds) ? json.rounds : [];
    const firstRound = rounds[0];
    const secondRound = rounds[1];
    if (!firstRound || !json.bestImage || !json.bestEvaluation) {
      throw new Error("智能体完成，但没有返回有效评审结果");
    }

    setAgentStep(1, "done", {
      status: "已完成",
      score: firstRound.evaluation.score,
      note: evaluationNote(firstRound.evaluation),
    });
    renderAgentPromptDiff(firstRound.evaluation);
    setAgentStep(2, "done", {
      status:
        firstRound.evaluation.score >= targetScore || rounds.length === 1
          ? "评审完成"
          : "已形成修正",
    });

    const finalRound = secondRound || firstRound;
    setAgentStep(3, "done", {
      status: secondRound
        ? finalRound.evaluation.score >= targetScore
          ? "已达标"
          : "达到轮次上限"
        : firstRound.evaluation.score >= targetScore
          ? "无需继续"
          : "达到轮次上限",
      score: finalRound.evaluation.score,
      note: evaluationNote(finalRound.evaluation),
    });

    enhancedPrompt.value = json.finalPrompt || finalRound.prompt || initialPrompt;
    renderAgentRoundCards(rounds);
    renderAgentChangeLog(json.bestEvaluation);
    updateBestSolution(
      {
        imageUrl: json.bestImage.url || "",
        fallbackClass: json.bestRound % 2 === 0 ? "art-two" : "art-one",
        historyId: json.historyRecord?.id || "",
        referenceCases: json.referenceCases || json.historyRecord?.referenceCases || [],
        compliance: json.historyRecord?.compliance || null,
      },
      json.bestEvaluation,
      json.completedRounds,
    );
    updateAgentSummary(json.completedRounds, rounds.length, json.bestScore);
    updateRefinePanel({
      promptText: input.value.trim(),
      imageUrl: json.bestImage.url || "",
      fallbackClass: json.bestRound % 2 === 0 ? "art-two" : "art-one",
      subtitle: `智能体最佳方案 · ${json.bestScore} 分`,
    });

    agentProcessStatus.textContent =
      json.bestScore >= targetScore ? "已完成 · 达标" : "已完成 · 未达标";
    agentProcessStatus.classList.add("success");
    setStatus("智能体已完成");
    loadingCard.querySelector("strong").textContent = uiText.idleTitle;
    loadingCard.querySelector("p").textContent =
      `完成 ${json.completedRounds} 轮生成，视觉模型最高评分 ${json.bestScore}。`;
  } catch (error) {
    console.error(error);
    setAgentStep(1, "failed", { status: "执行失败" });
    agentProcessStatus.textContent = "执行失败";
    agentProcessStatus.classList.add("idle");
    setStatus(uiText.failed);
    loadingCard.querySelector("strong").textContent = uiText.failed;
    loadingCard.querySelector("p").textContent = error.message;
  } finally {
    setLoadingState(false);
  }
}

function getRefineVersionLabel(index) {
  if (index === 0) {
    return "\u4e0a\u4e00\u7248\u56fe\u50cf";
  }
  if (index === 1) {
    return "\u4e0a\u4e0a\u7248\u56fe\u50cf";
  }
  return `\u66f4\u65e9\u7684\u7b2c ${index + 1} \u7248`;
}

function getNextRefineHint() {
  if (refineHistory.length < 2) {
    return "\u751f\u6210\u591a\u7248\u540e\u53ef\u5207\u6362";
  }

  const nextIndex = (selectedRefineIndex + 1) % refineHistory.length;
  return `\u70b9\u51fb\u5207\u6362${getRefineVersionLabel(nextIndex).replace("\u56fe\u50cf", "")}`;
}

function renderRefineStackCard(item, layerClass) {
  const fallbackClass = item && item.fallbackClass ? item.fallbackClass : "art-one";
  const imageUrl = item && item.imageUrl ? item.imageUrl : "";
  const imageMarkup = imageUrl
    ? `<img class="art-image" src="${imageUrl}" alt="${getRefineVersionLabel(selectedRefineIndex)}" />`
    : "";

  return `<span class="refine-stack-card ${layerClass} art ${fallbackClass} ${imageUrl ? "has-image" : ""}">${imageMarkup}</span>`;
}

function renderRefinePanel(index = 0) {
  if (!refineHistory.length) {
    return;
  }

  selectedRefineIndex = clamp(index, 0, refineHistory.length - 1);

  const currentItem = refineHistory[selectedRefineIndex];
  const midItem = refineHistory[(selectedRefineIndex + 1) % refineHistory.length] || currentItem;
  const backItem = refineHistory[(selectedRefineIndex + 2) % refineHistory.length] || midItem;

  lastGeneratedPrompt = currentItem.promptText.trim();
  refineSummary.textContent = lastGeneratedPrompt;
  refineMeta.textContent = currentItem.subtitle;
  refineVersionLabel.textContent = getRefineVersionLabel(selectedRefineIndex);
  refinePreview.classList.toggle("is-static", refineHistory.length < 2);
  refinePreview.innerHTML = [
    renderRefineStackCard(backItem, "refine-stack-back"),
    renderRefineStackCard(midItem, "refine-stack-mid"),
    renderRefineStackCard(currentItem, "refine-stack-front"),
    `<span class="refine-switch-hint">${getNextRefineHint()}</span>`,
  ].join("");

  refinePanel.classList.remove("hidden");
}

function updateRefinePanel({ promptText, imageUrl, fallbackClass, subtitle }) {
  refineHistory = [
    {
      promptText: promptText.trim(),
      imageUrl,
      fallbackClass,
      subtitle,
    },
    ...refineHistory,
  ].slice(0, 8);

  renderRefinePanel(0);
}

function setLoadingState(isLoading) {
  generateButton.disabled = isLoading;
  if (isLoading) {
    generateButton.textContent =
      selectedGenerationMode === "agent" ? "智能体执行中..." : "\u751f\u6210\u4e2d...";
    return;
  }
  generateButton.textContent =
    selectedGenerationMode === "agent" ? "✦ 启动智能体" : "\u2726 \u751f\u6210\u56fe\u50cf";
}

function setStatus(text, idle = false) {
  statusChip.textContent = text;
  statusChip.classList.toggle("idle", idle);
}

function hydrateConfigForm(config) {
  if (!config) {
    return;
  }

  engineSelect.value = config.defaultEngine || "automatic1111";
  auto1111BaseUrlInput.value = config.auto1111BaseUrl || "";
  auto1111ModelInput.value = config.auto1111Lora || config.auto1111Model || "";
  comfyBaseUrlInput.value = config.comfyBaseUrl || "";
  comfyCheckpointInput.value = config.comfyCheckpoint || "";
  comfyWorkflowFileInput.value = config.comfyWorkflowFile || "";
  textModelEnabledSelect.value = config.textModelEnabled ? "true" : "false";
  textModelBaseUrlInput.value = config.textModelBaseUrl || "";
  textModelNameInput.value = config.textModelName || "";
  textModelApiKeyInput.value = "";
  textModelApiKeyInput.placeholder = config.textModelApiKeyConfigured
    ? "已配置，留空则保持不变"
    : "输入文字模型 API Key";
  imageModelBaseUrlInput.value = config.imageModelBaseUrl || "";
  imageModelNameInput.value = config.imageModelName || "";
  imageModelSizeInput.value = config.imageModelSize || "";
  imageModelApiKeyInput.value = "";
  imageModelApiKeyInput.placeholder = config.imageModelApiKeyConfigured
    ? "已配置，留空则保持不变"
    : "输入图像模型 API Key";
  visionModelBaseUrlInput.value = config.visionModelBaseUrl || "";
  visionModelNameInput.value = config.visionModelName || "";
  visionModelApiKeyInput.value = "";
  visionModelApiKeyInput.placeholder = config.visionModelApiKeyConfigured
    ? "已配置，留空则保持不变"
    : "输入视觉模型 API Key";
}

function readConfigForm() {
  return {
    defaultEngine: engineSelect.value,
    auto1111BaseUrl: auto1111BaseUrlInput.value.trim(),
    auto1111Lora: auto1111ModelInput.value.trim(),
    comfyBaseUrl: comfyBaseUrlInput.value.trim(),
    comfyCheckpoint: comfyCheckpointInput.value.trim(),
    comfyWorkflowFile: comfyWorkflowFileInput.value.trim(),
    textModelEnabled: textModelEnabledSelect.value === "true",
    textModelBaseUrl: textModelBaseUrlInput.value.trim(),
    textModelApiKey: textModelApiKeyInput.value.trim(),
    textModelName: textModelNameInput.value.trim(),
    imageModelBaseUrl: imageModelBaseUrlInput.value.trim(),
    imageModelApiKey: imageModelApiKeyInput.value.trim(),
    imageModelName: imageModelNameInput.value.trim(),
    imageModelSize: imageModelSizeInput.value.trim(),
    visionModelBaseUrl: visionModelBaseUrlInput.value.trim(),
    visionModelApiKey: visionModelApiKeyInput.value.trim(),
    visionModelName: visionModelNameInput.value.trim(),
  };
}

function updateModelButton(config) {
  const engineLabel = engineLabels[config?.defaultEngine] || "Stable Diffusion WebUI";
  const textLabel = config?.textModelEnabled ? "文字增强 + " : "";
  const visionLabel = config?.visionModelName ? "视觉评审 + " : "";
  modelConfigButton.innerHTML = `<span class="status-dot"></span>${visionLabel}${textLabel}${engineLabel}`;
}

function openConfigModal() {
  hydrateConfigForm(currentConfig);
  configStatus.textContent = currentConfig ? uiText.configSaved : "未加载";
  configStatus.classList.add("idle");
  configModal.classList.remove("hidden");
}

function closeConfigModal() {
  configModal.classList.add("hidden");
}

function normalizeSizeValue(value) {
  const normalized = String(value || "").trim();
  if (sizePresets[normalized]) {
    return normalized;
  }

  const numeric = String(Number(normalized));
  if (sizePresets[numeric]) {
    return numeric;
  }

  const dimensions = normalized.replace(/\s+/g, "").replace("×", "x").toLowerCase();
  const matched = Object.entries(sizePresets).find(
    ([, preset]) => `${preset.width}x${preset.height}` === dimensions,
  );
  return matched ? matched[0] : defaultSizeValue;
}

function getSizePreset(value) {
  return sizePresets[normalizeSizeValue(value)] || sizePresets[defaultSizeValue];
}

function formatSizeLabel(value) {
  return getSizePreset(value).label;
}

function formatResolution(value) {
  return getSizePreset(value).resolution;
}

function selectSize(value) {
  selectedSize = normalizeSizeValue(value);
  setSegmentSelection(sizeSegment, selectedSize);
  currentResolution.textContent = formatResolution(selectedSize);
}
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toggleRerollMenu(card) {
  const menu = card.querySelector(".reroll-menu");
  if (!menu) {
    return;
  }

  const shouldOpen = menu.classList.contains("hidden");
  closeAllRerollMenus();
  if (shouldOpen) {
    menu.classList.remove("hidden");
  }
}

function closeAllRerollMenus() {
  galleryGrid.querySelectorAll(".reroll-menu").forEach((menu) => {
    menu.classList.add("hidden");
  });
}

async function fetchBackendConfig() {
  try {
    const response = await fetch(`${apiBase}/config`);
    if (!response.ok) {
      return;
    }
    const json = await response.json();
    if (json.config) {
      currentConfig = json.config;
      defaultEngine = json.config.defaultEngine || defaultEngine;
      hydrateConfigForm(currentConfig);
      updateModelButton(currentConfig);
    }
  } catch (error) {
    console.warn("Backend config unavailable.", error);
  }
}

async function saveBackendConfig() {
  const payload = readConfigForm();
  configStatus.textContent = uiText.configSaving;
  configStatus.classList.remove("idle");
  configSaveButton.disabled = true;

  try {
    const response = await fetch(`${apiBase}/config`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const json = await response.json();
    if (!response.ok || !json.ok) {
      throw new Error(json.message || "Config update failed");
    }

    currentConfig = json.config;
    defaultEngine = json.config.defaultEngine || defaultEngine;
    updateModelButton(currentConfig);
    configStatus.textContent = uiText.configSaved;
    configStatus.classList.add("idle");
    closeConfigModal();
  } catch (error) {
    configStatus.textContent = error.message;
    console.error(error);
  } finally {
    configSaveButton.disabled = false;
  }
}

styleChips.addEventListener("click", (event) => {
  const target = event.target.closest("button");
  if (!target) {
    return;
  }

  styleChips.querySelectorAll("button").forEach((button) => {
    button.classList.remove("active");
  });
  target.classList.add("active");
  selectedStyle = target.dataset.style;
  composePrompt();
});

bindSegment(qualitySegment, (value) => {
  selectedQuality = value;
});

bindSegment(sizeSegment, (value) => {
  selectSize(value);
});

moodRange.addEventListener("input", () => {
  moodValue.textContent = `${moodRange.value}%`;
  composePrompt();
});

input.addEventListener("input", composePrompt);

generationMode.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-mode]");
  if (!button) {
    return;
  }
  setGenerationMode(button.dataset.mode);
});

refineButton.addEventListener("click", () => {
  if (!lastGeneratedPrompt) {
    return;
  }

  input.value = `${uiText.refinePrefix}${lastGeneratedPrompt}`;
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
  composePrompt();
});

refinePreview.addEventListener("click", () => {
  if (refineHistory.length < 2) {
    return;
  }

  renderRefinePanel((selectedRefineIndex + 1) % refineHistory.length);
});

modelConfigButton.addEventListener("click", openConfigModal);
document.querySelectorAll("[data-open-config='true']").forEach((button) => {
  button.addEventListener("click", openConfigModal);
});
configCancelButton.addEventListener("click", closeConfigModal);
configSaveButton.addEventListener("click", saveBackendConfig);
configModal.addEventListener("click", (event) => {
  if (event.target.dataset.closeConfig === "true") {
    closeConfigModal();
  }
});

if (clearPromptButton) {
  clearPromptButton.addEventListener("click", () => {
    input.value = "";
    input.focus();
    composePrompt();
  });
}

if (randomPromptButton) {
  randomPromptButton.addEventListener("click", () => {
    const nextPrompt = inspirationPrompts[Math.floor(Math.random() * inspirationPrompts.length)];
    input.value = nextPrompt;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    composePrompt();
  });
}

generateButton.addEventListener("click", async () => {
  const sourcePrompt = input.value.trim();
  const generatedPrompt = enhancedPrompt.value.trim();

  if (!generatedPrompt) {
    setStatus(uiText.failed);
    return;
  }

  if (selectedGenerationMode === "agent") {
    await runAgentGeneration();
    return;
  }

  await requestGeneration(buildGenerationPayload(generatedPrompt));
});

bestDownloadButton.addEventListener("click", () => {
  if (!bestAgentResult?.imageUrl) {
    return;
  }
  const link = document.createElement("a");
  link.href = bestAgentResult.imageUrl;
  link.download = `musheng-agent-${Date.now()}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
});

bestRefineButton.addEventListener("click", () => {
  if (!lastGeneratedPrompt) {
    return;
  }
  input.value = `${uiText.refinePrefix}${lastGeneratedPrompt}`;
  input.focus();
  composePrompt();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

exportReportButton.addEventListener("click", async () => {
  try {
    await downloadRecordExport(bestAgentResult?.historyId, "report");
  } catch (error) {
    window.alert(error.message);
  }
});

exportDemoButton.addEventListener("click", async () => {
  try {
    await downloadRecordExport(bestAgentResult?.historyId, "demo");
  } catch (error) {
    window.alert(error.message);
  }
});

saveAgentProjectButton.addEventListener("click", () => {
  if (!bestAgentResult) {
    return;
  }
  loadHistory(true);
});

historyNavButton.addEventListener("click", () => loadHistory(true));
refreshHistoryButton.addEventListener("click", () => loadHistory(false));
historyModal.addEventListener("click", (event) => {
  if (event.target.dataset.closeHistory === "true") {
    closeHistoryModal();
  }
});
historyGrid.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-history-action]");
  if (!button) {
    return;
  }
  const card = button.closest(".history-item");
  const record = historyRecords.find((item) => item.id === card?.dataset.historyId);
  if (!record) {
    return;
  }

  if (button.dataset.historyAction === "restore") {
    restoreHistoryRecord(record);
    return;
  }
  if (button.dataset.historyAction === "report" || button.dataset.historyAction === "demo") {
    button.disabled = true;
    try {
      await downloadRecordExport(record.id, button.dataset.historyAction === "demo" ? "demo" : "report");
    } catch (error) {
      console.error(error);
      window.alert(error.message);
    } finally {
      button.disabled = false;
    }
    return;
  }


  if (
    button.dataset.historyAction === "delete" &&
    window.confirm("确定删除这条历史记录和保存的图片吗？")
  ) {
    button.disabled = true;
    try {
      await deleteHistoryRecord(record.id);
    } catch (error) {
      console.error(error);
      button.disabled = false;
      window.alert(error.message);
    }
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !historyModal.classList.contains("hidden")) {
    closeHistoryModal();
  }
});

document.addEventListener("load", (event) => {
  if (event.target instanceof HTMLImageElement) {
    markImageOrientation(event.target);
  }
}, true);

galleryGrid.addEventListener("click", async (event) => {
  const actionButton = event.target.closest("button[data-action]");
  if (!actionButton) {
    return;
  }

  const card = actionButton.closest(".result-card");
  if (!card || card.id === "loadingCard") {
    return;
  }

  const action = actionButton.dataset.action;
  if (action === "zoom") {
    openLightboxFromCard(card);
    return;
  }

  if (action === "download") {
    triggerDownload(card);
    return;
  }

  if (action === "reroll") {
    closeAllRerollMenus();
    await rerollCard(card, "same");
    return;
  }

  if (action === "toggle-reroll-menu") {
    event.stopPropagation();
    toggleRerollMenu(card);
    return;
  }

  if (action === "reroll-variant") {
    event.stopPropagation();
    closeAllRerollMenus();
    await rerollCard(card, actionButton.dataset.variant);
  }
});

function attachActionsToSeedCards() {
  galleryGrid.querySelectorAll(".result-card:not(.loading-card)").forEach((card) => {
    const actions = card.querySelectorAll(".result-actions button");
    if (actions.length >= 3) {
      actions[0].dataset.action = "zoom";
      actions[1].dataset.action = "download";
      actions[2].outerHTML = buildRerollMenu();
    }

    const art = card.querySelector(".art");
    if (art && art.classList.contains("art-one")) {
      card.dataset.fallbackClass = "art-one";
    } else if (art && art.classList.contains("art-two")) {
      card.dataset.fallbackClass = "art-two";
    } else if (art && art.classList.contains("art-three")) {
      card.dataset.fallbackClass = "art-three";
    }
  });
}

negativePrompt.value = negativeTemplate;
composePrompt();
setGenerationMode("agent");
fetchBackendConfig();
loadReferenceCases();
loadHistory(false);
attachActionsToSeedCards();
markImagesIn(document);
