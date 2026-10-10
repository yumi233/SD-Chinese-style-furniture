const { CodexCliAdapter } = require("./providers/codexCli");
const { Automatic1111Adapter } = require("./providers/automatic1111");
const { ComfyUiAdapter } = require("./providers/comfyui");
const { ImageModelAdapter } = require("./providers/imageModel");
const { TextModelAdapter } = require("./providers/textModel");
const { VisionModelAdapter } = require("./providers/visionModel");
const { buildGenerationSettings, normalizeGenerateRequest } = require("./lib/requestNormalizer");
const { matchReferenceCases } = require("./referenceKnowledge");

const ENGINE_MODES = [
  "codexCli",
  "automatic1111",
  "comfyui",
  "imageModel",
  "automatic1111+imageModel",
  "comfyui+imageModel",
];

function createImageGateway(config, options = {}) {
  const codexSettings = Object.freeze({ ...(options.codexCli || {}) });
  const codexProvider = codexSettings.enabled ? new CodexCliAdapter(codexSettings) : null;
  const state = {
    defaultEngine: config.defaultEngine,
    auto1111BaseUrl: config.auto1111BaseUrl,
    auto1111Lora: config.auto1111Lora,
    comfyBaseUrl: config.comfyBaseUrl,
    comfyCheckpoint: config.comfyCheckpoint,
    comfyWorkflowFile: config.comfyWorkflowFile,
    textModelEnabled: Boolean(config.textModelEnabled),
    textModelBaseUrl: config.textModelBaseUrl,
    textModelApiKey: config.textModelApiKey,
    textModelName: config.textModelName,
    imageModelBaseUrl: config.imageModelBaseUrl,
    imageModelApiKey: config.imageModelApiKey,
    imageModelName: config.imageModelName,
    imageModelSize: config.imageModelSize,
    visionModelBaseUrl: config.visionModelBaseUrl,
    visionModelApiKey: config.visionModelApiKey,
    visionModelName: config.visionModelName,
  };

  let providers = buildProviders(state, codexProvider);
  let textProvider = buildTextProvider(state);
  let visionProvider = buildVisionProvider(state);

  return {
    getConfig() {
      return { ...publicConfig(state), codexCli: { enabled: Boolean(codexProvider), model: codexSettings.model || "gpt-6.1-sol" } };
    },

    getRuntimeConfig() {
      return { ...state };
    },

    updateConfig(nextConfig) {
      Object.assign(state, sanitizeConfig(nextConfig, state));
      providers = buildProviders(state, codexProvider);
      textProvider = buildTextProvider(state);
      visionProvider = buildVisionProvider(state);
      return this.getConfig();
    },

    listEngines() {
      return {
        defaultEngine: state.defaultEngine,
        engines: Object.keys(providers),
        modes: ENGINE_MODES.filter(mode => mode !== "codexCli" || Boolean(codexProvider)),
        agentEngines: ENGINE_MODES.filter(mode => mode === "codexCli" ? Boolean(codexProvider) : visionProvider.isConfigured()),
      };
    },

    async health() {
      const checks = await Promise.all(
        Object.entries(providers).map(async ([name, provider]) => {
          try {
            return [name, await provider.health()];
          } catch (error) {
            return [name, { ok: false, message: error.message || "unreachable" }];
          }
        }),
      );

      let textModel = { ok: false, enabled: state.textModelEnabled, message: "disabled" };
      if (state.textModelEnabled) {
        try {
          textModel = { ...(await textProvider.health()), enabled: true };
        } catch (error) {
          textModel = { ok: false, enabled: true, message: error.message || "unreachable" };
        }
      }

      let visionModel = { ok: false, configured: visionProvider.isConfigured(), message: "not configured" };
      if (visionProvider.isConfigured()) {
        try {
          visionModel = { ...(await visionProvider.health()), configured: true };
        } catch (error) {
          visionModel = {
            ok: false,
            configured: true,
            message: error.message || "unreachable",
          };
        }
      }

      return {
        ok: true,
        defaultEngine: state.defaultEngine,
        engines: Object.fromEntries(checks),
        textModel,
        visionModel,
      };
    },

    async generate(body, context = {}) {
      context.onProgress?.({ phase: "preparing" });
      let request = normalizeGenerateRequest(body, state.defaultEngine);
      const localPrompt = request.prompt;
      let textMetadata = null;
      const errors = [];

      if (state.textModelEnabled) {
        try {
          const enhanced = await textProvider.enhance(request);
          request = { ...request, prompt: enhanced.prompt };
          textMetadata = enhanced.metadata;
        } catch (error) {
          textMetadata = { error: error.message || "prompt enhancement failed" };
          errors.push({
            engine: "textModel",
            message: error.message || "prompt enhancement failed",
            details: error.details || null,
          });
        }
      }

      context.onProgress?.({ phase: "generating" });
      const settings = buildGenerationSettings(request);
      const requestedEngines = expandEngineMode(request.engine);
      const results = await Promise.allSettled(
        requestedEngines.map(async (engine) => {
          const provider = providers[engine];
          if (!provider) {
            const error = new Error(`Unsupported engine: ${engine}`);
            error.statusCode = 400;
            throw error;
          }

          const result = await provider.generate({ request, settings });
          return { engine, result };
        }),
      );

      const images = [];
      const metadata = {};
      results.forEach((settled, index) => {
        const engine = requestedEngines[index];
        if (settled.status === "fulfilled") {
          metadata[engine] = settled.value.result.metadata || {};
          settled.value.result.images.forEach((image) => images.push({ ...image, engine }));
          return;
        }

        errors.push({
          engine,
          message: settled.reason?.message || "generation failed",
          details: settled.reason?.details || null,
        });
      });

      if (!images.length) {
        const firstFailure = results.find((item) => item.status === "rejected");
        const error = new Error(errors.map((item) => `${item.engine}: ${item.message}`).join("; "));
        error.statusCode = firstFailure?.reason?.statusCode || 500;
        error.details = errors;
        throw error;
      }

      return {
        engine: request.engine,
        engines: [...new Set(images.map((image) => image.engine))],
        request,
        settings,
        images,
        metadata,
        errors,
        promptPipeline: {
          textModelEnabled: state.textModelEnabled,
          localPrompt,
          finalPrompt: request.prompt,
          textModel: textMetadata,
        },
      };
    },

    async runAgent(body, context = {}) {
      const targetScore = clampNumber(body.targetScore, 1, 100, 85);
      const maxRounds = clampNumber(body.maxRounds, 1, 3, 2);
      const requirement = String(body.originalPrompt || body.prompt || "").trim();
      let prompt = String(body.prompt || body.enhancedPrompt || "").trim();

      if (!requirement || !prompt) {
        const error = new Error("Agent requirement and prompt are required.");
        error.statusCode = 400;
        throw error;
      }
      const reviewProvider = (body.engine || state.defaultEngine) === "codexCli" && codexProvider ? codexProvider : visionProvider;
      if (reviewProvider === visionProvider) visionProvider.assertConfigured();

      const referenceCases = matchReferenceCases(`${requirement} ${prompt}`);
      const rounds = [];
      for (let round = 1; round <= maxRounds; round += 1) {
        if (rounds.length && context.shouldStop?.()) break;
        let generated;
        try { generated = await this.generate({
          ...body,
          originalPrompt: requirement,
          prompt,
          enhancedPrompt: prompt,
        }, { onProgress: progress => context.onProgress?.({ ...progress, round, maxRounds }) });
        } catch (error) {
          if (!rounds.length) throw error;
          break;
        }
        const image = generated.images[0];
        if (!image?.url) {
          throw new Error(`Agent round ${round} finished without an image.`);
        }

        const pending = { score: null, rubric: {}, evaluationFailed: true, evaluationPending: true,
          problems: ["图片已保存，正在评审"], suggestion: "请等待评审", revisedPrompt: generated.request.prompt };
        const entry = { round, prompt: generated.request.prompt || prompt, image, engines: generated.engines, errors: [], evaluation: pending };
        await context.onRound?.(agentResult([...rounds, entry], targetScore, maxRounds, referenceCases));
        context.onProgress?.({ phase: "reviewing", round, maxRounds });
        let evaluation;
        try {
          evaluation = await reviewProvider.evaluate({ imageUrl: image.url, requirement,
            prompt: generated.request.prompt || prompt, targetScore, round, referenceCases });
        } catch {
          evaluation = { ...pending, evaluationPending: false,
            problems: ["图片已生成并保留，自动评审未完成"], suggestion: "可下载图片或继续细化" };
        }

        rounds.push({
          round,
          prompt: generated.request.prompt || prompt,
          image,
          engines: generated.engines,
          errors: generated.errors,
          evaluation,
        });

        await context.onRound?.(agentResult(rounds, targetScore, maxRounds, referenceCases));
        if (evaluation.evaluationFailed || context.shouldStop?.() || (evaluation.score >= targetScore && evaluation.decision !== "revise" && evaluation.decision !== "needs_review") || round === maxRounds) {
          break;
        }
        prompt = evaluation.revisedPrompt || appendSuggestion(prompt, evaluation.suggestion);
      }

      return { ...agentResult(rounds, targetScore, maxRounds, referenceCases), stopped: Boolean(context.shouldStop?.()) };
    },
  };
}

