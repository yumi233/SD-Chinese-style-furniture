const { CodexCliAdapter } = require("./providers/codexCli");
const { Automatic1111Adapter } = require("./providers/automatic1111");
const { ComfyUiAdapter } = require("./providers/comfyui");
const { ImageModelAdapter } = require("./providers/imageModel");
const { TextModelAdapter } = require("./providers/textModel");
const { VisionModelAdapter } = require("./providers/visionModel");
const { GeminiImageAdapter } = require("./providers/geminiImage");
const { buildGenerationSettings, normalizeGenerateRequest } = require("./lib/requestNormalizer");
const { retrieveKnowledge, formatPromptContext } = require("./referenceKnowledge");
const { getStyleProfile } = require("./knowledge/styleProfiles");
const { entryConcepts } = require("./knowledge/cuePicker");
const { parseBrief } = require("./design/brief");
const { establishDirection } = require("./design/direction");
const { composePrompt } = require("./design/composer");
const { compareEvaluations } = require("./design/evaluation");
const { selectReferences } = require("./design/references");

const ENGINE_MODES = [
  "codexCli",
  "automatic1111",
  "comfyui",
  "imageModel",
  "automatic1111+imageModel",
  "comfyui+imageModel",
  "geminiImage",
];

function createImageGateway(config, options = {}) {
  const codexSettings = Object.freeze({ ...(options.codexCli || {}) });
  const styleReferences = options.styleReferences || null;
  const userReferences = options.userReferences || null;
  const codexProvider = codexSettings.enabled ? new CodexCliAdapter(codexSettings) : null;
  // Optional, server-side only: GEMINI_API_KEY and GEMINI_IMAGE_MODEL.
  const geminiCandidate = options.gemini ? new GeminiImageAdapter(options.gemini) : null;
  const geminiProvider = geminiCandidate?.isConfigured() ? geminiCandidate : null;
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

  let providers = buildProviders(state, codexProvider, geminiProvider);
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
      providers = buildProviders(state, codexProvider, geminiProvider);
      textProvider = buildTextProvider(state);
      visionProvider = buildVisionProvider(state);
      return this.getConfig();
    },

    listEngines() {
      return {
        defaultEngine: state.defaultEngine,
        engines: Object.keys(providers),
        modes: ENGINE_MODES.filter(mode => (mode !== "codexCli" || Boolean(codexProvider)) && (mode !== "geminiImage" || Boolean(geminiProvider))),
        agentEngines: ENGINE_MODES.filter(mode => mode === "codexCli" ? Boolean(codexProvider) : mode === "geminiImage" ? Boolean(geminiProvider) && visionProvider.isConfigured() : visionProvider.isConfigured()),
      };
    },

    // Per-engine capability matrix, verified or not; shown to users as is.
    capabilities() {
      return Object.fromEntries(Object.entries(providers).map(([name, provider]) => [name, provider.capabilities?.() || null]));
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

    // Understand requirements -> lock constraints -> select references ->
    // compose -> generate. The structured design (brief, direction, references,
    // corrections, previous image) comes from the task; direct calls without
    // it derive the same structure from the request.
    async generate(body, context = {}) {
      context.onProgress?.({ phase: "brief" });
      let request = normalizeGenerateRequest(body, state.defaultEngine);
      const localPrompt = request.prompt;
      let textMetadata = null;
      const errors = [];
      const design = context.design || prepareDesign(request);
      const { brief, direction } = design;
      if (brief.needsClarification && !design.clarified) throw clarificationError(brief);

      context.onProgress?.({ phase: "references" });
      const engines = expandEngineMode(request.engine);
      const knowledge = Array.isArray(context.knowledge) ? context.knowledge : retrieveForBrief(brief, direction);
      const references = selectReferences({
        brief,
        direction,
        ownerId: context.ownerId,
        selections: design.referenceSelections || [],
        userReferences,
        styleReferences,
        engine: engines.includes("codexCli") ? "codexCli" : engines[0],
        baseImage: design.baseImage || null,
      });

      let draft = request.prompt;
      if (state.textModelEnabled) {
        try {
          const enhanced = await textProvider.enhance({ ...request, originalPrompt: brief.source }, { knowledge });
          draft = enhanced.prompt;
          textMetadata = enhanced.metadata;
        } catch (error) {
          textMetadata = { error: error.message || "prompt enhancement failed" };
          errors.push({ engine: "textModel", message: error.message || "prompt enhancement failed", details: error.details || null });
        }
      }

      const composed = composePrompt({ brief, direction, draft, negativeDraft: request.negativePrompt, corrections: design.corrections || [], edit: design.edit || null });
      const profile = getStyleProfile(direction.style);
      request = {
        ...request,
        style: direction.style,
        styleLabel: profile.label,
        stylePack: direction.pack,
        prompt: composed.prompt,
        negativePrompt: composed.negativePrompt,
        // Providers that write their own prompt (Codex CLI) read the same
        // locked structure; it is studio policy, not user data.
        styleGuidance: {
          anchor: profile.anchor,
          lockedRequirements: composed.lockedLines,
          avoid: composed.negativePrompt.split(", ").slice(0, 24),
          balance: direction.balance,
          knowledge: formatPromptContext(knowledge),
          expression: direction.expression.kind === "technique" ? `optional traditional technique: ${direction.expression.hint}` : direction.expression.hint,
          designMove: direction.move ? `${direction.move.title} (${direction.move.hint})` : "",
          stylePack: direction.pack ? `${direction.packTitle}: ${direction.packRecipe}` : "",
          corrections: (design.corrections || []).slice(0, 2).map((item) => item.instruction || item.issue),
          edit: design.edit ? { scope: design.edit.scope, keep: design.edit.keep } : null,
          referenceNotes: references.notes,
        },
      };

      context.onProgress?.({ phase: "generating" });
      const settings = buildGenerationSettings(request);
      const results = await Promise.allSettled(
        engines.map(async (engine) => {
          const provider = providers[engine];
          if (!provider) {
            const error = new Error(`Unsupported engine: ${engine}`);
            error.statusCode = 400;
            throw error;
          }
          const supportsReferences = provider.capabilities?.().referenceImages?.supported;
          const result = await provider.generate(supportsReferences && references.images.length ? { request, settings, referenceImages: references.images } : { request, settings });
          return { engine, result };
        }),
      );

      const images = [];
      const metadata = {};
      results.forEach((settled, index) => {
        const engine = engines[index];
        if (settled.status === "fulfilled") {
          metadata[engine] = settled.value.result.metadata || {};
          settled.value.result.images.forEach((image) => images.push({ ...image, engine }));
          return;
        }
        errors.push({ engine, message: settled.reason?.message || "generation failed", details: settled.reason?.details || null });
      });

      if (!images.length) {
        const firstFailure = results.find((item) => item.status === "rejected");
        const error = new Error(errors.map((item) => `${item.engine}: ${item.message}`).join("; "));
        error.statusCode = firstFailure?.reason?.statusCode || 500;
        error.details = errors;
        throw error;
      }

      const usedEngine = images[0].engine;
      const sentImages = providers[usedEngine]?.capabilities?.().referenceImages?.supported ? references.images : [];
      return {
        engine: request.engine,
        engines: [...new Set(images.map((image) => image.engine))],
        request,
        settings,
        images,
        metadata,
        errors,
        design: {
          brief,
          direction,
          references: references.used,
          referenceAdjustments: references.adjustments,
          sentImages: sentImages.map((image) => ({ id: image.id || null, kind: image.kind, title: image.title || "", purpose: image.purpose })),
          removedFromPrompt: composed.removed,
          edit: design.edit ? design.edit.labels : null,
          corrections: (design.corrections || []).slice(0, 2),
          model: { engine: usedEngine, model: metadata[usedEngine]?.model || null, provider: metadata[usedEngine]?.provider || usedEngine },
          capability: providers[usedEngine]?.capabilities?.() || null,
        },
        promptPipeline: {
          textModelEnabled: state.textModelEnabled,
          localPrompt,
          finalPrompt: request.prompt,
          removedTerms: composed.removed.map((item) => item.text),
          knowledgeIds: knowledge.map((item) => item.id),
          stylePack: direction.pack || null,
          referenceImageIds: sentImages.map((image) => image.id).filter(Boolean),
          textModel: textMetadata,
        },
      };
    },

    async evaluateImage({ engine, imageUrl, previousImageUrl, brief, direction, edit, targetScore, round }) {
      const reviewProvider = (engine || state.defaultEngine) === "codexCli" && codexProvider ? codexProvider : visionProvider;
      if (reviewProvider === visionProvider) visionProvider.assertConfigured();
      return reviewProvider.evaluate({ imageUrl, previousImageUrl, brief, direction, edit, targetScore, round, style: direction.style });
    },

    // Generate -> evaluate each criterion -> targeted correction, until the
    // result passes, the round limit is reached, two rounds in a row fail to
    // improve, or evaluation itself fails. Every image is kept.
    async runAgent(body, context = {}) {
      const targetScore = clampNumber(body.targetScore, 1, 100, 85);
      const maxRounds = clampNumber(body.maxRounds, 1, 3, 2);
      const requirement = String(body.originalPrompt || body.prompt || "").trim();
      const prompt = String(body.prompt || body.enhancedPrompt || "").trim();
      if (!requirement || !prompt) {
        const error = new Error("Agent requirement and prompt are required.");
        error.statusCode = 400;
        throw error;
      }
      const engine = body.engine || state.defaultEngine;
      if (!(engine === "codexCli" && codexProvider)) visionProvider.assertConfigured();

      const base = normalizeGenerateRequest({ ...body, prompt }, state.defaultEngine);
      const design = context.design || prepareDesign(base);
      if (design.brief.needsClarification && !design.clarified) throw clarificationError(design.brief);
      const knowledge = retrieveForBrief(design.brief, design.direction);
      const rounds = [];
      let corrections = design.corrections || [];
      let previous = design.baseImage ? { url: `data:${design.baseImage.mimeType};base64,${design.baseImage.bytes.toString("base64")}`, bytes: design.baseImage.bytes, mimeType: design.baseImage.mimeType } : null;
      let stalls = 0;
      let stopReason = "round_limit";
      for (let round = 1; round <= maxRounds; round += 1) {
        if (rounds.length && context.shouldStop?.()) {
          stopReason = "user_stop";
          break;
        }
        const roundDesign = {
          ...design,
          corrections,
          // Later rounds refine the previous image instead of starting over;
          // a refinement task starts from the version it refines.
          baseImage: previous ? { id: null, title: round > 1 ? "previous round" : "previous version", mimeType: previous.mimeType, bytes: previous.bytes } : null,
          edit: round > 1 ? null : design.edit || null,
        };
        let generated;
        try {
          generated = await this.generate({ ...body, originalPrompt: requirement, prompt, enhancedPrompt: prompt }, {
            design: roundDesign,
            knowledge,
            ownerId: context.ownerId,
            onProgress: (progress) => context.onProgress?.({ ...progress, round, maxRounds }),
          });
        } catch (error) {
          if (!rounds.length) throw error;
          stopReason = "generation_error";
          break;
        }
        const image = generated.images[0];
        if (!image?.url) throw new Error(`Agent round ${round} finished without an image.`);

        const pending = { status: "pending", score: null, evaluationFailed: true, evaluationPending: true, problems: ["图片已保存，正在评审"], suggestion: "请等待评审" };
        const entry = { round, prompt: generated.request.prompt, image, engines: generated.engines, errors: [], evaluation: pending, corrections, design: generated.design };
        await context.onRound?.(agentResult([...rounds, entry], targetScore, maxRounds, generated.design.references));
        context.onProgress?.({ phase: "reviewing", round, maxRounds });
        let evaluation;
        const comparedTo = previous?.url || null;
        try {
          evaluation = await this.evaluateImage({ engine, imageUrl: image.url, previousImageUrl: comparedTo, brief: design.brief, direction: design.direction, edit: round === 1 ? design.edit : null, targetScore, round });
        } catch {
          evaluation = { ...pending, status: "error", evaluationPending: false, problems: ["图片已生成并保留，自动评审未完成"], suggestion: "可下载图片或继续细化" };
        }
        rounds.push({ ...entry, evaluation });
        await context.onRound?.(agentResult(rounds, targetScore, maxRounds, generated.design.references));

        if (evaluation.evaluationFailed) { stopReason = "evaluation_error"; break; }
        if (evaluation.status === "incomplete") { stopReason = "evaluation_incomplete"; break; }
        if (evaluation.status === "pass" && (evaluation.score ?? 0) >= targetScore) { stopReason = "passed"; break; }
        if (context.shouldStop?.()) { stopReason = "user_stop"; break; }
        if (rounds.length > 1 && compareEvaluations(evaluation, rounds.at(-2).evaluation) >= 0) stalls += 1;
        else stalls = 0;
        if (stalls >= 2) { stopReason = "no_improvement"; break; }
        if (round === maxRounds) break;
        corrections = (evaluation.corrections || []).slice(0, 2);
        previous = { url: image.url, ...dataUrlParts(image.url) };
      }

      return { ...agentResult(rounds, targetScore, maxRounds, rounds.at(-1)?.design?.references || []), stopReason, design: rounds.at(-1)?.design || null, stopped: stopReason === "user_stop" };
    },
  };
}

