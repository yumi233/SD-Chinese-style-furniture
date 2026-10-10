const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { promisify } = require("util");

const scrypt = promisify(crypto.scrypt);
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_PASSWORD_LENGTH = 256;

class UserStore {
  constructor(options = {}) {
    this.filePath = path.resolve(
      options.filePath || path.join(process.cwd(), "data", "users", "users.json"),
    );
    this.adminUserIds = new Set(
      (options.adminUserIds || [])
        .map((id) => String(id || "").trim())
        .filter(Boolean),
    );
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (!fs.existsSync(this.filePath)) {
      this.write({ users: [], sessions: [] });
    }
  }

  async register(input = {}) {
    const email = normalizeEmail(input.email);
    const password = String(input.password || "");
    validateCredentials(email, password);
    const displayName = normalizeName(input.displayName || email.split("@")[0]);

    // Hashing is intentionally done before the final read. The latest state is
    // then checked synchronously so concurrent registrations cannot overwrite a
    // user added while scrypt was running.
    const passwordHash = await hashPassword(password);
    const state = this.read();
    if (state.users.some((user) => user.email === email)) {
      throw userInputError("该邮箱已注册，请直接登录");
    }

    const now = new Date().toISOString();
    const user = {
      id: crypto.randomUUID(),
      email,
      displayName,
      avatarDataUrl: "",
      passwordHash,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
    };
    state.users.push(user);
    const session = this.addSession(state, user.id);
    this.write(state);
    return {
      user: this.publicUser(user),
      token: session.token,
      expiresAt: session.expiresAt,
    };
  }

  async login(input = {}) {
    const email = normalizeEmail(input.email);
    const password = String(input.password || "");
    if (!isValidEmail(email) || password.length > MAX_PASSWORD_LENGTH) {
      throw userInputError("邮箱或密码不正确", 401);
    }

    const initialState = this.read();
    const initialUser = initialState.users.find((item) => item.email === email);
    if (!initialUser || !(await verifyPassword(password, initialUser.passwordHash))) {
      throw userInputError("邮箱或密码不正确", 401);
    }

    // Password verification yields to the event loop. Re-read before the
    // commit so a concurrent registration/profile update/logout is retained.
    // If the password hash changed while verification was running, reject this
    // stale login rather than overwriting the newer account state.
    const state = this.read();
    const user = state.users.find((item) => item.id === initialUser.id);
    if (!user || !samePasswordHash(user.passwordHash, initialUser.passwordHash)) {
      throw userInputError("邮箱或密码不正确", 401);
    }
    const now = new Date().toISOString();
    user.lastLoginAt = now;
    user.updatedAt = now;
    const session = this.addSession(state, user.id);
    this.write(state);
    return {
      user: this.publicUser(user),
      token: session.token,
      expiresAt: session.expiresAt,
    };
  }

  getUserByToken(token) {
    const normalizedToken = String(token || "").trim();
    if (!normalizedToken) {
      return null;
    }

    const state = this.read();
    const tokenHash = hashToken(normalizedToken);
    const session = state.sessions.find((item) => {
      if (new Date(item.expiresAt).getTime() <= Date.now()) {
        return false;
      }
      if (item.tokenHash) {
        return timingSafeEqualText(item.tokenHash, tokenHash);
      }
      // Sessions written by the first auth implementation stored the raw token.
      // Accept them during migration; newly written sessions are always hashed.
      return item.token === normalizedToken;
    });
    const user = session ? state.users.find((item) => item.id === session.userId) : null;
    return this.publicUser(user);
  }

  updateProfile(userId, input = {}) {
    const state = this.read();
    const user = state.users.find((item) => item.id === userId);
    if (!user) {
      throw userInputError("用户不存在", 404);
    }
    if (input.displayName !== undefined) {
      user.displayName = normalizeName(input.displayName);
    }
    if (input.avatarDataUrl !== undefined) {
      user.avatarDataUrl = normalizeAvatar(input.avatarDataUrl);
    }
    user.updatedAt = new Date().toISOString();
    this.write(state);
    return this.publicUser(user);
  }

