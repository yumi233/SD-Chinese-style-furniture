const {
  buildHeaders,
  createProviderError,
  normalizeBaseUrl,
  readErrorDetails,
} = require("./openaiCompatible");
const { formatReferenceContext } = require("../referenceKnowledge");
const { HIGHLIGHT_DIRECTION, PRODUCT_PHOTO_DIRECTION } = require("../lib/designDirection");
const { normalizeReviewLocale, reviewLanguageInstruction, reviewScriptConverter } = require("../lib/reviewLocale");
const { dispatchModelRequest } = require("./dispatch");

const RUBRIC_KEYS = [
  "cultureAccuracy",
  "structureReasoning",
  "materialCraft",
  "designInnovation",
  "sceneFit",
  "aiUsage",
  "contemporaneity",
];
const REFERENCE_TITLE_KEYS = { cn: "title", tw: "titleTw", en: "titleEn" };

const CONTEMPORANEITY_CRITERIA = [
  "Score contemporaneity from visible design and finish: contemporary proportions, clean new materials, restrained detail, and presentation as newly made furniture.",
  "Set antiqueLook to true if the furniture reads as an antique, an aged piece, or a museum object. Look for distressing, patina, cracked lacquer, dust, faded finishes, excessive period carving, and sepia display styling. Traditional geometry, dark timber, or joinery alone do not imply an antique look.",
  "Give cultural credit for contemporary reinterpretations of traditional forms. If antiqueLook is true, set decision to revise regardless of score and make revisedPrompt describe specific contemporary changes.",
].join(" ");

const HIGHLIGHT_CRITERIA = [
  "Before scoring, write highlightEvidence with three concrete observations: position (precise component and location), formChange (visible difference from ordinary construction), and visibleUse (what action or support the difference visibly makes possible). Summarize those same observations in one highlight sentence.",
  "Ordinary curved back rails, inset slab legs, or standard slatted doors with shelves are not distinctive on their own. Do not infer a grip or drawer from a slot without a visible opening, usable gap or linked movable part. Lighting, setting and ornament alone do not supply furniture evidence.",
  "If any observation is missing, ordinary, or unsupported by the image, return highlightEvidence as null and highlight as an empty string, cap designInnovation at 49, and set decision to revise. In revisedPrompt and suggestion specify one changed component and the viewpoint that will show it clearly.",
  "Judge historical appearance separately. Dark timber alone is not evidence of age.",
].join(" ");

