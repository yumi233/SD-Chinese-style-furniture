const fs = require("fs");
const path = require("path");
const express = require("express");
const { createImageGateway } = require("./src/imageGateway");

loadDotEnv(path.join(__dirname, ".env"));

const app = express();
const port = Number(process.env.PORT || 3000);
const gateway = createImageGateway({
  defaultEngine: process.env.DEFAULT_ENGINE || "automatic1111",
  auto1111BaseUrl: process.env.AUTO1111_BASE_URL || "http://127.0.0.1:7860",
  auto1111Lora: process.env.AUTO1111_LORA || process.env.AUTO1111_MODEL || "",
  comfyBaseUrl: process.env.COMFYUI_BASE_URL || "http://127.0.0.1:8188",
  comfyCheckpoint: process.env.COMFYUI_CHECKPOINT || "",
  comfyWorkflowFile: process.env.COMFYUI_WORKFLOW_FILE || "",
});

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
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
    res.json({
      ok: true,
      ...result,
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
