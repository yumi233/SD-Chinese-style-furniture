const {
  buildHeaders,
  createProviderError,
  normalizeBaseUrl,
  readErrorDetails,
} = require("./openaiCompatible");
const { formatReferenceContext } = require("../referenceKnowledge");
const { HIGHLIGHT_DIRECTION } = require("../lib/designDirection");

const RUBRIC_KEYS = [
  "cultureAccuracy",
  "structureReasoning",
  "materialCraft",
  "designInnovation",
  "sceneFit",
  "aiUsage",
  "contemporaneity",
];

const CONTEMPORANEITY_CRITERIA = [
  "Score contemporaneity from visible design and finish: contemporary proportions, clean new materials, restrained detail, and presentation as newly made furniture.",
  "Set antiqueLook to true if the furniture reads as an antique, an aged piece, or a museum object. Look for distressing, patina, cracked lacquer, dust, faded finishes, excessive period carving, and sepia display styling. Traditional geometry, dark timber, or joinery alone do not imply an antique look.",
  "Give cultural credit for contemporary reinterpretations of traditional forms. If antiqueLook is true, set decision to revise regardless of score and make revisedPrompt describe specific contemporary changes.",
].join(" ");

const HIGHLIGHT_CRITERIA = "In highlight, write one sentence naming the single memorable design feature actually visible on the furniture and its structural or practical role. Attractive lighting, scenery and decoration alone do not count. If no feature is recognizable, return an empty string, score designInnovation at most 49, set decision to revise, and name one specific structural or functional feature to strengthen in revisedPrompt and suggestion.";

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

  async evaluate({ imageUrl, requirement, prompt, targetScore, round, referenceCases = [], signal }) {
    this.assertConfigured();
    const resolvedImageUrl = await resolveImageUrl(imageUrl, signal);
    const referenceContext = formatReferenceContext(referenceCases);
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      signal,
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
              `Score the design with a teaching rubric: ${RUBRIC_KEYS.join(", ")}.`,
              CONTEMPORANEITY_CRITERIA,
              HIGHLIGHT_CRITERIA,
              "Return learning feedback that a student can act on: strengths, issues, and nextSteps.",
              "Return one valid JSON object only, without markdown or extra commentary.",
              "Use integer scores from 0 to 100.",
              "The revisedPrompt must be a concise positive English image-generation prompt that preserves the user's intent and fixes visible problems.",
              'Required schema: {"score":0,"rubric":{"cultureAccuracy":0,"structureReasoning":0,"materialCraft":0,"designInnovation":0,"sceneFit":0,"aiUsage":0,"contemporaneity":0},"antiqueLook":false,"highlight":"","decision":"pass|revise|needs_review","structureScore":0,"materialScore":0,"styleScore":0,"problems":[""],"suggestion":"","learningFeedback":{"strengths":[""],"issues":[""],"nextSteps":[""]},"knowledgeReferences":[""],"complianceNotes":[""],"revisedPrompt":""}.',
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
    const evaluation = normalizeEvaluation(parseJsonObject(content), prompt, referenceCases);

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

async function resolveImageUrl(imageUrl, signal) {
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

  const response = await fetch(normalized, { signal });
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

function normalizeEvaluation(value, fallbackPrompt, referenceCases = []) {
  const rubric = normalizeRubric(value || {});
  const hasHighlightField = Object.hasOwn(value || {}, "highlight");
  const highlight = typeof value?.highlight === "string"
    ? value.highlight.replace(/\s+/g, " ").trim().slice(0, 300).trimEnd()
    : "";
  const missingHighlight = hasHighlightField && !highlight;
  if (missingHighlight) rubric.designInnovation = Math.min(rubric.designInnovation, 49);
  const score = scoreValue(value?.score) || averageRubricScore(rubric);
  const antiqueLook = typeof value?.antiqueLook === "boolean" ? value.antiqueLook : undefined;
  const decision = antiqueLook === true || missingHighlight ? "revise" : value?.decision;
  const problems = listValue(value?.problems).slice(0, 6);
  const learningFeedback = normalizeLearningFeedback(value?.learningFeedback, value, problems);
  const knowledgeReferences = listValue(value?.knowledgeReferences).length
    ? listValue(value?.knowledgeReferences).slice(0, 5)
    : referenceCases.map((item) => item.title).slice(0, 5);
  const revisedPrompt = String(value?.revisedPrompt || "").trim();
  const fallback = String(fallbackPrompt || "").trim();

  return {
    score,
    rubric,
    ...(antiqueLook === undefined ? {} : { antiqueLook }),
    ...(hasHighlightField ? { highlight } : {}),
    ...(["pass", "revise", "needs_review"].includes(decision) ? { decision } : {}),
    structureScore: scoreValue(value?.structureScore ?? value?.structure ?? rubric.structureReasoning),
    materialScore: scoreValue(value?.materialScore ?? value?.material ?? rubric.materialCraft),
    styleScore: scoreValue(value?.styleScore ?? value?.style ?? rubric.cultureAccuracy),
    problems,
    suggestion: String(value?.suggestion || learningFeedback.nextSteps[0] || "").trim(),
    learningFeedback,
    knowledgeReferences,
    complianceNotes: listValue(value?.complianceNotes).slice(0, 5),
    revisedPrompt: missingHighlight && (!revisedPrompt || revisedPrompt === fallback)
      ? [fallback, HIGHLIGHT_DIRECTION].filter(Boolean).join("\n")
      : revisedPrompt || fallback,
  };
}

function normalizeRubric(value = {}) {
  const raw = value.rubric && typeof value.rubric === "object" ? value.rubric : value;
  const fallback = scoreValue(value?.score);
  const contemporaneity = raw.contemporaneity ?? value.contemporaneity;
  return {
    cultureAccuracy: scoreValue(raw.cultureAccuracy ?? raw.styleScore ?? raw.style ?? fallback),
    structureReasoning: scoreValue(raw.structureReasoning ?? raw.structureScore ?? raw.structure ?? fallback),
    materialCraft: scoreValue(raw.materialCraft ?? raw.materialScore ?? raw.material ?? fallback),
    designInnovation: scoreValue(raw.designInnovation ?? raw.innovationScore ?? fallback),
    sceneFit: scoreValue(raw.sceneFit ?? raw.sceneScore ?? raw.compositionScore ?? fallback),
    aiUsage: scoreValue(raw.aiUsage ?? raw.aiUsageScore ?? fallback),
    ...(contemporaneity == null ? {} : { contemporaneity: scoreValue(contemporaneity) }),
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
  const values = RUBRIC_KEYS.filter((key) => rubric[key] > 0 || (key === "contemporaneity" && key in rubric))
    .map((key) => rubric[key]);
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
  CONTEMPORANEITY_CRITERIA,
  HIGHLIGHT_CRITERIA,
  VisionModelAdapter,
  normalizeEvaluation,
  parseJsonObject,
  resolveImageUrl,
};
