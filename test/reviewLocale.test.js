const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { normalizeLiveEvaluation } = require("../src/providers/visionModel");
const { reviewScriptConverter } = require("../src/lib/reviewLocale");

const openccModules = ["opencc-js", "opencc-js/t2cn", "opencc-js/cn2t"];

function loadedOpenccModules() {
  return openccModules.filter(name => require.cache[require.resolve(name)]);
}

test("the production app can start and serve liveness without loading OpenCC", t => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "musheng-review-startup-"));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  execFileSync(process.execPath, ["-e", `
    const assert = require("node:assert/strict");
    const { app } = require("./server");
    const server = app.listen(0, "127.0.0.1", async () => {
      try {
        const response = await fetch("http://127.0.0.1:" + server.address().port + "/api/v1/live");
        assert.deepEqual(await response.json(), { ok: true });
        for (const name of ${JSON.stringify(openccModules)}) {
          assert.equal(require.cache[require.resolve(name)], undefined, name);
        }
      } finally {
        server.close();
        server.closeAllConnections();
      }
    });
  `], {
    cwd: path.join(__dirname, ".."),
    env: {
      HISTORY_DATA_DIR: path.join(tempRoot, "history"),
      MODEL_CONFIG_FILE: path.join(tempRoot, "models.json"),
      USER_DATA_FILE: path.join(tempRoot, "users.json"),
    },
    timeout: 10000,
  });
});

test("English review feedback passes through without loading any OpenCC dictionary", () => {
  const highlight = "A curved brace joins the seat frame of 圈椅-04.";
  const highlightEvidence = {
    position: "left rear leg", formChange: "curved brace", visibleUse: "supports the seat frame",
  };
  const evaluation = normalizeLiveEvaluation({ highlight, highlightEvidence }, "chair", [], "en");
  assert.equal(evaluation.highlight, highlight);
  assert.deepEqual(evaluation.highlightEvidence, highlightEvidence);
  assert.deepEqual(loadedOpenccModules(), []);
});

test("Chinese feedback loads only the dictionary for its script when it contains Han text", () => {
  const simplified = reviewScriptConverter("cn");
  const traditional = reviewScriptConverter("tw");
  assert.equal(simplified("Oak-04"), "Oak-04");
  assert.equal(traditional(""), "");
  assert.deepEqual(loadedOpenccModules(), []);

  assert.equal(simplified("畫面左側的後腿"), "画面左侧的后腿");
  assert.deepEqual(loadedOpenccModules(), ["opencc-js/t2cn"]);
  assert.equal(reviewScriptConverter("cn")("連接座框"), "连接座框");
  assert.deepEqual(loadedOpenccModules(), ["opencc-js/t2cn"]);

  assert.equal(traditional("画面左侧的后腿"), "畫面左側的後腿");
  assert.deepEqual(loadedOpenccModules(), ["opencc-js/t2cn", "opencc-js/cn2t"]);
});
