const {
  buildHeaders,
  createProviderError,
  normalizeBaseUrl,
  readErrorDetails,
} = require("./openaiCompatible");

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

  async enhance(request) {
    this.assertConfigured();

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
              "You are a prompt designer specializing in photorealistic Chinese furniture imagery.",
              "Convert the user's intent into one concise English image-generation prompt.",
              "Preserve furniture type, wood, joinery, spatial setting, lighting, composition, and style.",
              "Emphasize physically correct furniture structure and realistic materials.",
              "Return only the final positive prompt. Do not use markdown, labels, or explanations.",
            ].join(" "),
          },
          {
            role: "user",
            content: [
              `Original description: ${request.originalPrompt || request.prompt}`,
              `Existing prompt: ${request.prompt}`,
              `Style: ${request.styleLabel}`,
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
