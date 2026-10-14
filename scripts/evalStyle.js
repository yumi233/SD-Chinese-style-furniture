#!/usr/bin/env node
// Style evaluation: runs a fixed set of briefs through the configured online
// models and reports how often the result still looks antique ("古董率").
//
//   node scripts/evalStyle.js [--style newChinese] [--modernity 60] [--limit 20] [--rounds 1] [--out eval/results/run.json]
//
// Uses the same .env / config.local.json as the server, so it calls real
// (paid) models unless they point at a local mock. Results keep scores and
// prompts only, never images.
const fs = require("fs");
const path = require("path");

const { createRuntime } = require("../server");
const { getStyleProfile } = require("../src/knowledge/styleProfiles");

function parseArgs(argv) {
  const options = { style: "newChinese", modernity: 60, limit: Infinity, rounds: 1, out: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index].replace(/^--/, "");
    const value = argv[index + 1];
    if (key in options) {
      options[key] = ["modernity", "limit", "rounds"].includes(key) ? Number(value) : value;
      index += 1;
    }
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { briefs } = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "eval", "style-briefs.json"), "utf8"));
  const selected = briefs.slice(0, options.limit);
  const { gateway } = createRuntime(process.env);
  const profile = getStyleProfile(options.style);
  const rows = [];

  for (const [index, brief] of selected.entries()) {
    const prompt = [brief, ...profile.positive].join(", ");
    try {
      const result = await gateway.runAgent({
        originalPrompt: brief,
        prompt,
        style: options.style,
        modernity: options.modernity,
        maxRounds: options.rounds,
        targetScore: 85,
      });
      rows.push(rowFromResult(brief, result));
    } catch (error) {
      rows.push({ brief, error: error.message || "failed" });
    }
    process.stdout.write(`\r${index + 1}/${selected.length}`);
  }
  process.stdout.write("\n");

  const summary = summarize(rows);
  console.table(rows.map(({ brief, firstRisk, bestRisk, bestScore, error }) => ({ brief, firstRisk, bestRisk, bestScore, error })));
  console.log(`古董率（首轮）：${percent(summary.firstAntiqueRate)}　古董率（最佳）：${percent(summary.bestAntiqueRate)}`);
  console.log(`平均古旧风险：${summary.averageRisk ?? "--"}　平均得分：${summary.averageScore ?? "--"}`);
  console.log(`生成失败：${summary.generationFailures}　评审失败：${summary.evaluationFailures}　评审缺字段：${summary.incompleteEvaluations}　违反需求：${summary.requirementViolations}　风格不符：${summary.styleMismatches}　古旧风险未知：${summary.unknownRisk}`);

  const out = options.out || path.join("eval", "results", `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ options: { ...options, limit: selected.length }, summary, rows }, null, 2));
  console.log(`结果已写入 ${out}`);
}

// One row per brief. Antique flags are null (unknown) unless the reviewer
// actually gave a risk; unknown is never counted as "not antique".
function rowFromResult(brief, result) {
  const first = result.rounds?.[0]?.evaluation || {};
  const best = result.bestEvaluation || {};
  const flag = (evaluation) => (Number.isFinite(evaluation.styleCheck?.antiqueRisk) ? evaluation.styleCheck.antiqueRisk >= 60 : null);
  return {
    brief,
    evaluationStatus: first.evaluationFailed ? "error" : first.status || null,
    firstRisk: first.styleCheck?.antiqueRisk ?? null,
    firstAntique: flag(first),
    bestRisk: best.styleCheck?.antiqueRisk ?? null,
    bestAntique: flag(best),
    requirementViolations: best.counts?.requirementViolations ?? null,
    styleMismatch: best.counts ? Boolean(best.counts.styleMismatch) : null,
    bestScore: result.bestScore,
    stopReason: result.stopReason || null,
    finalPrompt: result.finalPrompt,
  };
}

// Generation failures, evaluation failures, incomplete evaluations,
// requirement violations and style mismatches are counted separately. Rates
// use only rows whose value is known, and say how many were known.
function summarize(rows) {
  const generated = rows.filter((row) => !row.error);
  const average = (values) => {
    const known = values.filter((value) => Number.isFinite(value));
    return known.length ? Math.round(known.reduce((sum, value) => sum + value, 0) / known.length) : null;
  };
  const rate = (flags) => {
    const known = flags.filter((value) => value === true || value === false);
    return known.length ? known.filter(Boolean).length / known.length : null;
  };
  return {
    total: rows.length,
    generationFailures: rows.length - generated.length,
    evaluationFailures: generated.filter((row) => row.evaluationStatus === "error").length,
    incompleteEvaluations: generated.filter((row) => row.evaluationStatus === "incomplete").length,
    requirementViolations: generated.filter((row) => (row.requirementViolations || 0) > 0).length,
    styleMismatches: generated.filter((row) => row.styleMismatch === true).length,
    unknownRisk: generated.filter((row) => !Number.isFinite(row.firstRisk)).length,
    knownRisk: generated.filter((row) => Number.isFinite(row.firstRisk)).length,
    firstAntiqueRate: rate(generated.map((row) => row.firstAntique)),
    bestAntiqueRate: rate(generated.map((row) => row.bestAntique)),
    averageRisk: average(generated.map((row) => row.firstRisk)),
    averageScore: average(generated.map((row) => row.bestScore)),
  };
}

function percent(value) {
  return value === null ? "--" : `${Math.round(value * 100)}%`;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

module.exports = { parseArgs, rowFromResult, summarize };
