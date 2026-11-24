const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const studioFiles = ["public/js/studio.js", ...fs.readdirSync(path.join(root, "public/js/studio")).filter(file => file.endsWith(".js")).map(file => `public/js/studio/${file}`)];
const scripts = () => studioFiles.map(read).join("\n");
const idsIn = html => new Set([...html.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]));
const getElementBindings = script => [...script.matchAll(/getElementById\("([^"]+)"\)/g)].map(match => match[1]);

test("every studio module binding resolves to a unique HTML id", () => {
  const html = read("public/studio.html");
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size, "HTML ids must be unique");
  const bindings = [...scripts().matchAll(/(?:getElementById|\$)\("([^"]+)"\)/g)].map(match => match[1]);
  assert.ok(bindings.length > 55, "cover modules as well as the entry point");
  for (const id of bindings) assert.ok(ids.includes(id), `missing #${id}`);
  for (const id of ["profileLoginForm", "profileRegisterForm", "taskEngineSelect", "configEngine", "styleSelect", "qualitySelect", "sizeSelect", "targetScore", "maxAgentRounds"]) assert.ok(ids.includes(id));
});
test("home and studio retain shared style layers and independent entry scripts", () => {
  for (const [file, css, entry] of [["index", "home", "home"], ["studio", "workbench", "studio"]]) {
    const html = read(`public/${file}.html`);
    for (const marker of [/data-site-dock/, /data-theme-toggle/, /data-locale-set="cn"/, /data-locale-set="tw"/, /data-locale-set="en"/]) assert.match(html, marker);
    const styles = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(match => match[1]);
    const expected = ["/vendor/yui/tokens.css", "/vendor/yui/components.css", `/css/${css}.css`];
    if (file === "index") expected.push("/css/home-demo.css", "/css/home-works.css");
    assert.deepEqual(styles, expected);
    styles.forEach(style => assert.ok(fs.existsSync(path.join(root, "public", style))));
    assert.match(html, new RegExp(`src="/js/${entry}\\.js"`));
  }
  assert.doesNotMatch(read("public/index.html"), /studio\.js/);
});
test("canvas starts empty and exposes generation, review, modification, comparison and export", () => {
  const html = read("public/studio.html");
  assert.match(html, /id="versionCards"><\/div>/);
  assert.match(html, /id="emptyState"/);
  for (const id of ["composer", "generateButton", "generationMode", "reviewPanel", "ringsHost", "settingsModal", "regionModal", "compareModal", "historyModal", "profileModal", "configModal", "exportButton"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /按区域描述修改/);
  assert.match(html, /不保证像素级局部重绘/);
  assert.match(scripts(), /safeImageUrl/);
  assert.match(scripts(), /const title = recordTitle\(record\);\s*return title \? escapeHtml\(title\)/);
  assert.match(scripts(), /textContent = node.prompt/);
});
test("generation uses v1 tasks, real parent IDs, auth gating and server recovery", () => {
  const script = scripts();
  assert.match(read("public/js/modules/api.js"), /const apiRoot = `\$\{origin\}\/api\/v1`/);
  assert.match(script, /request\("\/generation-tasks", payload/);
  assert.match(script, /request\("\/generation-tasks", undefined, "GET"/);
  assert.match(script, /generation-tasks\/\$\{encodeURIComponent\(task.id\)\}\/stop/);
  assert.match(script, /parentId: parent.historyId/);
  // owner() is the signed-in user, or the ?guest=1 visitor whose requests go to /guest/….
  assert.match(script, /if \(!owner\(\)\) \{ session.requireLogin/);
  assert.match(script, /const owner = \(\) => currentUser \|\| \(guest \?/);
  assert.match(script, /if \(!currentUser\?\.isAdmin\) return/);
  assert.match(script, /AuthCoordinator/);
  assert.match(script, /method = body === undefined \? "GET" : "POST"/);
  assert.match(script, /alive\(stamp\)/);
  assert.match(script, /recoverUncertain/);
  assert.match(script, /filter\(mode => !\/automatic1111\|comfyui\//);
});
test("shared theme, reduced motion and ASCII drafting remain integrated", () => {
  const dock = read("public/js/modules/dock.js");
  assert.match(dock, /try \{[\s\S]*localStorage\.getItem/);
  assert.match(dock, /const LANG = \{ cn: "zh-CN", tw: "zh-TW", en: "en" \}/);
  assert.match(dock, /html\.lang = LANG\[next\]/);
  assert.match(scripts(), /mountAsciiField/);
  assert.match(scripts(), /mountGrowthRings/);
  assert.match(scripts(), /prefers-reduced-motion: reduce/);
  assert.match(read("public/css/workbench.css"), /@media \(prefers-reduced-motion: reduce\)/);
});

test("studio composes its input and two generation modes from the shared library", () => {
  const composer = read("public/studio.html").match(/<form id="composer"[\s\S]*?<\/form>/)[0];
  for (const name of ["yui-composer", "yui-composer__body", "yui-composer__footer", "yui-textarea", "yui-segmented"]) {
    assert.ok(composer.split(/["\s]+/).includes(name), name);
  }
  for (const [mode, pressed] of [["normal", "true"], ["agent", "false"]]) {
    const button = composer.match(new RegExp('<button[^>]+data-mode="' + mode + '"[^>]*>'))[0];
    assert.match(button, /class="yui-segment"/);
    assert.ok(button.includes('aria-pressed="' + pressed + '"'));
  }
});

test("home shows one fixed ASCII hero, a scripted studio demo and hands the prompt to the studio", () => {
  const html = read("public/index.html");
  const script = read("public/js/home.js");
  const demo = read("public/js/home/demo.js");
  const ids = idsIn(html);
  for (const id of [...getElementBindings(script), ...[...demo.matchAll(/\$\("([^"]+)"\)/g)].map((m) => m[1])]) assert.ok(ids.has(id), `missing #${id} in public/index.html`);
  for (const id of ["heroPrompt", "homePrompt", "studioDemo", "demoStage", "demoSteps", "demoCompare", "demoSheet", "end-title"]) assert.ok(ids.has(id), `missing #${id}`);
  for (const step of [0, 1, 2, 3]) assert.match(html, new RegExp(`data-demo-step="${step}"`));
  for (const asset of ["hero-wide.webp", "hero-tall.webp"]) {
    assert.match(html, new RegExp(`/assets/${asset.replace(".", "\\.")}`));
    assert.ok(fs.existsSync(path.join(root, "public/assets", asset)), `missing ${asset}`);
  }
  assert.match(html, /<picture>[\s\S]*max-width: 720px/);
  assert.doesNotMatch(html + script, /making|idea-folder/);
  // The still render is always in the markup; the live field only enhances it.
  assert.match(script, /import\("\.\/modules\/ascii-field\.js"\)/);
  assert.match(script, /lens: finePointer/);
  assert.match(script, /\/studio\?prompt=\$\{encodeURIComponent/);
  // The demo plays itself: it pauses under the pointer and offers nothing to drag or type into.
  assert.match(demo, /IntersectionObserver/);
  assert.match(demo, /pointerenter/);
  assert.doesNotMatch(demo, /pointerdown|addEventListener\("input"|link\.download/);
  assert.match(read("public/css/home-demo.css"), /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(read("public/vendor/yui/fluid-motion.js"), /fluid-indicator/);
  assert.match(read("public/js/studio.js"), /get\("prompt"\)/);
});

test("login page binds both auth modes and sends the required API fields", () => {
  const html = read("public/login.html");
  const script = read("public/js/login.js");
  const ids = idsIn(html);
  const styles = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(styles, ["/vendor/yui/tokens.css", "/vendor/yui/components.css", "/css/login.css"]);
  for (const id of getElementBindings(script)) assert.ok(ids.has(id), `missing #${id} in public/login.html`);
  for (const id of ["authTitle", "displayName", "email", "password", "passwordToggle", "authMessage", "authSubmit", "authModeToggle"]) assert.ok(ids.has(id), `missing login control #${id}`);
  assert.match(html, /\/assets\/hero-tall\.webp/);
  for (const pattern of [/\/auth\/login/, /\/auth\/register/, /displayName/, /nextPath/, /location\.assign/]) assert.match(script, pattern);
});

test("home works wall pairs every ASCII draft with its photo and a prompt", () => {
  const html = read("public/index.html");
  const works = [...html.matchAll(/<figure class="work"[\s\S]*?<\/figure>/g)].map((m) => m[0]);
  assert.equal(works.length, 6);
  for (const work of works) {
    const [, name] = work.match(/\/assets\/works\/([a-z]+)-ascii\.webp/);
    assert.match(work, new RegExp(`/assets/works/${name}\\.webp`));
    assert.match(work, /<figcaption>[\s\S]*data-cn="[^"]+" data-tw="[^"]+"/);
  }
  for (const [, asset] of html.matchAll(/src="(\/assets\/[^"]+)"/g)) assert.ok(fs.existsSync(path.join(__dirname, "..", "public", asset)), `missing ${asset}`);
  assert.match(read("public/js/home.js"), /pointerdown/);
  assert.match(read("public/css/home-works.css"), /prefers-reduced-motion: reduce/);
});

test("every page uses the stump-and-sprout brand icon and the files exist", () => {
  for (const page of ["public/index.html", "public/login.html", "public/studio.html"]) {
    const html = read(page);
    assert.match(html, /<link rel="icon" href="\/assets\/brand\/musheng-icon-32\.png" type="image\/png" sizes="32x32" \/>/, page);
    assert.match(html, /<link rel="apple-touch-icon" href="\/assets\/brand\/apple-touch-icon\.png" \/>/, page);
    assert.match(html, /class="[a-z-]+brand__mark" src="\/assets\/brand\/musheng-icon-64\.png"/, page);
    assert.doesNotMatch(html, /musheng-ai-logo/, page);
  }
  for (const file of ["musheng-icon.svg", "musheng-icon-small.svg", "musheng-icon-32.png", "musheng-icon-64.png", "musheng-icon-96.png", "apple-touch-icon.png", "musheng-icon-512.png"]) assert.ok(fs.existsSync(path.join(root, "public/assets/brand", file)), file);
});

test("language switch shows the current language and first visits follow the browser", () => {
  for (const page of ["index", "login", "studio"]) assert.match(read(`public/${page}.html`), /data-locale-switch>.*data-locale-set="cn".*>中<.*data-locale-set="tw".*>繁<.*data-locale-set="en".*>EN</, page);
  const dock = read("public/js/modules/dock.js");
  assert.match(dock, /button\.dataset\.localeSet === next/);
  assert.match(dock, /localStorage\.getItem\(localeKey\) \|\| browserLocale\(\)/);
  assert.match(read("public/css/home.css"), /grid-template-columns: minmax\(0, 1fr\)/);
});

test("the component library only uses real yui-* classes and the rules document exists", () => {
  const library = read("public/lab/components.html");
  const css = read("public/vendor/yui/components.css");
  const used = new Set([...library.matchAll(/class="([^"]+)"/g)].flatMap(m => m[1].split(/\s+/)).filter(name => name.startsWith("yui-")));
  assert.ok(used.size > 40);
  for (const name of used) assert.match(css, new RegExp(`\\.${name.replace(/[-_]/g, "\\$&")}(?![\\w-])`), `components.css has no .${name}`);
  assert.match(library, /\/vendor\/yui\/tokens\.css[\s\S]*\/vendor\/yui\/components\.css/);
  const rules = read("docs/UI_RULES.md");
  for (const marker of [/内圆角 = 外圆角 − 间距/, /locale-en\.js/, /Let the layout do the explaining/]) assert.match(rules, marker);
  assert.match(read("AGENTS.md"), /docs\/UI_RULES\.md/);
});

test("public/vendor/yui is the pinned yui release, byte for byte", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.match(pkg.devDependencies["@yumi233/yui"], /^github:yumi233\/yui#v\d+\.\d+\.\d+$/);
  const dist = path.join(path.dirname(require.resolve("@yumi233/yui/package.json")), "dist");
  const files = fs.readdirSync(dist).sort();
  assert.deepEqual(fs.readdirSync(path.join(root, "public/vendor/yui")).sort(), files, "run npm run ui:sync");
  for (const file of files) assert.ok(fs.readFileSync(path.join(dist, file)).equals(fs.readFileSync(path.join(root, "public/vendor/yui", file))), `${file} differs; run npm run ui:sync`);
  assert.equal(`v${require("@yumi233/yui/package.json").version}`, pkg.devDependencies["@yumi233/yui"].split("#")[1]);
});

test("home uses yui primary buttons, scoped night inversion, inline demo note and 12-column works wall", () => {
  const html = read("public/index.html");
  const homeCss = read("public/css/home.css");
  const demoCss = read("public/css/home-demo.css");
  const worksCss = read("public/css/home-works.css");
  assert.doesNotMatch(homeCss, /#3A3A3A|#1E1E1E|#444444/);
  assert.match(homeCss, /\.home-head__links \.home-head__cta\s*\{[^}]*border-radius:\s*var\(--radius-full\)/);
  assert.match(html, /class="yui-button home-head__cta" data-variant="primary"/);
  assert.match(html, /class="yui-button yui-button--arrow" data-variant="primary"/);
  assert.match(html, /class="yui-button yui-button--arrow end__cta" data-variant="primary"/);
  assert.doesNotMatch(homeCss, /\[data-theme="night"\]\s*\.hero__art\s*\{/);
  assert.match(homeCss, /\[data-theme="night"\]\s*\.hero__art img,\s*\[data-theme="night"\]\s*\.hero__art \.ascii-field\s*\{/);
  assert.match(html, /<div class="studio-demo__head">\s*<h2[^>]*id="demo-title"[\s\S]*?<p class="demo-note">/);
  assert.match(demoCss, /\.studio-demo__head\s*\{[^}]*display:\s*flex/);
  assert.match(worksCss, /\.works__grid\s*\{[^}]*repeat\(12,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(worksCss, /\.work__media\s*\{[^}]*background:\s*var\(--art-paper\)/);
  assert.match(worksCss, /\.work:not\(:focus-within\):not\(\.is-pinned\)\s*\.work__toggle\s*\{\s*display:\s*none;\s*\}/);
});

test("studio workbench and design chat apply Batch 3 and Batch 4 tactile paper rules", () => {
  const html = read("public/studio.html");
  const css = read("public/css/workbench.css");
  const studioJs = read("public/js/studio.js");
  assert.match(html, /<header class="studio-bar"[\s\S]*?id="demoNotice"[\s\S]*?<\/header>/);
  assert.match(html, /<dialog id="designChatModal" class="studio-dialog yui-dialog design-chat-dialog"/);
  assert.match(css, /\[data-theme="night"\]\s*\.empty-artwork img\s*\{\s*filter:\s*invert\(\.9\)\s*hue-rotate\(180deg\);/);
  assert.match(css, /\.empty-artwork\s*\{[^}]*background:\s*var\(--art-paper\)/);
  assert.match(css, /\.studio-composer:focus-within\s*\{[^}]*var\(--focus-ring\)/);
  assert.doesNotMatch(css, /\.version-card\.selected\s*\{[^}]*outline-offset:\s*4px/);
  assert.match(css, /\.review-suggestions button\s*\{[^}]*border-left:\s*2px solid var\(--olive\)/);
  assert.match(css, /\.design-chat-input-shell:focus-within\s*\{[^}]*var\(--focus-ring\)/);
  assert.match(studioJs, /class="rubric-bar"/);
  assert.match(studioJs, /function centerPosition\(/);
});

test("example prompts describe furniture, never a room or a lighting scene", () => {
  const sceneWords = /茶室|晨光|阳光|靠窗|玄关|窗户|房间|客厅|书房|卧室|室内|场景|背景|公寓|庭院|花园/;
  for (const page of ["index", "studio"]) {
    const html = read(`public/${page}.html`);
    const seeds = [...html.matchAll(/data-seed="([^"]+)"/g)].map(match => match[1]);
    assert.ok(seeds.length >= 3, `${page}.html keeps its example prompts`);
    for (const prompt of seeds) assert.doesNotMatch(prompt, sceneWords, `${page}.html seed: ${prompt}`);
  }
});
