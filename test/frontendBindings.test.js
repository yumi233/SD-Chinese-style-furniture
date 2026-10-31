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
test("home and studio retain three style layers and independent entry scripts", () => {
  for (const [file, css, entry] of [["index", "home", "home"], ["studio", "workbench", "studio"]]) {
    const html = read(`public/${file}.html`);
    for (const marker of [/data-site-dock/, /data-theme-toggle/, /data-locale-toggle/]) assert.match(html, marker);
    const styles = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(match => match[1]);
    const field = file === "index" ? ["/ui/ascii-field.css"] : [];
    assert.deepEqual(styles, ["/ui/tokens.css", "/ui/components.css", ...field, `/css/${css}.css`]);
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
  assert.match(dock, /html\.lang = next === "tw" \? "zh-TW" : "zh-CN"/);
  assert.match(scripts(), /mountAsciiField/);
  assert.match(scripts(), /mountGrowthRings/);
  assert.match(scripts(), /prefers-reduced-motion: reduce/);
  assert.match(read("public/css/workbench.css"), /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(read("public/css/workbench.css"), /28 - inset 8 =/);
});

test("home uses the paper hero and exposes the interactive v3 sections", () => {
  const html = read("public/index.html");
  const script = read("public/js/home.js");
  const css = read("public/css/home.css");
  const ids = idsIn(html);
  const bindings = getElementBindings(script);

  for (const id of bindings) assert.ok(ids.has(id), `missing #${id} in public/index.html`);
  for (const id of [
    "heroField",
    "homePrompt",
    "one-by-one",
    "granularityRange",
    "disintegrateRange",
    "cropFrame",
    "refineButton",
    "growthRings",
    "end-title",
  ]) {
    assert.ok(ids.has(id), `missing home interaction #${id}`);
  }
  assert.match(script, /\/assets\/hero-meadow\.png/);
  assert.match(script, /look: "paper"/);
  assert.match(script, /titleZone:/);
  assert.match(script, /drift: true/);
  assert.match(script, /ripple: true/);
  assert.match(script, /studioPromptUrl/);
  assert.match(script, /data-step-filter/);
  assert.match(script, /refineDither/);
  assert.match(script, /IntersectionObserver/);
  assert.match(script, /prefers-reduced-motion/);
  assert.match(html, /data-step-filter="ascii"/);
  assert.match(html, /data-step-filter="dither"/);
  assert.match(html, /id="growthRings"/);
  assert.doesNotMatch(html, /making|idea-folder|productPreview|landingCase/);
  assert.match(css, /\.home-hero__visual/);
  assert.match(css, /\.growth-ring/);
});

test("login page binds both auth modes and sends the required API fields", () => {
  const html = read("public/login.html");
  const script = read("public/js/login.js");
  const css = read("public/css/login.css");
  const ids = idsIn(html);
  const bindings = getElementBindings(script);
  const styles = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((match) => match[1]);

  assert.deepEqual(styles, ["/ui/tokens.css", "/ui/components.css", "/ui/ascii-field.css", "/css/login.css"]);
  for (const file of styles) assert.ok(fs.existsSync(path.join(root, "public", file)), `missing stylesheet ${file}`);
  for (const id of bindings) assert.ok(ids.has(id), `missing #${id} in public/login.html`);
  for (const id of ["authTitle", "displayName", "email", "password", "passwordToggle", "authMessage", "authSubmit", "authModeToggle"]) {
    assert.ok(ids.has(id), `missing login control #${id}`);
  }
  assert.match(html, /src="\/js\/login\.js"/);
  assert.match(script, /\/auth\/login/);
  assert.match(script, /\/auth\/register/);
  assert.match(script, /displayName/);
  assert.match(script, /email/);
  assert.match(script, /password/);
  assert.match(script, /nextPath/);
  assert.match(script, /location\.assign/);
  assert.match(css, /@media \(max-width: 800px\)/);
  assert.match(css, /height: 32svh/);
  assert.doesNotMatch(html, /brand-tokens|fluid|materials|studio-theme|idea-folder/);
});
