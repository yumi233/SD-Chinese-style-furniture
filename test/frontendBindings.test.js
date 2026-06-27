const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("every getElementById binding exists in index.html", () => {
  const root = path.join(__dirname, "..");
  const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const ids = [...script.matchAll(/getElementById\("([^"]+)"\)/g)].map((match) => match[1]);

  for (const id of ids) {
    assert.match(html, new RegExp(`id=["']${escapeRegExp(id)}["']`), `missing #${id}`);
  }
});

test("agent mode exposes the minimum workflow controls", () => {
  const root = path.join(__dirname, "..");
  const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

  for (const id of [
    "generationMode",
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
    "referenceCasesGrid",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing agent UI #${id}`);
  }

  assert.match(script, /async function runAgentGeneration\(/);
  assert.match(script, /fetch\(`\$\{apiBase\}\/agent\/run`/);
  assert.match(script, /\/reference-cases/);
  assert.match(script, /\/history\/\$\{encodeURIComponent\(historyId\)\}\/report/);
  assert.doesNotMatch(script, /function buildRuleEvaluation\(/);
});

test("history UI reads server records and does not depend on localStorage", () => {
  const root = path.join(__dirname, "..");
  const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

  for (const id of [
    "historyNavButton",
    "historyCount",
    "historyModal",
    "historyGrid",
    "historyEmpty",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing history UI #${id}`);
  }

  assert.match(script, /fetch\(`\$\{apiBase\}\/history\?limit=200`/);
  assert.match(script, /method: "DELETE"/);
  assert.doesNotMatch(script, /localStorage\./);
});

test("canvas size UI exposes 16:9 and 4:3 at 720p and 1080p", () => {
  const root = path.join(__dirname, "..");
  const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

  for (const value of ["16:9-720p", "16:9-1080p", "4:3-720p", "4:3-1080p"]) {
    assert.match(html, new RegExp(`data-value=["']${escapeRegExp(value)}["']`));
    assert.match(script, new RegExp(`${escapeRegExp(value)}.*width`, "s"));
  }

  assert.match(html, /1280 × 720/);
  assert.match(html, /1920 × 1080/);
  assert.match(html, /960 × 720/);
  assert.match(html, /1440 × 1080/);
  assert.match(script, /size: selectedSize/);
});

test("generated images use complete-fit layout in result, best, history, and lightbox views", () => {
  const root = path.join(__dirname, "..");
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  const script = fs.readFileSync(path.join(root, "script.js"), "utf8");

  assert.match(css, /\.art-image\s*\{[\s\S]*object-fit:\s*contain/);
  assert.match(css, /\.best-solution-media \.art-image\s*\{[\s\S]*object-fit:\s*contain/);
  assert.match(css, /\.history-image img\s*\{[\s\S]*object-fit:\s*contain/);
  assert.match(css, /\.lightbox-image\s*\{[\s\S]*object-fit:\s*contain/);
  assert.match(css, /\.result-card \.art\s*\{[\s\S]*min-height:\s*0/);
  assert.match(css, /\.art\s*\{[\s\S]*aspect-ratio:\s*4\s*\/\s*3/);
  assert.match(css, /\.best-solution-media\.has-image\.is-landscape\s*\{[\s\S]*aspect-ratio:\s*16\s*\/\s*9/);
  assert.match(css, /\.best-solution-media\.has-image\.is-portrait\s*\{[\s\S]*aspect-ratio:\s*3\s*\/\s*4/);
  assert.match(css, /\.learning-feedback > div,[\s\S]*\.evidence-box\s*\{[\s\S]*max-height:\s*184px[\s\S]*overflow:\s*auto/);
  assert.match(script, /function markImageOrientation\(/);
  assert.match(script, /document\.addEventListener\("load", \(event\) =>/);
  assert.match(script, /markImagesIn\(bestSolutionMedia\)/);
  assert.match(script, /markImagesIn\(stage\)/);
});

test("layout guards keep dense modules from overlapping at responsive widths", () => {
  const root = path.join(__dirname, "..");
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");

  assert.match(css, /\.topbar\s*\{[\s\S]*flex-wrap:\s*wrap/);
  assert.match(css, /\.section-heading,[\s\S]*\.config-header\s*\{[\s\S]*flex-wrap:\s*wrap/);
  assert.match(css, /\.best-solution-info\s*\{[\s\S]*max-height:\s*clamp\(340px, 42vw, 640px\)[\s\S]*overflow:\s*auto/);
  assert.match(css, /@media \(max-width: 1500px\)[\s\S]*\.right-panel\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fit, minmax\(min\(100%, 280px\), 1fr\)\)/);
  assert.match(css, /\.studio-grid > \*,[\s\S]*\.constraint-groups > \*\s*\{[\s\S]*min-width:\s*0/);
  assert.match(css, /@media \(max-width: 680px\)[\s\S]*\.style-chips\s*\{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 680px\)[\s\S]*\.metric-grid,[\s\S]*\.metric-grid\.teaching-rubric\s*\{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 420px\)[\s\S]*\.metric-grid,[\s\S]*\.metric-grid\.teaching-rubric\s*\{[\s\S]*grid-template-columns:\s*1fr/);
  assert.match(css, /@media \(orientation: landscape\) and \(max-height: 760px\)[\s\S]*\.best-solution-info\s*\{[\s\S]*max-height:\s*calc\(100vh - 150px\)/);
});
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
