#!/usr/bin/env node
// Builds the curated reference set for style packs.
//
//   node scripts/styleReferences.js candidates --out <dir> [--pack id] [--per 6]
//     Generates candidate images for each pack with the configured models
//     (calls real, paid models unless they point at a local mock) and writes
//     <dir>/<pack>/NN.png plus <dir>/index.html, a contact sheet to pick from.
//
//   node scripts/styleReferences.js approve --from <dir> --pack <id> 01 04 07 [--to <STYLE_REFERENCE_DIR>]
//     Copies the chosen candidates into the reference directory and records
//     them in its manifest.json. The reference directory is private data: keep
//     it out of Git and copy it to the production data volume when deploying.
const fs = require("fs");
const path = require("path");

const { listStylePacks } = require("../src/knowledge/stylePacks");
const { familyFor } = require("../src/knowledge/cuePicker");

// Briefs that exercise each pack on furniture families it suits.
const PACK_BRIEFS = {
  "steel-line": ["新中式单椅，年轻人公寓", "新中式吧台椅", "新中式边几", "新中式长凳", "新中式书桌", "新中式衣帽架"],
  "garden-void": ["新中式玄关柜", "新中式屏风隔断", "新中式边几", "新中式电视柜", "新中式长凳，公共空间", "新中式床头柜"],
  "brush-gesture": ["新中式休闲躺椅", "新中式单椅", "新中式长凳，酒店大堂", "新中式茶桌", "新中式落地灯", "新中式吧台椅"],
  "song-vessel": ["新中式坐墩", "新中式边几", "新中式床头柜", "新中式茶台", "新中式收纳柜", "新中式凳子"],
  "timber-frame": ["新中式书架，可拆装", "新中式茶桌", "新中式餐桌", "新中式床架", "新中式边几", "新中式长凳"],
};

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { command, files: [] };
  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (value.startsWith("--")) {
      options[value.slice(2)] = rest[index + 1];
      index += 1;
    } else {
      options.files.push(value);
    }
  }
  return options;
}

async function candidates(options) {
  const { createRuntime } = require("../server");
  const { gateway } = createRuntime(process.env);
  const out = path.resolve(options.out || "style-reference-candidates");
  const per = Number(options.per || 6);
  const packs = listStylePacks().filter((pack) => !options.pack || pack.id === options.pack);
  for (const pack of packs) {
    const dir = path.join(out, pack.id);
    fs.mkdirSync(dir, { recursive: true });
    for (const [index, brief] of (PACK_BRIEFS[pack.id] || []).slice(0, per).entries()) {
      const name = String(index + 1).padStart(2, "0");
      if (fs.existsSync(path.join(dir, `${name}.png`))) continue;
      try {
        const result = await gateway.generate({ originalPrompt: brief, prompt: brief, style: "newChinese", modernity: 60, stylePack: pack.id, quality: "hd", size: "16:9-720p", mood: 62 });
        const match = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(result.images[0]?.url || "");
        if (!match) throw new Error("no image");
        fs.writeFileSync(path.join(dir, `${name}.png`), Buffer.from(match[2], "base64"));
        fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify({ brief, family: familyFor(brief).name, prompt: result.request.prompt }, null, 2));
        console.log(`${pack.id}/${name} ${brief}`);
      } catch (error) {
        console.log(`${pack.id}/${name} ERROR ${error.message}`);
      }
    }
  }
  // The sheet always lists every pack, even when only one was (re)generated.
  writeContactSheet(out, listStylePacks());
}

function writeContactSheet(out, packs) {
  const escapeHtml = (value) => String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[char]);
  const sections = packs.map((pack) => {
    const dir = path.join(out, pack.id);
    const cards = (fs.existsSync(dir) ? fs.readdirSync(dir) : []).filter((file) => file.endsWith(".png")).sort().map((file) => {
      const meta = readJson(path.join(dir, file.replace(/\.png$/, ".json")));
      return `<figure><img src="${pack.id}/${file}" alt="" loading="lazy"><figcaption><b>${pack.id} ${file.replace(".png", "")}</b> ${escapeHtml(meta.brief || "")}</figcaption></figure>`;
    }).join("");
    return `<h2>${escapeHtml(pack.title)} <small>${pack.id}</small></h2><p>${escapeHtml(pack.summary)}</p><div class="grid">${cards}</div>`;
  }).join("");
  fs.writeFileSync(path.join(out, "index.html"), `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>风格包候选图</title>
<style>:root{--bg:#f6f2ea;--ink:#2a2420;--muted:#7a6f66;--line:#ddd3c4}@media (prefers-color-scheme:dark){:root{--bg:#1d1a17;--ink:#eee6da;--muted:#a59a8e;--line:#3a332c}}
body{margin:0;padding:24px 16px 64px;background:var(--bg);color:var(--ink);font:14px/1.6 system-ui,-apple-system,"PingFang SC",sans-serif}main{max-width:1280px;margin:0 auto}h1,h2{font-family:"Songti SC",serif}h2 small{color:var(--muted);font:12px monospace}p{color:var(--muted)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}figure{margin:0}img{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:8px;border:1px solid var(--line)}figcaption{font-size:12px;color:var(--muted)}figcaption b{color:var(--ink)}</style>
</head><body><main><h1>风格包候选图</h1><p>每个风格包挑 3–6 张最能代表方向的图，告诉我编号（例如 steel-line 01 04）。选中的图会成为生图时的视觉参考。</p>${sections}</main></body></html>`);
  console.log(`contact sheet: ${path.join(out, "index.html")}`);
}

function approve(options) {
  const pack = listStylePacks().find((item) => item.id === options.pack);
  if (!pack) throw new Error(`Unknown pack: ${options.pack}`);
  const from = path.resolve(options.from, pack.id);
  const to = path.resolve(options.to || process.env.STYLE_REFERENCE_DIR || path.join(__dirname, "..", "data", "style-references"));
  fs.mkdirSync(path.join(to, pack.id), { recursive: true });
  const manifestPath = path.join(to, "manifest.json");
  const manifest = readJson(manifestPath);
  manifest.images = Array.isArray(manifest.images) ? manifest.images : [];
  for (const number of options.files) {
    const name = String(number).padStart(2, "0");
    const source = path.join(from, `${name}.png`);
    if (!fs.existsSync(source)) throw new Error(`Missing candidate ${pack.id}/${name}`);
    const meta = readJson(path.join(from, `${name}.json`));
    const id = `${pack.id}-${name}`;
    fs.copyFileSync(source, path.join(to, pack.id, `${name}.png`));
    manifest.images = manifest.images.filter((image) => image.id !== id);
    manifest.images.push({ id, pack: pack.id, title: meta.brief || id, file: `${pack.id}/${name}.png`, family: meta.family || "", kind: "aiConcept", source: "AI 生成（木生生图流程），人工精选", license: "项目自有；AI 概念图，不代表真实产品、材料或工艺" });
    console.log(`approved ${id}`);
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

if (require.main === module) {
  const options = parseArgs(process.argv.slice(2));
  const run = options.command === "candidates" ? candidates(options) : options.command === "approve" ? Promise.resolve(approve(options)) : Promise.reject(new Error("Usage: candidates | approve"));
  run.catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

module.exports = { parseArgs, approve, writeContactSheet, PACK_BRIEFS };
