# 实机测试与修复（负责人：GPT-6 Astra）

先读 `AGENTS.md`、`docs/v3/PLAN.md`。当前分支 `musheng/v3`，工作目录就是本目录。目标：把木生 v3 网站当成真实用户完整用一遍，找出问题，修好，再交给负责人复核。

## 运行环境（已在运行，不要改动配置）
- 服务：`http://127.0.0.1:3300`，已接本机 Codex CLI 真实生图（`codexCli`，gpt-6.1-sol）。tailnet 地址 `https://mac-mini.tailfe8584.ts.net:8443/` 指向同一服务。
- 如果改了 `server.js` 或 `src/` 需要重启，必须用同样的环境变量：
  ```
  cd 本目录; kill $(lsof -iTCP:3300 -sTCP:LISTEN -t)
  DEFAULT_ENGINE=codexCli CODEX_CLI_ENABLED=true CODEX_CLI_MODEL=gpt-6.1-sol CODEX_CLI_REASONING_EFFORT=high CODEX_CLI_TIMEOUT_MS=300000 CODEX_CLI_AUTH_FILE=$HOME/.codex/auth.json CODEX_CLI_AUTH_CACHE_FILE=$PWD/data/codex-auth/auth.json CORS_ALLOWED_ORIGINS=https://mac-mini.tailfe8584.ts.net:8443 PORT=3300 HOST=127.0.0.1 nohup node server.js > /tmp/ms-orch/v3-server.log 2>&1 &
  ```
- 浏览器：只用无头浏览器。桌面用 Chromium（`$(cat /tmp/ms-shots/chrome-path)`），手机用 iPhone WebKit（Playwright：`require("/tmp/pw/node_modules/playwright-core")`，可执行文件 `~/Library/Caches/ms-playwright/webkit-2370/pw_run.sh`，`devices["iPhone 15"]`；参考脚本 `/tmp/ms-wk/full.cjs`、`/tmp/ms-wk/live.cjs`）。**不要操作用户正在使用的 Chrome 或任何桌面窗口。**
- 真实生图会消耗用户的 Codex 额度：**整个任务最多发起 4 次真实生成**（含迭代模式）。其余流程用 `?demo=success` 等演示数据或 test 里的模拟服务器验证。

## 要实测的流程（桌面 1440 与 iPhone 各走一遍）
1. 首页：ASCII 主视觉（实时字符、鼠标放大镜、手机降级）、输入条跳转工作台并带入描述、短语、演示窗口四步自动播放与切换、底部工具栏、日夜与简繁切换。
2. 登录页：注册、登录、错误提示、密码显示切换、`?next=` 跳转、退出登录。
3. 工作台（真实账号）：单次生成 → 出图与显影 → 选中版本后「修改 vN」再生成（应带 parentId 连线）→ 卡片「改一处」框选并提交 → 对比三种方式 → 导出 PNG → 作品抽屉打开历史并恢复 → 刷新页面后恢复正在进行的任务 → 停止任务 → 迭代模式出评分与建议、点建议填入输入栏 → 设计记忆锁定。
4. 所有下拉框（自定义组件 `public/js/modules/select.js`）、复选框、滑杆、弹窗的键盘操作与 Esc 关闭、焦点返回。
5. 夜间模式下以上页面是否有刺眼白块、看不清的文字。
6. 控制台错误、横向溢出、按钮被遮挡、文字截断、点了没反应、状态不对的地方。

## 修复规则
- 修真实的缺陷和明显的体验问题；不要改整体视觉方向、配色、字体、版式（已被用户确认），不要重做组件，只做定向修复。
- 遵守 4px 网格和同心圆角（内 = 外 − 间距）、不加眉题和解释性小字。
- 不改依赖、Docker、部署配置；不提交 `data/`、`config.local.json`、`tmp/`。
- 每修一类问题补一个回归测试（`test/`），`npm test` 与 `make check` 必须通过。
- 可以分多次提交，提交信息说明修了什么。

## 交付
写 `docs/v3/QA-REPORT.md`：
- 测试清单：每一项「通过 / 发现问题 / 未能验证（原因）」。
- 问题列表：现象、复现步骤、原因、修复（提交号）、修复后如何验证。
- 没修的问题及原因。
- 真实生成用了几次。
- 截图放 `tmp/v3/qa/`（不提交），报告里写路径。
最后用中文简短回复：发现几个问题、修了几个、还剩什么。
