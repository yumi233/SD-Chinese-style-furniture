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
    "sourceNoteInput",
    "aiDisclosureSelect",
    "exportReportButton",
    "exportDemoButton",
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
  assert.match(script, /\/agent\/run/);
  assert.match(script, /\/reference-cases/);
  assert.match(script, /\/history\/\$\{encodeURIComponent\(historyId\)\}\/report/);
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
  const studioCss = read("public/css/studio.css");
  const homeCss = read("public/css/home.css");

  assert.match(dock, /try \{[\s\S]*localStorage\.getItem/);
  assert.match(dock, /try \{[\s\S]*localStorage\.setItem/);
  assert.match(dock, /html\.lang = next === "tw" \? "zh-TW" : "zh-CN"/);
  assert.match(home, /prefers-reduced-motion/);
  assert.match(studioCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(homeCss, /@media \(max-width: 560px\)/);
});
