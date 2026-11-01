const {
  buildHeaders,
  createProviderError,
  normalizeBaseUrl,
  readErrorDetails,
} = require("./openaiCompatible");

class ImageModelAdapter {
  constructor(config) {
    this.baseUrl = normalizeBaseUrl(config.baseUrl);
    this.apiKey = String(config.apiKey || "").trim();
    this.model = String(config.model || "").trim();
    this.size = String(config.size || "").trim();
  }

  async health() {
    this.assertConfigured();
    const response = await fetch(`${this.baseUrl}/models`, {
      headers: buildHeaders(this.apiKey),
    });
    if (!response.ok) {
      throw createProviderError(
        "Image model health check failed",
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

  async generate({ request, settings, signal, referenceImages = [] }) {
    this.assertConfigured();
    const requestSize = settings?.width && settings?.height ? `${settings.width}x${settings.height}` : this.size;
    const parent = referenceImages.find((image) => image?.role === "parent");

    // Editing from a previous version uses the OpenAI-compatible edits endpoint with that image.
    const response = parent
      ? await fetch(`${this.baseUrl}/images/edits`, {
        method: "POST",
        signal,
        headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {},   // fetch sets the multipart boundary
        body: buildEditForm({ model: this.model, prompt: buildEditPrompt(request), size: requestSize, parent }),
      })
      : await fetch(`${this.baseUrl}/images/generations`, {
        method: "POST",
        signal,
        headers: buildHeaders(this.apiKey),
        body: JSON.stringify({
          model: this.model,
          prompt: buildImagePrompt(request),
          n: 1,
          size: requestSize,
        }),
      });

    if (!response.ok) {
      throw createProviderError(
        "Image model generation failed",
        response,
        await readErrorDetails(response),
      );
    }

    const json = await response.json();
    const images = extractImages(json);
    if (!images.length) {
      throw new Error("Image model finished without an image URL or base64 payload.");
    }

    return {
      images,
      metadata: {
        model: this.model,
        created: json.created || null,
        usage: json.usage || null,
      },
    };
  }

  assertConfigured() {
    if (!this.baseUrl || !this.model) {
      const error = new Error("Image model API base URL or model name is missing.");
      error.statusCode = 400;
      throw error;
    }
  }
}

function buildEditForm({ model, prompt, size, parent }) {
  const form = new FormData();
  form.append("model", model);
  form.append("prompt", prompt);
  form.append("n", "1");
  form.append("size", size);
  const extension = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[parent.mimeType] || "png";
  form.append("image", new Blob([parent.bytes], { type: parent.mimeType || "image/png" }), `parent.${extension}`);
  return form;
}

// The region is guidance in percent of the parent image, not a pixel mask.
function buildEditPrompt(request) {
  const region = request.region;
  const where = region && ["x", "y", "width", "height"].every((key) => Number.isFinite(region[key]))
    ? `\nOnly change furniture parts inside the rectangle starting ${Math.round(region.x * 100)}% from the left and ${Math.round(region.y * 100)}% from the top, ${Math.round(region.width * 100)}% wide and ${Math.round(region.height * 100)}% tall.`
    : "";
  return `Edit this image. Keep the composition, camera, background, lighting, materials and every part not mentioned exactly the same.${where}\n${buildImagePrompt(request)}`;
}

function buildImagePrompt(request) {
  if (!request.negativePrompt) {
    return request.prompt;
  }

  return `${request.prompt}\nAvoid: ${request.negativePrompt}`;
}

function extractImages(json) {
  const data = Array.isArray(json?.data)
    ? json.data
    : Array.isArray(json?.images)
      ? json.images
      : [];

  return data
    .map((item) => {
      if (typeof item === "string") {
        return { mimeType: "image/png", url: item };
      }
      if (item?.b64_json) {
        return { mimeType: "image/png", url: `data:image/png;base64,${item.b64_json}` };
      }
      if (item?.url) {
        return { mimeType: item.mime_type || "image/png", url: item.url };
      }
      return null;
    })
    .filter(Boolean);
}

module.exports = {
  ImageModelAdapter,
  extractImages,
};
