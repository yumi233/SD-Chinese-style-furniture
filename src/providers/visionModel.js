const {
  buildHeaders,
  createProviderError,
  normalizeBaseUrl,
  readErrorDetails,
} = require("./openaiCompatible");
const { formatReferenceContext } = require("../referenceKnowledge");
const { getStyleProfile, describeModernity, normalizeModernity } = require("../knowledge/styleProfiles");

// In styles that check for it, an image this antique-looking cannot pass, and
// neither can one with no visible Chinese cue (generic modern furniture).
const ANTIQUE_RISK_LIMIT = 60;
const ANTIQUE_SCORE_CAP = 70;
const GENERIC_SCORE_CAP = 75;
const MATERIAL_SWAP_SCORE_CAP = 80;

const RUBRIC_KEYS = [
  "cultureAccuracy",
  "structureReasoning",
  "materialCraft",
  "designInnovation",
  "sceneFit",
  "aiUsage",
];

class VisionModelAdapter {
  constructor(config) {
    this.baseUrl = normalizeBaseUrl(config.baseUrl);
    this.apiKey = String(config.apiKey || "").trim();
    this.model = String(config.model || "").trim();
  }

  isConfigured() {
    return Boolean(this.baseUrl && this.model);
  }

  async health() {
    this.assertConfigured();
    const response = await fetch(`${this.baseUrl}/models`, {
      headers: buildHeaders(this.apiKey),
    });
    if (!response.ok) {
      throw createProviderError(
        "Vision model health check failed",
        response,
        await readErrorDetails(response),
      );
    }
    return {
      ok: true,
      baseUrl: this.baseUrl,
      model: this.model,
    };
  }

  async evaluate({ imageUrl, requirement, prompt, targetScore, round, referenceCases = [], style, modernity, requiredCues = [], designMove = "" }) {
    this.assertConfigured();
    const profile = getStyleProfile(style);
    const resolvedImageUrl = await resolveImageUrl(imageUrl);
    const referenceContext = formatReferenceContext(referenceCases);
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: buildHeaders(this.apiKey),
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: [
              "You are a strict visual reviewer for a Chinese furniture design course.",
              "Evaluate only what is visibly supported by the image and the user's requirement.",
              "Use the built-in reference cases as teaching context, not as external facts to invent details.",
              "Score the design with a teaching rubric: cultureAccuracy, structureReasoning, materialCraft, designInnovation, sceneFit, and aiUsage.",
              profile.cultureRubric,
              ...(profile.checksAntique
                ? [
                    "Also fill styleCheck: antiqueRisk from 0 (clearly contemporary) to 100 (looks like an antique or replica), chineseCue true only if an ordinary viewer, without being told, would recognise a traditional Chinese furniture cue (recessed legs or a thin shadow line alone do not count), keptCues listing the traditional cues you can see (empty if none), materialSwapOnly true if the form is essentially an unchanged classical piece made in a new material, and antiqueSignals listing what makes it look old (dark heavy hardwood, carving, patina, palace or museum setting, symbol stacking).",
                    "If antiqueRisk is high, say so in problems and make revisedPrompt more contemporary. If no Chinese cue is visible the piece is generic modern furniture: say so in problems and make revisedPrompt express the required cue through form. If materialSwapOnly is true, say so and make revisedPrompt apply the design move. Never put antique, replica, Ming-style, Qing-style, carving or palace into revisedPrompt.",
                  ]
                : []),
              "Return learning feedback that a student can act on: strengths, issues, and nextSteps.",
              "Return one valid JSON object only, without markdown or extra commentary.",
              "Use integer scores from 0 to 100.",
              "The revisedPrompt must be a concise positive English image-generation prompt that preserves the user's intent and fixes visible problems.",
              'Required schema: {"score":0,"rubric":{"cultureAccuracy":0,"structureReasoning":0,"materialCraft":0,"designInnovation":0,"sceneFit":0,"aiUsage":0},"structureScore":0,"materialScore":0,"styleScore":0,"problems":[""],"suggestion":"","learningFeedback":{"strengths":[""],"issues":[""],"nextSteps":[""]},"knowledgeReferences":[""],"complianceNotes":[""],"styleCheck":{"antiqueRisk":0,"keptCues":[""],"antiqueSignals":[""]},"revisedPrompt":""}.',
            ].join(" "),
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: [
                  `User requirement: ${requirement}`,
                  `Prompt used for round ${round}: ${prompt}`,
                  `Target score: ${targetScore}`,
                  `Style: ${profile.label} (${profile.anchor})`,
                  ...(profile.checksAntique
                    ? [
                        `Tradition-to-contemporary balance: ${normalizeModernity(modernity)}/100 (${describeModernity(normalizeModernity(modernity)).label})`,
                        ...(requiredCues.length ? [`Required traditional cue: ${requiredCues.join("; ")}`] : []),
                        ...(designMove ? [`Design move: ${designMove}`] : []),
                      ]
                    : []),
                  referenceContext ? `Reference cases:\n${referenceContext}` : "Reference cases: none matched.",
                  "Review this generated furniture image and return the required JSON.",
                ].join("\n"),
              },
              {
                type: "image_url",
                image_url: {
                  url: resolvedImageUrl,
                  detail: "high",
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      throw createProviderError(
        "Vision model evaluation failed",
        response,
        await readErrorDetails(response),
      );
    }

    const json = await response.json();
    const content = extractMessageText(json);
    const evaluation = normalizeEvaluation(parseJsonObject(content), prompt, referenceCases, { style });

    return {
      ...evaluation,
      metadata: {
        model: this.model,
        usage: json.usage || null,
      },
    };
  }

