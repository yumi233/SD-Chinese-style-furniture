"use strict";

const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { parseArgs } = require("node:util");
const { CodexCliAdapter, DEFAULT_CODEX_MODEL } = require("../src/providers/codexCli");
const { VisionModelAdapter } = require("../src/providers/visionModel");

const ROOT = path.resolve(__dirname, "..");
const ENGINES = ["automatic1111", "comfyui", "imageModel", "codexCli"];
const DIMENSIONS = ["cultureAccuracy", "structureReasoning", "materialCraft", "designInnovation", "sceneFit", "aiUsage", "contemporaneity"];
const CASES = [
  ["ming-chair", "ming", "明式圈椅，连续曲木扶手与胡桃木框架，置于阅读角"],
  ["ming-table", "ming", "明式长案，榆木案面与夹头榫构造，置于书房"],
  ["ming-cabinet", "ming", "明式圆角柜，胡桃木对开门，用于玄关收纳"],
  ["newChinese-chair", "newChinese", "新中式餐椅，白橡木框架和织物坐面，置于公寓餐厅"],
  ["newChinese-table", "newChinese", "新中式茶案，深色木材与浅色石面，置于家庭茶区"],
  ["newChinese-cabinet", "newChinese", "新中式餐边柜，胡桃木饰面与格栅门，用于餐具收纳"],
  ["song-chair", "song", "宋韵靠背椅，细木框与藤编座面，置于书房"],
  ["song-table", "song", "宋韵书案，修长案面与收分木腿，用于读写"],
  ["song-cabinet", "song", "宋韵书柜，浅色木框和通透门板，用于小户型书房"],
  ["zen-chair", "zen", "禅意休闲椅，实木低靠背与亚麻坐垫，置于静坐角"],
  ["zen-table", "zen", "禅意矮案，哑光木纹与简洁边缘，用于两人品茶"],
  ["zen-cabinet", "zen", "禅意矮柜，橡木柜体与平板门，置于留白起居室"],
].map(([id, style, prompt]) => ({ id, style, prompt }));

function options(args) {
  const { values } = parseArgs({ args, options: {
    engine: { type: "string", default: "codexCli" },
    reviewer: { type: "string" },
    phase: { type: "string", default: "before" },
    revision: { type: "string", default: "HEAD" },
    date: { type: "string", default: new Date().toLocaleDateString("sv-SE") },
    "resume-after": { type: "boolean" },
    "dry-run": { type: "boolean" },
    help: { type: "boolean" },
  } });
  const reviewer = values.reviewer || (values.engine === "codexCli" ? "codexCli" : "visionModel");
  if (!ENGINES.includes(values.engine) || !["codexCli", "visionModel"].includes(reviewer) ||
      !["before", "after"].includes(values.phase) || !/^\d{4}-\d{2}-\d{2}$/.test(values.date) ||
      (values["resume-after"] && (values.phase !== "after" || values.engine !== "codexCli" || reviewer !== "codexCli"))) {
    throw new Error("Invalid engine, reviewer, phase or date. See --help.");
  }
  return { ...values, reviewer };
}

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] });
}

function loopbackUrl(value, variable) {
  let parsed;
  try { parsed = new URL(value); } catch { /* Report only the variable name. */ }
  if (!parsed || !["http:", "https:"].includes(parsed.protocol) ||
      !["127.0.0.1", "[::1]", "localhost"].includes(parsed.hostname) ||
      parsed.username || parsed.password) {
    throw new Error(`${variable} must use a loopback HTTP endpoint without URL credentials.`);
  }
  return parsed.href.replace(/\/$/, "");
}

