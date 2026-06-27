const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createImageGateway } = require("../src/imageGateway");
const { CONFIG_KEYS, ModelConfigStore, normalizeConfig } = require("../src/modelConfigStore");

test("model config store persists local API settings and normalizes defaults", (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "huazuo-model-config-"));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const configPath = path.join(tmpDir, "config.local.json");
  const store = new ModelConfigStore({
    filePath: configPath,
    defaults: {
      textModelEnabled: "true",
      textModelBaseUrl: " https://api.example.com/v1 ",
      textModelApiKey: "default-secret",
      imageModelSize: "512x512",
    },
  });

  const initial = store.load();
  assert.equal(fs.existsSync(configPath), true);
  assert.equal(initial.textModelEnabled, true);
  assert.equal(initial.textModelBaseUrl, "https://api.example.com/v1");
  assert.equal(initial.textModelApiKey, "default-secret");

  store.save({
    ...initial,
    defaultEngine: "imageModel",
    textModelApiKey: "saved-text-secret",
    imageModelApiKey: "saved-image-secret",
    visionModelApiKey: "saved-vision-secret",
  });

  const reloaded = new ModelConfigStore({ filePath: configPath }).load();
  assert.equal(reloaded.defaultEngine, "imageModel");
  assert.equal(reloaded.textModelApiKey, "saved-text-secret");
  assert.equal(reloaded.imageModelApiKey, "saved-image-secret");
  assert.equal(reloaded.visionModelApiKey, "saved-vision-secret");

  const raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
  assert.deepEqual(Object.keys(raw), CONFIG_KEYS);
});

test("model config store accepts UTF-8 BOM JSON files", (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "huazuo-model-config-bom-"));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const configPath = path.join(tmpDir, "config.local.json");
  fs.writeFileSync(
    configPath,
    `\uFEFF${JSON.stringify({ defaultEngine: "comfyui", imageModelSize: "1280x720" })}`,
    "utf8",
  );

  const loaded = new ModelConfigStore({ filePath: configPath }).load();
  assert.equal(loaded.defaultEngine, "comfyui");
  assert.equal(loaded.imageModelSize, "1280x720");
});
test("gateway keeps secrets in runtime config while public config is redacted", () => {
  const gateway = createImageGateway(
    normalizeConfig({
      textModelApiKey: "text-secret",
      imageModelApiKey: "image-secret",
      visionModelApiKey: "vision-secret",
    }),
  );

  const runtimeConfig = gateway.getRuntimeConfig();
  assert.equal(runtimeConfig.textModelApiKey, "text-secret");
  assert.equal(runtimeConfig.imageModelApiKey, "image-secret");
  assert.equal(runtimeConfig.visionModelApiKey, "vision-secret");

  const publicConfig = gateway.getConfig();
  assert.equal(publicConfig.textModelApiKeyConfigured, true);
  assert.equal(publicConfig.imageModelApiKeyConfigured, true);
  assert.equal(publicConfig.visionModelApiKeyConfigured, true);
  assert.equal(Object.hasOwn(publicConfig, "textModelApiKey"), false);
  assert.equal(Object.hasOwn(publicConfig, "imageModelApiKey"), false);
  assert.equal(Object.hasOwn(publicConfig, "visionModelApiKey"), false);
});
