const STYLE_LABELS = {
  ming: "明式家具",
  newChinese: "新中式",
  song: "宋韵",
  zen: "禅意空间",
};

function normalizeGenerateRequest(body, defaultEngine) {
  const prompt = String(body.prompt || body.enhancedPrompt || "").trim();
  if (!prompt) {
    const error = new Error("Prompt is required.");
    error.statusCode = 400;
    throw error;
  }

  const size = Number(body.size || 1024);
  const quality = String(body.quality || "hd");
  const style = String(body.style || "ming");
  const engine = String(body.engine || defaultEngine || "automatic1111");
  const mood = Number(body.mood ?? 62);
  const seed = Number.isFinite(Number(body.seed)) ? Number(body.seed) : -1;

  return {
    prompt,
    originalPrompt: String(body.originalPrompt || "").trim(),
    negativePrompt: String(body.negativePrompt || "").trim(),
    style,
    styleLabel: STYLE_LABELS[style] || style,
    quality,
    size,
    mood,
    engine,
    seed,
  };
}

function buildGenerationSettings(request) {
  const sizeMap = {
    512: { width: 512, height: 512 },
    768: { width: 768, height: 768 },
    1024: { width: 1024, height: 1024 },
    1536: { width: 1536, height: 1536 },
  };

  const qualityMap = {
    standard: { steps: 20, cfgScale: 7 },
    hd: { steps: 20, cfgScale: 7 },
    ultra: { steps: 24, cfgScale: 7 },
  };

  const size = sizeMap[request.size] || sizeMap[1024];
  const quality = qualityMap[request.quality] || qualityMap.hd;

  return {
    width: size.width,
    height: size.height,
    steps: quality.steps,
    cfgScale: quality.cfgScale,
    samplerName: "DPM++ 2M",
    scheduler: "karras",
    clipSkip: 2,
    seed: request.seed,
  };
}

module.exports = {
  normalizeGenerateRequest,
  buildGenerationSettings,
};
