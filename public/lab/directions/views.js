const works = [
  ["chair", "一把浅木小椅子，靠背薄一点", "一把淺木小椅子，靠背薄一點", "浅木小椅"],
  ["table", "一张留白的茶桌，细腿", "一張留白的茶桌，細腿", "留白茶桌"],
  ["cabinet", "两扇门的矮柜，放在玄关", "兩扇門的矮櫃，放在玄關"],
  ["daybed", "一张能午睡的矮榻，亚麻垫", "一張能午睡的矮榻，亞麻墊"],
  ["bookshelf", "四层空书架，轻一点", "四層空書架，輕一點"],
  ["stool", "圆面小凳，脚下有横枨", "圓面小凳，腳下有橫棖"],
];
const titles = {
  a: ["显影", "顯影"],
  b: ["图录", "圖錄"],
  c: ["工作台即首页", "工作臺即首頁"],
};
export const versions = [
  { src: "/assets/hero-meadow.png", alt: "第一版浅木椅" },
  { src: "/assets/chair-v2.webp", alt: "靠背更薄的第二版浅木椅" },
  { src: "/assets/works/chair.webp", alt: "浅木小椅" },
];
export const samplePrompt = "一把浅木小椅子，轻一点";

const demoCopy = "演示数据 · 不调用模型，不写入真实作品";
const poster = "/assets/brand/musheng-icon-64.png";
const sectionTitle = (title, id) => `<h2 class="section-title" id="${id}" data-ui-copy>${title}</h2>`;
const index = (number) => `<span class="yui-index">${String(number).padStart(2, "0")}</span>`;
const primary = (text, href = "") => {
  const tag = href ? "a" : "button";
  const attrs = href ? `href="${href}"` : 'type="submit"';
  return `<${tag} class="yui-button yui-button--arrow" data-variant="primary" ${attrs}><span data-ui-copy>${text}</span><span class="yui-button__arrow" aria-hidden="true">→</span></${tag}>`;
};

function header(direction, login) {
  const route = direction ? `./${direction}.html` : "./index.html";
  return `
    <a class="skip-link" href="#main" data-ui-copy>跳到主要内容</a>
    <header class="site-head column">
      <a class="brand" href="${route}" aria-label="木生首页" data-ui-attrs="aria-label"><img src="${poster}" width="32" height="32" alt="" /><span data-ui-copy>木生</span></a>
      <nav class="head-actions" aria-label="主导航" data-ui-attrs="aria-label">
        ${direction ? '<a class="yui-link direction-link" href="./index.html">A/B/C</a>' : ""}
        ${direction && !login ? `<a class="yui-link" href="./${direction}-login.html" data-ui-copy>登录</a>` : ""}
        <div class="yui-segmented locale-switch" role="group" aria-label="语言" data-ui-attrs="aria-label" data-locale-switch>
          <button class="yui-segment" type="button" data-locale-set="cn" lang="zh-CN" aria-pressed="true">中</button>
          <button class="yui-segment" type="button" data-locale-set="tw" lang="zh-TW" aria-pressed="false">繁</button>
          <button class="yui-segment" type="button" data-locale-set="en" lang="en" aria-pressed="false">EN</button>
        </div>
      </nav>
    </header>`;
}

function footer(direction) {
  return `<footer class="site-foot column">
    <div class="brand"><img src="${poster}" width="32" height="32" alt="" /><span data-ui-copy>木生·AI</span></div>
    <nav class="foot-actions" aria-label="快捷" data-ui-attrs="aria-label">
      <a class="yui-link" href="#main" data-ui-copy>顶部</a>
      <a class="yui-link" href="./${direction}-login.html" data-ui-copy>登录</a>
      <button class="yui-button" data-variant="secondary" type="button" data-theme-toggle data-ui-copy>夜间</button>
    </nav>
  </footer>`;
}

function headline() {
  return `<h1 class="headline" id="hero-title"><span data-ui-copy>一句话，</span><em data-ui-copy>长出一件家具。</em></h1>`;
}

