const { Automatic1111Adapter } = require("./providers/automatic1111");
const { ComfyUiAdapter } = require("./providers/comfyui");
const { buildGenerationSettings, normalizeGenerateRequest } = require("./lib/requestNormalizer");

function createImageGateway(config) {
  const state = {
    defaultEngine: config.defaultEngine,
    auto1111BaseUrl: config.auto1111BaseUrl,
    auto1111Lora: config.auto1111Lora,
    comfyBaseUrl: config.comfyBaseUrl,
    comfyCheckpoint: config.comfyCheckpoint,
    comfyWorkflowFile: config.comfyWorkflowFile,
  };

  let providers = buildProviders(state);

  return {
    getConfig() {
      return { ...state };
    },

    updateConfig(nextConfig) {
      Object.assign(state, sanitizeConfig(nextConfig, state));
      providers = buildProviders(state);
      return this.getConfig();
    },

    listEngines() {
      return {
        defaultEngine: state.defaultEngine,
        engines: Object.keys(providers),
      };
    },

    async health() {
      const checks = await Promise.all(
        Object.entries(providers).map(async ([name, provider]) => {
          try {
            const status = await provider.health();
            return [name, status];
          } catch (error) {
            return [
              name,
              {
                ok: false,
                message: error.message || "unreachable",
              },
            ];
          }
        }),
      );

      return {
        ok: true,
        defaultEngine: state.defaultEngine,
        engines: Object.fromEntries(checks),
      };
    },

    async generate(body) {
      const request = normalizeGenerateRequest(body, state.defaultEngine);
      const provider = providers[request.engine];
      if (!provider) {
        const error = new Error(`Unsupported engine: ${request.engine}`);
        error.statusCode = 400;
        throw error;
      }

      const settings = buildGenerationSettings(request);
      const result = await provider.generate({
        request,
        settings,
      });

      return {
        engine: request.engine,
        request,
        settings,
        images: result.images,
        metadata: result.metadata || {},
      };
    },
  };
}

function buildProviders(config) {
  return {
    automatic1111: new Automatic1111Adapter({
      baseUrl: config.auto1111BaseUrl,
      lora: config.auto1111Lora,
    }),
    comfyui: new ComfyUiAdapter({
      baseUrl: config.comfyBaseUrl,
      checkpoint: config.comfyCheckpoint,
      workflowFile: config.comfyWorkflowFile,
    }),
  };
}

function sanitizeConfig(nextConfig, currentConfig) {
  return {
    defaultEngine: String(nextConfig.defaultEngine || currentConfig.defaultEngine || "automatic1111"),
    auto1111BaseUrl: String(nextConfig.auto1111BaseUrl || currentConfig.auto1111BaseUrl || "").trim(),
    auto1111Lora: String(nextConfig.auto1111Lora || nextConfig.auto1111Model || "").trim(),
    comfyBaseUrl: String(nextConfig.comfyBaseUrl || currentConfig.comfyBaseUrl || "").trim(),
    comfyCheckpoint: String(nextConfig.comfyCheckpoint || "").trim(),
    comfyWorkflowFile: String(nextConfig.comfyWorkflowFile || "").trim(),
  };
}

module.exports = {
  createImageGateway,
};
