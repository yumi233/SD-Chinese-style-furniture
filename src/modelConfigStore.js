const fs = require("fs");
const path = require("path");

const CONFIG_KEYS = [
  "defaultEngine",
  "auto1111BaseUrl",
  "auto1111Lora",
  "comfyBaseUrl",
  "comfyCheckpoint",
  "comfyWorkflowFile",
  "textModelEnabled",
  "textModelBaseUrl",
  "textModelApiKey",
  "textModelName",
  "imageModelBaseUrl",
  "imageModelApiKey",
  "imageModelName",
  "imageModelSize",
  "visionModelBaseUrl",
  "visionModelApiKey",
  "visionModelName",
];

class ModelConfigStore {
  constructor(options = {}) {
    this.filePath = path.resolve(options.filePath || path.join(process.cwd(), "config.local.json"));
    this.defaults = normalizeConfig(options.defaults || {});
  }

  load() {
    if (!fs.existsSync(this.filePath)) {
      this.save(this.defaults);
      return { ...this.defaults };
    }

    const parsed = readJsonFile(this.filePath);
    return normalizeConfig({
      ...this.defaults,
      ...parsed,
    });
  }

  save(config) {
    const normalized = normalizeConfig({
      ...this.defaults,
      ...config,
    });
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, `${JSON.stringify(stableConfig(normalized), null, 2)}\n`, "utf8");
    return normalized;
  }
}

function readJsonFile(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    const wrapped = new Error(`Model config file is not valid JSON: ${filePath}`);
    wrapped.cause = error;
    throw wrapped;
  }
}

function normalizeConfig(config) {
  return {
    defaultEngine: stringValue(config.defaultEngine || "automatic1111"),
    auto1111BaseUrl: stringValue(config.auto1111BaseUrl || "http://127.0.0.1:7860"),
    auto1111Lora: stringValue(config.auto1111Lora || config.auto1111Model),
    comfyBaseUrl: stringValue(config.comfyBaseUrl || "http://127.0.0.1:8188"),
    comfyCheckpoint: stringValue(config.comfyCheckpoint),
    comfyWorkflowFile: stringValue(config.comfyWorkflowFile),
    textModelEnabled: booleanValue(config.textModelEnabled),
    textModelBaseUrl: stringValue(config.textModelBaseUrl),
    textModelApiKey: stringValue(config.textModelApiKey),
    textModelName: stringValue(config.textModelName),
    imageModelBaseUrl: stringValue(config.imageModelBaseUrl),
    imageModelApiKey: stringValue(config.imageModelApiKey),
    imageModelName: stringValue(config.imageModelName),
    imageModelSize: stringValue(config.imageModelSize),
    visionModelBaseUrl: stringValue(config.visionModelBaseUrl || config.textModelBaseUrl),
    visionModelApiKey: stringValue(config.visionModelApiKey || config.textModelApiKey),
    visionModelName: stringValue(config.visionModelName || config.textModelName),
  };
}

function stableConfig(config) {
  return CONFIG_KEYS.reduce((result, key) => {
    result[key] = config[key];
    return result;
  }, {});
}

function stringValue(value) {
  return String(value || "").trim();
}

function booleanValue(value) {
  if (typeof value === "string") {
    return ["1", "true", "yes", "on"].includes(value.toLowerCase());
  }
  return Boolean(value);
}

module.exports = {
  ModelConfigStore,
  normalizeConfig,
  CONFIG_KEYS,
};