function composer(interactive) {
  const field = interactive
    ? `<textarea id="prompt" class="yui-textarea" rows="3" data-ui-attrs="placeholder" placeholder="${samplePrompt}"></textarea>`
    : `<input id="prompt" type="text" class="yui-input" autocomplete="off" data-ui-attrs="placeholder" placeholder="${samplePrompt}" />`;
  return `<form class="prompt ${interactive ? "prompt--stack" : ""}" id="composer" action="#demo">
    <label class="${interactive ? "yui-label" : "sr-only"}" for="prompt" data-ui-copy>${interactive ? "设计描述" : "描述一件家具"}</label>
    ${field}
    ${primary(interactive ? "生成" : "开始设计")}
  </form>`;
}

function photo(src, alt = "", css = "") {
  return `<img class="${css}" src="${src}" alt="${alt}"${alt ? ' data-ui-attrs="alt"' : ""} />`;
}

function wall(develop) {
  return `<section class="page-section column" id="works" aria-labelledby="works-title">
    ${sectionTitle("都从一句话开始。", "works-title")}
    <div class="works-grid">
      ${works.map(([id, cn, tw], i) => `
        <figure class="work-tile ${develop ? "reveal" : ""}"${develop ? ' tabindex="0"' : ""}>
          <div class="work-media">
            ${develop ? `<img class="ascii" src="/assets/works/${id}-ascii.webp" width="1080" height="1350" alt="" loading="lazy" decoding="async" />` : ""}
            <img class="reveal-photo" src="/assets/works/${id}.webp" width="1080" height="1350" alt="" loading="lazy" decoding="async" />
            ${develop ? '<span class="scan" aria-hidden="true"></span>' : ""}
          </div>
          <figcaption>${index(i + 1)}<span data-cn="${cn}" data-tw="${tw}">${cn}</span></figcaption>
        </figure>`).join("")}
    </div>
  </section>`;
}

function compare() {
  return `<div class="comparison">
    <div class="comparison-media">
      ${photo(versions[1].src, "对比的第二版")}
      ${photo(versions[0].src, "对比的第一版", "comparison-before")}
      <span class="comparison-line" aria-hidden="true"><b>↔</b></span>
      <span class="comparison-label comparison-label--before yui-index">v1</span>
      <span class="comparison-label comparison-label--after yui-index">v2</span>
    </div>
    <input type="range" min="0" max="100" value="70" aria-label="分界位置" data-ui-attrs="aria-label" />
  </div>`;
}

function editStage(id, interactive = false) {
  return `<div class="edit-stage" id="${id}">
    ${photo(versions[0].src, versions[0].alt, "edit-image")}
    <span class="edit-box" aria-hidden="true"></span>
    ${interactive ? '<span class="edit-note" data-ui-copy>靠背再薄一点</span><span class="bench-loading" aria-hidden="true"></span>' : ""}
  </div>`;
}

function demo() {
  const steps = ["生成", "改一处", "对比", "导出"];
  return `<section class="page-section column" id="demo" aria-labelledby="demo-title">
    ${sectionTitle("一件作品，四个动作。", "demo-title")}
    <div class="demo-window">
      <header class="demo-bar">
        <div class="yui-segmented demo-steps" role="group" aria-label="演示步骤" data-ui-attrs="aria-label">
          ${steps.map((step, i) => `<button type="button" class="yui-segment" data-step="${i}" aria-pressed="${i === 0}" aria-controls="scene-${i}">${index(i + 1)}<span data-ui-copy>${step}</span></button>`).join("")}
        </div>
        <span class="demo-note" data-ui-copy>${demoCopy}</span>
      </header>
      <div id="scene-0" class="demo-scene demo-generate">
        <div class="demo-media">${photo(versions[0].src, versions[0].alt)}</div>
        <div class="scene-brief"><span class="yui-index">v1</span><h3 data-ui-copy>浅木小椅</h3><p><span id="demo-prompt" data-ui-copy>${samplePrompt}</span><span id="demo-user-prompt" hidden></span></p></div>
      </div>
      <div id="scene-1" class="demo-scene demo-edit" hidden>
        ${editStage("demo-edit")}
        <div class="scene-brief"><span class="yui-index">v1 → v2</span><h3 data-ui-copy>靠背再薄一点</h3>
          <div class="scene-result">${photo(versions[1].src, versions[1].alt)}</div>
        </div>
      </div>
      <div id="scene-2" class="demo-scene" hidden>${compare()}</div>
      <div id="scene-3" class="demo-scene demo-export" hidden>
        <div class="demo-media">${photo(versions[1].src, versions[1].alt)}</div>
        <div class="scene-brief"><span class="yui-index">v2 · WebP</span><h3 data-ui-copy>浅木小椅</h3>
          <a class="yui-button yui-button--arrow" data-variant="primary" href="${versions[1].src}" download="musheng-v2.webp"><span data-ui-copy>下载方案</span><span class="yui-button__arrow" aria-hidden="true">↓</span></a>
        </div>
      </div>
    </div>
  </section>`;
}

