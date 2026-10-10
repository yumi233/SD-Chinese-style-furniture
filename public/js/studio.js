import { apiFetch, apiJson, jsonOptions, safeImageUrl } from "./modules/api.js";
import { enhanceDialogs } from "./modules/dialogs.js";
import "./modules/dock.js";
import { mountContours, mountGrowthRings } from "./modules/contours.js";
import { initWorkbench } from "./modules/workbench.js";

let stageContours = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function imageSrc(value, options = {}) {
  return safeImageUrl(value, options);
}

function responseMessage(response, payload, fallback) {
  if (response?.status === 401) return "请先登录后再继续；打开右上角个人资料即可登录或注册。";
  if (response?.status === 403) return "当前账号没有执行此操作的权限；模型配置需要管理员权限。";
  return payload?.message || fallback;
}

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
  codexCli: "Codex 图像生成",
  imageModel: "在线图像模型",
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

const input = document.getElementById("promptInput");
const originalPromptView = document.getElementById("originalPromptView");
const translatedPromptView = document.getElementById("translatedPrompt");
const enhancedPrompt = document.getElementById("enhancedPrompt");
const negativePrompt = document.getElementById("negativePrompt");
const styleChips = document.getElementById("styleChips");
const qualitySegment = document.getElementById("qualitySegment");
const sizeSegment = document.getElementById("sizeSegment");
const moodRange = document.getElementById("moodRange");
const moodValue = document.getElementById("moodValue");
const generateButton = document.getElementById("generateButton");
const modelConfigButton = document.getElementById("modelConfigButton");
const taskEngineSelect = document.getElementById("taskEngineSelect");
const taskEngineHint = document.getElementById("taskEngineHint");
const galleryGrid = document.getElementById("galleryGrid");
const topActions = document.querySelector(".top-actions");
const userProfileButton = document.getElementById("userProfileButton");
const profileModal = document.getElementById("profileModal");
const profileHistoryCount = document.getElementById("profileHistoryCount");
const profileHistoryButton = document.getElementById("profileHistoryButton");
const profileDisplayName = document.getElementById("profileDisplayName");
const profileEmail = document.getElementById("profileEmail");
const profileAvatarButton = document.getElementById("profileAvatarButton");
const profileAvatarImage = document.getElementById("profileAvatarImage");
const profileAvatarFallback = document.getElementById("profileAvatarFallback");
const profileAvatarInput = document.getElementById("profileAvatarInput");
const profileAuthView = document.getElementById("profileAuthView");
const profileAuthDisabled = document.getElementById("profileAuthDisabled");
const profileLoginForm = document.getElementById("profileLoginForm");
const profileRegisterForm = document.getElementById("profileRegisterForm");
const profileAccountView = document.getElementById("profileAccountView");
const profileLoginEmail = document.getElementById("profileLoginEmail");
const profileLoginPassword = document.getElementById("profileLoginPassword");
const profileRegisterName = document.getElementById("profileRegisterName");
const profileRegisterEmail = document.getElementById("profileRegisterEmail");
const profileRegisterPassword = document.getElementById("profileRegisterPassword");
const profileNameInput = document.getElementById("profileNameInput");
const profileLogoutButton = document.getElementById("profileLogoutButton");
const profileMessage = document.getElementById("profileMessage");
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
const bestDownloadButton = document.getElementById("bestDownloadButton");
const bestRefineButton = document.getElementById("bestRefineButton");
const saveAgentProjectButton = document.getElementById("saveAgentProjectButton");
const currentResolution = document.getElementById("currentResolution");
const historyNavButton = document.getElementById("historyNavButton");
const historyCount = document.getElementById("historyCount");
const historyModal = document.getElementById("historyModal");
const historyGrid = document.getElementById("historyGrid");
const historyEmpty = document.getElementById("historyEmpty");
const historyFilterInput = document.getElementById("historyFilterInput");
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
const textModelNameInput = document.getElementById("textModelNameInput");
const textModelApiKeyInput = document.getElementById("textModelApiKeyInput");
const imageModelBaseUrlInput = document.getElementById("imageModelBaseUrlInput");
const imageModelNameInput = document.getElementById("imageModelNameInput");
const imageModelSizeInput = document.getElementById("imageModelSizeInput");
const imageModelApiKeyInput = document.getElementById("imageModelApiKeyInput");
const visionModelBaseUrlInput = document.getElementById("visionModelBaseUrlInput");
const visionModelNameInput = document.getElementById("visionModelNameInput");
const visionModelApiKeyInput = document.getElementById("visionModelApiKeyInput");
const configCancelButton = document.getElementById("configCancelButton");
const configSaveButton = document.getElementById("configSaveButton");
const settingsShell = document.getElementById("settingsShell");
const settingsTitle = document.getElementById("settingsTitle");
const settingsEyebrow = document.getElementById("settingsEyebrow");
const modelAccessNote = document.getElementById("modelAccessNote");
const settingsDensity = document.getElementById("settingsDensity");
const settingsColorTheme = document.getElementById("settingsColorTheme");
const settingsFontFamily = document.getElementById("settingsFontFamily");
const settingsFontSize = document.getElementById("settingsFontSize");
const settingsDisplayMode = document.getElementById("settingsDisplayMode");
const settingsNotificationLevel = document.getElementById("settingsNotificationLevel");
const settingsSystemNotice = document.getElementById("settingsSystemNotice");
const settingsNotificationHint = document.getElementById("settingsNotificationHint");
enhanceDialogs([historyModal, configModal, profileModal]);
const generationStore = new Map();
const lightbox = createLightbox();

let selectedStyle = "ming";
let selectedQuality = "hd";
let selectedSize = defaultSizeValue;
let lastGeneratedPrompt = "";
let refineHistory = [];
let selectedRefineIndex = 0;
let defaultEngine = "codexCli";
let cardSequence = 0;
let currentConfig = null;
let selectedGenerationMode = "normal";
let bestAgentResult = null;
let historyRecords = [];
let referenceCases = [];
let historyFilter = "";
let lightboxTrigger = null;
let activeLightboxCardIndex = -1;

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const motionDemo = new URLSearchParams(window.location.search).get("motion");
const motionDemoOptions = {
  cards: {
    title: "家具卡片动效",
    description: "依次入场、悬停轻抬，并为键盘聚焦提供相同的视觉反馈。",
  },
  gallery: {
    title: "图片画廊浏览",
    description: "打开预览后可用左右方向键、Home、End 和 Escape 完成浏览。",
  },
  prompt: {
    title: "Prompt 流程动效",
    description: "把生成、评审与优化的执行步骤作为可读的渐进流程呈现。",
  },
  loading: {
    title: "生成等待状态",
    description: "在真正生成或演示状态中使用克制的呼吸反馈，静止时不分散注意力。",
  },
};

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
  generateButton.textContent = agentMode ? "✦ 开始迭代" : "✦ 生成方案";
  document.querySelector(".review-card")?.classList.toggle("hidden", !agentMode);
  document.querySelector(".studio-layout")?.setAttribute("data-mode", agentMode ? "agent" : "normal");
}

