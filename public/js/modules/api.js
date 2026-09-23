const origin = window.location.protocol === "file:" ? "http://127.0.0.1:3000" : window.location.origin;
const apiRoot = `${origin}/api/v1`;

export class ApiError extends Error {
  constructor(message, status = 0, payload = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    const message = response.status === 401
      ? "请先登录后再继续。"
      : response.status === 403
        ? "当前账号没有执行此操作的权限。"
        : payload.message || `请求失败（${response.status}）`;
    throw new ApiError(message, response.status, payload);
  }
  return payload;
}

export async function apiFetch(path, options = {}) {
  const suffix = String(path).startsWith("/") ? path : `/${path}`;
  return fetch(`${apiRoot}${suffix}`, {
    credentials: "same-origin",
    ...options,
  });
}

export async function apiJson(path, options = {}) {
  return parseResponse(await apiFetch(path, options));
}

export function jsonOptions(body, options = {}) {
  return {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: JSON.stringify(body),
  };
}

export function safeImageUrl(value, { allowData = false } = {}) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("data:")) {
    return allowData && /^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(raw) ? raw : "";
  }
  try {
    const url = new URL(raw, window.location.href);
    const allowed = ["http:", "https:", "blob:"];
    return allowed.includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}