function runtime(plan, env, scratch) {
  const codex = {
    enabled: ["true", "1", "yes", "on"].includes(String(env.CODEX_CLI_ENABLED).toLowerCase()),
    command: env.CODEX_CLI_COMMAND || "codex",
    model: env.CODEX_CLI_MODEL || DEFAULT_CODEX_MODEL,
    reasoningEffort: env.CODEX_CLI_REASONING_EFFORT || "high",
    authFile: env.CODEX_CLI_AUTH_FILE,
    authCacheFile: path.join(scratch, "auth.json"),
    workRoot: scratch,
    timeoutMs: Number(env.CODEX_CLI_TIMEOUT_MS) || 300000,
  };
  const config = {
    defaultEngine: plan.engine,
    auto1111BaseUrl: "http://127.0.0.1:7860",
    comfyBaseUrl: "http://127.0.0.1:8188",
  };
  if (plan.engine === "automatic1111") {
    config.auto1111BaseUrl = loopbackUrl(env.AUTO1111_BASE_URL || config.auto1111BaseUrl, "AUTO1111_BASE_URL");
    config.auto1111Lora = env.AUTO1111_LORA;
  }
  if (plan.engine === "comfyui") {
    config.comfyBaseUrl = loopbackUrl(env.COMFYUI_BASE_URL || config.comfyBaseUrl, "COMFYUI_BASE_URL");
    config.comfyCheckpoint = env.COMFYUI_CHECKPOINT;
    config.comfyWorkflowFile = env.COMFYUI_WORKFLOW_FILE;
    if (config.comfyWorkflowFile) throw new Error("Use the built-in ComfyUI workflow for one-image benchmark cases.");
    if (!config.comfyCheckpoint) throw new Error("COMFYUI_CHECKPOINT is required.");
  }
  if (plan.engine === "imageModel") {
    config.imageModelBaseUrl = loopbackUrl(env.IMAGE_MODEL_BASE_URL, "IMAGE_MODEL_BASE_URL");
    config.imageModelApiKey = env.IMAGE_MODEL_API_KEY;
    config.imageModelName = env.IMAGE_MODEL_NAME;
    if (!config.imageModelName) throw new Error("IMAGE_MODEL_NAME is required.");
  }
  if (plan.reviewer === "codexCli") {
    return { config, codex, reviewer: new CodexCliAdapter(codex) };
  }
  const reviewer = new VisionModelAdapter({
    baseUrl: loopbackUrl(env.VISION_MODEL_BASE_URL, "VISION_MODEL_BASE_URL"),
    apiKey: env.VISION_MODEL_API_KEY,
    model: env.VISION_MODEL_NAME,
  });
  if (!reviewer.isConfigured()) throw new Error("VISION_MODEL_NAME is required.");
  return { config, codex, reviewer };
}

async function saveImage(image, fileBase, signal) {
  let imageUrl = image?.url || "";
  if (!imageUrl.startsWith("data:")) {
    const response = await fetch(loopbackUrl(imageUrl, "Generated image URL"), { redirect: "error", signal });
    if (!response.ok) throw new Error("Image download failed.");
    const bytes = Buffer.from(await response.arrayBuffer());
    imageUrl = `data:${response.headers.get("content-type")};base64,${bytes.toString("base64")}`;
  }
  const match = imageUrl.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error("Unsupported generated image.");
  const filename = `${fileBase}.${match[1] === "jpeg" ? "jpg" : match[1]}`;
  await fs.writeFile(filename, Buffer.from(match[2], "base64"), { flag: "wx", mode: 0o600 });
  return { imageUrl, filename: path.relative(ROOT, filename) };
}

function mean(numbers) {
  return numbers.length ? Math.round(100 * numbers.reduce((sum, value) => sum + value, 0) / numbers.length) / 100 : null;
}

function summarize(rows) {
  const reviewed = rows.filter(row => row.evaluation).map(row => row.evaluation);
  return {
    attempted: rows.length,
    reviewed: reviewed.length,
    antiqueRate: mean(reviewed.map(row => row.antiqueLook ? 100 : 0)),
    averageScore: mean(reviewed.map(row => row.score)),
    averageRubric: Object.fromEntries(DIMENSIONS.map(key => [key, mean(reviewed.map(row => row.rubric[key]))])),
  };
}

async function writeReport(directory, report) {
  report.summary = summarize(report.rows);
  const { summary } = report;
  const markdown = [
    `# 家具画质基线 · ${report.phase}`, "",
    `- 生成版本 \`${report.revision}\`，评审代码 SHA-256 \`${report.reviewFingerprint}\``,
    `- 生成模型 ${report.generationModel || "未报告"}，评审模型 ${report.reviewModel}`,
    `- 已尝试 ${summary.attempted} / ${CASES.length} 张，已评审 ${summary.reviewed} 张`,
    `- 古董感比例 ${summary.antiqueRate == null ? "待评审" : `${summary.antiqueRate}%`}，平均分 ${summary.averageScore ?? "待评审"}`,
    "", "| 维度 | 平均分 |", "| --- | ---: |",
    ...DIMENSIONS.map(key => `| ${key} | ${summary.averageRubric[key] ?? "—"} |`),
    "", "| 提示词 | 图片 | 评分 | 古董感 | 状态 |", "| --- | --- | ---: | --- | --- |",
    ...report.rows.map(row => `| ${row.prompt} | ${row.image ? `[图片](${path.basename(row.image)})` : "—"} | ${row.evaluation?.score ?? "—"} | ${row.evaluation ? (row.evaluation.antiqueLook ? "是" : "否") : "—"} | ${row.status} |`),
    "",
  ].join("\n");
  for (const [name, contents] of [["results.json", JSON.stringify(report, null, 2) + "\n"], ["summary.md", markdown]]) {
    const file = path.join(directory, name);
    await fs.writeFile(`${file}.tmp`, contents, { mode: 0o600 });
    await fs.rename(`${file}.tmp`, file);
  }
}

