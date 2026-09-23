const fs = require("fs");
const path = require("path");
const { createApp } = require("./src/http/app");
const { createImageGateway } = require("./src/imageGateway");
const { HistoryStore } = require("./src/historyStore");
const { ModelConfigStore } = require("./src/modelConfigStore");
const { UserStore } = require("./src/userStore");

loadDotEnv(path.join(__dirname, ".env"));

function createRuntime(env = process.env) {
  const port = positiveInteger(env.PORT, 3000);
  const host = env.HOST || "127.0.0.1";
  const historyStore = new HistoryStore({
    rootDir: env.HISTORY_DATA_DIR || path.join(__dirname, "data", "history"),
  });
  const modelConfigStore = new ModelConfigStore({
    filePath: env.MODEL_CONFIG_FILE || path.join(__dirname, "config.local.json"),
    defaults: buildEnvModelConfig(env),
  });
  const adminUserIds = parseIdList(env.MUSHENG_ADMIN_USER_IDS);
  const userStore = new UserStore({
    filePath: env.USER_DATA_FILE || path.join(__dirname, "data", "users", "users.json"),
    adminUserIds,
  });
  const gateway = createImageGateway(modelConfigStore.load());
  const app = createApp({
    rootDir: __dirname,
    publicDir: path.join(__dirname, "public"),
    port,
    mushengPort: env.MUSHENG_PORT,
    historyStore,
    modelConfigStore,
    gateway,
    userStore,
    adminUserIds,
    allowedOrigins: parseOriginList(env.CORS_ALLOWED_ORIGINS),
    cookieOptions: {
      secure: parseBoolean(env.COOKIE_SECURE),
    },
  });
  return { app, host, port, historyStore, modelConfigStore, userStore, gateway };
}

const runtime = createRuntime();
const app = runtime.app;
let server = null;
if (require.main === module) {
  server = app.listen(runtime.port, runtime.host, () => {
    console.log(`Huazuo AI backend listening on http://${runtime.host}:${runtime.port}`);
  });
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function buildEnvModelConfig(env = process.env) {
  return {
    defaultEngine: env.DEFAULT_ENGINE || "automatic1111",
    auto1111BaseUrl: env.AUTO1111_BASE_URL || "http://127.0.0.1:7860",
    auto1111Lora: env.AUTO1111_LORA || env.AUTO1111_MODEL || "",
    comfyBaseUrl: env.COMFYUI_BASE_URL || "http://127.0.0.1:8188",
    comfyCheckpoint: env.COMFYUI_CHECKPOINT || "",
    comfyWorkflowFile: env.COMFYUI_WORKFLOW_FILE || "",
    textModelEnabled: parseBoolean(env.TEXT_MODEL_ENABLED),
    textModelBaseUrl: env.TEXT_MODEL_BASE_URL || "",
    textModelApiKey: env.TEXT_MODEL_API_KEY || "",
    textModelName: env.TEXT_MODEL_NAME || "",
    imageModelBaseUrl: env.IMAGE_MODEL_BASE_URL || "",
    imageModelApiKey: env.IMAGE_MODEL_API_KEY || "",
    imageModelName: env.IMAGE_MODEL_NAME || "",
    imageModelSize: env.IMAGE_MODEL_SIZE || "",
    visionModelBaseUrl: env.VISION_MODEL_BASE_URL || env.TEXT_MODEL_BASE_URL || "",
    visionModelApiKey: env.VISION_MODEL_API_KEY || env.TEXT_MODEL_API_KEY || "",
    visionModelName: env.VISION_MODEL_NAME || env.TEXT_MODEL_NAME || "",
  };
}

function parseIdList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseOriginList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseBoolean(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

module.exports = {
  app,
  buildEnvModelConfig,
  createRuntime,
  loadDotEnv,
  parseIdList,
  parseOriginList,
  server,
};
