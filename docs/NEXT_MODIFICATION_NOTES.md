# 后续修改注意事项

## 启动方式

在当前工作区运行：

```powershell
npm install
npm start
```

默认访问：

```text
http://127.0.0.1:3000
```

如果端口被占用：

```powershell
$env:PORT=3001
npm start
```

## 本地模型要求

AUTOMATIC1111 默认地址：

```text
http://127.0.0.1:7860
```

ComfyUI 默认地址：

```text
http://127.0.0.1:8188
```

如果网页调用没有反应，优先检查三件事：

1. 本地 SD WebUI 或 ComfyUI 是否已经启动。
2. SD WebUI 是否开启了 API。
3. 修改 `server.js` 或 `src/` 后是否重启了 `npm start`。

## 最容易改的功能点

- 想调 UI 间距、颜色、布局：改 `public/css/home.css` 或 `public/css/studio.css`，并保持页面 token 一致。
- 想改页面文案或模块位置：首页改 `public/index.html`，工作台改 `public/studio.html`。
- 想调中文词典、提示词强化、结果卡片按钮：改 `public/js/studio.js`。
- 想调默认出图参数：改 `src/lib/requestNormalizer.js`。
- 想调 LoRA 拼接、采样器、CLIP skip：改 `src/providers/automatic1111.js`。
- 想接自定义 ComfyUI 工作流：改 `.env` 的 `COMFYUI_WORKFLOW_FILE`，必要时改 `src/providers/comfyui.js`。
- 想改需求识别（否定词、材料、家具类型、推出的禁止项）：改 `src/design/concepts.js` 与 `src/design/brief.js`，并在 `test/knowledge.test.js` 或 `test/designTasks.test.js` 加用例。
- 想改提示词结构或冲突过滤：改 `src/design/composer.js`；不要在前端或 Provider 里再拼一份提示词，否则重新生成会和 Codex 收到的线索不一致。
- 想改评审标准或评分上限：改 `src/design/evaluation.js`；违反需求不能被高分抵消、缺字段即不完整这两条有回归测试。
- 想加真实案例：改 `src/references/realCases.json`。只写有出处的事实，每条材料和尺寸标明依据（`source` / `visible` / `inferred` / `unknown`），图片只给链接。不确定的名称、产地不要写。
- 想声明新引擎的能力：在 Provider 里实现 `capabilities()`；没有用真实调用验证过的能力只能标 `documented_unverified`。
- 调提示词、知识或规则时只看 `eval/design-briefs.json` 的 `dev` 用例；`holdout` 只用于对比，不要据此调参。

## 历史坑位

- 网页出图曾经比 SD 原版更乱，主要原因是后端默认参数和 SD 原版不一致。
- 当前已按稳定参数收敛，但如果继续改默认值，建议一次只改一个变量，方便定位。
- 浏览器可能缓存 `public/js/` 和 `public/css/`，UI 没变时先 `Ctrl + F5` 强刷。
- 移动端已取消，不要再从旧文档里恢复 `apps/mobile`，除非明确重新启动 App 方向。
