const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
// Imported by file URL so the module can load its English dictionary next to it.
const modulePromise = import(pathToFileURL(path.join(__dirname, "../public/js/modules/locale.js")).href);
test("product labels use traditional copy without changing Latin model names or version numbers", async () => {
  const { traditionalCopy } = await modulePromise;
  assert.equal(traditionalCopy("登录 · 生成设置 · 在线图像模型 · 修改 v12"), "登入 · 生成設定 · 線上圖像模型 · 修改 v12");
  assert.equal(traditionalCopy("宋韵 · 禅意 · 白蜡木 · 密钥"), "宋韻 · 禪意 · 白蠟木 · 密鑰");
  assert.equal(traditionalCopy("作品 · PNG · codexCli · 16:9 · 720p"), "作品 · PNG · codexCli · 16:9 · 720p");
});
test("locale toggles restore original product copy and keep unmarked user content unchanged", async () => {
  const { refreshLocaleCopy } = await modulePromise;
  const text = { nodeType: 3, nodeValue: "生成设置" };
  const user = { nodeType: 3, nodeValue: "我的设计" };
  const element = { matches: () => false, childNodes: [text] };
  const placeholder = { dataset: { uiAttrs: "placeholder" }, value: "我的设计", placeholder: "设计描述", getAttribute(key) { return this[key]; }, setAttribute(key, value) { this[key] = value; } };
  global.document = { documentElement: { dataset: { locale: "tw" } } };
  const root = { querySelectorAll: selector => selector === "[data-ui-copy]" ? [element] : [placeholder] };
  try {
    refreshLocaleCopy(root); refreshLocaleCopy(root);
    assert.equal(text.nodeValue, "生成設定"); assert.equal(placeholder.placeholder, "設計描述");
    assert.equal(placeholder.value, "我的设计"); assert.equal(user.nodeValue, "我的设计");
    document.documentElement.dataset.locale = "cn"; refreshLocaleCopy(root);
    assert.equal(text.nodeValue, "生成设置"); assert.equal(placeholder.placeholder, "设计描述");
    text.nodeValue = "正在创建账号";
    document.documentElement.dataset.locale = "tw"; refreshLocaleCopy(root);
    assert.equal(text.nodeValue, "正在創建帳號");
  } finally { delete global.document; }
});

test("English copy translates product labels, numbered messages and keeps user text", async () => {
  const { englishCopy } = await modulePromise;
  assert.equal(englishCopy("开始设计"), "Start designing");
  assert.equal(englishCopy(" 关闭 "), " Close ");
  assert.equal(englishCopy("修改 v12"), "Edit v12");
  assert.equal(englishCopy("剩 3"), "3 left");
  assert.equal(englishCopy("出图 · 第 2 轮 · 正在取消"), "Rendering · round 2 · Cancelling");
  assert.equal(englishCopy("本小时生成次数已用完，约 7 分钟后恢复"), "No generations left this hour; resets in about 7 min");
  assert.equal(englishCopy("删除我的圈椅"), "Delete 我的圈椅");
  assert.equal(englishCopy("作品 · PNG · codexCli · 16:9"), "Works · PNG · codexCli · 16:9");
  assert.equal(englishCopy("用户写的椅子描述"), "用户写的椅子描述");
});

test("every marked product string has an English entry", () => {
  const dictionary = fs.readFileSync(path.join(__dirname, "../public/js/modules/locale-en.js"), "utf8");
  for (const page of ["index", "login", "studio"]) {
    const html = fs.readFileSync(path.join(__dirname, `../public/${page}.html`), "utf8");
    for (const [, cn] of html.matchAll(/data-cn="([^"]+)"/g)) assert.ok(dictionary.includes(`"${cn}"`), `${page}.html: missing English for ${cn}`);
  }
});
