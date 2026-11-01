// Only explicitly marked product copy is translated. User names, briefs, model
// suggestions and saved titles are never walked or rewritten.
const pairs = [
  ["登录", "登入"], ["账号", "帳號"], ["设置", "設定"], ["在线", "線上"],
  ["软件", "軟體"], ["信息", "資訊"], ["默认", "預設"], ["后台", "後臺"],
];
const characterPairs = "资資 韵韻 禅禪 蜡蠟 钥鑰 于於 盘盤 话話 长長 开開 设設 计計 单單 柜櫃 个個 动動 对對 导導 浅淺 结結 构構 艺藝 创創 欢歡 继繼 续續 邮郵 码碼 显顯 隐隱 注註 册冊 称稱 误誤 请請 后後 试試 连連 时時 检檢 网網 络絡 错錯 频頻 体體 间間 数數 风風 评評 审審 锁鎖 忆憶 质質 约約 负負 词詞 轮輪 标標 围圍 细細 准準 图圖 线線 处處 来來 载載 缩縮 选選 区區 将將 语語 带帶 进進 证證 级級 绘繪 较較 叠疊 并並 关關 闭閉 帐帳 号號 头頭 传傳 删刪 筛篩 暂暫 还還 没沒 录錄 断斷 键鍵 复復 旧舊 换換 实實 远遠 仅僅 汉漢 发發 过過 为為 与與 从從 轻輕 点點 宽寬 扩擴 满滿 让讓 这這 页頁 据據 态態 额額 类類 获獲 随隨 气氣 顶頂 确確 读讀 写寫 权權 务務 启啟 无無 蓝藍 块塊 览覽 别別 总總 台臺 应應 达達 条條 见見 补補 败敗 树樹 样樣 稳穩 声聲 参參 项項 顾顧 验驗 认認 联聯 响響 转轉 圆圓 节節 闪閃 烁爍 记記 询詢 云雲 变變 库庫 组組 边邊 画畫 书書 帧幀 减減 帘簾 辑輯 锐銳 弹彈 层層 译譯 说說 现現 静靜 驱驅 临臨 余餘 双雙 释釋 内內 报報 备備 择擇 议議 历歷 统統 厅廳 制製 强強 听聽 颜顏 灯燈 横橫 纵縱 齐齊 侧側 当當 独獨 归歸 肤膚 护護 极極 许許 测測 识識 队隊 尝嘗 虑慮 尽盡 松鬆 拟擬 则則 广廣";
const characters = new Map(characterPairs.split(" ").map(pair => [...pair]));
export function traditionalCopy(value) {
  let text = String(value);
  for (const [cn, tw] of pairs) text = text.replaceAll(cn, tw);
  return [...text].map(char => characters.get(char) || char).join("");
}
export const uiCopy = value => document.documentElement.dataset.locale === "tw" ? traditionalCopy(value) : value;
const sources = new WeakMap();
function copy(target, key, value, tw) {
  let entries = sources.get(target);
  if (!entries) { entries = new Map(); sources.set(target, entries); }
  let entry = entries.get(key);
  if (!entry || value !== entry.output) entry = { source: value };
  entry.output = tw ? traditionalCopy(entry.source) : entry.source;
  entries.set(key, entry);
  return entry.output;
}
export function refreshLocaleCopy(root = document) {
  const tw = document.documentElement.dataset.locale === "tw";
  for (const element of root.querySelectorAll("[data-ui-copy]")) {
    if (element.matches("input, textarea")) continue;
    for (const node of element.childNodes) {
      if (node.nodeType !== 3) continue;
      const next = copy(node, "text", node.nodeValue, tw);
      if (next !== node.nodeValue) node.nodeValue = next;
    }
  }
  for (const element of root.querySelectorAll("[data-ui-attrs]")) {
    for (const key of element.dataset.uiAttrs.split(" ")) {
      const value = element.getAttribute(key);
      if (value == null) continue;
      const next = copy(element, key, value, tw);
      if (next !== value) element.setAttribute(key, next);
    }
  }
}
if (typeof document !== "undefined") {
  new MutationObserver(() => refreshLocaleCopy()).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["placeholder", "aria-label", "title"] });
}
