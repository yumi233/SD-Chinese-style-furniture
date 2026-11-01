# B2 · 基于父图修改（负责人：GPT-6.1 Sol）

先读 `AGENTS.md`、`docs/RELEASE_RULES.md`、`docs/v3/PLAN.md`、`docs/v3/tasks/B1-REPORT.md`。不要改已认可的视觉；界面只改逻辑和必要文案。

## 问题

「修改 vN」「改一处」「再来一版」创建任务时带 `parentId`，但服务端只校验并记录它：`src/imageGateway.js` 调用 `provider.generate({ request, settings })` 时**没有传父图**，模型只拿到文字，新版本与上一版没有图像上的继承。框选区域在前端被压成「中右区域」这类九宫格文字（`public/js/studio/model.js` 的 `regionDescription`），真实框选坐标丢失。

## 要求

1. **前端**：带父版本的提交，除 `parentId` 外，「改一处」再发送归一化选区 `region: { x, y, width, height }`（0–1，相对父图）。文字描述保留，作为提示的一部分。
2. **任务接口**（`src/generationTasks.js`）：校验 `region`（四个有限数、范围 0–1、面积大于 0、不越界），只允许和 `parentId` 一起出现；存进 `task.request`。
3. **服务端取父图**：由 `parentId` 找到当前用户自己的历史记录，读取它保存在 `historyStore` 图片目录里的第一张图（只能读该目录内的文件，防路径穿越；限制大小与类型）。找不到或读不了 → 400，明确报错，**不得静默退回纯文字生成**。
4. **网关与 provider**：`generate` 和 `runAgent` 的每一轮把父图作为参考图传给 provider（`src/providers/codexCli.js` 已支持 `referenceImages`）。
   - 给 codexCli 的提示包区分「父图（要在它基础上修改）」与普通风格参考：父图用途写明保持构图、视角、材质、光线和未提及的部件不变，只改用户说的地方；有 `region` 时写出选区坐标（百分比）并说明只改该区域内的部件。不要把它说成像素级蒙版。
   - 不支持参考图的引擎（检查 A1111、ComfyUI、兼容接口的 provider 现有能力）在带 `parentId` 时返回明确错误「此引擎暂不支持基于上一版修改」；若某 provider 已有 img2img 能力且改动很小，可接入，但要在报告里说明。
   - 防止把父图原样当作结果：沿用 codexCli 已有的「输出与输入相同则排除」逻辑，并有测试。
5. **历史记录**：在新记录上保存 `region`（若有），供以后展示；旧记录兼容。
6. **测试**（不调用付费模型，用模拟 provider / fixture）：父图字节确实到达 provider；region 校验的边界；他人 parentId、缺失文件、路径穿越被拒；不支持的引擎报错；agent 每轮都带父图；`test/v3Browser.test.js` 增加「改一处」请求体含 region 的断言。

## 交付

- 本地 `V3_QA_REQUIRED=1 … make check` 0 失败 0 跳过（命令见 `docs/v3/QA-REPORT.md`）。
- 一个或两个提交，信息以 `Edit from the parent image` 开头，末尾 `Co-Authored-By: GPT-6.1 Sol <noreply@openai.com>`。不推送、不开 PR、不发起真实生成。
- 写 `docs/v3/tasks/B2-REPORT.md`，并用中文简短回复七项：已完成工作、文件、关键改动、测试命令、测试结果、未解决问题、风险。真实生成验收由负责人另做。
