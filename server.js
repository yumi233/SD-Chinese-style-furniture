const fs = require("fs");
const path = require("path");
const express = require("express");
const { createImageGateway } = require("./src/imageGateway");
const { ModelConfigStore } = require("./src/modelConfigStore");
const { HistoryStore } = require("./src/historyStore");
const { getReferenceCases } = require("./src/referenceKnowledge");
const { buildCompetitionReport, buildDemoScript } = require("./src/reportBuilder");

loadDotEnv(path.join(__dirname, ".env"));

const app = express();
const port = Number(process.env.PORT || 3000);
const historyStore = new HistoryStore({
  rootDir: process.env.HISTORY_DATA_DIR || path.join(__dirname, "data", "history"),
});
const modelConfigStore = new ModelConfigStore({
  filePath: process.env.MODEL_CONFIG_FILE || path.join(__dirname, "config.local.json"),
  defaults: buildEnvModelConfig(),
});
const gateway = createImageGateway(modelConfigStore.load());
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  return next();
});

app.use(express.json({ limit: "10mb" }));
app.use(express.static(__dirname));

app.get("/api/health", async (req, res) => {
  try {
    const payload = await gateway.health();
    res.json(payload);
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error.message || "health check failed",
    });
  }
});

app.get("/api/engines", (req, res) => {
  res.json(gateway.listEngines());
});

app.get("/api/reference-cases", (req, res) => {
  res.json({
    ok: true,
    cases: getReferenceCases(),
  });
});

app.get("/api/config", (req, res) => {
  res.json({
    ok: true,
    config: gateway.getConfig(),
    engines: gateway.listEngines().engines,
  });
});

app.post("/api/config", (req, res) => {
  try {
    const config = gateway.updateConfig(req.body || {});
    modelConfigStore.save(gateway.getRuntimeConfig());
    res.json({
      ok: true,
      config,
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      message: error.message || "config update failed",
    });
  }
});

app.post("/api/generate", async (req, res) => {
  try {
    const result = await gateway.generate(req.body || {});
    const saved = await historyStore.saveGeneration(req.body || {}, result);
    res.json({
      ok: true,
      ...saved.result,
      historyRecord: saved.record,
    });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({
      ok: false,
      message: error.message || "image generation failed",
      details: error.details || null,
    });
  }
});

app.post("/api/agent/run", async (req, res) => {
  try {
    const result = await gateway.runAgent(req.body || {});
    const saved = await historyStore.saveAgent(req.body || {}, result);
    res.json({
      ok: true,
      ...saved.result,
      historyRecord: saved.record,
    });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({
      ok: false,
      message: error.message || "agent execution failed",
      details: error.details || null,
    });
  }
});

app.get("/api/history", (req, res) => {
  res.json({
    ok: true,
    records: historyStore.list(req.query.limit),
  });
});

app.get("/api/history/assets/:filename", (req, res) => {
  const assetPath = historyStore.resolveAsset(req.params.filename);
  if (!assetPath) {
    return res.status(404).json({
      ok: false,
      message: "history image not found",
    });
  }
  return res.sendFile(assetPath);
});

app.get("/api/history/:id/report", (req, res) => {
  const record = historyStore.get(req.params.id);
  if (!record) {
    return res.status(404).json({
      ok: false,
      message: "history record not found",
    });
  }

  const format = req.query.format === "demo" ? "demo" : "report";
  const content = format === "demo" ? buildDemoScript(record) : buildCompetitionReport(record);
  return res.json({
    ok: true,
    format,
    filename: exportFilename(record.title, format),
    content,
    mimeType: "text/markdown; charset=utf-8",
  });
});

app.get("/api/history/:id", (req, res) => {
  const record = historyStore.get(req.params.id);
  if (!record) {
    return res.status(404).json({
      ok: false,
      message: "history record not found",
    });
  }
  return res.json({
    ok: true,
    record,
  });
});

app.delete("/api/history/:id", (req, res) => {
  const deleted = historyStore.delete(req.params.id);
  if (!deleted) {
    return res.status(404).json({
      ok: false,
      message: "history record not found",
    });
  }
  return res.json({
    ok: true,
    deletedId: req.params.id,
  });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(port, () => {
  console.log(`Huazuo AI backend listening on http://127.0.0.1:${port}`);
});

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

function buildEnvModelConfig() {
  return {
    defaultEngine: process.env.DEFAULT_ENGINE || "automatic1111",
    auto1111BaseUrl: process.env.AUTO1111_BASE_URL || "http://127.0.0.1:7860",
    auto1111Lora: process.env.AUTO1111_LORA || process.env.AUTO1111_MODEL || "",
    comfyBaseUrl: process.env.COMFYUI_BASE_URL || "http://127.0.0.1:8188",
    comfyCheckpoint: process.env.COMFYUI_CHECKPOINT || "",
    comfyWorkflowFile: process.env.COMFYUI_WORKFLOW_FILE || "",
    textModelEnabled: parseBoolean(process.env.TEXT_MODEL_ENABLED),
    textModelBaseUrl: process.env.TEXT_MODEL_BASE_URL || "",
    textModelApiKey: process.env.TEXT_MODEL_API_KEY || "",
    textModelName: process.env.TEXT_MODEL_NAME || "",
    imageModelBaseUrl: process.env.IMAGE_MODEL_BASE_URL || "",
    imageModelApiKey: process.env.IMAGE_MODEL_API_KEY || "",
    imageModelName: process.env.IMAGE_MODEL_NAME || "",
    imageModelSize: process.env.IMAGE_MODEL_SIZE || "",
    visionModelBaseUrl:
      process.env.VISION_MODEL_BASE_URL || process.env.TEXT_MODEL_BASE_URL || "",
    visionModelApiKey:
      process.env.VISION_MODEL_API_KEY || process.env.TEXT_MODEL_API_KEY || "",
    visionModelName:
      process.env.VISION_MODEL_NAME || process.env.TEXT_MODEL_NAME || "",
  };
}
function exportFilename(title, format) {
  const suffix = format === "demo" ? "演示文案" : "作品说明";
  const safeTitle = String(title || "中式家具AI智能体")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48);
  return `${safeTitle || "中式家具AI智能体"}-${suffix}.md`;
}

function parseBoolean(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}
