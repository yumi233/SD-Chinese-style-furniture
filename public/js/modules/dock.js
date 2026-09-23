const html = document.documentElement;
const localeKey = "musheng-locale";
const preferenceKey = "musheng-studio-preferences";
const staticCopy = [
  ["#taskEngineSelect option[value='automatic1111']", "Stable Diffusion WebUI", "Stable Diffusion WebUI"],
  ["#taskEngineSelect option[value='comfyui']", "ComfyUI", "ComfyUI"],
  ["#taskEngineSelect option[value='imageModel']", "图像大模型", "圖像大模型"],
  ["#taskEngineSelect option[value='automatic1111+imageModel']", "SD WebUI + 图像大模型", "SD WebUI + 圖像大模型"],
  ["#taskEngineSelect option[value='comfyui+imageModel']", "ComfyUI + 图像大模型", "ComfyUI + 圖像大模型"],
  ["#targetScore option", "", ""],
  ["#bestDownloadButton", "下载方案", "下載方案"],
  ["#bestRefineButton", "继续细化", "繼續細化"],
  ["#exportReportButton", "导出说明", "匯出說明"],
  ["#exportDemoButton", "演示文案", "演示文案"],
  ["#saveAgentProjectButton", "查看历史记录", "查看歷史記錄"],
  ["#refreshHistoryButton", "刷新", "刷新"],
  ["#configCancelButton", "关闭", "關閉"],
  ["#configSaveButton", "保存模型设置", "保存模型設定"],
  ["#settingsShell [data-settings-panel='general']", "通用", "通用"],
  ["#settingsShell [data-settings-panel='model']", "模型连接", "模型連接"],
  ["#settingsShell [data-settings-panel='data']", "数据与隐私", "數據與隱私"],
  ["#settingsShell [data-settings-panel='about']", "关于木生", "關於木生"],
  ["#settingsShell [data-settings-content='general'] .settings-group:first-child h3", "工作台偏好", "工作臺偏好"],
  ["#settingsShell [data-settings-content='general'] .settings-group:nth-child(2) h3:first-of-type", "显示模式", "顯示模式"],
  ["#settingsShell [data-settings-content='general'] .settings-group:nth-child(2) h3:nth-of-type(2)", "通知等级", "通知等級"],
  ["#settingsShell [data-settings-content='general'] .settings-field-row > label", "", ""],
  ["#settingsDensity [data-density='comfortable']", "舒适", "舒適"],
  ["#settingsDensity [data-density='compact']", "紧凑", "緊湊"],
  ["#settingsColorTheme [data-color-theme='wood']", "木韵", "木韻"],
  ["#settingsColorTheme [data-color-theme='ceramic']", "青瓷", "青瓷"],
  ["#settingsColorTheme [data-color-theme='ink']", "墨色", "墨色"],
  ["#settingsDisplayMode [data-display-mode='day']", "日间", "日間"],
  ["#settingsDisplayMode [data-display-mode='night']", "夜间", "夜間"],
  ["#settingsDisplayMode [data-display-mode='eye']", "护眼", "護眼"],
  ["#settingsNotificationLevel [data-notification-level='off']", "关闭", "關閉"],
  ["#settingsNotificationLevel [data-notification-level='complete']", "完成", "完成"],
  ["#settingsNotificationLevel [data-notification-level='all']", "全部", "全部"],
  ["#settingsShell [data-settings-content='model'] .config-section-title strong", "", ""],
  ["#settingsShell [data-settings-content='data'] h3", "数据与隐私", "數據與隱私"],
  ["#settingsShell [data-settings-content='data'] button", "查看历史记录", "查看歷史記錄"],
  ["#settingsShell [data-settings-content='about'] h3", "木生·AI", "木生·AI"],
  ["#profileTitle", "个人资料", "個人資料"],
  ["#profileAuthView [data-auth-mode='login']", "登录", "登入"],
  ["#profileAuthView [data-auth-mode='register']", "注册", "註冊"],
  ["#profileLoginForm button[type='submit']", "登录", "登入"],
  ["#profileRegisterForm button[type='submit']", "创建账号", "建立帳號"],
  ["#profileAccountView button[type='submit']", "保存个人资料", "保存個人資料"],
  ["#profileLogoutButton", "退出登录", "登出"],
  ["#historyModal .modal-header p:not(.eyebrow)", "记录保存在当前服务端，换浏览器后仍可查询。", "記錄保存在目前服務端，換瀏覽器後仍可查詢。"],
  ["#historyModal .history-toolbar .yui-label", "筛选", "篩選"],
  ["#params-card dt", "", ""],
];