function buildGenerationPayload(prompt = enhancedPrompt.value.trim()) {
  return {
    engine: taskEngineSelect?.value || defaultEngine,
    originalPrompt: input.value.trim(),
    prompt,
    enhancedPrompt: prompt,
    negativePrompt: negativePrompt.value.trim(),
    style: selectedStyle,
    quality: selectedQuality,
    size: selectedSize,
    mood: Number(moodRange.value),
  };
}

function resetAgentProcess() {
  document.querySelectorAll(".agent-step").forEach((step) => {
    step.classList.remove("active", "done", "failed");
    step.removeAttribute("aria-current");
    step.setAttribute("aria-busy", "false");
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
  if (state === "active") {
    step.setAttribute("aria-current", "step");
    step.setAttribute("aria-busy", "true");
  } else {
    step.removeAttribute("aria-current");
    step.setAttribute("aria-busy", "false");
  }
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
  const values = [["迭代", rounds, "轮"], ["生成", imageCount, "张"], ["最佳评分", score || "--", ""]];
  agentSummary.replaceChildren(...values.map(([label, value, suffix]) => {
    const span = document.createElement("span");
    const strong = document.createElement("strong");
    span.append(`${label} `, strong, suffix);
    strong.textContent = String(value);
    return span;
  }));
}

function updateBestSolution(result, evaluation, rounds) {
  bestAgentResult = { ...result, evaluation };
  bestSolution.classList.remove("hidden");
  bestScoreBadge.textContent = evaluation.evaluationFailed ? (evaluation.evaluationPending ? "正在评审" : "待人工评审") : `${evaluation.score} / 100 ${
    evaluation.score >= Number(targetScoreSelect.value) ? "已达标" : "待优化"
  }`;
  bestScoreBadge.classList.remove("idle");
  bestScoreBadge.classList.toggle("success", evaluation.score >= Number(targetScoreSelect.value));

  bestSolutionMedia.className = `best-solution-media art ${result.fallbackClass || "art-one"}`;
  bestSolutionMedia.replaceChildren();
  const bestImageUrl = imageSrc(result.imageUrl);
  if (bestImageUrl) {
    const image = document.createElement("img");
    image.className = "art-image";
    image.src = bestImageUrl;
    image.alt = "智能体最佳家具方案";
    bestSolutionMedia.appendChild(image);
  }
  if (bestImageUrl) {
    bestSolutionMedia.classList.add("has-image");
  }
  markImagesIn(bestSolutionMedia);

  bestSolutionTitle.textContent = `${styleLabels[selectedStyle]}优化方案`;
  bestSolutionReason.textContent =
    evaluation.suggestion ||
    (rounds > 1
      ? "经过教学 Rubric 评审和提示词修正，当前方案是本次任务中的最高分结果。"
      : "当前方案已完成教学 Rubric 与视觉模型评审。");
  renderRubricScores(evaluation.rubric || evaluation);
  renderLearningFeedback(evaluation.learningFeedback || {}, evaluation);
  renderReferenceEvidence(result.referenceCases || []);
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



function normalizedScore(value) {
  if (value === null || value === undefined) return "--";
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
  if (!currentUser) {
    historyRecords = [];
    historyFilter = "";
    if (historyFilterInput) historyFilterInput.value = "";
    renderHistoryRecords();
    historyEmpty.querySelector("strong").textContent = "请先登录";
    historyEmpty.querySelector("p").textContent = "登录后可查看属于你的历史记录。";
    if (openAfterLoad) {
      historyModal.classList.remove("hidden");
      document.body.classList.add("modal-open");
    }
    return;
  }
  refreshHistoryButton.disabled = true;
  try {
    const response = await apiFetch("/history?limit=200");
    const json = await response.json();
    if (!response.ok || !json.ok) {
      const error = new Error(responseMessage(response, json, "历史记录读取失败"));
      error.status = response.status;
      throw error;
    }
    historyRecords = Array.isArray(json.records) ? json.records : [];
    renderHistoryRecords();
    if (openAfterLoad) {
      historyModal.classList.remove("hidden");
      document.body.classList.add("modal-open");
    }
  } catch (error) {
    console.error(error);
    historyGrid.replaceChildren();
    historyGrid.classList.add("hidden");
    historyEmpty.classList.remove("hidden");
    historyEmpty.querySelector("strong").textContent = error?.status === 401 ? "请先登录" : "历史记录读取失败";
    historyEmpty.querySelector("p").textContent = error?.status === 401
      ? "登录后可查看属于你的历史记录。"
      : error.message;
    if (openAfterLoad) {
      historyModal.classList.remove("hidden");
      document.body.classList.add("modal-open");
    }
  } finally {
    refreshHistoryButton.disabled = false;
  }
}

function renderHistoryRecords() {
  const query = historyFilter.trim().toLowerCase();
  const visibleRecords = query
    ? historyRecords.filter((record) => [record.title, record.originalPrompt, record.finalPrompt, record.style, record.type].some((value) => String(value || "").toLowerCase().includes(query)))
    : historyRecords;
  historyCount.textContent = String(visibleRecords.length);
  historyGrid.replaceChildren(...visibleRecords.map(createHistoryCard));
  historyGrid.classList.toggle("hidden", visibleRecords.length === 0);
  historyEmpty.classList.toggle("hidden", visibleRecords.length > 0);
  if (!visibleRecords.length) {
    historyEmpty.querySelector("strong").textContent = "还没有历史记录";
    historyEmpty.querySelector("p").textContent = query
      ? "没有匹配的历史记录，请换一个关键词。"
      : "完成一次普通生成或智能体生成后，图片和参数会自动保存在这里。";
  }
}

function createHistoryCard(record) {
  const card = document.createElement("article");
  card.className = "history-item yui-card";
  card.dataset.historyId = record.id;

  const media = document.createElement("div");
  media.className = "history-image";
  const preview = getHistoryPreview(record);
  const previewUrl = imageSrc(preview?.url);
  if (previewUrl) {
    const image = document.createElement("img");
    image.src = previewUrl;
    image.alt = String(record.title || "历史家具方案");
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
  const remove = document.createElement("button");
  remove.type = "button";
  remove.dataset.historyAction = "delete";
  remove.setAttribute("aria-label", "删除历史记录");
  remove.textContent = "×";
  actions.append(restore, remove);
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
  document.body.classList.remove("modal-open");
}

function restoreHistoryRecord(record) {
  if (!record) {
    return;
  }

  setGenerationMode(record.type === "agent" ? "agent" : "normal");
  input.value = record.originalPrompt || record.finalPrompt || "";

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




function listText(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean).join("；");
  }
  return String(value || "").trim();
}

async function loadReferenceCases() {
  try {
  const response = await apiFetch("/reference-cases");
    const json = await response.json();
    if (!response.ok || !json.ok) {
      throw new Error(responseMessage(response, json, "案例知识库读取失败"));
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
      card.className = "reference-case yui-card";
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
  const response = await apiFetch(`/history/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  const json = await response.json();
  if (!response.ok || !json.ok) {
    throw new Error(responseMessage(response, json, "删除历史记录失败"));
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
  const safeUrl = imageSrc(imageUrl);
  const safeClass = ["art-one", "art-two", "art-three"].includes(fallbackClass) ? fallbackClass : "art-one";
  if (safeUrl) {
    return `
      <div class="art has-image">
        <img class="art-image" src="${escapeHtml(safeUrl)}" alt="Generated furniture concept" />
      </div>
    `;
  }

  return `<div class="art ${safeClass}"></div>`;
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
  card.className = "result-card yui-card";
  card.dataset.fallbackClass = ["art-one", "art-two", "art-three"].includes(fallbackClass) ? fallbackClass : "art-one";
  card.innerHTML = `
    ${renderArtMarkup(imageUrl, card.dataset.fallbackClass)}
    <div class="result-meta">
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(subtitle)}</p>
    </div>
    <div class="result-actions">
      <button data-action="zoom" type="button">${uiText.zoom}</button>
      <button data-action="download" type="button">${uiText.download}</button>
      ${buildRerollMenu()}
    </div>
  `;
  markImagesIn(card);
  card.classList.add("is-new");
  card.addEventListener("animationend", () => card.classList.remove("is-new"), { once: true });
  return card;
}

function registerGeneratedCard(card, payload) {
  cardSequence += 1;
  const cardId = `generated-${cardSequence}`;
  card.dataset.cardId = cardId;
  generationStore.set(cardId, payload);
}

function getBrowsableCards() {
  return Array.from(galleryGrid.querySelectorAll(".result-card:not(.loading-card)"));
}

function getLightboxFocusableElements() {
  return Array.from(
    lightbox.querySelectorAll('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
  ).filter((element) => !element.hidden && element.getClientRects().length > 0);
}

function trapLightboxFocus(event) {
  if (event.key !== "Tab") {
    return;
  }

  const focusable = getLightboxFocusableElements();
  if (!focusable.length) {
    event.preventDefault();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function createLightbox() {
  const overlay = document.createElement("div");
  overlay.className = "lightbox hidden";
  overlay.innerHTML = `
    <div class="lightbox-backdrop" data-close="true"></div>
    <section class="lightbox-dialog" role="dialog" aria-modal="true" aria-labelledby="lightboxCaption">
      <button class="lightbox-close" type="button" data-close="true" aria-label="关闭图片预览">×</button>
      <div class="lightbox-toolbar">
        <p class="lightbox-caption" id="lightboxCaption"></p>
        <span class="lightbox-counter" id="lightboxCounter" aria-live="polite"></span>
      </div>
      <div class="lightbox-stage" id="lightboxStage"></div>
      <div class="lightbox-navigation" aria-label="图片浏览">
        <button type="button" data-lightbox-action="previous">← 上一张</button>
        <button type="button" data-lightbox-action="next">下一张 →</button>
      </div>
    </section>
  `;

  overlay.addEventListener("click", (event) => {
    if (event.target.dataset.close === "true") {
      closeLightbox();
      return;
    }

    const action = event.target.closest("button[data-lightbox-action]")?.dataset.lightboxAction;
    if (action === "previous") {
      showLightboxCard(activeLightboxCardIndex - 1);
    } else if (action === "next") {
      showLightboxCard(activeLightboxCardIndex + 1);
    }
  });

  document.body.appendChild(overlay);
  document.addEventListener("keydown", (event) => {
    if (overlay.classList.contains("hidden")) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeLightbox();
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      showLightboxCard(activeLightboxCardIndex - 1);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      showLightboxCard(activeLightboxCardIndex + 1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      showLightboxCard(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      showLightboxCard(getBrowsableCards().length - 1);
      return;
    }
    trapLightboxFocus(event);
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".reroll-group")) {
      closeAllRerollMenus();
    }
  });

  return overlay;
}

function showLightboxCard(index) {
  const cards = getBrowsableCards();
  if (!cards.length) {
    closeLightbox();
    return;
  }

  activeLightboxCardIndex = Math.max(0, Math.min(index, cards.length - 1));
  const card = cards[activeLightboxCardIndex];
  const stage = lightbox.querySelector("#lightboxStage");
  const image = card.querySelector(".art-image");
  const fallbackClass = card.dataset.fallbackClass || "art-one";
  const title = card.querySelector(".result-meta strong")?.textContent?.trim() || "家具方案预览";
  const subtitle = card.querySelector(".result-meta p")?.textContent?.trim() || "";

  stage.replaceChildren();
  const lightboxUrl = imageSrc(image?.src);
  if (lightboxUrl) {
    const lightboxImage = document.createElement("img");
    lightboxImage.className = "lightbox-image";
    lightboxImage.src = lightboxUrl;
    lightboxImage.alt = title;
    stage.appendChild(lightboxImage);
  } else {
    const fallback = document.createElement("div");
    fallback.className = `lightbox-fallback art ${["art-one", "art-two", "art-three"].includes(fallbackClass) ? fallbackClass : "art-one"}`;
    fallback.setAttribute("role", "img");
    fallback.setAttribute("aria-label", title);
    stage.appendChild(fallback);
  }

  lightbox.querySelector("#lightboxCaption").textContent = subtitle ? `${title} · ${subtitle}` : title;
  lightbox.querySelector("#lightboxCounter").textContent = `${activeLightboxCardIndex + 1} / ${cards.length}`;
  lightbox.querySelector('[data-lightbox-action="previous"]').disabled = activeLightboxCardIndex === 0;
  lightbox.querySelector('[data-lightbox-action="next"]').disabled = activeLightboxCardIndex === cards.length - 1;
  markImagesIn(stage);
}

function openLightboxFromCard(card, trigger = null) {
  const cards = getBrowsableCards();
  const index = cards.indexOf(card);
  if (index < 0) {
    return;
  }

  lightboxTrigger = trigger instanceof HTMLElement ? trigger : document.activeElement instanceof HTMLElement ? document.activeElement : null;
  lightbox.classList.remove("hidden");
  document.body.classList.add("modal-open");
  showLightboxCard(index);
  requestAnimationFrame(() => lightbox.querySelector(".lightbox-close").focus());
}

function closeLightbox() {
  if (lightbox.classList.contains("hidden")) {
    return;
  }

  lightbox.classList.add("hidden");
  document.body.classList.remove("modal-open");
  activeLightboxCardIndex = -1;
  lightboxTrigger?.focus();
  lightboxTrigger = null;
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
  const imageUrl = imageSrc(image.src);
  if (!imageUrl) return;
  link.href = imageUrl;
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

let taskPolling = false;
async function submitGenerationTask(mode, payload, existingTask = null) {
  if (taskPolling) throw new Error("已有任务正在加载");
  if (!currentUser) throw new Error("请先登录后再生成");
  const ownerId = currentUser.id;
  taskPolling = true;
  try {
    let task = existingTask;
    if (!task) {
      const response = await apiJson("/generation-tasks", jsonOptions({ ...payload, mode, requestId: crypto.randomUUID() }, { method: "POST" }));
      task = response.task;
    }
    const started = Date.now();
    while (["queued", "running"].includes(task.status)) {
      if (currentUser?.id !== ownerId) throw new Error("账号已切换，请登录原账号查看生成任务");
      const phases = { preparing: "正在整理设计需求", generating: "正在生成家具图片", reviewing: "图片已生成，正在视觉评审", saving: "正在保存图片" };
      loadingCard.querySelector("strong").textContent = phases[task.phase] || "任务已提交";
      loadingCard.querySelector("p").textContent = `${task.round ? `第 ${task.round} 轮 · ` : ""}你可以刷新页面，任务会在后台继续。`;
      setStatus(task.phase === "reviewing" ? "正在评审" : "生成中");
      if (task.result?.bestImage) {
        updateBestSolution({ imageUrl: task.result.bestImage.url, historyId: task.result.historyRecord?.id, referenceCases: task.result.referenceCases || [] }, task.result.bestEvaluation, task.result.completedRounds);
      }
      if (Date.now() - started > 30 * 60_000) throw new Error("任务仍在后台执行，请稍后刷新查看进度");
      await new Promise(resolve => setTimeout(resolve, 2000));
      task = (await apiJson(`/generation-tasks/${encodeURIComponent(task.id)}`)).task;
    }
    if (currentUser?.id !== ownerId) throw new Error("请登录原账号查看结果");
    if (task.status !== "completed" || !task.result) throw new Error(task.message || "生成未完成，请稍后重试");
    return task.result;
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    throw new Error("连接中断，任务可能仍在生成；请刷新查看，避免重复提交");
  } finally { taskPolling = false; }
}
async function resumeGenerationTask() {
  if (!currentUser || taskPolling) return;
  try {
    const { tasks } = await apiJson("/generation-tasks");
    const task = tasks?.[0];
    if (!task || taskPolling) return;
    input.value = task.request.originalPrompt || task.request.prompt;
    enhancedPrompt.value = task.request.prompt;
    if (task.mode === "agent") await runAgentGeneration(task);
    else await requestGeneration(task.request, { task });
  } catch { /* A transient reconnect failure does not resubmit or bill another generation. */ }
}

async function requestGeneration(requestPayload, options = {}) {
  setStatus(uiText.generating);
  setLoadingState(true);
  loadingCard.querySelector("strong").textContent = uiText.loadingTitle;
  loadingCard.querySelector("p").textContent = uiText.loadingDesc;

  try {
    const json = await submitGenerationTask("normal", requestPayload, options.task);
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

async function runAgentGeneration(existingTask = null) {
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
    const json = await submitGenerationTask("agent", existingTask?.request || {
      ...buildGenerationPayload(initialPrompt), targetScore, maxRounds,
    }, existingTask);
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

    agentProcessStatus.textContent = json.reviewIncomplete ? "图片已保留 · 评审未完成" :
      json.bestScore >= targetScore ? "已完成 · 达标" : "已完成 · 未达标";
    agentProcessStatus.classList.add("success");
    setStatus("智能体已完成");
    loadingCard.querySelector("strong").textContent = uiText.idleTitle;
    loadingCard.querySelector("p").textContent =
      json.reviewIncomplete ? "图片已保存，可查看、下载或继续细化。自动评审未完成。" : `完成 ${json.completedRounds} 轮生成，视觉模型最高评分 ${json.bestScore}。`;
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
  const imageUrl = item && item.imageUrl ? imageSrc(item.imageUrl) : "";
  const imageMarkup = imageUrl
    ? `<img class="art-image" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(getRefineVersionLabel(selectedRefineIndex))}" />`
    : "";

  const safeFallback = ["art-one", "art-two", "art-three"].includes(fallbackClass) ? fallbackClass : "art-one";
  return `<span class="refine-stack-card ${layerClass} art ${safeFallback} ${imageUrl ? "has-image" : ""}">${imageMarkup}</span>`;
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
  loadingCard.classList.toggle("is-loading", isLoading);
  loadingCard.setAttribute("aria-busy", String(isLoading));
  const configCheckButton = loadingCard.querySelector("[data-open-config]");
  if (configCheckButton) configCheckButton.disabled = isLoading;
  if (isLoading) {
    generateButton.textContent =
      selectedGenerationMode === "agent" ? "智能体迭代中…" : "生成中…";
    stageContours?.setMode("busy");
    return;
  }
  generateButton.textContent =
    selectedGenerationMode === "agent" ? "✦ 开始迭代" : "✦ 生成方案";
  stageContours?.setMode("idle");
}

function setStatus(text, idle = false) {
  statusChip.textContent = text;
  const tone = idle || /生成中|执行中|待生成|等待|未加载/.test(text)
    ? "neutral"
    : /失败|错误|需要登录|不可用/.test(text)
      ? "danger"
      : /完成|成功|达标|已生成/.test(text)
        ? "success"
        : "neutral";
  statusChip.dataset.tone = tone;
  statusChip.classList.toggle("idle", tone === "neutral");
  statusChip.classList.toggle("success", tone === "success");
  statusChip.classList.toggle("danger", tone === "danger");
}

function hydrateConfigForm(config) {
  if (!config) {
    engineSelect.value = "automatic1111";
    textModelEnabledSelect.value = "false";
    [
      auto1111BaseUrlInput,
      auto1111ModelInput,
      comfyBaseUrlInput,
      comfyCheckpointInput,
      comfyWorkflowFileInput,
      textModelBaseUrlInput,
      textModelNameInput,
      textModelApiKeyInput,
      imageModelBaseUrlInput,
      imageModelNameInput,
      imageModelSizeInput,
      imageModelApiKeyInput,
      visionModelBaseUrlInput,
      visionModelNameInput,
      visionModelApiKeyInput,
    ].forEach((control) => { if (control) control.value = ""; });
    return;
  }

  if (config.codexCli?.enabled && ![...engineSelect.options].some(option => option.value === "codexCli")) {
    const option = document.createElement("option"); option.value = "codexCli"; option.textContent = engineLabels.codexCli; engineSelect.prepend(option);
  }
  engineSelect.value = config.defaultEngine || "codexCli";
  auto1111BaseUrlInput.value = config.auto1111BaseUrl || "";
  auto1111ModelInput.value = config.auto1111Lora || config.auto1111Model || "";
  comfyBaseUrlInput.value = config.comfyBaseUrl || "";
  comfyCheckpointInput.value = config.comfyCheckpoint || "";
  comfyWorkflowFileInput.value = config.comfyWorkflowFile || "";
  textModelEnabledSelect.value = config.textModelEnabled ? "true" : "false";
  textModelBaseUrlInput.value = config.textModelBaseUrl || "";
  textModelNameInput.value = config.textModelName || "";
  textModelApiKeyInput.value = "";
  textModelApiKeyInput.placeholder = config.textModelApiKeyConfigured ? "已配置，留空则保留" : "输入文字模型 API Key";
  imageModelBaseUrlInput.value = config.imageModelBaseUrl || "";
  imageModelNameInput.value = config.imageModelName || "";
  imageModelSizeInput.value = config.imageModelSize || "";
  imageModelApiKeyInput.value = "";
  imageModelApiKeyInput.placeholder = config.imageModelApiKeyConfigured ? "已配置，留空则保留" : "输入图像模型 API Key";
  visionModelBaseUrlInput.value = config.visionModelBaseUrl || "";
  visionModelNameInput.value = config.visionModelName || "";
  visionModelApiKeyInput.value = "";
  visionModelApiKeyInput.placeholder = config.visionModelApiKeyConfigured ? "已配置，留空则保留" : "输入视觉模型 API Key";
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
    textModelName: textModelNameInput.value.trim(),
    textModelApiKey: textModelApiKeyInput.value.trim(),
    imageModelBaseUrl: imageModelBaseUrlInput.value.trim(),
    imageModelName: imageModelNameInput.value.trim(),
    imageModelSize: imageModelSizeInput.value.trim(),
    imageModelApiKey: imageModelApiKeyInput.value.trim(),
    visionModelBaseUrl: visionModelBaseUrlInput.value.trim(),
    visionModelName: visionModelNameInput.value.trim(),
    visionModelApiKey: visionModelApiKeyInput.value.trim(),
  };
}

function updateModelButton(config) {
  const engineLabel = engineLabels[config?.defaultEngine] || "模型状态";
  const textLabel = config?.textModelEnabled ? "文字增强 + " : "";
  const visionLabel = config?.visionModelName ? "视觉评审 + " : "";
  modelConfigButton.replaceChildren();
  const dot = document.createElement("span");
  dot.className = "status-dot";
  const label = document.createElement("span");
  label.textContent = config ? `${visionLabel}${textLabel}${engineLabel}` : "模型状态";
  modelConfigButton.append(dot, label);
}

function openConfigModal(event) {
  event?.preventDefault();
  event?.stopPropagation();
  hydrateConfigForm(currentConfig);
  configStatus.textContent = currentConfig ? uiText.configSaved : "未加载";
  configStatus.classList.add("idle");
  setSettingsPanel("general");
  updateModelAccess();
  configModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function closeConfigModal() {
  configModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

const settingsPanelMeta = {
  general: { eyebrow: "GENERAL", title: "通用设置" },
  model: { eyebrow: "MODEL CONNECTION", title: "生成模型连接" },
  data: { eyebrow: "DATA & PRIVACY", title: "数据与隐私" },
  about: { eyebrow: "ABOUT", title: "关于木生 AI" },
};
const preferenceKey = "musheng-studio-preferences";

function readPreferences() {
  try {
    return JSON.parse(localStorage.getItem(preferenceKey) || "{}") || {};
  } catch {
    return {};
  }
}

function writePreference(key, value) {
  try {
    const current = readPreferences();
    current[key] = value;
    localStorage.setItem(preferenceKey, JSON.stringify(current));
  } catch {
    // Private browsing may deny storage; the setting still applies for this view.
  }
}

function setSettingsPanel(panel) {
  const nextPanel = settingsPanelMeta[panel] ? panel : "general";
  settingsShell?.setAttribute("data-settings-panel", nextPanel);
  document.querySelectorAll("[data-settings-panel]").forEach((button) => {
    if (button.tagName === "BUTTON") button.classList.toggle("active", button.dataset.settingsPanel === nextPanel);
  });
  document.querySelectorAll("[data-settings-content]").forEach((content) => {
    content.classList.toggle("active", content.dataset.settingsContent === nextPanel);
  });
  if (settingsTitle) settingsTitle.textContent = settingsPanelMeta[nextPanel].title;
  if (settingsEyebrow) settingsEyebrow.textContent = settingsPanelMeta[nextPanel].eyebrow;
  configStatus?.classList.toggle("hidden", nextPanel !== "model");
  if (configSaveButton) configSaveButton.hidden = nextPanel !== "model" || !currentUser?.isAdmin;
  updateModelAccess();
}

function setInterfaceDensity(density) {
  const compact = density === "compact";
  document.body.classList.toggle("compact-interface", compact);
  document.body.dataset.density = compact ? "compact" : "comfortable";
  writePreference("density", compact ? "compact" : "comfortable");
  settingsDensity?.querySelectorAll("button").forEach((button) => button.classList.toggle("active", button.dataset.density === (compact ? "compact" : "comfortable")));
}

function setChoiceState(container, dataKey, value) {
  container?.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", button.dataset[dataKey] === value);
  });
}

function setColorTheme(theme) {
  document.body.dataset.colorTheme = theme;
  writePreference("colorTheme", theme);
  setChoiceState(settingsColorTheme, "colorTheme", theme);
}

function setFontFamily(font) {
  document.body.dataset.fontFamily = font;
  document.documentElement.dataset.fontFamily = font;
  writePreference("fontFamily", font);
  if (settingsFontFamily) settingsFontFamily.value = font;
}

function setFontSize(size) {
  document.documentElement.dataset.fontSize = size;
  writePreference("fontSize", size);
  if (settingsFontSize) settingsFontSize.value = size;
}

function setDisplayMode(mode) {
  document.body.dataset.displayMode = mode;
  document.documentElement.dataset.theme = mode === "night" ? "night" : "day";
  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    button.textContent = document.documentElement.dataset.theme === "night" ? "日间" : "夜间";
    button.setAttribute("aria-pressed", String(document.documentElement.dataset.theme === "night"));
  });
  writePreference("displayMode", mode);
  setChoiceState(settingsDisplayMode, "displayMode", mode);
}

window.addEventListener("musheng:theme-change", (event) => {
  const mode = event.detail?.theme === "night" ? "night" : "day";
  setDisplayMode(mode);
});

function setNotificationLevel(level) {
  const copy = {
    off: "已关闭工作台消息提醒。",
    complete: "当前仅在木生 AI 工作台内提示生成完成。",
    all: "当前会提示智能体进度与生成完成。",
  };
  setChoiceState(settingsNotificationLevel, "notificationLevel", level);
  writePreference("notificationLevel", level);
  if (settingsNotificationHint) settingsNotificationHint.textContent = copy[level] || copy.complete;
}

function restorePreferences() {
  const preferences = readPreferences();
  setInterfaceDensity(preferences.density || "comfortable");
  setColorTheme(preferences.colorTheme || "wood");
  setFontFamily(preferences.fontFamily || "system");
  setFontSize(preferences.fontSize || "medium");
  setDisplayMode(preferences.displayMode || document.documentElement.dataset.theme || "day");
  setNotificationLevel(preferences.notificationLevel || "complete");
  if (settingsSystemNotice) settingsSystemNotice.checked = Boolean(preferences.systemNotice);
}

let currentUser = null;
let pendingAvatarDataUrl = "";
let authenticationEnabled = true;

function updateModelAccess() {
  const isAdmin = Boolean(currentUser?.isAdmin);
  const modelPanel = document.querySelector('[data-settings-content="model"]');
  modelPanel?.querySelectorAll("input, select, textarea").forEach((control) => {
    control.disabled = !isAdmin;
  });
  if (configSaveButton) {
    const panel = settingsShell?.dataset.settingsPanel || "general";
    configSaveButton.hidden = panel !== "model" || !isAdmin;
    configSaveButton.disabled = !isAdmin;
  }
  if (modelAccessNote) {
    modelAccessNote.hidden = isAdmin;
    modelAccessNote.textContent = isAdmin
      ? "模型连接由管理员维护。"
      : currentUser
        ? "模型连接由管理员维护；普通账号可在创作区选择本次任务的生成引擎。"
        : "登录后可查看模型设置；普通账号可在创作区选择本次任务的生成引擎。";
  }
  if (taskEngineHint) {
    taskEngineHint.textContent = isAdmin
      ? "本次任务使用的引擎可单独选择；保存默认值需要管理员权限。"
      : "由服务端调用在线模型，密钥不会进入浏览器。";
  }
}

async function openProfileModal() {
  if (profileHistoryCount) profileHistoryCount.textContent = String(historyRecords.length);
  profileModal?.classList.remove("hidden");
  document.body.classList.add("modal-open");
  await refreshCurrentUser();
}

function closeProfileModal() {
  profileModal?.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

async function authRequest(path, options = {}) {
  const response = await apiFetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.ok) {
    const error = new Error(responseMessage(response, json, "请求失败，请稍后再试"));
    error.status = response.status;
    throw error;
  }
  return json;
}

function userInitial(user = currentUser) {
  return String(user?.displayName || "木").trim().slice(0, 1) || "木";
}

function updateHeaderAvatar() {
  const avatar = userProfileButton?.querySelector(".user-avatar");
  const name = userProfileButton?.querySelector(".user-name");
  if (!avatar) return;
  avatar.textContent = userInitial();
  const avatarUrl = imageSrc(currentUser?.avatarDataUrl, { allowData: true });
  avatar.style.backgroundImage = avatarUrl ? `url("${avatarUrl.replaceAll('"', "%22")}")` : "";
  avatar.style.backgroundSize = "cover";
  avatar.style.backgroundPosition = "center";
  if (name) name.textContent = currentUser?.displayName || (authenticationEnabled ? "登录 / 注册" : "木生");
  userProfileButton?.setAttribute("aria-label", currentUser?.displayName || (authenticationEnabled ? "登录 / 注册" : "个人资料"));
}

function renderProfile() {
  const loggedIn = Boolean(currentUser);
  const avatarDataUrl = imageSrc(pendingAvatarDataUrl || currentUser?.avatarDataUrl, { allowData: true });
  const initial = userInitial();
  if (profileDisplayName) profileDisplayName.textContent = currentUser?.displayName || (authenticationEnabled ? "登录 / 注册" : "木生访客");
  if (profileEmail) profileEmail.textContent = currentUser?.email || (authenticationEnabled ? "登录后可保存资料并同步个人头像" : "本地模式 · 不需要登录");
  if (profileAvatarFallback) {
    profileAvatarFallback.textContent = initial;
    profileAvatarFallback.classList.toggle("hidden", Boolean(avatarDataUrl));
  }
  if (profileAvatarImage) {
    profileAvatarImage.src = avatarDataUrl || "";
    profileAvatarImage.classList.toggle("hidden", !avatarDataUrl);
  }
  profileAvatarButton?.classList.toggle("is-editable", loggedIn && authenticationEnabled);
  profileAuthView?.classList.toggle("hidden", loggedIn || !authenticationEnabled);
  profileAuthDisabled?.classList.toggle("hidden", authenticationEnabled);
  profileAccountView?.classList.toggle("hidden", !loggedIn);
  if (profileNameInput && loggedIn) profileNameInput.value = currentUser.displayName;
  updateHeaderAvatar();
}

function setProfileMessage(message = "", isError = false) {
  if (!profileMessage) return;
  profileMessage.textContent = message;
  profileMessage.classList.toggle("is-error", isError);
}

async function refreshCurrentUser() {
  try {
    const result = await authRequest("/auth/me");
    authenticationEnabled = result.enabled !== false;
    currentUser = result.user || null;
    if (!currentUser) pendingAvatarDataUrl = "";
    setProfileMessage("");
  } catch (error) {
    currentUser = null;
    if ([404, 405].includes(error?.status)) authenticationEnabled = false;
  }
  renderProfile();
  updateModelAccess();
}

function setAuthMode(mode) {
  if (!authenticationEnabled) return;
  const register = mode === "register";
  profileLoginForm?.classList.toggle("hidden", register);
  profileRegisterForm?.classList.toggle("hidden", !register);
  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.authMode === mode);
  });
  setProfileMessage("");
}

function readAvatarFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("头像读取失败，请换一张图片后重试"));
    reader.readAsDataURL(file);
  });
}

function syncTopActionsVisibility() {
  if (!topActions) return;
  const shouldHide = window.matchMedia("(min-width: 981px)").matches && window.scrollY > 80;
  topActions.classList.toggle("is-scroll-hidden", shouldHide);
}

let topActionsScrollFrame = 0;
window.addEventListener(
  "scroll",
  () => {
    if (topActionsScrollFrame) return;
    topActionsScrollFrame = window.requestAnimationFrame(() => {
      syncTopActionsVisibility();
      topActionsScrollFrame = 0;
    });
  },
  { passive: true },
);
window.addEventListener("hashchange", () => window.requestAnimationFrame(syncTopActionsVisibility));
window.addEventListener("resize", syncTopActionsVisibility);

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

async function fetchEngineModes() {
  try {
    const response = await apiFetch("/engines");
    const json = await response.json().catch(() => ({}));
    if (!response.ok) return;
    const allModes = Array.isArray(json.modes) && json.modes.length
      ? json.modes
      : Object.keys(json.engines || {});
    // The workbench only offers online models; local engines stay server-side.
    const online = allModes.filter((mode) => !/automatic1111|comfyui/.test(mode));
    const modes = online.length ? online : ["imageModel"];
    if (taskEngineSelect && modes.length) {
      const current = taskEngineSelect.value;
      const labels = engineLabels;
      taskEngineSelect.replaceChildren(...modes.map((mode) => {
        const option = document.createElement("option");
        option.value = mode;
        option.textContent = labels[mode] || mode;
        return option;
      }));
      const preferred = json.defaultEngine || current || defaultEngine;
      taskEngineSelect.value = modes.includes(preferred) ? preferred : modes[0];
      defaultEngine = taskEngineSelect.value;
    }
  } catch (error) {
    console.warn("Generation engine list unavailable.", error);
  }
}