async function writeComparison(directory, before, after) {
  const first = before.summary;
  const second = after.summary;
  const markdown = [
    "# 家具画质前后对比", "",
    "| 指标 | 改动前 | 改动后 |", "| --- | ---: | ---: |",
    `| 已评审张数 | ${first.reviewed} | ${second.reviewed} |`,
    `| 古董感比例 | ${first.antiqueRate}% | ${second.antiqueRate}% |`,
    `| 平均分 | ${first.averageScore} | ${second.averageScore} |`,
    ...DIMENSIONS.map(key => `| ${key} | ${first.averageRubric[key]} | ${second.averageRubric[key]} |`),
    "", "| 提示词 | 改动前 | 改动后 |", "| --- | --- | --- |",
    ...before.rows.map((row, index) => `| ${row.prompt} | [图片](before/${path.basename(row.image)}) | [图片](after/${path.basename(after.rows[index].image)}) |`),
    "", "[改动前评审结果](before/summary.md) · [改动后评审结果](after/summary.md)", "",
  ].join("\n");
  await fs.writeFile(path.join(directory, "comparison.md"), markdown, { flag: "wx", mode: 0o600 });
}

async function loadBaseline(directory, report) {
  const before = JSON.parse(await fs.readFile(path.join(directory, "before", "results.json"), "utf8"));
  const matching = ["engine", "reviewer", "generationModel", "reviewModel", "reviewFingerprint", "size", "seed"];
  if (before.rows.length !== CASES.length || !before.rows.every((row, index) =>
    row.status === "complete" && ["id", "style", "prompt"].every(key => row[key] === CASES[index][key])) ||
    !matching.every(key => before[key] === report[key])) {
    throw new Error("The before report is incomplete or uses a different suite, engine or reviewer.");
  }
  return before;
}

function resumeCases(rows) {
  // The interrupted legacy request counts, even if its case is selected again.
  const covered = new Set(rows.filter(row => row.image || row.revision).map(row => row.id));
  const styles = [...new Set(CASES.map(entry => entry.style))];
  const byStyle = styles.map(style => CASES.filter(entry => entry.style === style && !covered.has(entry.id)));
  const remaining = [];
  for (let index = 0; index < 3; index += 1) {
    for (const cases of byStyle) if (cases[index]) remaining.push(cases[index]);
  }
  return remaining.slice(0, Math.max(0, CASES.length - rows.length));
}

