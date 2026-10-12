# 设计知识库与新中式风格控制

木生的智能体在生成和评审时，会先从内置知识库检索相关条目（检索增强生成，RAG），再把它们交给写提示词的模型、生图模型和评审模型。这样做的目的，是让“新中式”稳定地落在当代设计上，而不是被模型默认的“中式家具 = 红木古董”拉回去。

## 数据流

1. 前端把需求、风格（默认 `newChinese`）和「传统与当代」配比（`modernity`，0 偏传统、100 偏当代）发给后端。
2. `src/referenceKnowledge.js` 按关键词与风格检索至多 7 条知识。新中式模式下，先放入本次选定的传统基因和形体手法，再保证包含跨界母题、当代材料和反例。
3. 文字模型（若启用）收到风格定义、配比和知识里的 Use / Avoid 短语，先决定保留哪一两个传统基因，再写英文提示词。
4. `src/knowledge/promptGuard.js` 去掉风格禁止的词（如 antique、Ming-style、carving、palace），缺少风格锚点时补上，并把风格反向词并入负面提示词。新中式还会追加两样东西（见 `cuePicker.js`）：
   - **指定基因**：按家具类别挑一个具体的传统基因（椅类用椅圈线或罗锅枨，桌类用缩进腿足或束腰，柜类用格栅或冰裂纹，屏风用格栅，坐墩用鼓墩轮廓），偏传统挑两个。
   - **形体手法**：按类别挑一个改变形体的手法（减法、放大、负形、悬浮、借形建筑、笔势……），避免“只换材料”。偏传统不加。
   每一轮都经过这一步，评审改写的提示词也不例外。
5. Codex CLI 生图会单独收到 `styleGuidance`（锚点、配比、避免项、知识）。它由服务器生成，与用户输入的 `designBrief` 分开。
6. 评审（视觉模型或 Codex CLI）知道当前风格、配比、指定基因和形体手法。新中式模式下「文化准确性」改为「文化转译」，并额外返回 `styleCheck`：古旧风险 `antiqueRisk`、是否可见中国基因 `chineseCue`、保留的基因 `keptCues`、是否只换材料 `materialSwapOnly`、古旧信号 `antiqueSignals`。三种情况强制进入下一轮修改：
   - 古旧风险 ≥ 60：最高 70 分。
   - 看不出中国基因（太普通）：最高 75 分。
   - 只换材料、形体没变：最高 80 分。

## 文件

- `src/knowledge/index.js`：合并下面四个条目文件。
- `src/knowledge/entries.json`：形制、传统基因、基础手法、材料、场景、尺度、反例。
- `src/knowledge/methods.json`：形体转译手法（带 `fits` 适用类别）与“只换材料”等反例。
- `src/knowledge/motifs.json`：跨界母题（建筑、园林、器物、书画、自然）。
- `src/knowledge/cases.json`：当代案例分析、补充形制与当代材料。
- `src/knowledge/cuePicker.js`：按家具类别挑选指定基因与形体手法，优先用强识别度的基因（罗锅枨、马蹄足、格栅、冰裂纹等）；缩进腿足、束腰阴影线这类弱基因只作第二个基因。
- `src/knowledge/stylePacks.json` 与 `stylePacks.js`：风格包。
- `src/styleReferences.js`：风格包参考图读取（只读私有目录与清单）。
- `scripts/styleReferences.js`：生成候选图、批准参考图。
- `src/knowledge/styleProfiles.js`：各风格的锚点、正向词、反向词、禁止词与评审口径，以及配比档位。
- `src/knowledge/promptGuard.js`：提示词守卫与负面词合并。
- `src/referenceKnowledge.js`：检索与格式化，同时提供 `/api/reference-cases` 给前端「案例」面板。
- `eval/style-briefs.json` 与 `scripts/evalStyle.js`：古董率评测。

## 条目格式

```json
{
  "id": "gene-continuous-rail",
  "kind": "gene",
  "title": "一笔连续的椅圈线",
  "styles": ["newChinese"],
  "keywords": ["圈椅", "扶手", "曲线"],
  "summary": "用自己的话写的知识说明",
  "promptHints": ["英文正向短语，可直接进提示词"],
  "avoidHints": ["英文反向短语"],
  "reviewPoints": ["评审时检查什么"],
  "commonIssues": ["典型错误"],
  "sources": [{ "title": "出处名称", "url": "https://..." }]
}
```

`kind` 取值：`form` 经典形制、`gene` 传统基因、`method` 转译手法、`motif` 跨界母题、`material` 材料搭配、`scene` 应用场景、`ergonomics` 尺度规范、`antiPattern` 常见反例、`case` 研究与案例。`styles` 决定条目在哪些风格下可被检索。形体手法另有 `fits`（`seat`、`bench`、`table`、`cabinet`、`screen`、`stool`、`bed`、`other`），决定它会被分配给哪类家具；`promptHints` 的第一条会直接写进提示词，务必是一句具体的英文形体描述。