function prepareDesign(request) {
  const brief = parseBrief(request.originalPrompt || request.prompt, { style: request.style, presetLabel: request.styleLabel });
  const direction = establishDirection(brief, { style: request.style, stylePack: request.stylePack, modernity: request.modernity });
  return { brief, direction, corrections: [], edit: null };
}

// Knowledge for the prompt writer, without entries that would put a
// prohibited concept back into the image.
function retrieveForBrief(brief, direction) {
  const prohibited = new Set(brief.prohibitions.filter((entry) => entry.strength === "hard").map((entry) => entry.concept));
  return retrieveKnowledge(brief.positiveText || brief.source, { style: direction.style })
    .filter((item) => ![...entryConcepts({ id: item.id, title: item.title, promptHints: item.promptHints })].some((concept) => prohibited.has(concept)));
}

function clarificationError(brief) {
  const error = new Error(`需求里有互相矛盾的地方，请先确认：${brief.conflicts.map((item) => `「${item.requiredBy}」与「${item.prohibitedBy}」`).join("；")}`);
  error.statusCode = 422;
  error.details = { clarification: brief.conflicts };
  error.publicMessage = error.message;
  return error;
}

function dataUrlParts(url) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(String(url || ""));
  return match ? { mimeType: match[1], bytes: Buffer.from(match[2], "base64") } : { mimeType: "image/png", bytes: Buffer.alloc(0) };
}

function agentResult(rounds, targetScore, maxRounds, references) {
  const reviewed = rounds.filter((item) => !item.evaluation.evaluationFailed);
  const best = [...(reviewed.length ? reviewed : rounds)].sort((a, b) => compareEvaluations(a.evaluation, b.evaluation) || a.round - b.round)[0] || null;
  return { targetScore, maxRounds, completedRounds: rounds.length,
    finalPrompt: rounds.at(-1)?.prompt || "", bestScore: best?.evaluation.score ?? null,
    bestRound: best?.round || null, bestImage: best?.image || null,
    bestEvaluation: best?.evaluation || null,
    reviewIncomplete: rounds.some((item) => item.evaluation.evaluationFailed || item.evaluation.status === "incomplete"),
    referenceCases: references, rounds };
}

function buildProviders(config, codexProvider, geminiProvider) {
  return {
    ...(codexProvider ? { codexCli: codexProvider } : {}),
    ...(geminiProvider ? { geminiImage: geminiProvider } : {}),
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


module.exports = {
  ENGINE_MODES,
  createImageGateway,
  expandEngineMode,
  prepareDesign,
};