function agentResult(rounds, targetScore, maxRounds, referenceCases) {
  const reviewed = rounds.filter(item => !item.evaluation.evaluationFailed);
  const best = (reviewed.length ? reviewed : rounds).reduce((best, item) => !best || item.evaluation.score > best.evaluation.score ? item : best, null);
  return { targetScore, maxRounds, completedRounds: rounds.length,
    finalPrompt: rounds.at(-1)?.prompt || "", bestScore: best?.evaluation.score ?? null,
    bestRound: best?.round || null, bestImage: best?.image || null,
    bestEvaluation: best?.evaluation || null, reviewIncomplete: rounds.some(item => item.evaluation.evaluationFailed), referenceCases, rounds };
}

function buildProviders(config, codexProvider) {
  return {
    ...(codexProvider ? { codexCli: codexProvider } : {}),
    automatic1111: new Automatic1111Adapter({
      baseUrl: config.auto1111BaseUrl,
      lora: config.auto1111Lora,
    }),
    comfyui: new ComfyUiAdapter({
      baseUrl: config.comfyBaseUrl,
      checkpoint: config.comfyCheckpoint,
      workflowFile: config.comfyWorkflowFile,
    }),
    imageModel: new ImageModelAdapter({
      baseUrl: config.imageModelBaseUrl,
      apiKey: config.imageModelApiKey,
      model: config.imageModelName,
      size: config.imageModelSize,
    }),
  };
}