async function fetchBackendConfig() {
  if (!currentUser?.isAdmin) {
    configStatus.textContent = currentUser ? "模型连接由管理员维护" : "登录后可查看模型设置";
    configStatus.classList.add("idle");
    updateModelAccess();
    return;
  }
  try {
    const response = await apiFetch("/config");
    if (!response.ok) {
      const json = await response.json().catch(() => ({}));
      configStatus.textContent = responseMessage(response, json, "模型配置暂不可用");
      configStatus.classList.add("idle");
      return;
    }
    const json = await response.json();
    if (json.config) {
      currentConfig = json.config;
      defaultEngine = json.config.defaultEngine || defaultEngine;
      if (taskEngineSelect && [...taskEngineSelect.options].some((option) => option.value === defaultEngine)) {
        taskEngineSelect.value = defaultEngine;
      }
      hydrateConfigForm(currentConfig);
      updateModelButton(currentConfig);
    }
  } catch (error) {
    console.warn("Backend config unavailable.", error);
  }
}

async function saveBackendConfig() {
  if (!currentUser?.isAdmin) {
    configStatus.textContent = "模型配置需要管理员权限";
    configStatus.classList.add("idle");
    updateModelAccess();
    return;
  }
  const payload = readConfigForm();
  configStatus.textContent = uiText.configSaving;
  configStatus.classList.remove("idle");
  configSaveButton.disabled = true;

  try {
    const response = await apiFetch("/config", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const json = await response.json();
    if (!response.ok || !json.ok) {
      throw new Error(responseMessage(response, json, "模型配置保存失败"));
    }

    currentConfig = json.config;
    defaultEngine = json.config.defaultEngine || defaultEngine;
    if (taskEngineSelect && [...taskEngineSelect.options].some((option) => option.value === defaultEngine)) {
      taskEngineSelect.value = defaultEngine;
    }
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
document.querySelectorAll(".settings-nav [data-settings-panel]").forEach((button) => {
  button.addEventListener("click", () => setSettingsPanel(button.dataset.settingsPanel));
});
settingsDensity?.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => setInterfaceDensity(button.dataset.density)));
settingsColorTheme?.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => setColorTheme(button.dataset.colorTheme)));
settingsDisplayMode?.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => setDisplayMode(button.dataset.displayMode)));
settingsNotificationLevel?.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => setNotificationLevel(button.dataset.notificationLevel)));
settingsFontFamily?.addEventListener("change", () => setFontFamily(settingsFontFamily.value));
settingsFontSize?.addEventListener("change", () => setFontSize(settingsFontSize.value));
settingsSystemNotice?.addEventListener("change", () => {
  writePreference("systemNotice", settingsSystemNotice.checked);
  if (settingsNotificationHint) settingsNotificationHint.textContent = settingsSystemNotice.checked
    ? "已选择系统通知；首次推送时浏览器会向你确认权限。"
    : "系统通知未开启，消息将只显示在木生 AI 工作台内。";
});
document.querySelectorAll("[data-settings-action]").forEach((button) => {
  button.addEventListener("click", () => {
    closeConfigModal();
    if (button.dataset.settingsAction === "profile") openProfileModal();
    if (button.dataset.settingsAction === "history") loadHistory(true);
  });
});
userProfileButton?.addEventListener("click", openProfileModal);
document.querySelectorAll("[data-auth-mode]").forEach((button) => {
  button.addEventListener("click", () => setAuthMode(button.dataset.authMode));
});
profileLoginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setProfileMessage("正在登录…");
  try {
    const result = await authRequest("/auth/login", { method: "POST", body: JSON.stringify({ email: profileLoginEmail.value, password: profileLoginPassword.value }) });
    currentUser = result.user;
    pendingAvatarDataUrl = "";
    profileLoginForm.reset();
    renderProfile();
    updateModelAccess();
    fetchBackendConfig();
    loadHistory(false);
    setProfileMessage("登录成功，欢迎回来");
  } catch (error) {
    setProfileMessage(error.message, true);
  }
});
profileRegisterForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setProfileMessage("正在创建账号…");
  try {
    const result = await authRequest("/auth/register", { method: "POST", body: JSON.stringify({ displayName: profileRegisterName.value, email: profileRegisterEmail.value, password: profileRegisterPassword.value }) });
    currentUser = result.user;
    pendingAvatarDataUrl = "";
    profileRegisterForm.reset();
    renderProfile();
    updateModelAccess();
    fetchBackendConfig();
    loadHistory(false);
    setProfileMessage("账号已创建，现在可以上传头像");
  } catch (error) {
    setProfileMessage(error.message, true);
  }
});
profileAvatarButton?.addEventListener("click", () => {
  if (!authenticationEnabled) return setProfileMessage("当前为本地创作模式，无需登录", false);
  if (!currentUser) return setProfileMessage("请先登录或注册账号后再修改头像", true);
  profileAvatarInput?.click();
});
profileAvatarInput?.addEventListener("change", async () => {
  const file = profileAvatarInput.files?.[0];
  if (!file) return;
  if (file.size > 1024 * 1024) {
    setProfileMessage("头像请使用 1 MB 以内的图片", true);
    profileAvatarInput.value = "";
    return;
  }
  try {
    pendingAvatarDataUrl = await readAvatarFile(file);
    renderProfile();
    setProfileMessage("头像已选定，点击“保存个人资料”后生效");
  } catch (error) {
    setProfileMessage(error.message, true);
  }
});
profileAccountView?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setProfileMessage("正在保存…");
  try {
    const payload = { displayName: profileNameInput.value };
    if (pendingAvatarDataUrl) payload.avatarDataUrl = pendingAvatarDataUrl;
    const result = await authRequest("/auth/profile", { method: "PATCH", body: JSON.stringify(payload) });
    currentUser = result.user;
    pendingAvatarDataUrl = "";
    renderProfile();
    setProfileMessage("个人资料已保存");
  } catch (error) {
    setProfileMessage(error.message, true);
  }
});
profileLogoutButton?.addEventListener("click", async () => {
  try {
    await authRequest("/auth/logout", { method: "POST" });
    currentUser = null;
    pendingAvatarDataUrl = "";
    currentConfig = null;
    historyRecords = [];
    renderHistoryRecords();
    renderProfile();
    updateModelAccess();
    updateModelButton(null);
    setAuthMode("login");
    setProfileMessage("已退出登录");
  } catch (error) {
    setProfileMessage(error.message, true);
  }
});
profileHistoryButton?.addEventListener("click", () => {
  closeProfileModal();
  loadHistory(true);
});
profileModal?.addEventListener("click", (event) => {
  if (event.target.dataset.closeProfile === "true") closeProfileModal();
});
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
  const bestUrl = imageSrc(bestAgentResult?.imageUrl);
  if (!bestUrl) {
    return;
  }
  const link = document.createElement("a");
  link.href = bestUrl;
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