function applyStaticCopy(locale) {
  const useTw = locale === "tw";
  staticCopy.forEach(([selector, cn, tw]) => {
    if (!cn && !tw) return;
    document.querySelectorAll(selector).forEach((element) => {
      element.textContent = useTw ? tw : cn;
    });
  });
}

function setText(element, locale) {
  const value = element.dataset[locale === "tw" ? "tw" : "cn"];
  if (value !== undefined) element.textContent = value;
  const label = element.dataset[`aria${locale === "tw" ? "Tw" : "Cn"}`];
  if (label !== undefined) element.setAttribute("aria-label", label);
  const placeholder = element.dataset[`placeholder${locale === "tw" ? "Tw" : "Cn"}`];
  if (placeholder !== undefined) element.setAttribute("placeholder", placeholder);
}

function applyLocale(locale) {
  const next = locale === "tw" ? "tw" : "cn";
  html.dataset.locale = next;
  html.lang = next === "tw" ? "zh-TW" : "zh-CN";
  try {
    localStorage.setItem(localeKey, next);
  } catch {
    // Storage may be blocked in private browsing; the current view still updates.
  }
  document.querySelectorAll("[data-cn], [data-tw], [data-placeholder-cn], [data-placeholder-tw]").forEach((element) => setText(element, next));
  applyStaticCopy(next);
  document.querySelectorAll("[data-locale-toggle]").forEach((button) => {
    button.textContent = next === "tw" ? "简体" : "繁體";
    button.setAttribute("aria-pressed", String(next === "tw"));
  });
  window.dispatchEvent(new CustomEvent("musheng:locale-change", { detail: { locale: next } }));
}

function applyTheme(theme) {
  return applyThemeWithPersistence(theme, true);
}

function applyThemeWithPersistence(theme, persist) {
  const next = theme === "night" ? "night" : "day";
  html.dataset.theme = next;
  if (persist) {
    try {
      const preferences = JSON.parse(localStorage.getItem(preferenceKey) || "{}") || {};
      preferences.displayMode = next;
      localStorage.setItem(preferenceKey, JSON.stringify(preferences));
    } catch {
      // Storage may be blocked in private browsing; the current view still updates.
    }
  }
  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    button.textContent = next === "night" ? "日间" : "夜间";
    button.setAttribute("aria-pressed", String(next === "night"));
  });
  window.dispatchEvent(new CustomEvent("musheng:theme-change", { detail: { theme: next } }));
}

export function initDock() {
  let storedTheme = "day";
  let storedLocale = "cn";
  try {
    const preferences = JSON.parse(localStorage.getItem(preferenceKey) || "{}") || {};
    storedTheme = preferences.displayMode === "night" ? "night" : "day";
    storedLocale = localStorage.getItem(localeKey) || storedLocale;
  } catch {
    // Storage may be blocked in private browsing; use the defaults.
  }
  applyThemeWithPersistence(storedTheme, false);
  applyLocale(storedLocale);
  document.querySelectorAll("[data-theme-toggle]").forEach((button) => button.addEventListener("click", () => applyTheme(html.dataset.theme === "night" ? "day" : "night")));
  document.querySelectorAll("[data-locale-toggle]").forEach((button) => button.addEventListener("click", () => applyLocale(html.dataset.locale === "tw" ? "cn" : "tw")));
  document.querySelectorAll("[data-site-dock]").forEach((root) => {
    const menu = root.querySelector("details");
    root.querySelectorAll(".yui-dock__item").forEach((item) => {
      item.addEventListener("focus", () => root.classList.add("is-focused"));
      item.addEventListener("blur", () => root.classList.remove("is-focused"));
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && menu?.open) {
        menu.open = false;
        menu.querySelector("summary")?.focus();
      }
    });
    document.addEventListener("click", (event) => {
      if (menu?.open && !menu.contains(event.target)) menu.open = false;
    });
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initDock, { once: true });
else initDock();