const PRODUCT_PHOTO_CRITERIA = "Score sceneFit for a seamless pure white backdrop, a complete unobstructed furniture silhouette and the absence of props. A soft contact shadow on white is allowed. Set productPresentation.whiteBackdrop to false for visible rooms, horizons, colored backgrounds or other nonwhite scenery. Set propFree to false for props such as leaves, rugs, books, or tableware. Set furnitureFullyVisible to false for cropping or obstruction. If any condition fails, set decision to revise regardless of total score and correct the specific background, props or framing in revisedPrompt.";
const PRESENTATION_CORRECTIONS = {
  whiteBackdrop: "Replace the entire existing backdrop with seamless pure white.",
  propFree: "Remove all unrelated objects from the shot.",
  furnitureFullyVisible: "Reframe to show every edge of the furniture, with nothing covering it.",
};

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

  async evaluate({ imageUrl, requirement, prompt, targetScore, round, referenceCases = [], locale, signal, onDispatch }) {
    this.assertConfigured();
    const resolvedImageUrl = await resolveImageUrl(imageUrl, signal);
    const referenceContext = formatReferenceContext(referenceCases);
    const response = await dispatchModelRequest(`${this.baseUrl}/chat/completions`, {
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
              PRODUCT_PHOTO_CRITERIA,
              reviewLanguageInstruction(locale),
              "Return learning feedback that a student can act on: strengths, issues, and nextSteps.",
              "Return one valid JSON object only, without markdown or extra commentary.",
              "Use integer scores from 0 to 100.",
              "The revisedPrompt must be a concise positive English image-generation prompt that preserves the user's intent and fixes visible problems.",
              'Required schema: {"score":0,"rubric":{"cultureAccuracy":0,"structureReasoning":0,"materialCraft":0,"designInnovation":0,"sceneFit":0,"aiUsage":0,"contemporaneity":0},"antiqueLook":false,"highlight":"","highlightEvidence":{"position":"","formChange":"","visibleUse":""},"productPresentation":{"whiteBackdrop":true,"propFree":true,"furnitureFullyVisible":true},"decision":"pass|revise|needs_review","structureScore":0,"materialScore":0,"styleScore":0,"problems":[""],"suggestion":"","learningFeedback":{"strengths":[""],"issues":[""],"nextSteps":[""]},"knowledgeReferences":[""],"complianceNotes":[""],"revisedPrompt":""}.',
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
    }, onDispatch);

    if (!response.ok) {
      throw createProviderError(
        "Vision model evaluation failed",
        response,
        await readErrorDetails(response),
      );
    }

    const json = await response.json();
    const content = extractMessageText(json);
    const evaluation = normalizeLiveEvaluation(parseJsonObject(content), prompt, referenceCases, locale);

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

function normalizeLiveEvaluation(value, fallbackPrompt, referenceCases, locale) {
  const evidence = Object.fromEntries(["position", "formChange", "visibleUse"].map(key => [
    key, normalizeEvidenceText(value?.highlightEvidence?.[key]),
  ]));
  const highlight = Object.values(evidence).every(Boolean) ? normalizeEvidenceText(value?.highlight) : "";
  const evaluation = normalizeEvaluation({ ...value, highlight }, fallbackPrompt, referenceCases, locale);
  if (highlight) evaluation.highlightEvidence = evidence;
  const presentation = value?.productPresentation;
  const presentationKeys = Object.keys(PRESENTATION_CORRECTIONS);
  const presentationKnown = presentationKeys.every(key => typeof presentation?.[key] === "boolean");
  const corrections = presentationKeys.filter(key => presentation?.[key] === false).map(key => PRESENTATION_CORRECTIONS[key]);
  if (presentationKnown) {
    evaluation.productPresentation = Object.fromEntries(presentationKeys.map(key => [key, presentation[key]]));
  }
  if (corrections.length) {
    evaluation.rubric.sceneFit = Math.min(evaluation.rubric.sceneFit, 49);
    evaluation.decision = "revise";
    evaluation.revisedPrompt = [evaluation.revisedPrompt, PRODUCT_PHOTO_DIRECTION, corrections.join(" ")].filter(Boolean).join("\n");
  }
  const convert = reviewScriptConverter(locale);
  evaluation.highlight = convert(evaluation.highlight);
  if (evaluation.highlightEvidence) {
    for (const key of Object.keys(evidence)) evaluation.highlightEvidence[key] = convert(evidence[key]);
  }
  evaluation.problems = evaluation.problems.map(convert);
  evaluation.suggestion = convert(evaluation.suggestion);
  for (const key of Object.keys(evaluation.learningFeedback)) {
    evaluation.learningFeedback[key] = evaluation.learningFeedback[key].map(convert);
  }
  evaluation.knowledgeReferences = evaluation.knowledgeReferences.map(convert);
  evaluation.complianceNotes = evaluation.complianceNotes.map(convert);
  if (typeof evaluation.antiqueLook === "boolean" && (presentationKnown || corrections.length)) return evaluation;
  return {
    ...evaluation,
    decision: evaluation.decision === "revise" ? "revise" : "needs_review",
    evaluationFailed: true,
  };
}

function normalizeEvidenceText(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 300).trimEnd() : "";
}

function normalizeEvaluation(value, fallbackPrompt, referenceCases = [], locale) {
  const rubric = normalizeRubric(value || {});
  const hasHighlightField = Object.hasOwn(value || {}, "highlight");
  const highlight = normalizeEvidenceText(value?.highlight);
  const missingHighlight = hasHighlightField && !highlight;
  if (missingHighlight) rubric.designInnovation = Math.min(rubric.designInnovation, 49);
  const score = scoreValue(value?.score) || averageRubricScore(rubric);
  const antiqueLook = typeof value?.antiqueLook === "boolean" ? value.antiqueLook : undefined;
  const decision = antiqueLook === true || missingHighlight ? "revise" : value?.decision;
  const problems = listValue(value?.problems).slice(0, 6);
  const learningFeedback = normalizeLearningFeedback(value?.learningFeedback, value, problems);
  const modelReferences = listValue(value?.knowledgeReferences);
  const referenceTitleKey = REFERENCE_TITLE_KEYS[normalizeReviewLocale(locale)];
  const knowledgeReferences = (modelReferences.length
    ? modelReferences
    : referenceCases.map(item => item[referenceTitleKey]).filter(Boolean)).slice(0, 5);
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
  PRODUCT_PHOTO_CRITERIA,
  VisionModelAdapter,
  normalizeEvaluation,
  normalizeLiveEvaluation,
  parseJsonObject,
  resolveImageUrl,
};
