const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

class HistoryStore {
  constructor(options = {}) {
    this.rootDir = path.resolve(options.rootDir || path.join(process.cwd(), "data", "history"));
    this.imagesDir = path.join(this.rootDir, "images");
    this.indexFile = path.join(this.rootDir, "records.json");
    fs.mkdirSync(this.imagesDir, { recursive: true });
    if (!fs.existsSync(this.indexFile)) {
      this.writeRecords([]);
    }
  }

  list(limit = 100) {
    const normalizedLimit = Math.max(1, Math.min(500, Number(limit) || 100));
    return this.readRecords()
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, normalizedLimit);
  }

  get(id) {
    return this.readRecords().find((record) => record.id === id) || null;
  }

  async saveGeneration(request, result) {
    const id = crypto.randomUUID();
    const images = await this.persistImages(id, result.images || []);
    const record = {
      id,
      type: "generation",
      createdAt: new Date().toISOString(),
      title: buildTitle(request.originalPrompt || result.request?.originalPrompt || result.request?.prompt),
      originalPrompt: String(request.originalPrompt || result.request?.originalPrompt || "").trim(),
      finalPrompt: String(result.request?.prompt || request.prompt || "").trim(),
      style: result.request?.style || request.style || "",
      quality: result.request?.quality || request.quality || "",
      size: result.request?.size || request.size || null,
      mood: result.request?.mood ?? request.mood ?? null,
      engine: result.engine || request.engine || "",
      engines: result.engines || [],
      bestScore: null,
      images,
      rounds: [],
      referenceCases: result.referenceCases || request.referenceCases || [],
      compliance: buildComplianceRecord(request, result),
    };
    this.prependRecord(record);
    return {
      record,
      result: {
        ...result,
        images,
      },
    };
  }

  async saveAgent(request, result) {
    const id = crypto.randomUUID();
    const rounds = [];

    for (const round of result.rounds || []) {
      const [image] = await this.persistImages(id, [round.image], `round-${round.round}`);
      rounds.push({
        round: round.round,
        prompt: round.prompt,
        image,
        engines: round.engines || [],
        errors: round.errors || [],
        evaluation: round.evaluation || null,
      });
    }

    const bestRound = rounds.find((round) => round.round === result.bestRound) || rounds[0] || null;
    const images = rounds.map((round) => round.image).filter(Boolean);
    const record = {
      id,
      type: "agent",
      createdAt: new Date().toISOString(),
      title: buildTitle(request.originalPrompt || request.prompt),
      originalPrompt: String(request.originalPrompt || "").trim(),
      finalPrompt: String(result.finalPrompt || request.prompt || "").trim(),
      style: request.style || "",
      quality: request.quality || "",
      size: request.size || null,
      mood: request.mood ?? null,
      engine: request.engine || "",
      engines: [...new Set(rounds.flatMap((round) => round.engines))],
      targetScore: result.targetScore,
      bestScore: result.bestScore,
      bestRound: result.bestRound,
      bestEvaluation: result.bestEvaluation,
      images,
      rounds,
      referenceCases: result.referenceCases || request.referenceCases || [],
      compliance: buildComplianceRecord(request, result),
    };
    this.prependRecord(record);
    return {
      record,
      result: {
        ...result,
        rounds,
        bestImage: bestRound?.image || null,
      },
    };
  }

  delete(id) {
    const records = this.readRecords();
    const record = records.find((item) => item.id === id);
    if (!record) {
      return false;
    }

    for (const image of record.images || []) {
      const filename = historyFilename(image?.url);
      if (!filename) {
        continue;
      }
      const target = path.join(this.imagesDir, filename);
      if (path.dirname(target) === this.imagesDir && fs.existsSync(target)) {
        fs.rmSync(target, { force: true });
      }
    }

    this.writeRecords(records.filter((item) => item.id !== id));
    return true;
  }

  resolveAsset(filename) {
    const safeName = path.basename(String(filename || ""));
    if (!safeName || safeName !== filename) {
      return null;
    }
    const target = path.join(this.imagesDir, safeName);
    return fs.existsSync(target) ? target : null;
  }

  async persistImages(recordId, images, prefix = "image") {
    const persisted = [];
    let index = 0;
    for (const image of images || []) {
      if (!image?.url) {
        continue;
      }
      index += 1;
      try {
        persisted.push(await this.persistImage(recordId, image, `${prefix}-${index}`));
      } catch (error) {
        persisted.push({
          ...image,
          persistenceError: error.message || "image persistence failed",
        });
      }
    }
    return persisted;
  }

  async persistImage(recordId, image, suffix) {
    const source = String(image.url || "");
    let buffer;
    let mimeType = image.mimeType || "image/png";

    if (source.startsWith("data:")) {
      const match = source.match(/^data:([^;,]+);base64,(.+)$/s);
      if (!match) {
        throw new Error("Unsupported image data URL.");
      }
      mimeType = match[1] || mimeType;
      buffer = Buffer.from(match[2], "base64");
    } else if (/^https?:\/\//i.test(source)) {
      const response = await fetch(source);
      if (!response.ok) {
        throw new Error(`Unable to download generated image: ${response.status}`);
      }
      mimeType = response.headers.get("content-type") || mimeType;
      buffer = Buffer.from(await response.arrayBuffer());
    } else if (source.startsWith("/api/history/assets/")) {
      return { ...image };
    } else {
      throw new Error("Unsupported generated image URL.");
    }

    const extension = extensionForMime(mimeType);
    const filename = `${recordId}-${suffix}${extension}`;
    fs.writeFileSync(path.join(this.imagesDir, filename), buffer);
    return {
      ...image,
      mimeType,
      url: `/api/history/assets/${filename}`,
    };
  }

  prependRecord(record) {
    const records = this.readRecords();
    records.unshift(record);
    this.writeRecords(records.slice(0, 500));
  }

  readRecords() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.indexFile, "utf8"));
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  writeRecords(records) {
    fs.writeFileSync(this.indexFile, `${JSON.stringify(records, null, 2)}\n`, "utf8");
  }
}

function buildComplianceRecord(request, result = {}) {
  const engines = result.engines || request.engines || (request.engine ? [request.engine] : []);
  const bestEvaluation = result.bestEvaluation || null;
  const visionModel = bestEvaluation?.metadata?.model;
  const modelUse = [
    engines.length ? `生成引擎：${[...new Set(engines)].join("、")}` : "",
    visionModel ? `视觉评审模型：${visionModel}` : "",
  ].filter(Boolean);

  return {
    sourceNote: String(request.sourceNote || "").trim(),
    aiDisclosure:
      String(request.aiDisclosure || "").trim() ||
      "本作品包含 AI 生成内容，提交和展示时应明示标识。",
    modelUse,
    generatedAt: new Date().toISOString(),
  };
}

function buildTitle(prompt) {
  const normalized = String(prompt || "").replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, 42) : "未命名家具方案";
}

function extensionForMime(mimeType) {
  const normalized = String(mimeType || "").toLowerCase();
  if (normalized.includes("jpeg") || normalized.includes("jpg")) {
    return ".jpg";
  }
  if (normalized.includes("webp")) {
    return ".webp";
  }
  return ".png";
}

function historyFilename(url) {
  const prefix = "/api/history/assets/";
  const normalized = String(url || "");
  return normalized.startsWith(prefix) ? path.basename(normalized.slice(prefix.length)) : null;
}

module.exports = {
  HistoryStore,
  buildTitle,
  extensionForMime,
};