saveAgentProjectButton.addEventListener("click", () => {
  if (!bestAgentResult) {
    return;
  }
  loadHistory(true);
});

historyNavButton.addEventListener("click", () => loadHistory(true));
refreshHistoryButton.addEventListener("click", () => loadHistory(false));
historyFilterInput?.addEventListener("input", () => {
  historyFilter = historyFilterInput.value;
  renderHistoryRecords();
});
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
    openLightboxFromCard(card, actionButton);
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

negativePrompt.value = negativeTemplate;
loadingCard.querySelector("strong").textContent = "还没有生成结果";
loadingCard.querySelector("p").textContent = "完成一次生成后，结果会出现在这里；如果失败，请检查模型连接或联系管理员。";
composePrompt();
setGenerationMode("normal");
loadReferenceCases();
restorePreferences();
syncTopActionsVisibility();
markImagesIn(document);
updateModelButton(null);
updateModelAccess();
fetchEngineModes();
refreshCurrentUser().then(() => {
  if (currentUser) { loadHistory(false); resumeGenerationTask(); }
  if (currentUser?.isAdmin) fetchBackendConfig();
});

function buildMotionDemoUrl(id) {
  const url = new URL(window.location.href);
  url.searchParams.set("motion", id);
  return url.href;
}

function showMotionDemoBanner(option) {
  const banner = document.createElement("aside");
  banner.className = "motion-demo-banner";
  banner.setAttribute("aria-label", "动效方案演示");

  const copy = document.createElement("div");
  const eyebrow = document.createElement("span");
  eyebrow.textContent = "MOTION STUDY";
  const title = document.createElement("strong");
  title.textContent = option.title;
  const description = document.createElement("p");
  description.textContent = option.description;
  copy.append(eyebrow, title, description);

  const links = document.createElement("nav");
  links.className = "motion-demo-links";
  links.setAttribute("aria-label", "切换动效方案");
  Object.entries(motionDemoOptions).forEach(([id, item]) => {
    const link = document.createElement("a");
    link.href = buildMotionDemoUrl(id);
    link.textContent = item.title.replace("动效", "").replace("状态", "");
    link.classList.toggle("active", id === motionDemo);
    link.setAttribute("aria-current", id === motionDemo ? "page" : "false");
    links.append(link);
  });

  banner.append(copy, links);
  document.querySelector(".studio-main")?.prepend(banner);
}

