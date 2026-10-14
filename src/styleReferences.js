const fs = require("fs");
const path = require("path");

// Curated reference images for style packs. They are kept in the data directory
// (private storage, ignored by Git), never in the public repository. The
// directory holds manifest.json:
//   { "images": [{ "id", "pack", "title", "file", "family", "source", "license" }] }
// where `file` is relative to the directory and `family` (optional) is a
// furniture family from src/knowledge/cuePicker.js.
const MIME_TYPES = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES = 3;

class StyleReferenceStore {
  constructor({ rootDir } = {}) {
    this.rootDir = rootDir ? path.resolve(rootDir) : "";
  }

  manifestPath() {
    return path.join(this.rootDir, "manifest.json");
  }

  list() {
    if (!this.rootDir) return [];
    try {
      const manifest = JSON.parse(fs.readFileSync(this.manifestPath(), "utf8"));
      return Array.isArray(manifest.images) ? manifest.images.filter((image) => image && image.id && image.pack && image.file) : [];
    } catch {
      return [];
    }
  }

  countByPack() {
    const counts = {};
    for (const image of this.list()) counts[image.pack] = (counts[image.pack] || 0) + 1;
    return counts;
  }

  // Up to `count` images of the pack, same furniture family first. The choice
  // rotates with `seedText` so repeated briefs do not always get the same pair.
  pick(packId, { family, count = 2, seedText = "" } = {}) {
    const images = this.list().filter((image) => image.pack === packId);
    if (!images.length) return [];
    const sameFamily = images.filter((image) => image.family && image.family === family);
    const others = images.filter((image) => !sameFamily.includes(image));
    const offset = [...String(seedText)].reduce((sum, char) => sum + char.codePointAt(0), 0);
    const rotate = (list) => (list.length ? [...list.slice(offset % list.length), ...list.slice(0, offset % list.length)] : list);
    const chosen = [...rotate(sameFamily), ...rotate(others)].slice(0, Math.min(count, MAX_IMAGES));
    return chosen.map((image) => this.read(image)).filter(Boolean);
  }

  byId(id) {
    const image = this.list().find((item) => item.id === String(id || ""));
    return image ? this.read(image) : null;
  }

  read(image) {
    const file = path.resolve(this.rootDir, image.file);
    if (!file.startsWith(`${this.rootDir}${path.sep}`)) return null;
    const mimeType = MIME_TYPES[path.extname(file).toLowerCase()];
    if (!mimeType) return null;
    try {
      const stat = fs.statSync(file);
      if (!stat.isFile() || stat.size > MAX_BYTES) return null;
      return { id: String(image.id), title: String(image.title || image.id), mimeType, bytes: fs.readFileSync(file) };
    } catch {
      return null;
    }
  }
}

module.exports = {
  StyleReferenceStore,
  MAX_IMAGES,
};