  assertConfigured() {
    if (!this.baseUrl || !this.model) {
      const error = new Error(
        "Vision model API base URL or model name is missing. Configure VISION_MODEL_* first.",
      );
      error.statusCode = 400;
      throw error;
    }
  }
}

async function resolveImageUrl(imageUrl) {
  const normalized = String(imageUrl || "").trim();
  if (!normalized) {
    const error = new Error("Vision evaluation requires an image.");
    error.statusCode = 400;
    throw error;
  }

  if (normalized.startsWith("data:")) {
    return normalized;
  }

  if (!/^https?:\/\//i.test(normalized)) {
    const error = new Error("Vision evaluation received an unsupported image URL.");
    error.statusCode = 400;
    throw error;
  }

  const response = await fetch(normalized);
  if (!response.ok) {
    const error = new Error(`Unable to download generated image for evaluation: ${response.status}`);
    error.statusCode = response.status;
    throw error;
  }

  const mimeType = response.headers.get("content-type") || "image/png";
  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function extractMessageText(json) {
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => (typeof item === "string" ? item : item?.text || ""))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function parseJsonObject(content) {
  const normalized = String(content || "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(normalized);
  } catch (error) {
    const start = normalized.indexOf("{");
    const end = normalized.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(normalized.slice(start, end + 1));
    }
    const parseError = new Error("Vision model did not return valid JSON.");
    parseError.details = normalized;
    throw parseError;
  }
}

