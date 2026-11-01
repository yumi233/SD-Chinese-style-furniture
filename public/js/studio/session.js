import { AuthCoordinator } from "../modules/auth-coordinator.js";
import { uiCopy } from "../modules/locale.js";
import { openDialog } from "./dialog-focus.js";

export function initSession({ request, onUser, notify }) {
  const $ = id => document.getElementById(id);
  let currentUser = null, revision = 0;
  const auth = new AuthCoordinator(pending => {
    for (const button of $("profileModal").querySelectorAll("button, input")) button.disabled = pending;
  });
  function showUser(user) {
    revision += 1; currentUser = user;
    $("userProfileButton").textContent = user?.displayName || uiCopy("登录");
    $("profileLoginForm").hidden = Boolean(user);
    $("profileRegisterForm").hidden = true;
    $("authTabs").hidden = Boolean(user);
    $("profileAccountView").hidden = !user;
    $("profileEmail").textContent = user?.email || "";
    $("profileAccountView").elements.displayName.value = user?.displayName || "";
    $("profileAvatarInput").value = "";
    $("modelConfigButton").hidden = !user?.isAdmin;
    $("modelFields").replaceChildren();
    $("configForm").reset();
    $("configModal").close();
    onUser(user);
  }
  window.addEventListener("musheng:locale-change", () => { $("userProfileButton").textContent = currentUser?.displayName || uiCopy("登录"); });
  const run = async (action, success) => {
    if (auth.pending) return;
    try {
      await auth.write(action);
      $("profileMessage").textContent = success;
    } catch (error) { $("profileMessage").textContent = error.message; }
  };
  $("userProfileButton").addEventListener("click", event => openDialog($("profileModal"), event.currentTarget));
  $("authTabs").addEventListener("click", event => {
    const mode = event.target.closest("[data-auth-mode]")?.dataset.authMode;
    if (!mode) return;
    $("profileLoginForm").hidden = mode !== "login";
    $("profileRegisterForm").hidden = mode !== "register";
    for (const button of $("authTabs").querySelectorAll("button")) button.setAttribute("aria-pressed", String(button.dataset.authMode === mode));
    $("profileMessage").textContent = "";
  });
  for (const [id, path] of [["profileLoginForm", "/auth/login"], ["profileRegisterForm", "/auth/register"]]) {
    $(id).addEventListener("submit", event => {
      event.preventDefault();
      const body = Object.fromEntries(new FormData(event.currentTarget));
      run(async () => {
        await request(path, body);
        // Confirm the HttpOnly session really reached the server before loading private data.
        const confirmed = await request("/auth/me");
        if (!confirmed.user?.id) throw new Error("会话未生效，请检查浏览器 Cookie 设置后重试");
        showUser(confirmed.user); $(id).reset(); $("profileModal").close();
      }, "已登录");
    });
  }
  $("profileLogoutButton").addEventListener("click", () => run(async () => {
    await request("/auth/logout", {}); showUser(null);
  }, "已退出登录"));
  $("profileAccountView").addEventListener("submit", event => {
    event.preventDefault();
    run(async () => {
      const body = { displayName: $("profileAccountView").elements.displayName.value };
      const file = $("profileAvatarInput").files?.[0];
      if (file) {
        if (file.size > 1024 * 1024 || !/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("头像请使用 1 MB 以内的 PNG、JPEG 或 WebP");
        body.avatarDataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error("头像读取失败")); reader.readAsDataURL(file);
        });
      }
      const { user } = await request("/auth/profile", body, "PATCH");
      // Profile updates do not reload or erase the canvas.
      currentUser = user; $("userProfileButton").textContent = user.displayName;
      $("profileAvatarInput").value = "";
    }, "个人资料已保存");
  });
  const fields = [
    ["textModelBaseUrl", "文字模型地址"], ["textModelName", "文字模型名称"], ["textModelApiKey", "文字模型密钥"],
    ["imageModelBaseUrl", "图像模型地址"], ["imageModelName", "图像模型名称"], ["imageModelSize", "图像模型尺寸"], ["imageModelApiKey", "图像模型密钥"],
    ["visionModelBaseUrl", "视觉模型地址"], ["visionModelName", "视觉模型名称"], ["visionModelApiKey", "视觉模型密钥"],
  ];
  $("modelConfigButton").addEventListener("click", async () => {
    if (!currentUser?.isAdmin) return;
    const stamp = revision;
    openDialog($("configModal"), $("modelConfigButton")); $("configStatus").textContent = "读取中…";
    try {
      const { config } = await request("/config");
      if (stamp !== revision || !currentUser?.isAdmin) return;
      const root = $("modelFields"); root.replaceChildren();
      for (const [name, text] of fields) {
        const label = document.createElement("label"); label.textContent = text; label.dataset.uiCopy = "";
        const input = document.createElement("input"); input.name = name;
        const secret = name.endsWith("ApiKey"); input.type = secret ? "password" : "text";
        input.value = secret ? "" : config[name] || "";
        if (secret) { input.autocomplete = "new-password"; input.placeholder = config[`${name}Configured`] ? "已配置，留空则保留" : "留空则保留现有密钥"; }
        label.append(input); root.append(label);
      }
      $("configEngine").value = config.defaultEngine;
      $("configForm").elements.textModelEnabled.value = String(Boolean(config.textModelEnabled));
      $("configStatus").textContent = "";
    } catch (error) { $("configStatus").textContent = error.message; }
  });
  $("configForm").addEventListener("submit", async event => {
    event.preventDefault();
    if (!currentUser?.isAdmin) return;
    const stamp = revision; const button = event.submitter; button.disabled = true;
    try {
      const body = Object.fromEntries(new FormData($("configForm"))); body.textModelEnabled = body.textModelEnabled === "true";
      await request("/config", body);
      if (stamp !== revision) return;
      $("configModal").close(); $("configForm").querySelectorAll('input[type="password"]').forEach(input => { input.value = ""; });
      notify("模型设置已保存");
    } catch (error) { if (stamp === revision) $("configStatus").textContent = error.message; }
    finally { button.disabled = false; }
  });
  return {
    async refresh() {
      try {
        const result = await auth.read(() => request("/auth/me"));
        if (result) showUser(result.user || null);
      } catch (error) { notify(error.message); }
    },
    requireLogin() { openDialog($("profileModal"), $("generateButton")); $("profileMessage").textContent = "登录后继续，设计描述已保留。"; },
  };
}
