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
      const first = result.rounds[0]?.evaluation || {};
      const best = result.bestEvaluation || {};
      rows.push({
        brief,
        firstRisk: first.styleCheck?.antiqueRisk ?? null,
        firstAntique: Boolean(first.styleCheck?.tooAntique),
        bestRisk: best.styleCheck?.antiqueRisk ?? null,
        bestAntique: Boolean(best.styleCheck?.tooAntique),
        bestScore: result.bestScore,
        finalPrompt: result.finalPrompt,
      });
    } catch (error) {
      rows.push({ brief, error: error.message || "failed" });
    }
    process.stdout.write(`\r${index + 1}/${selected.length}`);
  }
  process.stdout.write("\n");

  const summary = summarize(rows);
  console.table(rows.map(({ brief, firstRisk, bestRisk, bestScore, error }) => ({ brief, firstRisk, bestRisk, bestScore, error })));
  console.log(`古董率（首轮）：${percent(summary.firstAntiqueRate)}　古董率（最佳）：${percent(summary.bestAntiqueRate)}`);
  console.log(`平均古旧风险：${summary.averageRisk ?? "--"}　平均得分：${summary.averageScore ?? "--"}　失败：${summary.failed}`);

  const out = options.out || path.join("eval", "results", `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ options: { ...options, limit: selected.length }, summary, rows }, null, 2));
  console.log(`结果已写入 ${out}`);
}

function summarize(rows) {
  const ok = rows.filter((row) => !row.error);
  const average = (values) => {
    const known = values.filter((value) => Number.isFinite(value));
    return known.length ? Math.round(known.reduce((sum, value) => sum + value, 0) / known.length) : null;
  };
  return {
    total: rows.length,
    failed: rows.length - ok.length,
    firstAntiqueRate: ok.length ? ok.filter((row) => row.firstAntique).length / ok.length : null,
    bestAntiqueRate: ok.length ? ok.filter((row) => row.bestAntique).length / ok.length : null,
    averageRisk: average(ok.map((row) => row.firstRisk)),
    averageScore: average(ok.map((row) => row.bestScore)),
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

module.exports = { parseArgs, summarize };
