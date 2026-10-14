const {
  buildHeaders,
  createProviderError,
  normalizeBaseUrl,
  readErrorDetails,
} = require("./openaiCompatible");
const { normalizeCriteria, reviewInstructions } = require("../design/evaluation");

// OpenAI-compatible vision reviewer. It answers the same four criteria as the
// Codex CLI reviewer (see src/design/evaluation.js); the decision comes from
// the criteria, never from the model's own verdict or score.
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

  async evaluate({ imageUrl, previousImageUrl = null, brief, direction, edit = null, targetScore = 85, round = 1 }) {
    this.assertConfigured();
    if (!brief || !direction) {
      const error = new Error("Review requires the locked brief.");
      error.statusCode = 400;
      throw error;
    }
    const resolvedImageUrl = await resolveImageUrl(imageUrl);
    const resolvedPrevious = previousImageUrl ? await resolveImageUrl(previousImageUrl) : null;
    const instructions = reviewInstructions({ brief, direction, hasPrevious: Boolean(resolvedPrevious), edit });
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: buildHeaders(this.apiKey),
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        messages: [
          { role: "system", content: instructions.rules.join(" ") },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  userRequirement: brief.source,
                  round,
                  targetScore,
                  checklist: instructions.checklist.map(({ id, label, strength, visual }) => ({ id, label, strength, visual })),
                  direction: instructions.direction,
                  responseSchema: instructions.schema,
                  images: resolvedPrevious ? "first image: to review; second image: previous version" : "the image to review",
                }),
              },
              { type: "image_url", image_url: { url: resolvedImageUrl, detail: "high" } },
              ...(resolvedPrevious ? [{ type: "image_url", image_url: { url: resolvedPrevious, detail: "high" } }] : []),
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
    let raw;
    try {
      raw = parseJsonObject(extractMessageText(json));
    } catch {
      raw = null;
    }
    // Unparseable output is an incomplete evaluation, not a pass.
    const evaluation = normalizeCriteria(raw, { brief, style: direction.style, hasPrevious: Boolean(resolvedPrevious), targetScore });
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

module.exports = {
  VisionModelAdapter,
  parseJsonObject,
  resolveImageUrl,
};
