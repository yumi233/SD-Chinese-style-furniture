const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// A design session keeps one piece of furniture across versions: the locked
// brief, the locked direction (and earlier directions), and every version with
// its image, prompt, model, references and evaluation. Sessions are private to
// their owner and stored next to history, so results can be reproduced and
// problems investigated.
const ID = /^[a-f0-9-]{36}$/;
const MAX_VERSIONS = 40;

class DesignSessionStore {
  constructor({ rootDir }) {
    this.rootDir = path.resolve(rootDir);
    fs.mkdirSync(this.rootDir, { recursive: true, mode: 0o700 });
  }

  file(id) {
    return path.join(this.rootDir, `${id}.json`);
  }

  get(id, ownerId) {
    if (!ID.test(String(id || ""))) return null;
    try {
      const session = JSON.parse(fs.readFileSync(this.file(id), "utf8"));
      return session.ownerId === ownerId ? session : null;
    } catch {
      return null;
    }
  }

  create(ownerId, { brief, direction }) {
    const now = new Date().toISOString();
    const session = { id: crypto.randomUUID(), ownerId, createdAt: now, updatedAt: now, brief, direction, directions: [direction], versions: [], activeVersion: null };
    this.write(session);
    return session;
  }

  update(id, ownerId, change) {
    const session = this.get(id, ownerId);
    if (!session) return null;
    change(session);
    session.updatedAt = new Date().toISOString();
    this.write(session);
    return session;
  }

  setDirection(id, ownerId, direction, brief) {
    return this.update(id, ownerId, (session) => {
      session.direction = direction;
      if (brief) session.brief = brief;
      if (!session.directions.some((item) => item.id === direction.id && item.variation === direction.variation)) session.directions.push(direction);
      session.directions = session.directions.slice(-12);
    });
  }

  addVersion(id, ownerId, version) {
    let added = null;
    this.update(id, ownerId, (session) => {
      added = { ...version, version: (session.versions.at(-1)?.version || 0) + 1, createdAt: new Date().toISOString() };
      session.versions.push(added);
      session.versions = session.versions.slice(-MAX_VERSIONS);
      session.activeVersion = added.version;
    });
    return added;
  }

  // Restoring an earlier version makes it the base for the next refinement;
  // nothing is deleted.
  restore(id, ownerId, versionNumber) {
    return this.update(id, ownerId, (session) => {
      const version = session.versions.find((item) => item.version === Number(versionNumber));
      if (!version) throw Object.assign(new Error("版本不存在"), { statusCode: 404 });
      session.activeVersion = version.version;
      if (version.direction) session.direction = version.direction;
    });
  }

  list(ownerId, limit = 20) {
    const sessions = [];
    for (const name of fs.readdirSync(this.rootDir).filter((file) => /^[a-f0-9-]{36}\.json$/.test(file))) {
      const session = this.get(name.replace(/\.json$/, ""), ownerId);
      if (session) sessions.push({ id: session.id, title: session.brief?.source?.slice(0, 42) || "未命名方案", updatedAt: session.updatedAt, versions: session.versions.length });
    }
    return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit);
  }

  write(session) {
    const destination = this.file(session.id);
    const temporary = `${destination}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(session), { mode: 0o600 });
    fs.renameSync(temporary, destination);
  }
}

module.exports = {
  DesignSessionStore,
};
