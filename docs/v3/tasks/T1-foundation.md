# T1 · 视觉基础（负责人：GPT-6.1 Sol）

先读 `docs/v3/PLAN.md` 和 `AGENTS.md`。

目标：把全站样式改成 v3 规格，并合并成三层。当前页面的功能和 DOM 不变，只改外观；后续任务会重做首页和工作台。

1. 改写 `public/ui/tokens.css`：放入 PLAN 中的全部颜色、日夜两套主题、字体、圆角、间距、阴影、动效变量。保留现有代码在用的变量名作为别名，例如 --background、--foreground、--accent、--radius-*、--r-*，让旧样式继续生效。
2. 改写 `public/ui/components.css`：按钮、输入框、选择框、分段控件、标签、卡片、浮层、对话框、提示条，全部按 PLAN 的质感和同心圆角来做。把 `brand-tokens.css`、`fluid.css`、`materials.css`、`studio-theme.css` 中仍然需要的规则并入这一层或 `public/css/*.css`，然后删除这几个文件，并从 html 里去掉对它们的引用。
3. 首页和工作台的 `<link>` 只保留三层。标题字体改为宋体。主色从蓝改为鼠尾草绿 / 橄榄绿，主按钮改为石板灰渐变。
4. 更新 `docs/v3/tasks/T1-REPORT.md`，列出：删掉的文件、新的变量表、每一对同心圆角（外 − 间距 = 内）。
5. 验证：`npm test`、`make check` 通过；用无头 Chromium 截图首页和 /studio（1440 和 390），检查没有控制台错误、横向溢出或明显错位。截图放在 tmp/v3/T1/。
6. 允许修改：`public/ui/`、`public/css/`、`public/index.html` 与 `public/studio.html` 的 `<head>`、`docs/v3/tasks/T1-REPORT.md`；如果测试里有断言引用了被删除的 css 文件，可以修改 `test/frontendBindings.test.js`。不要改 JS 逻辑和后端。
7. 只提交一次，提交信息以 `Rebuild v3 visual foundation` 开头。最后用中文回复：改了什么、怎么验证的、还有什么风险。