function replayCardEntrance() {
  getBrowsableCards().forEach((card, index) => {
    card.style.setProperty("--motion-delay", `${index * 90}ms`);
    card.classList.remove("is-new");
    card.addEventListener("animationend", () => card.classList.remove("is-new"), { once: true });
    if (!prefersReducedMotion()) {
      requestAnimationFrame(() => card.classList.add("is-new"));
    }
  });
}

function scrollToMotionDemo(target) {
  target?.scrollIntoView({
    behavior: prefersReducedMotion() ? "auto" : "smooth",
    block: "center",
  });
}

function startMotionDemo() {
  const option = motionDemoOptions[motionDemo];
  if (!option) {
    return;
  }


  document.body.dataset.motionDemo = motionDemo;
  showMotionDemoBanner(option);

  if (motionDemo === "cards") {
    scrollToMotionDemo(galleryGrid);
    window.setTimeout(replayCardEntrance, prefersReducedMotion() ? 0 : 260);
    return;
  }

  if (motionDemo === "gallery") {
    scrollToMotionDemo(galleryGrid);
    const firstCard = getBrowsableCards()[0];
    const trigger = firstCard?.querySelector('button[data-action="zoom"]');
    window.setTimeout(
      () => firstCard && openLightboxFromCard(firstCard, trigger),
      prefersReducedMotion() ? 0 : 300,
    );
    return;
  }

  if (motionDemo === "prompt") {
    scrollToMotionDemo(document.getElementById("agentProcess"));
    return;
  }

  loadingCard.classList.add("motion-demo-loading");
  loadingCard.querySelector("strong").textContent = "生成等待状态 · 动效演示";
  loadingCard.querySelector("p").textContent = "此演示不会调用模型；实际生成时会使用相同的状态反馈。";
  scrollToMotionDemo(loadingCard);
}

const stageHost = document.getElementById("stageCanvas");
stageContours = stageHost
  ? mountContours(stageHost, { seed: 11, levels: 22, cell: 16, scale: 420, knots: [{ x: 0.72, y: 0.46, r: 0.34, strength: 0.7 }], labelBase: 100, labelStep: 5 })
  : null;
initWorkbench(document);
const ringsHost = document.getElementById("ringsHost");
if (ringsHost) {
  mountGrowthRings(ringsHost, [
    { element: cultureScore, label: "文化准确性" },
    { element: structureScore, label: "结构合理性" },
    { element: craftScore, label: "材料工艺" },
    { element: innovationScore, label: "设计创新" },
    { element: sceneFitScore, label: "场景适配" },
    { element: aiUsageScore, label: "AI 使用" },
  ]);
}

startMotionDemo();
