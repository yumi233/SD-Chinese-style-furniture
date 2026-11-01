# B1 · 强制取消、按调用计额度、CI 浏览器门禁（负责人：GPT-6.1 Sol）

工作目录：`/Users/huangxi/orca/workspaces/SD-Chinese-style-furniture/backend-gates`，分支 `musheng/backend-gates`（基于已合并 v3 的 `main`）。先读 `AGENTS.md`、`docs/RELEASE_RULES.md`、`docs/v3/PLAN.md`、`docs/v3/QA-REPORT.md`。

三件事按顺序做，每件一个提交。**不要发起任何真实生图**：所有验证用测试里的本地模拟服务（参考 `test/v3Browser.test.js` 的 `startFixture`）。不要改已认可的视觉（颜色、布局、动效、组件样式）；界面只允许改文案和状态逻辑，确需新增的显示必须复用现有组件。项目原则：Avoid unnecessary secondary labels and descriptions. Let the layout do the explaining.

## 1. 单次生成强制取消

现状：`src/generationTasks.js` 的 `stop()` 只给 agent 任务置 `stopRequested`，普通任务停不下来；全站同时只允许 1 个活动任务，一个卡住的任务会挡住所有人。

要求：
- 每个任务创建一个 `AbortController`。`stop()` 对 normal 和 agent 都生效：立即 abort 当前调用。agent 任务已保存的轮次保留。
- `signal` 经 context 传到 `src/imageGateway.js` 的 `generate` / `runAgent`，再传给 provider。`src/providers/codexCli.js` 的子进程在 abort 时走已有的 SIGTERM → SIGKILL 路径并清理临时目录；HTTP 类 provider（A1111、ComfyUI、兼容接口）把 signal 交给 fetch。
- 新增终态 `cancelled`（不属于 `ACTIVE`）。**确认子进程或请求真正结束后**才写终态、释放全局槽位，避免旧进程还在跑时新任务已开始。服务重启恢复时，`cancelled` 视为终态。
- 竞态全部有测试：排队中取消、运行中取消、完成瞬间取消、重复取消（幂等）、取消后立即创建新任务能成功、已完整落盘的图片不丢。
- 前端 `public/js/studio.js`（及 `public/js/studio/` 模块）：普通任务也能点停止；显示已取消的状态；刷新页面能正确恢复 `cancelled`。去掉「无法强制取消」之类的旧提示。提示里如实说明「已发出的请求可能仍计入额度」，一句话即可。
- 接口沿用 `POST /api/v1/generation-tasks/:id/stop`（以及旧的 `/api` 路由）。

## 2. 额度按实际调用计数

现状：`src/generationTasks.js:53` 每人每小时 20 个**任务**；agent 任务一次最多 3 轮生成 + 3 轮评审，实际消耗被低估。

要求：
- 生成调用与评审调用**分开计数**，每人滚动一小时内各 20 次（做成常量，集中定义）。
- 创建任务时预留：normal = 1 次生成；agent = `maxRounds` 次生成 + `maxRounds` 次评审。余量不足返回 429，消息写明哪一类不够、多久后恢复。
- 任务结束（完成、失败、取消）时结算：按实际发出的调用记账，未用的预留退回。结算必须幂等，重复结算、服务重启后都不能多扣或少扣；预留和实际用量随任务文件持久化。已经发出后被取消的调用照常计入。
- 提供只读接口返回当前用户剩余次数与最早恢复时间（`/api/v1/generation-tasks/quota`，旧 `/api` 同步），需登录。
- 工作台显示剩余生成次数：只用一个等宽数字，放在现有设置弹窗或输入栏已有的状态位置里，不加说明文字；剩余 0 时生成按钮禁用并显示恢复时间。
- 保留「全站同时 1 个任务」不变。不自动切换到其他生图服务。

## 3. CI 浏览器门禁

现状：`.github/workflows/docker-image.yml` 只跑 `npm test`，`test/v3Browser.test.js` 缺环境变量就静默跳过。

要求：
- 把 `playwright-core` 固定版本加为 devDependency（Docker 用 `npm ci --omit=dev`，不进镜像）。
- CI 的 test job 安装 Chromium 与 WebKit（含系统依赖），设置 `V3_QA_*` 变量，跑完整测试。
- 新增 `V3_QA_REQUIRED=1`：设置时浏览器套件缺环境直接**失败**，不得跳过。CI 设置它；本地不设时行为不变。
- docker job 仍然 `needs: test`，浏览器测试失败就不构建、不发布。
- 按 `docs/RELEASE_RULES.md` 同步文档（依赖变化：`README.md` / `docs/INSTALL.md` 中测试说明，以及 `docs/v3/QA-REPORT.md` 里本地运行命令）。

## 验收与交付

- 每件事都补回归测试（`node:test`），并更新 `test/v3Browser.test.js` 覆盖：普通任务运行中停止 → 显示已取消 → 立即开始新任务成功；剩余次数显示与 0 次时禁用。
- 本地完整运行（必须 0 失败 0 跳过）：
  ```sh
  V3_QA_REQUIRED=1 V3_QA_PLAYWRIGHT=/tmp/pw/node_modules/playwright-core \
  V3_QA_CHROMIUM="$(cat /tmp/ms-shots/chrome-path)" \
  V3_QA_WEBKIT="$HOME/Library/Caches/ms-playwright/webkit-2370/pw_run.sh" \
  V3_QA_OUTPUT="$PWD/tmp/v3/b1" make check
  ```
- 不推送、不开 PR、不部署；只在本分支提交三个提交，信息分别以 `Cancel`、`Count`、`Require` 开头，末尾带 `Co-Authored-By: GPT-6.1 Sol <noreply@openai.com>`。
- 最后写 `docs/v3/tasks/B1-REPORT.md`（中文）：每件事改了哪些文件、关键设计、测试命令与结果（贴数字）、未解决问题和风险。用中文简短回复同样的七项：已完成工作、文件、关键改动、测试命令、测试结果、未解决问题、风险。
