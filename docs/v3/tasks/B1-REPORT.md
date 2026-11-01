# B1 报告 · 强制取消、按调用计额度、CI 浏览器门禁

第 1 项由 GPT-6.1 Sol 完成（`Cancel active generation calls…`），负责人逐行复核后保留，并补回 SIGKILL 之后的 10 秒兜底；第 2、3 项由负责人完成。

## 1. 强制取消
- 每个任务一个 `AbortController`；`POST /generation-tasks/:id/stop` 对单次和迭代都立即生效。signal 经网关传到 Codex 子进程（SIGTERM → SIGKILL）、A1111、ComfyUI 轮询和兼容 HTTP 接口。
- 新终态 `cancelled`；子进程或请求真正结束后才写终态、释放全站唯一槽位。SIGKILL 后 10 秒仍未退出也按已结束处理，避免一个卡死进程永久占住槽位。
- 已完整落盘的图片保留；重启后 `cancelled` 视为终态。

## 2. 额度按调用计数（`src/generationQuota.js`）
- 每人滚动一小时：生成 20 次、评审 20 次，分开计数。
- 创建时按最多轮数预留（单次 1 次生成；迭代 N 轮 = N 次生成 + N 次评审），网关每发出一次调用就记一笔；结束时结算并退回未用预留，已发出后被取消的调用照常计入。用量随任务文件持久化，重启后旧任务文件按已保存轮次一次性估算迁移。
- `GET /api/v1/generation-tasks/quota`；工作台剩余 5 次以内显示「剩 N」，用完时禁用生成并显示恢复时间。

## 3. CI 浏览器门禁
- `playwright-core@1.64.1` 固定为开发依赖（镜像 `--omit=dev` 不含）。
- CI 安装 Chromium 与 WebKit，设置 `V3_QA_REQUIRED=1` 跑完整测试；缺环境直接失败，失败时不构建、不发布。

## 验证
- 本地按 README 的命令：`make check` **135 项通过，0 失败，0 跳过**（含桌面 Chromium 与 iPhone WebKit 全流程：普通任务运行中取消 → 刷新仍为已取消 → 立即开始新任务成功；额度提示 3 次与 0 次）。
- 未发起任何真实生成。

## 风险
- 取消只能停止本机进程和 HTTP 连接，远端服务可能已经计费；界面已如实提示。
- 迭代任务按最多轮数预留，接近上限时会比实际需要更早拒绝，属于有意的保守设计。