function heroA() {
  return `<section class="hero-a column" aria-labelledby="hero-title">
    <div class="hero-art reveal">
      <picture class="ascii"><source media="(max-width: 720px)" srcset="/assets/hero-tall.webp" />${photo("/assets/hero-wide.webp")}</picture>
      <picture class="reveal-photo"><source media="(max-width: 720px)" srcset="/assets/works/chair.webp" />${photo(versions[0].src, "浅木小椅")}</picture>
    </div>
    <div class="hero-copy">
      ${headline()}
      ${composer(false)}
      <div class="seeds" role="group" aria-label="试试" data-ui-attrs="aria-label">
        <button class="yui-button" data-variant="secondary" type="button" data-seed="一张留白的茶桌，胡桃木" data-ui-copy>留白茶桌</button>
        <button class="yui-button" data-variant="secondary" type="button" data-seed="靠窗的单椅，白蜡木，靠背高一点" data-ui-copy>靠窗单椅</button>
        <button class="yui-button" data-variant="secondary" type="button" data-seed="一组竹木矮柜，适合玄关" data-ui-copy>竹木矮柜</button>
      </div>
    </div>
  </section>`;
}

function catalog() {
  return `<section class="page-section column" id="works" aria-labelledby="works-title">
    <div class="catalog-heading">${sectionTitle("都从一句话开始。", "works-title")}<span class="catalog-glyph" aria-hidden="true">. : + #</span></div>
    <div class="catalog">
      ${works.map(([id, cn, tw, title], i) => `
        <article class="catalog-item twelve" id="work-${id}">
          <div class="catalog-image"><img src="/assets/works/${id}.webp" width="1080" height="1350" alt="" loading="lazy" decoding="async" /></div>
          <div class="catalog-spec">
            ${index(i + 1)}
            <h3 ${title ? "data-ui-copy" : 'class="copy-slot"'}>${title || `TODO_TEXT:${id}_name`}</h3>
            <p class="catalog-prompt" data-cn="${cn}" data-tw="${tw}">${cn}</p>
            <dl>
              <div><dt data-ui-copy>材质</dt><dd>TODO_TEXT:${id}_material</dd></div>
              <div><dt>TODO_TEXT:size</dt><dd>TODO_TEXT:${id}_dimensions</dd></div>
              <div><dt>TODO_TEXT:version</dt><dd class="yui-index">v1</dd></div>
            </dl>
          </div>
        </article>`).join("")}
    </div>
  </section>`;
}

function heroB() {
  return `<section class="hero-b column twelve" aria-labelledby="hero-title">
    <div class="hero-copy">${headline()}${composer(false)}</div>
    <figure class="catalog-cover">
      ${photo("/assets/works/chair.webp", "浅木小椅")}
      <figcaption>${index(1)}<span data-ui-copy>浅木小椅</span><a class="yui-link" href="#work-chair" data-ui-copy>查看</a></figcaption>
    </figure>
  </section>`;
}

function heroC() {
  return `<section class="hero-c column twelve" aria-labelledby="hero-title">
    <div class="hero-copy">
      ${headline()}
      ${composer(true)}
    </div>
    <div class="bench" id="bench">
      <header class="bench-bar">
        <span class="bench-name" data-ui-copy>浅木小椅</span>
        <button class="yui-button edit-toggle" data-variant="secondary" type="button" aria-pressed="true" aria-controls="bench-stage" data-ui-copy>改一处</button>
      </header>
      ${editStage("bench-stage", true)}
      <div class="version-chain" role="group" aria-label="版本对比" data-ui-attrs="aria-label">
        ${versions.map(({ src }, i) => `
          <button class="version-card" type="button" data-version="${i}" aria-pressed="${i === 0}" aria-controls="bench-stage">
            ${photo(src)}<span class="yui-index">v${i + 1}</span>
          </button>`).join("")}
      </div>
      <p class="demo-note bench-note" data-ui-copy>${demoCopy}</p>
      <span class="sr-only bench-status" role="status" data-ui-copy></span>
    </div>
  </section>`;
}

