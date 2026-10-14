const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { familyFor } = require("./knowledge/cuePicker");
const { CONCEPTS, findEnConcepts, findZhConcepts } = require("./design/concepts");

// Reference images and documents a user uploads for their own designs. Each
// account has its own directory (named by a hash of the account id) and index;
// nothing here is listed publicly or added to the shared library unless the
// user explicitly does so. Text inside uploads is reference data only: it is
// never run, and only ever reaches a model inside a block marked untrusted.
const PURPOSES = {
  silhouette: "轮廓参考",
  material: "材质参考",
  structure: "结构参考",
  atmosphere: "氛围参考",
};
const IMAGE_TYPES = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp" };
const DOCUMENT_TYPES = { "text/plain": ".txt", "text/markdown": ".md", "application/pdf": ".pdf" };
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_BYTES = 200 * 1024;
// The JSON body limit is 10 MB, so base64 uploads stay below it.
const MAX_PDF_BYTES = 6 * 1024 * 1024;
const MAX_ITEMS = 60;
const ID = /^[a-f0-9-]{36}$/;
const MATERIAL_IDS = Object.entries(CONCEPTS).filter(([, concept]) => concept.group === "material").map(([id]) => id);

class UserReferenceStore {
  constructor({ rootDir }) {
    this.rootDir = path.resolve(rootDir);
    fs.mkdirSync(this.rootDir, { recursive: true, mode: 0o700 });
  }

  dir(ownerId) {
    if (!ownerId) throw referenceError(401, "请先登录");
    const folder = path.join(this.rootDir, crypto.createHash("sha256").update(String(ownerId)).digest("hex").slice(0, 32));
    fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
    return folder;
  }

  index(ownerId) {
    try {
      const items = JSON.parse(fs.readFileSync(path.join(this.dir(ownerId), "index.json"), "utf8"));
      return Array.isArray(items) ? items : [];
    } catch {
      return [];
    }
  }