function buildTextProvider(config) {
  return new TextModelAdapter({
    baseUrl: config.textModelBaseUrl,
    apiKey: config.textModelApiKey,
    model: config.textModelName,
  });
}

function buildVisionProvider(config) {
  return new VisionModelAdapter({
    baseUrl: config.visionModelBaseUrl,
    apiKey: config.visionModelApiKey,
    model: config.visionModelName,
  });
}

function expandEngineMode(mode) {
  const normalized = String(mode || "imageModel");
  if (normalized === "hybrid" || normalized === "automatic1111+imageModel") {
    return ["automatic1111", "imageModel"];
  }
  if (normalized === "comfyui+imageModel") {
    return ["comfyui", "imageModel"];
  }
  return [normalized];
}

function publicConfig(config) {
  return {
    defaultEngine: config.defaultEngine,
    auto1111BaseUrl: config.auto1111BaseUrl,
    auto1111Lora: config.auto1111Lora,
    comfyBaseUrl: config.comfyBaseUrl,
    comfyCheckpoint: config.comfyCheckpoint,
    comfyWorkflowFile: config.comfyWorkflowFile,
    textModelEnabled: config.textModelEnabled,
    textModelBaseUrl: config.textModelBaseUrl,
    textModelName: config.textModelName,
    textModelApiKeyConfigured: Boolean(config.textModelApiKey),
    imageModelBaseUrl: config.imageModelBaseUrl,
    imageModelName: config.imageModelName,
    imageModelSize: config.imageModelSize,
    imageModelApiKeyConfigured: Boolean(config.imageModelApiKey),
    visionModelBaseUrl: config.visionModelBaseUrl,
    visionModelName: config.visionModelName,
    visionModelApiKeyConfigured: Boolean(config.visionModelApiKey),
  };
}

