const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function idsIn(html) {
  return new Set([...html.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]));
}

function getElementBindings(script) {
  return [...script.matchAll(/getElementById\("([^"]+)"\)/g)].map((match) => match[1]);
}

test("studio script bindings resolve against the independent studio DOM", () => {
  const html = read("public/studio.html");
  const script = read("public/js/studio.js");
  const ids = idsIn(html);
  const bindings = getElementBindings(script);

  for (const id of bindings) {
    assert.ok(ids.has(id), `missing #${id} in public/studio.html`);
  }
  assert.equal(new Set(bindings).size, bindings.length, "script should not bind the same id twice");
});

test("home and studio expose one shared dock and independent entry scripts", () => {
  const home = read("public/index.html");
  const studio = read("public/studio.html");

  for (const html of [home, studio]) {
    assert.match(html, /data-site-dock/);
    assert.match(html, /data-theme-toggle/);
    assert.match(html, /data-locale-toggle/);
    assert.match(html, /href="\/ui\/tokens\.css"/);
    assert.match(html, /href="\/ui\/components\.css"/);
    assert.match(html, /href="\/ui\/brand-tokens\.css"/);
  }
  assert.match(home, /src="\/js\/home\.js"/);
  assert.match(studio, /src="\/js\/studio\.js"/);
  assert.doesNotMatch(studio, /productPreview|landingCase|caseShowcase/);
  assert.doesNotMatch(home, /studio\.js/);
});

test("studio keeps the complete generation workflow entry points", () => {
  const html = read("public/studio.html");
  const script = read("public/js/studio.js");
  const requiredIds = [
    "generationMode",
    "taskEngineSelect",
    "targetScore",
    "maxAgentRounds",
    "constraintCard",
    "agentProcess",
    "agentSummary",
    "bestSolution",
    "cultureScore",
    "craftScore",
    "innovationScore",
    "sceneFitScore",
    "aiUsageScore",
    "learningStrengths",
    "learningIssues",
    "learningNextSteps",
    "saveAgentProjectButton",
    "referenceCasesGrid",
    "historyModal",
    "historyFilterInput",
    "configModal",
    "modelAccessNote",
    "profileModal",
  ];
  const ids = idsIn(html);
  for (const id of requiredIds) assert.ok(ids.has(id), `missing workflow entry #${id}`);

  assert.match(script, /async function runAgentGeneration\(/);
  assert.match(script, /submitGenerationTask\("agent"/);
  assert.match(script, /\/reference-cases/);
  assert.match(script, /method: "DELETE"/);
  assert.match(script, /selectedGenerationMode = "normal"/);
  assert.match(script, /taskEngineSelect\?\.value/);
});

test("initial gallery is an empty state and dynamic media has URL and text guards", () => {
  const html = read("public/studio.html");
  const script = read("public/js/studio.js");

  assert.doesNotMatch(html, /<article class="result-card" data-fallback-class=/);
  assert.match(html, /id="loadingCard"/);
  assert.match(html, /id="loadingCard"[\s\S]*data-open-config="true"/);
  assert.match(script, /function escapeHtml\(/);
  assert.match(script, /safeImageUrl/);
  assert.match(script, /escapeHtml\(title\)/);
  assert.match(script, /escapeHtml\(subtitle\)/);
  assert.match(script, /imageSrc\(imageUrl\)/);
});

test("frontend calls the v1 API and gates protected data after auth", () => {
  const script = read("public/js/studio.js");
  const api = read("public/js/modules/api.js");

  assert.match(api, /const apiRoot = `\$\{origin\}\/api\/v1`/);
  assert.doesNotMatch(script, /apiBase/);
  assert.match(script, /authRequest\("\/auth\/me"\)/);
  assert.match(script, /if \(!currentUser\) \{/);
  assert.match(script, /if \(!currentUser\?\.isAdmin\)/);
  assert.match(script, /fetchEngineModes\(\)/);
  assert.match(script, /refreshCurrentUser\(\)\.then/);
});

test("shared theme and locale code handles restricted storage and reduced motion", () => {
  const dock = read("public/js/modules/dock.js");
  const home = read("public/js/home.js");
  const studioCss = read("public/css/workbench.css");
  const homeCss = read("public/css/home.css");

  assert.match(dock, /try \{[\s\S]*localStorage\.getItem/);
  assert.match(dock, /try \{[\s\S]*localStorage\.setItem/);
  assert.match(dock, /html\.lang = next === "tw" \? "zh-TW" : "zh-CN"/);
  assert.match(home, /prefers-reduced-motion/);
  assert.match(studioCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(homeCss, /@media \(max-width: 560px\)/);
});

test("studio offers online models only and no competition report", () => {
  const html = read("public/studio.html");
  const script = read("public/js/studio.js");
  const engineSelect = html.match(/<select[^>]*id="taskEngineSelect"[^>]*>([\s\S]*?)<\/select>/)[1];
  assert.doesNotMatch(engineSelect, /automatic1111|comfyui/);
  assert.match(engineSelect, /value="imageModel"/);
  assert.match(script, /filter\(\(mode\) => !\/automatic1111\|comfyui\/\.test\(mode\)\)/);
  assert.doesNotMatch(html, /exportReportButton|exportDemoButton|sourceNoteInput|aiDisclosureSelect/);
  assert.doesNotMatch(script, /\/report\?format=|buildClientExport|downloadRecordExport/);
});

test("studio draws contour lines and growth-ring review from a shared module", () => {
  const html = read("public/studio.html");
  const script = read("public/js/studio.js");
  const contours = read("public/js/modules/contours.js");
  assert.match(html, /id="stageCanvas"/);
  assert.match(html, /id="ringsHost"/);
  assert.match(script, /import \{ mountContours, mountGrowthRings \} from "\.\/modules\/contours\.js"/);
  assert.match(contours, /export function traceContours/);
  assert.match(contours, /prefers-reduced-motion: reduce/);
  assert.match(contours, /aria-hidden/);
});

test("drafting table exposes tool-rail popovers and a review drawer", () => {
  const html = read("public/studio.html");
  const workbench = read("public/js/modules/workbench.js");
  for (const key of ["style", "params", "constraints", "prompt", "cases"]) {
    assert.match(html, new RegExp(`data-pop="${key}"`));
    assert.match(html, new RegExp(`data-pop-panel="${key}"[^>]*hidden`));
  }
  assert.match(html, /id="reviewDrawer"/);
  assert.match(html, /data-drawer-toggle/);
  assert.match(html, /href="\/css\/workbench\.css"/);
  assert.match(workbench, /event\.key === "Escape"/);
  assert.match(workbench, /aria-expanded/);
});

test("studio defaults to new Chinese with a tradition dial and an antique-risk readout", () => {
  const html = read("public/studio.html");
  const script = read("public/js/studio.js");
  assert.match(html, /class="style-option active" data-style="newChinese"/);
  for (const id of ["modernityRange", "modernityValue", "modernityHint", "cultureLabel", "styleCheck", "antiqueRiskValue", "antiqueRiskBar"]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
  }
  assert.match(script, /let selectedStyle = "newChinese";/);
  assert.match(script, /modernity: Number\(modernityRange\?\.value \?\? 60\)/);
  assert.doesNotMatch(script, /horseshoe-back armchair/);
  assert.doesNotMatch(html, /现代简约/);
  // Untranslated Chinese used to be deleted, silently dropping materials from the brief.
  assert.doesNotMatch(script, /replace\(\/\[\\u4e00-\\u9fff\]\+\/g, ""\)/);
  assert.match(script, /`\$\{basePrompt\} \(\$\{keyTerms\}\)`/);
});
