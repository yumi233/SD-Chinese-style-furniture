const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../public/js/modules/locale.js"), "utf8");
const modulePromise = import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
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