function normalizeEvaluation(value, fallbackPrompt, referenceCases = [], { style } = {}) {
  const rubric = normalizeRubric(value);
  let score = scoreValue(value?.score) || averageRubricScore(rubric);
  const problems = listValue(value?.problems).slice(0, 6);
  const styleCheck = normalizeStyleCheck(value?.styleCheck, style);
  if (styleCheck?.tooAntique) {
    score = Math.min(score, ANTIQUE_SCORE_CAP);
    const signals = styleCheck.antiqueSignals.slice(0, 3).join("、");
    problems.unshift(`画面偏古董化（古旧风险 ${styleCheck.antiqueRisk}）${signals ? `：${signals}` : ""}，不符合新中式要求`);
    problems.splice(6);
  } else if (styleCheck?.tooGeneric) {
    score = Math.min(score, GENERIC_SCORE_CAP);
    problems.unshift("看不出中国家具的传统基因，更像普通现代家具，需要把指定的基因体现在形体上");
    problems.splice(6);
  } else if (styleCheck?.materialSwapOnly) {
    score = Math.min(score, MATERIAL_SWAP_SCORE_CAP);
    problems.unshift("形体与传统原型几乎一样，只是换了材料，需要用形体手法做出新意");
    problems.splice(6);
  }
  const learningFeedback = normalizeLearningFeedback(value?.learningFeedback, value, problems);
  const knowledgeReferences = listValue(value?.knowledgeReferences).length
    ? listValue(value?.knowledgeReferences).slice(0, 5)
    : referenceCases.map((item) => item.title).slice(0, 5);

  return {
    score,
    rubric,
    structureScore: scoreValue(value?.structureScore ?? value?.structure ?? rubric.structureReasoning),
    materialScore: scoreValue(value?.materialScore ?? value?.material ?? rubric.materialCraft),
    styleScore: scoreValue(value?.styleScore ?? value?.style ?? rubric.cultureAccuracy),
    problems,
    suggestion: String(value?.suggestion || learningFeedback.nextSteps[0] || "").trim(),
    learningFeedback,
    knowledgeReferences,
    complianceNotes: listValue(value?.complianceNotes).slice(0, 5),
    ...(styleCheck ? { styleCheck } : {}),
    ...(styleCheck?.tooAntique || styleCheck?.tooGeneric || styleCheck?.materialSwapOnly ? { decision: "revise" } : {}),
    revisedPrompt: String(value?.revisedPrompt || fallbackPrompt || "").trim(),
  };
}

function normalizeStyleCheck(raw, style) {
  if (!getStyleProfile(style).checksAntique || !raw || typeof raw !== "object") {
    return null;
  }
  const antiqueRisk = scoreValue(raw.antiqueRisk);
  const keptCues = listValue(raw.keptCues).slice(0, 4);
  const tooAntique = antiqueRisk >= ANTIQUE_RISK_LIMIT;
  return {
    antiqueRisk,
    chineseCue: raw.chineseCue === false ? false : keptCues.length > 0,
    keptCues,
    antiqueSignals: listValue(raw.antiqueSignals).slice(0, 4),
    materialSwapOnly: !tooAntique && raw.materialSwapOnly === true,
    tooAntique,
    tooGeneric: !tooAntique && (raw.chineseCue === false || keptCues.length === 0),
  };
}

function normalizeRubric(value = {}) {
  const raw = value.rubric && typeof value.rubric === "object" ? value.rubric : value;
  const fallback = scoreValue(value?.score);
  return {
    cultureAccuracy: scoreValue(raw.cultureAccuracy ?? raw.styleScore ?? raw.style ?? fallback),
    structureReasoning: scoreValue(raw.structureReasoning ?? raw.structureScore ?? raw.structure ?? fallback),
    materialCraft: scoreValue(raw.materialCraft ?? raw.materialScore ?? raw.material ?? fallback),
    designInnovation: scoreValue(raw.designInnovation ?? raw.innovationScore ?? fallback),
    sceneFit: scoreValue(raw.sceneFit ?? raw.sceneScore ?? raw.compositionScore ?? fallback),
    aiUsage: scoreValue(raw.aiUsage ?? raw.aiUsageScore ?? fallback),
  };
}

function normalizeLearningFeedback(rawFeedback, value = {}, problems = []) {
  return {
    strengths: listValue(rawFeedback?.strengths || value?.strengths || value?.advantages).slice(0, 5),
    issues: listValue(rawFeedback?.issues || value?.issues || problems).slice(0, 5),
    nextSteps: listValue(rawFeedback?.nextSteps || value?.nextSteps || value?.suggestion).slice(0, 5),
  };
}

function listValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  const normalized = String(value || "").trim();
  return normalized ? [normalized] : [];
}

function averageRubricScore(rubric) {
  const values = RUBRIC_KEYS.map((key) => scoreValue(rubric[key])).filter((value) => value > 0);
  if (!values.length) {
    return 0;
  }
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

function scoreValue(value) {
  const score = Number(value);
  return Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0;
}

module.exports = {
  ANTIQUE_RISK_LIMIT,
  ANTIQUE_SCORE_CAP,
  GENERIC_SCORE_CAP,
  MATERIAL_SWAP_SCORE_CAP,
  VisionModelAdapter,
  normalizeEvaluation,
  parseJsonObject,
  resolveImageUrl,
};
