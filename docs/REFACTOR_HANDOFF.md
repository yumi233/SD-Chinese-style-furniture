# 木生·AI 独立家具前端重构交接

## 2026-09-23 后续状态

本次重构源码已完成本地测试与生产页面逐字节核对，并随主站木生·AI 入口同步到独立仓库主分支。下文“未提交、未推送”是 2026-09-20 交接时的历史状态。生产容器仍运行已经验收的固定镜像，真实模型联调另行进行。

日期：2026-09-20

当前工作树：`/tmp/yumi-furniture-refactor`

主会话最终归档目标：`/vol1/1000/SD-Chinese-style-furniture`

本轮交接记录的是独立 Express 家具项目的前端重构。主页由 `/` 提供，工作台由 `/studio` 提供；资源全部使用根绝对路径，避免 `/studio/` 尾斜杠导致静态资源相对路径错误。

## 设计与功能

- 视觉方向改为年轻的新中式品牌“木生·AI”：浅杏、奶油纸白、深木色、大留白、衬线标题和编辑式版面。
- 首页使用生成的 `musheng-hero.png` 主视觉，包含“开始创作”“浏览灵感”、四种风格入口、材料与工艺说明、简洁页脚，以及圈椅四视图旋转预览。
- `/` 与 `/studio` 共用同一 Dock、主题切换、简繁标签和 Day/Night DOM；Dock 和通用设置都写入同一个 `musheng-studio-preferences.displayMode` 偏好来源。
- 工作台保留输入与双 prompt 流程、普通/智能体模式、生成引擎选择、风格/质量/尺寸/mood/高级参数、round/target、视觉评审、轮次对比、预览下载/变体/继续细化、历史筛选/恢复/删除/导出、报告与演示文案、参考案例、模型配置、注册登录退出、资料头像和运行时偏好。
- “收藏夹”导航统一改为“风格灵感”，没有虚构不存在的收藏 API；主页风格链接与工作台风格语义保持一致。
- 动态模型、历史、用户、报告和图片数据经过文本转义及图片 URL 白名单处理；图片 URL 由安全协议检查或 DOM 属性赋值进入界面。
- 异步区域包含 loading、empty、error、success 状态。普通用户不能编辑管理员模型配置；401 显示登录引导，403 说明所需权限。弹窗支持焦点移入、Tab 圈定、Escape 关闭、背景 inert 和触发者焦点恢复。
- 移动端按内容重组；`prefers-reduced-motion` 会关闭非必要动效。最近的产品预览修复使用明确的 `minmax(0, 1fr)` grid 轨道和 `object-fit: contain`，用于避免四张圈椅图被裁掉。

## API 与模型路由

- 前端请求统一走 `/api/v1`，未对 POST/DELETE 失败做旧路径重试。
- 所有用户先请求 `/api/v1/auth/me`，登录后才加载需要身份的历史；管理员配置读取和写入按 `currentUser.isAdmin` 控制。
- 所有用户从 `/api/v1/engines` 获取 `defaultEngine` 与可用模式，并把当前选择的 engine 放进普通或智能体任务请求；普通模式默认可运行，智能体模式仍需要对应的 vision 配置。
- 管理员模型配置保留 GitHub、provider、endpoint、image model、vision model、key 等字段；读取时不展示 key，保存空 key 表示保留已有值。
- 本轮未使用真实 provider key，也未声称真实模型联调成功。前端 mock 生成与智能体评分流程已经由主会话浏览器验收，实际 provider 连接仍属于部署侧工作。

## 协作路由记录

以下模型与并发信息来自主会话本轮协作记录：

| 代理 | 模型 | 推理档位 | 调度 |
| --- | --- | --- | --- |
| `function_audit` | `gpt-5.6-luna` | `max` | 两代理并发 |
| `furniture_frontend` | `gpt-5.6-luna` | `max` | 两代理并发 |

本子任务没有再次派发模型或子代理；上表用于交接主会话已记录的路由事实。

可复制的 subagent skill 调用示例：

```text
使用 $subagent-skill，先读取当前模型列表，给我一个最多两个并发的路由计划；我确认后再派发。
```

## 验证证据

