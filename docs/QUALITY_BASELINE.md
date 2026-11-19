# 家具画质基线

同一引擎、模型和评审代码各运行一组改动前与改动后的样本。两组各有 12 个固定需求，覆盖明式、新中式、宋韵、禅意四种风格，每种各生成椅、案、柜。每条需求生成 1 张并评审 1 次，使用首轮结果比较古董感比例、平均总分和七项维度均分。

## 本机运行

先用预演查看题组，预演不会读取模型配置、发请求或写入报告。

```sh
node scripts/quality-baseline.js --engine codexCli --dry-run
```

`--only` 接受逗号分隔的题目 ID 或从 1 起的题号，按给定顺序选题。`--max-calls` 限制每阶段累计的生图尝试，取值 1–12，失败与中断也计入。每张完成的图另评一次。限额用完时停止，即使列表还有题目。续跑沿用阶段记录中的上限，可以调低。进行配对时，改动前报告需已包含选中的题目。

```sh
node scripts/quality-baseline.js --only newChinese-chair,song-table,zen-chair --max-calls 2 --dry-run
```

获得真实调用授权后，使用当前工作树的脚本，指定一组共用的日期和两次生成版本。脚本从各指定提交提取后端生成代码，两组使用当前脚本的同一视觉评审代码。名为 `before` 的阶段完成后才能运行 `after`。采用 GPT-6.2 Sol 比较时，基线版本为 `main` 加仅改变 Codex 模型配置的提交，以便保留原生成逻辑并使用相同模型。

```sh
node scripts/quality-baseline.js --engine codexCli --phase before --revision <基线提交> --date <YYYY-MM-DD>
node scripts/quality-baseline.js --engine codexCli --phase after --revision <改动后提交> --date <YYYY-MM-DD>
```

脚本直接读取当前进程的环境变量。生产配置、工作台账号与历史无需接入。

| 入口 | 环境变量 |
| --- | --- |
| Codex CLI 生成或评审 | `CODEX_CLI_ENABLED`、`CODEX_CLI_MODEL`、`CODEX_CLI_AUTH_FILE`。按需配置 `CODEX_CLI_COMMAND`、`CODEX_CLI_REASONING_EFFORT`、`CODEX_CLI_TIMEOUT_MS` |
| A1111 生成 | `AUTO1111_BASE_URL`、`AUTO1111_LORA` |
| ComfyUI 生成 | `COMFYUI_BASE_URL`、`COMFYUI_CHECKPOINT`。使用内置单图工作流 |
| 兼容图像接口生成 | `IMAGE_MODEL_BASE_URL`、`IMAGE_MODEL_NAME`，认证时用 `IMAGE_MODEL_API_KEY` |
| 兼容视觉模型评审 | `VISION_MODEL_BASE_URL`、`VISION_MODEL_NAME`，认证时用 `VISION_MODEL_API_KEY` |

Codex CLI 引擎默认同样使用 Codex CLI 评审。可通过 `--reviewer visionModel` 对接本机的兼容视觉端点。其余引擎默认接兼容视觉模型，也可指定 `--reviewer codexCli`。HTTP 端点与需下载的图像地址使用回环地址。Codex CLI 使用既有本机登录文件，运行时的私有缓存由适配器在临时目录管理。

GPT-6.2 Sol 本机测试计划按每张约 1–3 分钟预留，包含生成和一次视觉评审。每次请求的实际耗时写入 JSON。同一日期的每个阶段最多发出 12 次生图请求，失败时停止并保存已有结果。开始后请保留目录和计数，重新运行前先核对已发出的请求。一次完整对照上限为 24 次生图。

## 结果

图片以及 `results.json`、`summary.md` 放在 `local-archive/quality-baseline/<日期>/<阶段>/`。完成两组后，日期目录生成 `comparison.md`，其中列出各维度与配对图。归档由 Git 和 Docker 忽略。

汇总以已评审样本为分母。测试固定了提示词与方形尺寸请求。Codex CLI 的随机输出可能有波动，同一个种子不保证复现。该测试比较首轮的生图表现，迭代继续、最佳轮选择和默认风格由回归测试覆盖。

已有两阶段记录时，可以在同一日期使用 `--resume-after` 续跑 Codex CLI 组。保留原有结果，每个阶段最多记录 12 次生成尝试，已开始但没有图片的请求也占一条。续跑先按风格轮流选没有改动后图片的题。补测旧中断题会额外消耗一个剩余名额。每条新增记录保留实际提交和评审代码指纹，比较新版和旧版评审分数时应标明差异。新记录用 `highlight` 保存一句可见设计特点，空值表示评审没有找到亮点。旧记录保留原字段。

生成计划按题号独立分配场景、光线和机位，作为默认方向。需求指定的条件优先，机位以能看清亮点为准。新版结果保留计划与 `highlightEvidence`，后者记录部件位置、与常规形态的区别和可见用途。

汇总混合批次时，按题号、生成版本和评审指纹区分。已有九对的人工判定可作为离线核对材料。旧版图片和分数应沿用原始记录。

## 参考案例文案待补

下列条目各留有 `title`、`titleEn`、`teachingPoint`、`teachingPointEn` 四个 `TODO_TEXT` 字段，供后续补写。评审上下文在文案完成前使用形制和关键词。

| 条目 ID | 形制关键词 |
| --- | --- |
| `contemporary-circle-chair` | 圈椅、连续曲木、薄截面、哑光白橡木 |
| `contemporary-recessed-leg-table` | 案、腿足内收、夹头榫、平直案面 |
| `contemporary-rounded-cabinet` | 圆角柜、简化门框、平整饰面、隐藏拉手 |
