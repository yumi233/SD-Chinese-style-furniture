const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./src/http/app");
const { createPiAdapter } = require("./src/agent/piAdapter");
const { DesignChat } = require("./src/designChat");
const { createImageGateway } = require("./src/imageGateway");
const { HistoryStore } = require("./src/historyStore");
const { ModelConfigStore } = require("./src/modelConfigStore");
const { DEFAULT_CODEX_MODEL } = require("./src/providers/codexCli");
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
  const gateway = createImageGateway(modelConfigStore.load(), {
    comfyStrictNegativeValidation: parseBoolean(env.COMFYUI_STRICT_NEGATIVE_VALIDATION),
    codexCli: {
      enabled: parseBoolean(env.CODEX_CLI_ENABLED),
      command: env.CODEX_CLI_COMMAND || "codex",
      model: env.CODEX_CLI_MODEL || DEFAULT_CODEX_MODEL,
      reasoningEffort: env.CODEX_CLI_REASONING_EFFORT || "high",
      authFile: env.CODEX_CLI_AUTH_FILE,
      authCacheFile: env.CODEX_CLI_AUTH_CACHE_FILE,
      workRoot: env.CODEX_CLI_WORK_ROOT || path.join(historyStore.rootDir, "codex-jobs"),
      timeoutMs: positiveInteger(env.CODEX_CLI_TIMEOUT_MS, 300000),
    },
  });
  const designChat = createDesignChat(env, historyStore.rootDir);
  const guestChat = createGuestChat(env, historyStore.rootDir);
  const guestGeneration = createGuestGeneration(env, historyStore.rootDir);
  const app = createApp({
    rootDir: __dirname,
    publicDir: path.join(__dirname, "public"),
    port,
    mushengPort: env.MUSHENG_PORT,
    historyStore,
    modelConfigStore,
    gateway,
    userStore,
    designChat,
    guestChat,
    guestGeneration,
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

// Off unless DESIGN_CHAT_ENABLED is set; direct generation never depends on it.
function createDesignChat(env, historyRoot) {
  if (!parseBoolean(env.DESIGN_CHAT_ENABLED)) return null;
  const rootDir = env.DESIGN_CHAT_DATA_DIR || path.join(historyRoot, "design-chat");
  return new DesignChat({
    runtime: createChatRuntime(env, path.join(rootDir, "pi")),
    rootDir,
    perMinute: positiveInteger(env.DESIGN_CHAT_PER_MINUTE, 6),
    maxMessages: positiveInteger(env.DESIGN_CHAT_MAX_MESSAGES, 20),
  });
}

// Guest chat (no account): its own data directory and Pi directory, one
// conversation per browser session, tighter limits, and expiry. Guests can
// never generate; generation routes still require an account.
function createGuestChat(env, historyRoot) {
  if (!parseBoolean(env.DESIGN_CHAT_ENABLED) || !parseBoolean(env.DESIGN_CHAT_GUEST_ENABLED)) return null;
  const rootDir = env.DESIGN_CHAT_GUEST_DATA_DIR || path.join(path.dirname(historyRoot), "guest-chat");
  const ttlHours = positiveInteger(env.DESIGN_CHAT_GUEST_TTL_HOURS, 24);
  const chat = new DesignChat({
    runtime: createChatRuntime(env, path.join(rootDir, "pi")),
    rootDir,
    perMinute: positiveInteger(env.DESIGN_CHAT_GUEST_PER_MINUTE, 2),
    maxMessages: positiveInteger(env.DESIGN_CHAT_GUEST_MAX_MESSAGES, 6),
    globalPerMinute: positiveInteger(env.DESIGN_CHAT_GUEST_GLOBAL_PER_MINUTE, 20),
    ttlMs: ttlHours * 3_600_000,
    singleConversation: true,
    fullMessage: "试用对话已到上限，登录后可继续",
  });
  chat.sweep();
  setInterval(() => chat.sweep(), 3_600_000).unref();
  return chat;
}

// Guest generation (no account) uses the real engine through the normal task
// pipeline, with its own history directory and a quota of saved images.
function createGuestGeneration(env, historyRoot) {
  if (!parseBoolean(env.GUEST_GENERATION_ENABLED)) return null;
  return {
    historyStore: new HistoryStore({
      rootDir: env.GUEST_HISTORY_DATA_DIR || path.join(path.dirname(historyRoot), "guest-history"),
      assetPrefix: "/api/guest/history/assets/",
    }),
    perSession: positiveInteger(env.GUEST_GENERATION_PER_SESSION, 1),
    perDay: positiveInteger(env.GUEST_GENERATION_PER_DAY, 10),
    ttlMs: positiveInteger(env.GUEST_GENERATION_TTL_HOURS, 24) * 3_600_000,
  };
}

function createChatRuntime(env, dataDir) {
  return createPiAdapter({
    command: env.DESIGN_CHAT_PI_COMMAND || "pi",
    provider: env.DESIGN_CHAT_PI_PROVIDER || "magpie",
    model: env.DESIGN_CHAT_PI_MODEL || "",
    thinking: env.DESIGN_CHAT_PI_THINKING || "",
    modelsFile: env.DESIGN_CHAT_PI_MODELS_FILE || path.join(os.homedir(), ".pi", "agent", "models.json"),
    dataDir,
    timeoutMs: positiveInteger(env.DESIGN_CHAT_TIMEOUT_MS, 90000),
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
    defaultEngine: env.DEFAULT_ENGINE || "imageModel",
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
  createDesignChat,
  createGuestChat,
  createGuestGeneration,
  createRuntime,
  loadDotEnv,
  parseIdList,
  parseOriginList,
  server,
};
