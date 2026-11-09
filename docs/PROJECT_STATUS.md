# 木生 · 项目现状与下一步

日期：2026-11-07。以 `main` 为准；功能细节见 [功能与架构](PROJECT_OVERVIEW.md)。

## 已上线

生产 `https://ms.yumi233.cn`，镜像 `musheng:20261107-v3-r3`（GHCR `sha-1574f97`），包含下表全部内容。

| PR | 内容 |
| --- | --- |
| #4 | v3 界面：新首页（ASCII 主视觉、自动演示、作品墙）、登录页、画布工作台 |
| #5 | ASCII 木字椅 logo |
| #6 | 单次与迭代立即取消；额度按生成、评审调用计数；CI 必跑 Chromium 与 iPhone WebKit 浏览器流程 |
| #7 | 修改与「改一处」基于上一版图片和框选区域 |
| #8、#11 | 英文版；顶栏「中 / 繁 / EN」切换；英文排版 |
| #9、#10 | WebKit 跳转取消请求的测试修复 |
| #12 | [UI 组件规则](UI_RULES.md) 与组件库 `/lab/components.html` |
| #13 | 新 logo：木墩生芽（木是木墩，生是新芽），替换 ASCII 木字椅 |
| yui | 组件与变量独立为 [yumi233/yui](https://github.com/yumi233/yui) v1.0.0，木生固定版本并同步到 `public/vendor/yui/` |

运维记录：生产数据卷每次发版前备份到发布目录 `backups/`；旧镜像 `musheng:20261102-v3-r2`、`v3-r1`、`musheng:20261010-auth-mobile-r5` 保留作回滚。NAS 的 Cloudflare 隧道因网络拦截 UDP 改用 `--protocol http2`（个人网站 `infrastructure/stacks/cloudflare/compose.yaml`）。

## 待定

- **生图改走 magpie**：默认 Codex 720p / 1080p，「高清」用 Gemini；生产在 NAS、magpie 在 Mac，需先定网络方案。用户要求暂缓。
- **PR #2、#3**（Codex 十月的设计知识库、设计智能体）：基于旧界面，保留开启作参考，不合并。
- **实体 iPhone 验收**：需用户在真机走一遍 登录 → 生成 → 改一处 → 对比 → 导出 → EN。

## 下一步：Pi 设计会话

按 [PI_WORKBENCH_PLAN](PI_WORKBENCH_PLAN.md) 分阶段：B 核实 Pi SDK 与白名单工具（模拟服务）→ C 生图、评审、保存闭环 → D 设计会话存储 → E 画布旁的对话面板 → F 真实模型验收与发布。强约束：只开放生图、高清、评审、参考案例、保存版本五个工具；无 shell、文件、联网；每轮最多 3 次生成 + 3 次评审、20 次工具调用、5 分钟超时；独立进程、无主目录与密钥访问。

## 资料位置

| 位置 | 内容 |
| --- | --- |
| `docs/v3/` | v3 规格、任务说明与报告、QA 报告 |
| `docs/history/` | v3 之前的研究与验收记录（已被 v3 取代，仅供参考） |
| GitHub `archive/pre-v3-ui-experiments` | v3 之前未合并的 Fluid UI 实验代码 |
| GitHub `archive/redesign-{brief,astra,claude,deepseek,gemini}` | 四个改版方案与简报 |
| 本地 `local-archive/2026-11-musheng-v3/` | 生图原图与提示词、ASCII 渲染与生图脚本、logo 样稿、实验截图（仅本地） |