  logout(token) {
    const normalizedToken = String(token || "").trim();
    if (!normalizedToken) {
      return;
    }
    const tokenHash = hashToken(normalizedToken);
    const state = this.read();
    state.sessions = state.sessions.filter((item) => {
      const matches = item.tokenHash
        ? timingSafeEqualText(item.tokenHash, tokenHash)
        : item.token === normalizedToken;
      return !matches && new Date(item.expiresAt).getTime() > Date.now();
    });
    this.write(state);
  }

  addSession(state, userId) {
    const token = crypto.randomBytes(32).toString("base64url");
    const session = {
      tokenHash: hashToken(token),
      userId,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    };
    state.sessions = state.sessions.filter(
      (item) => new Date(item.expiresAt).getTime() > Date.now(),
    );
    state.sessions.push(session);
    return { ...session, token };
  }

  publicUser(user) {
    return publicUser(user, this.adminUserIds);
  }

  findUserIdByEmail(email) {
    const normalizedEmail = normalizeEmail(email);
    const user = this.read().users.find((item) => item.email === normalizedEmail);
    return user?.id || null;
  }

  read() {
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
    } catch (error) {
      const wrapped = new Error("用户数据文件无法读取或不是有效 JSON");
      wrapped.cause = error;
      throw wrapped;
    }
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.users) || !Array.isArray(parsed.sessions)) {
      throw new Error("用户数据文件结构无效");
    }
    return parsed;
  }

  write(value) {
    const serialized = `${JSON.stringify(value, null, 2)}\n`;
    const tempPath = `${this.filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(tempPath, serialized, { encoding: "utf8", mode: 0o600 });
    fs.renameSync(tempPath, this.filePath);
    try {
      fs.chmodSync(this.filePath, 0o600);
    } catch {
      // Some filesystems do not expose chmod; the atomic replacement remains valid.
    }
  }
}

function userInputError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

function validateCredentials(email, password) {
  if (!isValidEmail(email)) {
    throw userInputError("请输入有效的邮箱地址");
  }
  if (password.length < 8) {
    throw userInputError("密码至少需要 8 个字符");
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw userInputError(`密码不能超过 ${MAX_PASSWORD_LENGTH} 个字符`);
  }
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const hash = (await scrypt(password, salt, 64)).toString("base64url");
  return { salt, hash };
}

async function verifyPassword(password, saved = {}) {
  if (!saved.salt || !saved.hash) {
    return false;
  }
  try {
    const hash = Buffer.from(await scrypt(password, saved.salt, 64));
    const expected = Buffer.from(saved.hash, "base64url");
    return hash.length === expected.length && crypto.timingSafeEqual(hash, expected);
  } catch {
    return false;
  }
}

function samePasswordHash(left = {}, right = {}) {
  return left.salt === right.salt && left.hash === right.hash;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("base64url");
}

function timingSafeEqualText(left, right) {
  const first = Buffer.from(String(left || ""));
  const second = Buffer.from(String(right || ""));
  return first.length === second.length && crypto.timingSafeEqual(first, second);
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeName(value) {
  const name = String(value || "").trim().replace(/\s+/g, " ").slice(0, 40);
  if (!name) {
    throw userInputError("请输入显示名称");
  }
  return name;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeAvatar(value) {
  const avatar = String(value || "");
  if (!avatar) {
    return "";
  }
  if (
    !/^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(avatar) ||
    avatar.length > 1_400_000
  ) {
    throw userInputError("头像需为 1MB 以内的 PNG、JPG、WebP 或 GIF 图片");
  }
  return avatar;
}

function publicUser(user, adminUserIds = new Set()) {
  if (!user) {
    return null;
  }
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarDataUrl: user.avatarDataUrl || "",
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    isAdmin: adminUserIds.has(user.id),
  };
}

module.exports = {
  MAX_PASSWORD_LENGTH,
  SESSION_TTL_MS,
  UserStore,
  hashToken,
  normalizeEmail,
  publicUser,
};