  writeIndex(ownerId, items) {
    const destination = path.join(this.dir(ownerId), "index.json");
    const temporary = `${destination}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(items, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, destination);
  }

  list(ownerId) {
    return this.index(ownerId).map(publicItem);
  }

  get(ownerId, id) {
    return this.index(ownerId).find((item) => item.id === id) || null;
  }

  add(ownerId, { filename, mimeType, data, title, purposes, note } = {}) {
    const items = this.index(ownerId);
    if (items.length >= MAX_ITEMS) throw referenceError(409, `参考资料最多 ${MAX_ITEMS} 份，请先删除不用的`);
    const type = String(mimeType || "").toLowerCase();
    const kind = IMAGE_TYPES[type] ? "image" : DOCUMENT_TYPES[type] ? "document" : null;
    if (!kind) throw referenceError(415, "只支持 PNG、JPG、WebP 图片，以及 TXT、Markdown、PDF 文档");
    const base64 = String(data || "").replace(/^data:[^;,]+;base64,/, "");
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw referenceError(400, "文件内容无效");
    const bytes = Buffer.from(base64, "base64");
    const limit = kind === "image" ? MAX_IMAGE_BYTES : type === "application/pdf" ? MAX_PDF_BYTES : MAX_TEXT_BYTES;
    if (!bytes.length || bytes.length > limit) throw referenceError(413, `文件过大（上限 ${Math.round(limit / 1024 / 1024 * 10) / 10} MB）`);
    if (kind === "image" && !imageHeaderMatches(type, bytes)) throw referenceError(415, "图片格式与内容不符");
    if (type === "application/pdf" && bytes.subarray(0, 5).toString("latin1") !== "%PDF-") throw referenceError(415, "PDF 内容无效");
    const text = type.startsWith("text/") ? bytes.toString("utf8").replace(/\u0000/g, "") : "";

    const id = crypto.randomUUID();
    const extension = IMAGE_TYPES[type] || DOCUMENT_TYPES[type];
    fs.writeFileSync(path.join(this.dir(ownerId), `${id}${extension}`), bytes, { mode: 0o600 });
    const safeTitle = cleanText(title || path.basename(String(filename || "参考资料"), path.extname(String(filename || ""))), 80) || "参考资料";
    const annotation = autoAnnotate({ kind, title: safeTitle, filename, note, text });
    const item = {
      id,
      kind,
      mimeType: type,
      file: `${id}${extension}`,
      size: bytes.length,
      title: safeTitle,
      note: cleanText(note, 500),
      purposes: normalizePurposes(purposes).length ? normalizePurposes(purposes) : annotation.purposes,
      category: annotation.category,
      materials: annotation.materials,
      annotation: { source: "auto", basis: annotation.basis },
      textPreview: text ? cleanText(text, 1500) : "",
      parsed: type === "application/pdf" ? false : true,
      createdAt: new Date().toISOString(),
      visibility: "private",
    };
    items.unshift(item);
    this.writeIndex(ownerId, items);
    return publicItem(item);
  }

  // The user corrects the automatic annotation; the result is marked as theirs.
  update(ownerId, id, patch = {}) {
    const items = this.index(ownerId);
    const item = items.find((candidate) => candidate.id === id);
    if (!item) throw referenceError(404, "参考资料不存在");
    if (patch.title !== undefined) item.title = cleanText(patch.title, 80) || item.title;
    if (patch.note !== undefined) item.note = cleanText(patch.note, 500);
    if (patch.purposes !== undefined) item.purposes = normalizePurposes(patch.purposes);
    if (patch.category !== undefined) item.category = ["seat", "bench", "table", "cabinet", "screen", "stool", "bed", "other"].includes(patch.category) ? patch.category : item.category;
    if (patch.materials !== undefined) item.materials = (Array.isArray(patch.materials) ? patch.materials : []).filter((value) => MATERIAL_IDS.includes(value));
    item.annotation = { source: "user", basis: "用户修改" };
    this.writeIndex(ownerId, items);
    return publicItem(item);
  }

  remove(ownerId, id) {
    const items = this.index(ownerId);
    const item = items.find((candidate) => candidate.id === id);
    if (!item) return false;
    fs.rmSync(path.join(this.dir(ownerId), item.file), { force: true });
    this.writeIndex(ownerId, items.filter((candidate) => candidate.id !== id));
    return true;
  }

  filePath(ownerId, id) {
    if (!ID.test(String(id || ""))) return null;
    const item = this.get(ownerId, id);
    if (!item) return null;
    const file = path.join(this.dir(ownerId), path.basename(item.file));
    return fs.existsSync(file) ? { file, item } : null;
  }

  readImage(ownerId, id) {
    const found = this.filePath(ownerId, id);
    if (!found || found.item.kind !== "image") return null;
    return { id, title: found.item.title, mimeType: found.item.mimeType, bytes: fs.readFileSync(found.file), purposes: found.item.purposes, materials: found.item.materials, category: found.item.category };
  }
}

function publicItem(item) {
  const { file, ...rest } = item;
  return { ...rest, purposeLabels: (item.purposes || []).map((purpose) => PURPOSES[purpose]) };
}

function normalizePurposes(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(String).filter((purpose) => PURPOSES[purpose]))];
}

// Keywords only: the basis is stated so the user knows what to correct.
function autoAnnotate({ kind, title, filename, note, text }) {
  const haystack = [title, filename, note, String(text || "").slice(0, 4000)].join(" ");
  const family = familyFor(haystack).name;
  const materials = [...new Set([
    ...findZhConcepts(haystack).map((found) => found.id),
    ...findEnConcepts(haystack).positive,
  ].filter((id) => MATERIAL_IDS.includes(id)))];
  const purposes = [];
  if (kind === "image") purposes.push("silhouette");
  if (materials.length) purposes.push("material");
  if (/榫卯|结构|节点|连接|joint|structure/i.test(haystack)) purposes.push("structure");
  if (/氛围|场景|空间|光|interior|mood|atmosphere/i.test(haystack)) purposes.push("atmosphere");
  return {
    category: family,
    materials,
    purposes: [...new Set(purposes)].slice(0, 3),
    basis: "根据文件名、说明和文档文字中的关键词自动判断，可能不准确，请核对",
  };
}

function cleanText(value, limit) {
  return String(value || "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function imageHeaderMatches(type, bytes) {
  if (type === "image/png") return bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (type === "image/jpeg") return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/webp") return bytes.length > 12 && bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP";
  return false;
}

function referenceError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicMessage = message;
  return error;
}

module.exports = {
  PURPOSES,
  UserReferenceStore,
  autoAnnotate,
};
