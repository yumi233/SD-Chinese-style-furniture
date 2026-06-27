const STYLE_LABELS = {
  ming: "明式家具",
  newChinese: "新中式",
  song: "宋韵",
  zen: "禅意空间",
};

const DEFAULT_SIZE_KEY = "16:9-720p";

const SIZE_PRESETS = {
  "16:9-720p": { width: 1280, height: 720, label: "16:9 720p" },
  "16:9-1080p": { width: 1920, height: 1080, label: "16:9 1080p" },
  "4:3-720p": { width: 960, height: 720, label: "4:3 720p" },
  "4:3-1080p": { width: 1440, height: 1080, label: "4:3 1080p" },
  512: { width: 512, height: 512, label: "512 × 512" },
  768: { width: 768, height: 768, label: "768 × 768" },
  1024: { width: 1024, height: 1024, label: "1024 × 1024" },
  1536: { width: 1536, height: 1536, label: "1536 × 1536" },
};

function normalizeGenerateRequest(body, defaultEngine) {
  const prompt = String(body.prompt || body.enhancedPrompt || "").trim();
  if (!prompt) {
    const error = new Error("Prompt is required.");
    error.statusCode = 400;
    throw error;
  }

  const size = normalizeSize(body.size || body.sizePreset);
  const quality = String(body.quality || "hd");
  const style = String(body.style || "ming");
  const engine = String(body.engine || defaultEngine || "automatic1111");
  const mood = Number(body.mood ?? 62);
  const seed = Number.isFinite(Number(body.seed)) ? Number(body.seed) : -1;

  return {
    prompt,
    originalPrompt: String(body.originalPrompt || "").trim(),
    negativePrompt: String(body.negativePrompt || "").trim(),
    sourceNote: String(body.sourceNote || "").trim().slice(0, 1200),
    aiDisclosure: normalizeAiDisclosure(body.aiDisclosure),
    style,
    styleLabel: STYLE_LABELS[style] || style,
    quality,
    size,
    sizeLabel: getSizeLabel(size),
    mood,
    engine,
    seed,
  };
}

function normalizeAiDisclosure(value) {
  const normalized = String(value || "").trim();
  if (normalized) {
    return normalized.slice(0, 300);
  }
  return "本作品包含 AI 生成内容，提交和展示时应明示标识。";
}

function buildGenerationSettings(request) {
  const qualityMap = {
    standard: { steps: 20, cfgScale: 7 },
    hd: { steps: 20, cfgScale: 7 },
    ultra: { steps: 24, cfgScale: 7 },
  };

  const size = resolveSize(request.size);
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

function normalizeSize(value) {
  const raw = String(value || DEFAULT_SIZE_KEY).trim();
  if (SIZE_PRESETS[raw]) {
    return raw;
  }

  const dimensionMatch = raw.match(/^(\d{3,4})\s*[x×]\s*(\d{3,4})$/i);
  if (dimensionMatch) {
    const width = Number(dimensionMatch[1]);
    const height = Number(dimensionMatch[2]);
    const match = Object.entries(SIZE_PRESETS).find(
      ([, preset]) => preset.width === width && preset.height === height,
    );
    if (match) {
      return match[0];
    }
  }

  return DEFAULT_SIZE_KEY;
}

function resolveSize(value) {
  return SIZE_PRESETS[normalizeSize(value)] || SIZE_PRESETS[DEFAULT_SIZE_KEY];
}

function getSizeLabel(value) {
  return resolveSize(value).label;
}

module.exports = {
  normalizeGenerateRequest,
  buildGenerationSettings,
  normalizeAiDisclosure,
  normalizeSize,
  resolveSize,
  getSizeLabel,
  SIZE_PRESETS,
};