- `npm test`：22 个测试全部通过，0 失败。覆盖前端绑定契约、历史、HTTP、provider/gateway、配置、报告和尺寸等检查。
- `node --test test/frontendBindings.test.js`：通过。测试基于新页面 DOM、静态 ID、功能入口和安全契约，不依赖旧首页或旧 CSS 精确正则。
- `node --check public/js/studio.js`：通过。
- `node --check public/js/home.js`：通过。
- `node --check public/js/modules/api.js`：通过。
- `node --check public/js/modules/dialogs.js`：通过。
- `node --check public/js/modules/dock.js`：通过。
- 静态 DOM 检查：`public/index.html` 的 15 个 ID 无重复；`public/studio.html` 的 133 个 ID 无重复；工作台绑定缺失项为 0；静态结果卡片为 0，初始结果区保持真实空态。
- `git diff --check`：已通过已跟踪变更检查；最新产品预览 CSS 修改后再次检查无空白错误。
- 主会话浏览器已验证：注册、登录、更新昵称、Escape 关闭资料弹窗、空历史态；普通用户模型配置保存按钮隐藏且 disabled；配置、资料、历史弹窗的焦点移入/Escape/焦点恢复；mock 普通生成；mock 智能体评分 90 渲染；`/studio/` 根绝对资源加载；390px 工作台无横向溢出；Dock 日夜切换有效。
- 最终归档浏览器证据目录为 `/vol1/1000/SD-Chinese-style-furniture/output/playwright/`，包含 `home-cover.png`、`home-full.png`、`studio-desktop.png`、`studio-mobile.png`、`chair-detail.png` 和 `main-entry.png`。最近检查发现产品图的 grid 自动轨道导致高度溢出，已在 `public/css/home.css` 收紧轨道和图片盒尺寸；主会话当前浏览器复核确认共享容器在桌面为 480px、手机为 256px，四张椅子完整可见。

## 未验证边界与限制

- 未用真实 A1111、ComfyUI、OpenAI 或 vision provider 做付费模型联调；未把任何 key 写入源码、日志或文档。
- 未执行生产部署、未推送 Git，也未把独立项目宣称为已上线。最终归档目录由主会话处理。
- 最新圈椅预览 CSS 修复已完成静态检查，并已由主会话在桌面和移动尺寸浏览器检查确认四张源图完整可见；最终归档镜像仍在重建中。
- 静态契约测试不能替代真实 provider、浏览器网络失败、跨浏览器和屏幕阅读器审计；已验证的浏览器流程是主会话记录的 mock 与账号流程。
- 本轮没有新增收藏数据模型或 API；“风格灵感”只表示既有风格入口。

## 最终变更文件清单

以下是本轮工作树中与独立前端重构、验证和交接直接相关的最终绝对路径。`public/` 在当前工作树中作为新前端目录加入；其中主会话预先生成的 hero 文件保留，未被本代理覆盖。

### 本轮前端与交接文件

- 新建 `/tmp/yumi-furniture-refactor/public/index.html`
- 新建 `/tmp/yumi-furniture-refactor/public/studio.html`
- 新建 `/tmp/yumi-furniture-refactor/public/css/home.css`
- 新建 `/tmp/yumi-furniture-refactor/public/css/studio.css`
- 新建 `/tmp/yumi-furniture-refactor/public/js/home.js`
- 新建 `/tmp/yumi-furniture-refactor/public/js/studio.js`
- 新建 `/tmp/yumi-furniture-refactor/public/js/modules/api.js`
- 新建 `/tmp/yumi-furniture-refactor/public/js/modules/dialogs.js`
- 新建 `/tmp/yumi-furniture-refactor/public/js/modules/dock.js`
- 新建 `/tmp/yumi-furniture-refactor/public/ui/tokens.css`
- 新建 `/tmp/yumi-furniture-refactor/public/ui/components.css`
- 新建 `/tmp/yumi-furniture-refactor/public/ui/brand-tokens.css`
- 新建 `/tmp/yumi-furniture-refactor/public/assets/musheng-ai-logo.png`
- 新建 `/tmp/yumi-furniture-refactor/public/assets/ming-chair-3d-preview.png`
- 新建 `/tmp/yumi-furniture-refactor/public/assets/ming-chair-front-view.png`
- 新建 `/tmp/yumi-furniture-refactor/public/assets/ming-chair-rear-view.png`
- 新建 `/tmp/yumi-furniture-refactor/public/assets/ming-chair-side-view.png`
- 新建 `/tmp/yumi-furniture-refactor/public/assets/style-ming-elegance.png`
- 新建 `/tmp/yumi-furniture-refactor/public/assets/style-modern-minimal.png`
- 新建 `/tmp/yumi-furniture-refactor/public/assets/style-vintage-walnut.png`
- 新建 `/tmp/yumi-furniture-refactor/public/assets/style-zen-white.png`
- 保留 `/tmp/yumi-furniture-refactor/public/assets/musheng-hero.png`（主会话预先生成，本代理未覆盖）
- 修改 `/tmp/yumi-furniture-refactor/test/frontendBindings.test.js`
- 新建 `/tmp/yumi-furniture-refactor/CHANGELOG.md`
- 新建 `/tmp/yumi-furniture-refactor/docs/REFACTOR_HANDOFF.md`

