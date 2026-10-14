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

  list(limit = 100, ownerId, options = {}) {
    const normalizedLimit = Math.max(1, Math.min(500, Number(limit) || 100));
    const records = this.readRecords().filter((record) => {
      if (ownerId === undefined || ownerId === null) {
        return true;
      }
      if (options.isAdmin) {
        return true;
      }
      return record.ownerId === ownerId;
    });
    return records
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, normalizedLimit);
  }

  get(id) {
    return this.readRecords().find((record) => record.id === id) || null;
  }

  async saveGeneration(request, result, options = {}) {
    const id = crypto.randomUUID();
    const images = await this.persistImages(id, result.images || []);
    const record = {
      id,
      type: "generation",
      ownerId: options.ownerId || null,
      createdAt: new Date().toISOString(),
      title: buildTitle(request.originalPrompt || result.request?.originalPrompt || result.request?.prompt),
      originalPrompt: String(request.originalPrompt || result.request?.originalPrompt || "").trim(),
      finalPrompt: String(result.request?.prompt || request.prompt || "").trim(),
      style: result.request?.style || request.style || "",
      quality: result.request?.quality || request.quality || "",
      size: result.request?.size || request.size || null,
      mood: result.request?.mood ?? request.mood ?? null,
      modernity: result.request?.modernity ?? request.modernity ?? null,
      stylePack: result.request?.stylePack || request.stylePack || "",
      negativePrompt: String(
        result.request?.negativePrompt || request.negativePrompt || "",
      ).trim(),
      seed: result.request?.seed ?? request.seed ?? null,
      engine: result.engine || request.engine || "",
      engines: result.engines || [],
      bestScore: null,
      images,
      rounds: [],
      views: result.views || undefined,
      referenceCases: result.referenceCases || request.referenceCases || [],
      design: designRecord(result),
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

  async saveAgent(request, result, options = {}) {
    const id = options.id || crypto.randomUUID();
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
        corrections: round.corrections || [],
        design: round.design ? { sentImages: round.design.sentImages, removedFromPrompt: round.design.removedFromPrompt, model: round.design.model } : undefined,
      });
    }

    const bestRound = rounds.find((round) => round.round === result.bestRound) || rounds[0] || null;
    const images = rounds.map((round) => round.image).filter(Boolean);
    const record = {
      id,
      type: "agent",
      ownerId: options.ownerId || null,
      createdAt: new Date().toISOString(),
      title: buildTitle(request.originalPrompt || request.prompt),
      originalPrompt: String(request.originalPrompt || "").trim(),
      finalPrompt: String(result.finalPrompt || request.prompt || "").trim(),
      style: request.style || "",
      quality: request.quality || "",
      size: request.size || null,
      mood: request.mood ?? null,
      modernity: request.modernity ?? null,
      stylePack: request.stylePack || "",
      negativePrompt: String(request.negativePrompt || "").trim(),
      seed: request.seed ?? null,
      engine: request.engine || "",
      engines: [...new Set(rounds.flatMap((round) => round.engines))],
      targetScore: result.targetScore ?? request.targetScore,
      maxRounds: result.maxRounds ?? request.maxRounds,
      bestScore: result.bestScore,
      bestRound: result.bestRound,
      bestEvaluation: result.bestEvaluation,
      stopReason: result.stopReason || null,
      images,
      rounds,
      referenceCases: result.referenceCases || request.referenceCases || [],
      design: designRecord(result),
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

  resolveAssetForUser(filename, user) {
    const assetPath = this.resolveAsset(filename);
    if (!assetPath || !user) {
      return null;
    }
    const normalizedFilename = path.basename(String(filename || ""));
    const ownsAsset = this.readRecords().some((record) => {
      const permitted = user.isAdmin || record.ownerId === user.id;
      if (!permitted) {
        return false;
      }
      return (record.images || []).some((image) => historyFilename(image?.url) === normalizedFilename);
    });
    return ownsAsset ? assetPath : null;
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
        const failure = new Error("图片已生成，但保存失败；请管理员检查存储后重试");
        failure.code = "IMAGE_PERSISTENCE";
        failure.statusCode = 507;
        throw failure;
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
    const records = this.readRecords().filter(item => item.id !== record.id);
    records.unshift(record);
    this.writeRecords(records.slice(0, 500));
  }

  readRecords() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.indexFile, "utf8"));
      if (!Array.isArray(parsed)) {
        throw new Error("History records must be an array.");
      }
      return parsed;
    } catch (error) {
      const wrapped = new Error("History records file is invalid or unreadable.");
      wrapped.cause = error;
      throw wrapped;
    }
  }

  writeRecords(records) {
    const serialized = `${JSON.stringify(records, null, 2)}\n`;
    const tempPath = `${this.indexFile}.${process.pid}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(tempPath, serialized, { encoding: "utf8", mode: 0o600 });
    fs.renameSync(tempPath, this.indexFile);
    try {
      fs.chmodSync(this.indexFile, 0o600);
    } catch {
      // Keep the atomic replacement portable across local filesystems.
    }
  }
}

// What is needed to reproduce or investigate a result: the locked brief, the
// direction, references and their purposes, what was removed from the prompt
// and the model actually used.
function designRecord(result = {}) {
  const design = result.design;
  if (!design) return null;
  return {
    brief: design.brief || null,
    direction: design.direction || null,
    references: design.references || [],
    referenceAdjustments: design.referenceAdjustments || [],
    sentImages: design.sentImages || [],
    removedFromPrompt: design.removedFromPrompt || [],
    model: design.model || null,
  };
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
  const normalized = String(url || "");
  const prefixes = ["/api/history/assets/", "/api/v1/history/assets/"];
  const prefix = prefixes.find((item) => normalized.startsWith(item));
  return prefix ? path.basename(normalized.slice(prefix.length)) : null;
}

module.exports = {
  HistoryStore,
  buildTitle,
  extensionForMime,
};
