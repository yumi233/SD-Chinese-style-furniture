const {
  buildHeaders,
  createProviderError,
  normalizeBaseUrl,
  readErrorDetails,
} = require("./openaiCompatible");
const { formatPromptContext } = require("../referenceKnowledge");
const { getStyleProfile, describeModernity } = require("../knowledge/styleProfiles");

class TextModelAdapter {
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
        "Text model health check failed",
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

  async enhance(request, { knowledge = [] } = {}) {
    this.assertConfigured();
    const profile = getStyleProfile(request.style);
    const knowledgeContext = formatPromptContext(knowledge);

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: buildHeaders(this.apiKey),
      body: JSON.stringify({
        model: this.model,
        temperature: 0.35,
        messages: [
          {
            role: "system",
            content: [
              "You are a prompt designer for a furniture design studio used by design students and designers.",
              "Convert the user's intent into one concise English image-generation prompt.",
              "Preserve furniture type, materials, spatial setting, lighting, composition, and style.",
              "Emphasize physically correct furniture structure and realistic, manufacturable materials.",
              "Use the design knowledge provided as guidance: borrow its Use phrases where they fit and never include anything listed under Avoid.",
              ...(profile.checksAntique
                ? [
                    "The target is contemporary new Chinese furniture, not antique Chinese furniture.",
                    "First decide which one or two traditional cues to keep and how to abstract them, then describe everything else in contemporary design language.",
                    "Never describe the piece as antique, a replica, Ming-style or Qing-style, and never add carving, patina, palace or museum settings.",
                  ]
                : []),
              "Return only the final positive prompt. Do not use markdown, labels, or explanations.",
            ].join(" "),
          },
          {
            role: "user",
            content: [
              `Original description: ${request.originalPrompt || request.prompt}`,
              `Existing prompt: ${request.prompt}`,
              `Style: ${request.styleLabel} (${profile.anchor})`,
              ...(profile.checksAntique
                ? [`Tradition-to-contemporary balance: ${request.modernity ?? 60}/100 (${describeModernity(request.modernity ?? 60).hint})`]
                : []),
              knowledgeContext ? `Design knowledge:\n${knowledgeContext}` : "Design knowledge: none matched.",
              `Quality: ${request.quality}`,
              `Mood intensity: ${request.mood}/100`,
            ].join("\n"),
          },
        ],
      }),
    });

    if (!response.ok) {
      throw createProviderError(
        "Text model prompt enhancement failed",
        response,
        await readErrorDetails(response),
      );
    }

    const json = await response.json();
    const prompt = extractMessageText(json).replace(/^```(?:text)?\s*|\s*```$/g, "").trim();
    if (!prompt) {
      throw new Error("Text model returned an empty prompt.");
    }

    return {
      prompt,
      metadata: {
        model: this.model,
        usage: json.usage || null,
      },
    };
  }

  assertConfigured() {
    if (!this.baseUrl || !this.model) {
      const error = new Error("Text model is enabled but its API base URL or model name is missing.");
      error.statusCode = 400;
      throw error;
    }
  }
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

module.exports = {
  TextModelAdapter,
  extractMessageText,
};
