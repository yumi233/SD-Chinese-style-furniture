# 文件整理说明

## 根目录

分类导航见 [文档总目录](README.md)，归档约定见 [整理规则](ORGANIZATION.md)。

- `.env.example`：安全配置模板，适合安装时参考。
- `.gitignore`：忽略本地配置、缓存、历史记录、提交材料和临时文件。
- `.dockerignore`：控制 Docker 构建上下文，排除本地隐私和运行产物。
- `.gitattributes`：标记图片、Office 文档、视频和压缩包等二进制文件。
- `config.local.example.json`：本地模型配置示例，不包含密钥。
- `Dockerfile`：构建 Node/Express 网页服务镜像。
- `docker-compose.yml`：普通 Docker 使用入口，默认拉取 GHCR 最新镜像。
- `docker-compose.local.yml`：本地源码构建覆盖配置，开发时使用。
- `public/index.html`：木生 AI 主页。
- `public/studio.html`：生成工作台。
- `public/js/`、`public/css/`：页面脚本和样式。
- `server.js`：环境读取、依赖装配和 Express 入口。
- `package.json` / `package-lock.json`：Node 项目依赖和脚本。
- `README.md`：项目主页说明。

## GitHub 和 Docker 发布规则

- `.github/workflows/docker-image.yml`：`main` 更新时自动测试、构建并发布 Docker 镜像到 GHCR。
- `docs/RELEASE_RULES.md`：规定 GitHub 更新必须同步维护 Docker 运行路径。

## 后端源码

- `src/imageGateway.js`：统一图片生成网关，根据配置选择 Provider。
- `src/http/`：`createApp`、共享 API 路由、Origin/session/限流和错误处理。
- `src/userStore.js`：用户、session、管理员 ID allowlist 与原子 JSON 持久化。
- `src/historyStore.js`：本地生成历史记录存储。
- `src/modelConfigStore.js`：模型配置读取、保存和公开配置脱敏。
- `src/lib/requestNormalizer.js`：把前端尺寸、风格、质量、参数转换为后端生成参数。
- `src/providers/automatic1111.js`：调用 Stable Diffusion WebUI/AUTOMATIC1111。
- `src/providers/comfyui.js`：调用 ComfyUI，支持内置或外部 workflow。
- `src/providers/openaiCompatible.js`：OpenAI 兼容接口基础请求封装。
- `src/providers/textModel.js`：文字模型提示词增强。
- `src/providers/imageModel.js`：图像模型生成适配。
- `src/providers/visionModel.js`：视觉评估适配。
- `src/referenceKnowledge.js`：设计知识检索与格式化（RAG），也提供前端「案例」面板数据。
- `src/knowledge/index.js` 与 `entries.json`、`methods.json`、`motifs.json`、`cases.json`：设计知识条目（形制、传统基因、形体手法、跨界母题、材料、场景、尺度、反例、当代案例），附出处。
- `src/knowledge/cuePicker.js`：按家具类别挑选指定基因与形体手法。
- `src/knowledge/stylePacks.json`、`stylePacks.js`：风格包定义。
- `src/styleReferences.js`：风格包参考图读取；图片与清单在 `STYLE_REFERENCE_DIR`（私有数据，不进 Git）。
- `scripts/styleReferences.js`：生成风格包候选图、批准参考图。
- `src/knowledge/styleProfiles.js`：各风格的锚点、正反向词、禁止词、评审口径与「传统与当代」配比档位。
- `src/knowledge/promptGuard.js`：每轮生成前的提示词守卫与负面词合并。
- `src/utils.js`：通用工具函数。

## 品牌和图片资源

- `assets/musheng-ai-logo.png`：透明底正式 logo。
- `assets/musheng-ai-logo-original.png`：logo 原图备份。
- `assets/style-ming-elegance.png`：明式风格示例图。
- `assets/style-modern-minimal.png`：新中式/现代简洁示例图。
- `assets/style-vintage-walnut.png`：复古胡桃木示例图。
- `assets/style-zen-white.png`：禅意白墙示例图。

## 文档和测试

- `docs/TEAM_HANDOVER.md`：团队共享、职责、接管验收、部署整改和数据迁移。
- `docs/PROJECT_OVERVIEW.md`：当前功能、架构数据流、模块修改入口和接口清单。
- `docs/INSTALL.md`：安装说明。
- `docs/USAGE.md`：使用说明。
- `docs/SCREENSHOTS.md`：截图说明。
- `docs/ASSET_INVENTORY.md`：公开网页资产和本地私有资料边界。
- `docs/ASSETS.md`：本轮主页资产来源与用途记录。
- `docs/FILE_MAP.md`：当前文件用途说明。
- `docs/NEXT_MODIFICATION_NOTES.md`：后续修改注意事项。
- `docs/RELEASE_RULES.md`：GitHub 和 Docker 同步发布规则。
- `docs/KNOWLEDGE_BASE.md`：知识库数据流、条目格式、新增规则与古董率评测。
- `eval/style-briefs.json`、`scripts/evalStyle.js`：古董率评测的固定需求与脚本；结果写入被忽略的 `eval/results/`。
- `test/`：Node 内置测试运行的回归用例。

## 不推送到公开仓库的本地内容

- `local-archive/root-materials/`：根目录归档的 PPT、ZIP、制作脚本和笔记。
- `deliverables/`、`references/`、`extracted_media/`、`slide_previews/`：交付件与制作素材。
- `.localappdata/`：本机程序数据。

- `.env`、`config.local.json`：本地配置。
- `.codex/`：本地 Codex 元数据。
- `data/history/`、`data/users/`：运行时生成历史、用户和 session。
- `assets/generated/`：本地生成图归档。
- `docs/source/`：私有申报和原始资料。
- `submit_materials/`：提交材料包和附件。
- `tools/`：提交材料和视频构建辅助脚本。
- `tmp/`、日志、根目录压缩包：临时或导出产物。

## 工作台（2026-10 制图台）

- `public/css/workbench.css`：制图台布局与视觉（顶栏、工具栏、画布标尺、指令栏、评审抽屉）。`public/css/studio.css` 只保留弹窗、历史、设置与结果卡片的共享规则。
- `public/js/modules/contours.js`：等高线生成（`traceContours` / `mountContours`）与年轮评审环（`mountGrowthRings`）。
- `public/js/modules/workbench.js`：工具栏弹出面板与评审抽屉的开合、Esc 与焦点处理。