### 当前 git status 中其他协作变更

以下路径也出现在本工作树的 `git status` 中，由主会话或其他后端/项目整理工作负责；本代理没有在本轮编辑这些路径：

- 修改 `/tmp/yumi-furniture-refactor/.dockerignore`
- 修改 `/tmp/yumi-furniture-refactor/.env.example`
- 修改 `/tmp/yumi-furniture-refactor/.gitignore`
- 修改 `/tmp/yumi-furniture-refactor/AGENTS.md`
- 修改 `/tmp/yumi-furniture-refactor/Dockerfile`
- 修改 `/tmp/yumi-furniture-refactor/README.md`
- 删除 `/tmp/yumi-furniture-refactor/docker-compose.auto-update.yml`
- 修改 `/tmp/yumi-furniture-refactor/docker-compose.local.yml`
- 修改 `/tmp/yumi-furniture-refactor/docker-compose.yml`
- 修改 `/tmp/yumi-furniture-refactor/docs/ASSET_INVENTORY.md`
- 修改 `/tmp/yumi-furniture-refactor/docs/FILE_MAP.md`
- 修改 `/tmp/yumi-furniture-refactor/docs/GETTING_STARTED.md`
- 修改 `/tmp/yumi-furniture-refactor/docs/INSTALL.md`
- 修改 `/tmp/yumi-furniture-refactor/docs/NEXT_MODIFICATION_NOTES.md`
- 修改 `/tmp/yumi-furniture-refactor/docs/PROJECT_OVERVIEW.md`
- 修改 `/tmp/yumi-furniture-refactor/docs/README.md`
- 修改 `/tmp/yumi-furniture-refactor/docs/RELEASE_RULES.md`
- 修改 `/tmp/yumi-furniture-refactor/docs/TEAM_HANDOVER.md`
- 修改 `/tmp/yumi-furniture-refactor/docs/USAGE.md`
- 新建 `/tmp/yumi-furniture-refactor/docs/ASSETS.md`
- 删除 `/tmp/yumi-furniture-refactor/index.html`
- 删除 `/tmp/yumi-furniture-refactor/script.js`
- 修改 `/tmp/yumi-furniture-refactor/server.js`
- 修改 `/tmp/yumi-furniture-refactor/src/historyStore.js`
- 新建 `/tmp/yumi-furniture-refactor/src/http/app.js`
- 新建 `/tmp/yumi-furniture-refactor/src/http/middleware.js`
- 新建 `/tmp/yumi-furniture-refactor/src/http/routes.js`
- 新建 `/tmp/yumi-furniture-refactor/src/printAdminId.js`
- 新建 `/tmp/yumi-furniture-refactor/src/userStore.js`
- 删除 `/tmp/yumi-furniture-refactor/styles.css`
- 修改 `/tmp/yumi-furniture-refactor/test/historyStore.test.js`
- 新建 `/tmp/yumi-furniture-refactor/test/httpApp.test.js`
- 新建 `/tmp/yumi-furniture-refactor/Makefile`

目录级路径 `src/http/` 下的具体文件以及其他新增目录内容以当前 git 工作树为准；本清单不展开构建资产的像素级元数据。

## 最终归档与运行验收

- 已保存到 `/vol1/1000/SD-Chinese-style-furniture`，保留 Git 工作树与分支 `codex/musheng-ui-refactor`，未提交、未推送。
- 最终镜像 `musheng-refactor:review`：`sha256:479cf7ee44eb231dc657f4f87e51656d7c27355ab14e5e56f249f3d97510271f`。
- 本机临时验收容器 `musheng-review`，地址 `http://127.0.0.1:4318`，无自动重启；独立验收数据卷 `musheng-review-data-20260920`。这是本机预览，不是正式上线。
- 镜像实际运行检查：非 root 用户 `node`，容器 healthy；`/`、`/studio`、`/studio/`、`/api/v1/live` 和 JS 资源返回 200；`/.env`、`/server.js`、`/data/users/users.json` 返回 404；未登录配置接口返回 401。
- 早期临时预览容器已停止。真实模型仍未接入，未调用付费服务。