## 新增条目的规则

- **只写自己的归纳。** 不复制网页原文，不收录第三方图片。仓库是公开的，条目会随源码一起发布。
- **记录出处。** 有外部依据就写进 `sources`（必须是 https）。没有外部依据的经验性条目留空，前端显示为「木生课程整理」。
- **尺寸写参考区间**，并注明以现行国家标准文本为准。
- **关键词要贴近用户的写法**（如“公寓”“租房”“茶桌”），检索只做关键词匹配。
- 改完运行 `npm test`。`test/knowledge.test.js` 会检查字段完整、id 唯一、来源是 https、风格名有效。

## 风格包与参考图（类似生图 Skill）

风格包把一个设计方向固定下来，定义在 `src/knowledge/stylePacks.json`：优先使用的基因（`cues`）和形体手法（`moves`）、写进提示词的配方（`recipe`）、要避免的元素（`avoid`）和评审清单（`checklist`）。目前有五个：钢木细线、园林负形、书法笔势、宋式素器、构架斗拱。

- 用户在「风格」面板选择新中式后，可以再选一个风格包（`stylePack`）。不选就按家具类别自动挑基因与手法。
- 每个风格包有 `fits`（适用的家具类别）。不适用时整个风格包不生效（不加配方、不附参考图），`promptPipeline.stylePackSkipped` 会记录；前端提示里会写出适用范围。
- 风格包的基因只在适合该类家具时使用；不合适时（例如给椅子选了园林负形的月洞门）退回该类别自己的基因。形体手法同理。
- **参考图**：每个风格包可以有若干张精选参考图。使用 Codex CLI 生图时，服务器按家具类别挑 2 张作为视觉参考附上；其他引擎只使用配方文字。
- 参考图放在 `STYLE_REFERENCE_DIR`（默认 `data/style-references`，Docker 中为 `/app/data/style-references`），目录里有 `manifest.json`。**它属于私有数据，不进 Git**；部署时随数据卷一起备份和迁移。
- 不使用博物馆古董照片作为生图参考，它们会把结果拉回老家具；博物馆开放授权图片只用于知识整理。

### 建立参考图

```bash
node scripts/styleReferences.js candidates --out <候选目录> --per 6
```

为每个风格包生成候选图（会调用已配置的真实模型），并在候选目录里生成 `index.html` 对照页。人工挑选后：

```bash
node scripts/styleReferences.js approve --from <候选目录> --pack song-vessel 01 03 05
```

把选中的图复制到参考图目录并写入清单。`GET /api/style-packs` 会返回每个风格包的参考图数量（不返回图片）。

## 古董率评测

```bash
node scripts/evalStyle.js --limit 20 --rounds 2
```

脚本复用服务器的 `.env` 与模型配置，**会调用真实的付费模型**，除非配置指向本地模拟服务。它对 `eval/style-briefs.json` 里固定的 20 条需求逐条运行智能体，输出首轮与最佳轮的古董率（古旧风险 ≥ 60 的比例）、平均古旧风险和平均得分。结果写入 `eval/results/`（已被 Git 忽略），只含分数和提示词，不含图片。调整提示词、知识或风格配置前后各跑一次，用数字判断是否改善。

古旧风险由评审模型给出，本身也可能有偏差；建议每次再人工抽看几张图。

### 2026-10 评测结果

20 条固定需求，各版本跑两轮智能体（Codex CLI · GPT-6.1 Sol / high），由同一个不知版本的独立评审打分（最佳轮）：

| 指标 | 线上旧版 | 默认（强基因 + 中立评审） | 风格包 + 参考图 |
|---|---|---|---|
| 古董率 | 20%（首轮 35%） | 0% | 0% |
| 可辨认中国基因 | 100% | 100% | 85% |
| 形体新意（0–100） | 32 | 61 | 70 |
| 符合需求 | 81 | 91 | 87 |

风格包里书法笔势（82）、园林负形（80）新意最高；宋式素器用在桌类时会丢失中国基因，因此加了 `fits` 限制。参考图少时结果会趋同，每个风格包建议 8–12 张。每条需求只跑一次，结论供参考。

## 后续可做

- 关键词检索换成向量检索（用在线模型的 embedding 接口，条目数量在几千以内无需单独的向量数据库）。
- 图片参考：Codex CLI 生图与评审已支持参考图附件（`referenceImages`），可以接入授权明确的当代家具图片，作为形体参考。
