const { safeJsonParse } = require("../utils");

class Automatic1111Adapter {
  constructor(config) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.lora = config.lora;
  }

  async health() {
    const response = await fetch(`${this.baseUrl}/sdapi/v1/options`);
    if (!response.ok) {
      throw new Error(`Automatic1111 health check failed: ${response.status}`);
    }
    return {
      ok: true,
      baseUrl: this.baseUrl,
    };
  }

  async generate({ request, settings }) {
    const prompt = this.lora && !request.prompt.includes("<lora:")
      ? `<lora:${this.lora}:1>, ${request.prompt}`
      : request.prompt;

    const payload = {
      prompt,
      negative_prompt: request.negativePrompt,
      width: settings.width,
      height: settings.height,
      steps: settings.steps,
      cfg_scale: settings.cfgScale,
      sampler_name: settings.samplerName,
      scheduler: settings.scheduler,
      seed: settings.seed,
      override_settings: {
        CLIP_stop_at_last_layers: settings.clipSkip,
      },
    };

    const response = await fetch(`${this.baseUrl}/sdapi/v1/txt2img`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      const error = new Error(`Automatic1111 generate failed: ${response.status}`);
      error.statusCode = response.status;
      error.details = text;
      throw error;
    }

    const json = await response.json();
    return {
      images: (json.images || []).map((item) => ({
        mimeType: "image/png",
        url: `data:image/png;base64,${item}`,
      })),
      metadata: {
        info: safeJsonParse(json.info) || json.info || null,
      },
    };
  }
}

module.exports = {
  Automatic1111Adapter,
};
