#!/usr/bin/env node
// Checks what the configured image engine actually does, with real calls and
// through the same task path the studio uses:
//   1. generate a first version from a locked brief, then review it on the
//      four criteria (is the evaluation complete?)
//   2. "Continue refining" with the previous image as input, then review the
//      refinement for consistency with the previous version
//   3. optionally (--views) the three concept views, each reviewed for
//      consistency with the version they were made from
// It records elapsed time, token usage and the CLI event types (to see whether
// any intermediate image is streamed). Everything, images included, goes to
// --out; point HISTORY_DATA_DIR there too so real history is never touched.
//
//   node scripts/verifyEngines.js --engine codexCli --out <dir> [--views]
//
// Calls real, paid models with the server's configuration.
const fs = require("fs");
const path = require("path");
const { createRuntime } = require("../server");
const { GenerationTasks } = require("../src/generationTasks");
const { DesignSessionStore } = require("../src/designSessions");
const { parseEdit } = require("../src/design/edit");

const USER = { id: "verify-engines-local", isAdmin: false };

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

async function main() {
  const engine = arg("engine", "codexCli");
  const out = path.resolve(arg("out", "verify-engines"));
  const brief = arg("brief", "一把无扶手的新中式餐椅，全金属，不要木头");
  const change = arg("change", "保留这把椅子，背板更薄，坐垫换成黑色皮革");
  const withViews = process.argv.includes("--views");
  fs.mkdirSync(out, { recursive: true });
  const { gateway, historyStore } = createRuntime(process.env);
  const designSessions = new DesignSessionStore({ rootDir: path.join(out, "sessions") });
  const tasks = new GenerationTasks({ rootDir: path.join(out, "tasks"), gateway, historyStore, safeError: (error) => error, designSessions });
  const report = { engine, brief, change, capability: gateway.capabilities()[engine] || null, steps: [] };
  let counter = 0;

  const imageData = (url) => {
    const assetPath = historyStore.resolveAssetForUser(path.basename(String(url)), USER);
    const mimeType = /\.jpe?g$/i.test(assetPath) ? "image/jpeg" : /\.webp$/i.test(assetPath) ? "image/webp" : "image/png";
    return { assetPath, dataUrl: `data:${mimeType};base64,${fs.readFileSync(assetPath).toString("base64")}` };
  };
  const keep = (url, name) => {
    const file = path.join(out, name);
    fs.copyFileSync(imageData(url).assetPath, file);
    return file;
  };
  const runTask = async (label, body) => {
    counter += 1;
    const started = Date.now();
    const step = { step: label, ok: false };
    report.steps.push(step);
    try {
      const task = tasks.create({ mode: "normal", engine, requestId: `verify-engines-${String(counter).padStart(6, "0")}`, prompt: brief, originalPrompt: brief, style: "newChinese", modernity: 60, quality: "hd", size: "16:9-720p", ...body }, USER);
      const finished = await tasks.waitForCompletion(task.id, USER.id);
      step.seconds = Math.round((Date.now() - started) / 1000);
      step.ok = finished.status === "completed";
      if (!step.ok) step.error = finished.message || finished.status;
      return step.ok ? finished.result : null;
    } catch (error) {
      step.seconds = Math.round((Date.now() - started) / 1000);
      step.error = `${error.statusCode || error.code || ""} ${error.message || error}`.trim();
      return null;
    }
  };
  const review = async (label, input) => {
    const started = Date.now();
    const step = { step: label, ok: false };
    report.steps.push(step);
    try {
      const value = await gateway.evaluateImage({ engine, targetScore: 85, ...input });
      step.ok = true;
      step.seconds = Math.round((Date.now() - started) / 1000);
      return { status: value.status, missing: value.missing, score: value.score, counts: value.counts, criteria: value.criteria, changedUnrequested: value.changedUnrequested, usage: value.metadata?.usage || null };
    } catch (error) {
      step.seconds = Math.round((Date.now() - started) / 1000);
      step.error = `${error.code || ""} ${error.message || error}`.trim();
      return null;
    }
  };

  const first = await runTask("generate", {});
  if (!first) return finish(out, report);
  const session = () => designSessions.get(first.session.id, USER.id);
  report.first = { image: keep(first.images[0].url, "01-first.png"), metadata: first.metadata?.[engine] || null, locked: [...first.design.brief.requirements, ...first.design.brief.prohibitions].map((item) => item.label), prompt: first.finalPrompt || first.request?.prompt || null };
  report.first.review = await review("review", { imageUrl: imageData(first.images[0].url).dataUrl, brief: first.design.brief, direction: first.design.direction, round: 1 });

  const refined = await runTask("refine-with-previous-image", { action: "refine", sessionId: first.session.id, changeRequest: change });
  if (!refined) return finish(out, report);
  const version = session().versions.at(-1);
  report.refined = { image: keep(refined.images[0].url, "02-refined.png"), metadata: refined.metadata?.[engine] || null, sentImages: refined.design.sentImages, scope: version.edit?.scope, keep: version.edit?.keep, lockedAfterChange: [...refined.design.brief.requirements, ...refined.design.brief.prohibitions].map((item) => item.label), prompt: refined.finalPrompt || refined.request?.prompt || null };
  report.refined.review = await review("review-consistency", { imageUrl: imageData(refined.images[0].url).dataUrl, previousImageUrl: imageData(first.images[0].url).dataUrl, brief: refined.design.brief, direction: version.direction, edit: parseEdit(change, { family: version.direction?.family }), round: 2 });

  if (withViews) {
    const views = await runTask("three-concept-views", { action: "views", sessionId: first.session.id });
    if (views) report.views = views.images.map((image, index) => ({ view: image.view, image: keep(image.url, `03-view-${image.view}.png`), review: views.views?.[index] ? { status: views.views[index].status, consistency: views.views[index].criteria?.consistency, changedUnrequested: views.views[index].changedUnrequested } : null }));
  }
  finish(out, report);
}

function finish(out, report) {
  const events = [report.first?.metadata?.eventTypes, report.refined?.metadata?.eventTypes].filter(Boolean);
  report.intermediateImageEventsSeen = events.some((types) => Object.keys(types).some((key) => /partial|preview/i.test(key)));
  fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    steps: report.steps,
    firstReview: report.first?.review?.status,
    refinedReview: report.refined?.review?.status,
    refinedScope: report.refined?.scope,
    lockedAfterChange: report.refined?.lockedAfterChange,
    consistency: report.refined?.review?.criteria?.consistency,
    changedUnrequested: report.refined?.review?.changedUnrequested,
    views: report.views?.map((item) => ({ view: item.view, status: item.review?.status, consistency: item.review?.consistency?.status })),
    intermediateImageEventsSeen: report.intermediateImageEventsSeen,
    eventTypes: report.first?.metadata?.eventTypes,
  }, null, 2));
}

if (require.main === module) main().catch((error) => { console.error(error.message || error); process.exit(1); });