function compareSection() {
  return `<section class="page-section column" id="demo" aria-labelledby="demo-title">
    ${sectionTitle("版本对比", "demo-title")}
    <div class="compare-story twelve">
      ${compare()}
      <div class="scene-brief"><span class="yui-index">v1 → v2</span><h3 data-ui-copy>靠背再薄一点</h3></div>
    </div>
  </section>`;
}

function closing(direction) {
  return `<section class="closing column">
    <h2 data-ui-copy>从一件开始。</h2>
    ${primary("开始设计", "#hero-title")}
    <a class="yui-button" data-variant="secondary" href="./${direction}-login.html" data-ui-copy>登录</a>
  </section>`;
}

export function renderHome(direction) {
  const content = {
    a: () => heroA() + demo() + wall(true),
    b: () => heroB() + catalog() + demo(),
    c: () => heroC() + compareSection() + wall(false),
  };
  return `${header(direction, false)}<main id="main">${content[direction]()}${closing(direction)}</main>${footer(direction)}`;
}

export function renderLogin(direction) {
  return `${header(direction, true)}
    <main class="auth column" id="main">
      <section class="auth-visual" aria-labelledby="welcome-title">
        <h1 id="welcome-title" class="welcome"><span data-ui-copy>欢迎回来，</span><em data-ui-copy>继续你的作品。</em></h1>
        <figure class="auth-image">
          ${photo(direction === "a" ? "/assets/hero-tall.webp" : "/assets/works/chair.webp", direction === "a" ? "" : "浅木小椅", direction === "a" ? "ascii" : "")}
          ${direction === "b" ? `<figcaption>${index(1)}<span data-ui-copy>浅木小椅</span></figcaption>` : ""}
          ${direction === "c" ? '<figcaption><span class="yui-index">v1 → v2 → v3</span></figcaption>' : ""}
        </figure>
      </section>
      <section class="auth-panel" aria-labelledby="auth-title">
        <h2 id="auth-title" data-ui-copy>登录</h2>
        <form class="auth-form" id="auth-form" method="post" autocomplete="off">
          <label class="yui-field" id="auth-name" hidden><span class="yui-label" data-ui-copy>称呼</span><input class="yui-input" type="text" maxlength="40" /></label>
          <label class="yui-field"><span class="yui-label" data-ui-copy>邮箱</span><input class="yui-input" type="email" autocapitalize="none" spellcheck="false" required /></label>
          <div class="yui-field"><label class="yui-label" for="password" data-ui-copy>密码</label>
            <div class="password"><input class="yui-input" id="password" type="password" minlength="8" maxlength="256" required />
              <button class="yui-button" data-variant="secondary" type="button" id="show-password" aria-pressed="false" data-ui-copy>显示</button>
            </div>
          </div>
          ${primary("登录")}
        </form>
        <div class="auth-switch"><span id="auth-question" data-ui-copy>没有账号？</span> <button class="yui-link" id="auth-switch" type="button" data-ui-copy>注册</button></div>
        <p class="demo-note auth-note" role="status" data-ui-copy>演示入口不保存账号或模型设置</p>
      </section>
    </main>
    <footer class="auth-foot column"><button type="button" class="yui-link" data-theme-toggle data-ui-copy>夜间</button></footer>`;
}

export function renderIndex() {
  const covers = { a: versions[0].src, b: versions[2].src, c: versions[1].src };
  return `${header("", false)}
    <main class="column direction-index" id="main">
      <h1 data-ui-copy>木生·AI</h1>
      <div class="index-grid">
        ${Object.entries(titles).map(([id, [cn, tw]]) => `
          <article class="direction-card">
            <a class="direction-cover direction-cover--${id}" tabindex="-1" href="./${id}.html" aria-labelledby="direction-${id}">${photo(covers[id])}</a>
            <h2 id="direction-${id}"><span class="yui-index">${id.toUpperCase()}</span><span data-cn="${cn}" data-tw="${tw}" data-en="TODO_TEXT:direction_${id}">${cn}</span></h2>
            <div class="index-actions">${primary("查看", `./${id}.html`)}<a class="yui-button" data-variant="secondary" href="./${id}-login.html" data-ui-copy>登录</a></div>
          </article>`).join("")}
      </div>
      <button class="yui-link index-theme" type="button" data-theme-toggle data-ui-copy>夜间</button>
    </main>`;
}
