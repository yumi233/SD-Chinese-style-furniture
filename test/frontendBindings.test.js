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
    const expected = ["/ui/tokens.css", "/ui/components.css", `/css/${css}.css`];
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
  assert.match(scripts(), /escapeHtml\(node.record.title/);
  assert.match(scripts(), /textContent = node.prompt/);
});
test("generation uses v1 tasks, real parent IDs, auth gating and server recovery", () => {
  const script = scripts();
  assert.match(read("public/js/modules/api.js"), /const apiRoot = `\$\{origin\}\/api\/v1`/);
  assert.match(script, /request\("\/generation-tasks", payload/);
  assert.match(script, /request\("\/generation-tasks", undefined, "GET"/);
  assert.match(script, /generation-tasks\/\$\{encodeURIComponent\(task.id\)\}\/stop/);
  assert.match(script, /parentId: parent.historyId/);
  assert.match(script, /if \(!currentUser\) \{ session.requireLogin/);
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
  assert.match(read("public/css/workbench.css"), /28 - inset 8 =/);
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
  assert.match(read("public/js/modules/fluid-motion.js"), /fluid-indicator/);
  assert.match(read("public/js/studio.js"), /get\("prompt"\)/);
});

test("login page binds both auth modes and sends the required API fields", () => {
  const html = read("public/login.html");
  const script = read("public/js/login.js");
  const ids = idsIn(html);
  const styles = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(styles, ["/ui/tokens.css", "/ui/components.css", "/css/login.css"]);
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

test("every page uses the ASCII 木-chair brand icon and the files exist", () => {
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
  const css = read("public/ui/components.css");
  const used = new Set([...library.matchAll(/class="([^"]+)"/g)].flatMap(m => m[1].split(/\s+/)).filter(name => name.startsWith("yui-")));
  assert.ok(used.size > 40);
  for (const name of used) assert.match(css, new RegExp(`\\.${name.replace(/[-_]/g, "\\$&")}(?![\\w-])`), `components.css has no .${name}`);
  assert.match(library, /\/ui\/tokens\.css[\s\S]*\/ui\/components\.css/);
  const rules = read("docs/UI_RULES.md");
  for (const marker of [/内圆角 = 外圆角 − 间距/, /locale-en\.js/, /Let the layout do the explaining/]) assert.match(rules, marker);
  assert.match(read("AGENTS.md"), /docs\/UI_RULES\.md/);
});
