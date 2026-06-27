const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { HistoryStore } = require("../src/historyStore");

test("history records and generated images survive store recreation", async (t) => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "musheng-history-"));
  t.after(() => {
    const resolved = path.resolve(rootDir);
    if (resolved.startsWith(path.resolve(os.tmpdir()))) {
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  });

  const store = new HistoryStore({ rootDir });
  const saved = await store.saveGeneration(
    {
      originalPrompt: "一张黑胡桃木明式圈椅",
      prompt: "black walnut Ming chair",
      style: "ming",
      quality: "hd",
      size: 512,
      engine: "automatic1111",
    },
    {
      engine: "automatic1111",
      engines: ["automatic1111"],
      request: {
        prompt: "black walnut Ming chair",
        originalPrompt: "一张黑胡桃木明式圈椅",
        style: "ming",
        quality: "hd",
        size: 512,
      },
      images: [
        {
          engine: "automatic1111",
          mimeType: "image/png",
          url: `data:image/png;base64,${Buffer.from("persisted-image").toString("base64")}`,
        },
      ],
    },
  );

  assert.match(saved.result.images[0].url, /^\/api\/history\/assets\//);
  assert.equal(store.list().length, 1);

  const recreatedStore = new HistoryStore({ rootDir });
  const record = recreatedStore.get(saved.record.id);
  assert.equal(record.originalPrompt, "一张黑胡桃木明式圈椅");
  assert.equal(record.images.length, 1);

  const filename = path.basename(record.images[0].url);
  const asset = recreatedStore.resolveAsset(filename);
  assert.equal(fs.readFileSync(asset, "utf8"), "persisted-image");

  assert.equal(recreatedStore.delete(record.id), true);
  assert.equal(recreatedStore.list().length, 0);
  assert.equal(fs.existsSync(asset), false);
});

test("agent history stores teaching references and compliance metadata", async (t) => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "musheng-agent-history-"));
  t.after(() => {
    const resolved = path.resolve(rootDir);
    if (resolved.startsWith(path.resolve(os.tmpdir()))) {
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  });

  const store = new HistoryStore({ rootDir });
  const saved = await store.saveAgent(
    {
      originalPrompt: "设计一张明式圈椅",
      prompt: "ming chair prompt",
      style: "ming",
      quality: "hd",
      size: 512,
      engine: "automatic1111",
      sourceNote: "参考课程案例库，未使用外部素材。",
      aiDisclosure: "本作品图像由生成式 AI 辅助生成，文字说明由人工审核。",
    },
    {
      targetScore: 85,
      bestScore: 90,
      bestRound: 1,
      finalPrompt: "final prompt",
      referenceCases: [{ title: "明式圈椅", category: "经典形制" }],
      bestEvaluation: {
        score: 90,
        metadata: { model: "vision-model" },
      },
      rounds: [
        {
          round: 1,
          prompt: "final prompt",
          engines: ["automatic1111"],
          image: {
            engine: "automatic1111",
            mimeType: "image/png",
            url: `data:image/png;base64,${Buffer.from("agent-image").toString("base64")}`,
          },
          evaluation: { score: 90 },
        },
      ],
    },
  );

  assert.equal(saved.record.referenceCases[0].title, "明式圈椅");
  assert.equal(saved.record.compliance.sourceNote, "参考课程案例库，未使用外部素材。");
  assert.equal(saved.record.compliance.aiDisclosure, "本作品图像由生成式 AI 辅助生成，文字说明由人工审核。");
  assert.ok(saved.record.compliance.modelUse.some((item) => item.includes("automatic1111")));
  assert.ok(saved.record.compliance.modelUse.some((item) => item.includes("vision-model")));
});