async function benchmark(plan) {
  const revision = git(["rev-parse", "--verify", "--end-of-options", `${plan.revision}^{commit}`]).toString().trim();
  const hash = createHash("sha256");
  for (const file of ["codexCli.js", "visionModel.js"]) {
    hash.update(await fs.readFile(path.join(ROOT, "src", "providers", file)));
  }
  const reviewFingerprint = hash.digest("hex");
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "musheng-quality-"));
  let resumeLock;
  try {
    const { config, codex, reviewer } = runtime(plan, process.env, scratch);
    if ((plan.engine === "codexCli" || plan.reviewer === "codexCli") && !(await new CodexCliAdapter(codex).health()).ok) {
      throw new Error("Codex CLI configuration, executable or login file is unavailable.");
    }
    if (plan.reviewer === "visionModel") {
      try { await reviewer.health(); } catch { throw new Error("Vision model health check failed."); }
    }
    execFileSync("tar", ["-xf", "-", "-C", scratch], { input: git(["archive", revision, "src"]) });
    const { createImageGateway } = require(path.join(scratch, "src/imageGateway"));
    if (plan.engine === "codexCli") {
      const { CodexCliAdapter: GenerationAdapter } = require(path.join(scratch, "src/providers/codexCli"));
      if (new GenerationAdapter(codex).configurationError()) throw new Error("The generation revision does not support the selected Codex model.");
    }
    const gateway = createImageGateway(config, { codexCli: codex });
    const runDirectory = path.join(ROOT, "local-archive", "quality-baseline", plan.date);
    const directory = path.join(runDirectory, plan.phase);
    const current = {
      phase: plan.phase, revision, reviewFingerprint, engine: plan.engine, reviewer: plan.reviewer,
      generationModel: { codexCli: codex.model, comfyui: config.comfyCheckpoint, imageModel: config.imageModelName }[plan.engine] || null,
      reviewModel: reviewer.model, size: "1024", seed: 12345, rows: [],
    };
    let report = current;
    let before;
    let cases = CASES;
    if (plan["resume-after"]) {
      const lock = path.join(directory, ".resume-lock");
      await fs.mkdir(lock, { mode: 0o700 });
      resumeLock = lock;
      report = JSON.parse(await fs.readFile(path.join(directory, "results.json"), "utf8"));
      await loadBaseline(runDirectory, report);
      const fields = ["phase", "engine", "reviewer", "generationModel", "reviewModel", "size", "seed"];
      if (!fields.every(key => report[key] === current[key]) ||
          report.rows.length > CASES.length ||
          !report.rows.every(row => CASES.some(entry => ["id", "style", "prompt"].every(key => row[key] === entry[key])))) {
        throw new Error("The existing after report uses a different suite, engine or reviewer.");
      }
      cases = resumeCases(report.rows);
    } else {
      before = plan.phase === "after" ? await loadBaseline(runDirectory, report) : null;
      await fs.mkdir(runDirectory, { recursive: true, mode: 0o700 });
      await fs.mkdir(directory, { mode: 0o700 }).catch(error => {
        if (error.code === "EEXIST") throw new Error("This date and phase already have a report. Preserve it to avoid duplicate generation calls.");
        throw error;
      });
      await writeReport(directory, report);
    }
    for (const entry of cases) {
      const provenance = plan["resume-after"] ? { revision, reviewFingerprint } : {};
      const row = { ...entry, ...provenance, status: "generation-started" };
      report.rows.push(row);
      await writeReport(directory, report);
      const start = Date.now();
      try {
        console.log(`[${plan.phase} ${report.rows.length}/${CASES.length}] Generating ${row.id}`);
        const generated = await gateway.generate({ ...entry, originalPrompt: entry.prompt, size: report.size, seed: report.seed }, {
          signal: AbortSignal.timeout(360000),
          benchmarkCaseIndex: CASES.indexOf(entry),
        });
        if (generated.promptPipeline?.photography) row.photography = generated.promptPipeline.photography;
        if (generated.images.length !== 1) throw new Error("Expected one image per case.");
        const image = await saveImage(generated.images[0], path.join(directory, row.id), AbortSignal.timeout(30000));
        row.image = image.filename;
        row.generationMs = Date.now() - start;
        row.status = "review-started";
        await writeReport(directory, report);
        console.log(`[${plan.phase} ${report.rows.length}/${CASES.length}] Reviewing ${row.id}`);
        const evaluation = await reviewer.evaluate({
          imageUrl: image.imageUrl, requirement: entry.prompt, prompt: entry.prompt, targetScore: 85, round: 1,
          signal: AbortSignal.timeout(360000),
        });
        if (typeof evaluation.antiqueLook !== "boolean" ||
            (plan["resume-after"] && typeof evaluation.highlight !== "string") ||
            !DIMENSIONS.every(key => Number.isFinite(evaluation.rubric?.[key]))) {
          throw new Error("Incomplete review");
        }
        const { score, rubric, antiqueLook, highlight, highlightEvidence, decision, revisedPrompt } = evaluation;
        row.evaluation = { score, rubric, antiqueLook, highlight, highlightEvidence, decision, revisedPrompt };
        row.reviewMs = Date.now() - start - row.generationMs;
        row.status = "complete";
      } catch (error) {
        row.status = row.image ? "review-failed" : "generation-failed";
        if (/^CODEX_[A-Z_]+$/.test(error?.code || "")) row.errorCode = error.code;
        await writeReport(directory, report);
        throw new Error(`${row.id}: ${row.status}; stopped without retrying. Partial report: ${path.relative(ROOT, directory)}.`);
      }
      await writeReport(directory, report);
    }
    if (before) await writeComparison(runDirectory, before, report);
    console.log(path.relative(ROOT, directory));
  } finally {
    if (resumeLock) await fs.rmdir(resumeLock);
    await fs.rm(scratch, { recursive: true, force: true });
  }
}

async function main() {
  const plan = options(process.argv.slice(2));
  if (plan.help) {
    console.log("Usage: node scripts/quality-baseline.js --engine <automatic1111|comfyui|imageModel|codexCli> --phase <before|after> [--reviewer <codexCli|visionModel>] [--revision <git-ref>] [--date <YYYY-MM-DD>] [--resume-after] [--dry-run]");
    return;
  }
  if (plan["dry-run"]) {
    const cases = plan["resume-after"]
      ? resumeCases(JSON.parse(await fs.readFile(path.join(ROOT, "local-archive", "quality-baseline", plan.date, "after", "results.json"), "utf8")).rows)
      : CASES;
    console.log(JSON.stringify({ ...plan, calls: { generation: cases.length, review: cases.length }, cases }, null, 2));
    return;
  }
  await benchmark(plan);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { resumeCases };
