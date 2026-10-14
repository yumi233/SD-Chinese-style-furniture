const {
  buildHeaders,
  createProviderError,
  normalizeBaseUrl,
  readErrorDetails,
} = require("./openaiCompatible");

// OpenAI-compatible image API. Without references it calls
// /images/generations. With references (previous version, user uploads) it
// calls /images/edits, which OpenAI documents for its GPT image models with
// up to 16 input images; other compatible providers may not offer it. Not
// verified from this project with a real key, hence "documented_unverified".
const IMAGE_MODEL_CAPABILITIES = Object.freeze({
  provider: "imageModel",
  referenceImages: { supported: true, status: "documented_unverified", note: "通过 /images/edits 发送参考图（OpenAI GPT 图像模型有文档）；兼容服务不一定支持；本项目未用真实密钥验证" },
  imageEdit: { supported: true, status: "documented_unverified", note: "OpenAI 文档称 GPT 图像模型会整体重绘，蒙版只是提示，不保证像素不变" },
  multiTurn: { supported: false, status: "unsupported", note: "无会话状态；用上一版图片作为输入模拟" },
  localizedEdit: { supported: false, status: "unsupported", note: "未实现蒙版参数" },
  intermediatePreview: { supported: false, status: "unsupported", note: "未实现流式中间图" },
});

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

  capabilities() {
    return IMAGE_MODEL_CAPABILITIES;
  }

  async generate({ request, settings, referenceImages = [] }) {
    this.assertConfigured();
    const requestSize = settings?.width && settings?.height ? `${settings.width}x${settings.height}` : this.size;
    if (referenceImages.length) return this.edit({ request, referenceImages, size: requestSize });

    const response = await fetch(`${this.baseUrl}/images/generations`, {
      method: "POST",
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

  async edit({ request, referenceImages, size }) {
    const form = new FormData();
    form.append("model", this.model);
    form.append("prompt", `${buildImagePrompt(request)}\nAttached images: ${referenceImages.map((image, index) => `${index + 1}. ${image.purpose || "reference"}`).join(" ")}`);
    if (size) form.append("size", size);
    form.append("n", "1");
    for (const [index, image] of referenceImages.slice(0, 16).entries()) {
      form.append("image[]", new Blob([image.bytes], { type: image.mimeType }), `reference-${index + 1}.${image.mimeType.split("/")[1]}`);
    }
    const response = await fetch(`${this.baseUrl}/images/edits`, { method: "POST", headers: buildHeaders(this.apiKey, { json: false }), body: form });
    if (!response.ok) {
      throw createProviderError("Image model edit failed", response, await readErrorDetails(response));
    }
    const json = await response.json();
    const images = extractImages(json);
    if (!images.length) throw new Error("Image model edit finished without an image.");
    return { images, metadata: { model: this.model, created: json.created || null, usage: json.usage || null, endpoint: "images/edits" } };
  }

  assertConfigured() {
    if (!this.baseUrl || !this.model) {
      const error = new Error("Image model API base URL or model name is missing.");
      error.statusCode = 400;
      throw error;
    }
  }
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
  IMAGE_MODEL_CAPABILITIES,
  ImageModelAdapter,
  extractImages,
};