function sanitizeConfig(nextConfig, currentConfig) {
  const defaultEngine = String(nextConfig.defaultEngine || currentConfig.defaultEngine || "imageModel");
  if (!ENGINE_MODES.includes(defaultEngine)) {
    const error = new Error(`Unsupported default engine mode: ${defaultEngine}`);
    error.statusCode = 400;
    throw error;
  }

  return {
    defaultEngine,
    auto1111BaseUrl: stringValue(nextConfig, "auto1111BaseUrl", currentConfig.auto1111BaseUrl),
    auto1111Lora: stringValue(
      nextConfig,
      "auto1111Lora",
      currentConfig.auto1111Lora,
      nextConfig.auto1111Model,
    ),
    comfyBaseUrl: stringValue(nextConfig, "comfyBaseUrl", currentConfig.comfyBaseUrl),
    comfyCheckpoint: stringValue(nextConfig, "comfyCheckpoint", currentConfig.comfyCheckpoint),
    comfyWorkflowFile: stringValue(nextConfig, "comfyWorkflowFile", currentConfig.comfyWorkflowFile),
    textModelEnabled: booleanValue(nextConfig.textModelEnabled, currentConfig.textModelEnabled),
    textModelBaseUrl: stringValue(nextConfig, "textModelBaseUrl", currentConfig.textModelBaseUrl),
    textModelApiKey: secretValue(nextConfig.textModelApiKey, currentConfig.textModelApiKey),
    textModelName: stringValue(nextConfig, "textModelName", currentConfig.textModelName),
    imageModelBaseUrl: stringValue(nextConfig, "imageModelBaseUrl", currentConfig.imageModelBaseUrl),
    imageModelApiKey: secretValue(nextConfig.imageModelApiKey, currentConfig.imageModelApiKey),
    imageModelName: stringValue(nextConfig, "imageModelName", currentConfig.imageModelName),
    imageModelSize: stringValue(nextConfig, "imageModelSize", currentConfig.imageModelSize),
    visionModelBaseUrl: stringValue(
      nextConfig,
      "visionModelBaseUrl",
      currentConfig.visionModelBaseUrl,
    ),
    visionModelApiKey: secretValue(nextConfig.visionModelApiKey, currentConfig.visionModelApiKey),
    visionModelName: stringValue(nextConfig, "visionModelName", currentConfig.visionModelName),
  };
}

function stringValue(source, key, fallback, aliasValue) {
  if (Object.prototype.hasOwnProperty.call(source, key)) {
    return String(source[key] || "").trim();
  }
  if (aliasValue !== undefined) {
    return String(aliasValue || "").trim();
  }
  return String(fallback || "").trim();
}

function secretValue(nextValue, currentValue) {
  const normalized = String(nextValue || "").trim();
  return normalized || String(currentValue || "").trim();
}

function booleanValue(nextValue, currentValue) {
  if (nextValue === undefined) {
    return Boolean(currentValue);
  }
  if (typeof nextValue === "string") {
    return ["1", "true", "yes", "on"].includes(nextValue.toLowerCase());
  }
  return Boolean(nextValue);
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(min, Math.min(max, Math.round(numeric))) : fallback;
}

function appendSuggestion(prompt, suggestion) {
  const normalizedSuggestion = String(suggestion || "").trim();
  return normalizedSuggestion ? `${prompt}, ${normalizedSuggestion}` : prompt;
}

module.exports = {
  ENGINE_MODES,
  createImageGateway,
  expandEngineMode,
};
