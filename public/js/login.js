import "./modules/dock.js";

const form = document.getElementById("authForm");
const title = document.getElementById("authTitle");
const submitButton = document.getElementById("authSubmit");
const modeToggle = document.getElementById("authModeToggle");
const switchText = document.getElementById("authSwitchText");
const nameField = document.getElementById("nameField");
const displayName = document.getElementById("displayName");
const email = document.getElementById("email");
const password = document.getElementById("password");
const passwordToggle = document.getElementById("passwordToggle");
const message = document.getElementById("authMessage");
const nextPath = safeNextPath(new URLSearchParams(window.location.search).get("next"));
let mode = "login";
let pending = false;

function safeNextPath(value) {
  try {
    const target = new URL(value || "/studio", window.location.origin);
    if (target.origin !== window.location.origin || target.pathname === "/login" || target.pathname === "/login.html") {
      return "/studio";
    }
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "/studio";
  }
}

function setMessage(value = "", tone = "") {
  message.textContent = value;
  message.dataset.tone = tone;
}

function setPending(next) {
  pending = next;
  form.setAttribute("aria-busy", String(next));
  submitButton.disabled = next;
  submitButton.textContent = next
    ? mode === "login" ? "正在登录…" : "正在创建…"
    : mode === "login" ? "登录" : "创建账号";
}

function setMode(nextMode, { focus = true } = {}) {
  mode = nextMode === "register" ? "register" : "login";
  const registering = mode === "register";
  title.textContent = registering ? "注册" : "登录";
  submitButton.textContent = registering ? "创建账号" : "登录";
  switchText.textContent = registering ? "已有账号？" : "没有账号？";
  modeToggle.textContent = registering ? "登录" : "注册";
  nameField.hidden = !registering;
  displayName.required = registering;
  email.autocomplete = registering ? "email" : "username";
  password.autocomplete = registering ? "new-password" : "current-password";
  form.action = registering ? "/api/v1/auth/register" : "/api/v1/auth/login";
  setMessage();
  if (focus) (registering ? displayName : email).focus();
}

modeToggle.addEventListener("click", () => {
  setMode(mode === "login" ? "register" : "login");
});

passwordToggle.addEventListener("click", () => {
  const show = password.type === "password";
  password.type = show ? "text" : "password";
  passwordToggle.textContent = show ? "隐藏" : "显示";
  passwordToggle.setAttribute("aria-pressed", String(show));
  password.focus({ preventScroll: true });
});

for (const input of [displayName, email, password]) {
  input.addEventListener("input", () => {
    input.removeAttribute("aria-invalid");
    if (message.textContent) setMessage();
  });
}

async function authRequest(path, payload) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`/api/v1${path}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ok === false) {
      if (response.status === 401) {
        const error = new Error("邮箱或密码不正确。");
        error.status = 401;
        throw error;
      }
      if (response.status === 429) {
        const seconds = response.headers.get("Retry-After") || "60";
        const error = new Error(`尝试过于频繁，请 ${seconds} 秒后重试。`);
        error.status = 429;
        throw error;
      }
      const error = new Error(body.message || "账号请求失败，请稍后重试。");
      error.status = response.status;
      throw error;
    }
    return body;
  } finally {
    window.clearTimeout(timeout);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (pending) return;
  setMessage();
  if (!form.reportValidity()) return;

  const registering = mode === "register";
  const payload = registering
    ? {
      displayName: displayName.value.trim(),
      email: email.value.trim(),
      password: password.value,
    }
    : {
      email: email.value.trim(),
      password: password.value,
    };

  setPending(true);
  try {
    await authRequest(registering ? "/auth/register" : "/auth/login", payload);
    setMessage(registering ? "账号已创建，正在进入工作台。" : "登录成功，正在进入工作台。", "success");
    window.location.assign(nextPath);
  } catch (error) {
    if (error.name === "AbortError") {
      setMessage("连接超时，请检查网络后重试。", "error");
    } else if (error instanceof TypeError) {
      setMessage("无法连接服务器，请稍后重试。", "error");
    } else {
      setMessage(error.message || "账号请求失败，请稍后重试。", "error");
    }
    if (error.status === 401) {
      email.setAttribute("aria-invalid", "true");
      password.setAttribute("aria-invalid", "true");
      password.focus();
    }
  } finally {
    setPending(false);
  }
});

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", () => reject(new Error("主视觉素材读取失败")), { once: true });
    image.src = source;
  });
}

window.mushengLogin = {
  getMode: () => mode,
  nextPath,
};

requestAnimationFrame(() => {
  document.body.dataset.ready = "true";
});
