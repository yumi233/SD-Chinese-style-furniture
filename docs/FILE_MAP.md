# 文件整理说明

## 根目录

- `.env.example`：安全配置模板，适合安装时参考。
- `.gitignore`：忽略本地配置、缓存、历史记录、提交材料和临时文件。
- `.dockerignore`：控制 Docker 构建上下文，排除本地隐私和运行产物。
- `.gitattributes`：标记图片、Office 文档、视频和压缩包等二进制文件。
- `config.local.example.json`：本地模型配置示例，不包含密钥。
- `Dockerfile`：构建 Node/Express 网页服务镜像。
- `docker-compose.yml`：一条命令启动网页服务，并持久化历史记录和模型配置。
- `index.html`：木生 AI 网页主结构。
- `styles.css`：页面样式、响应式布局和工作台视觉。
- `script.js`：前端交互、提示词合成、中文翻译、结果卡片和模型配置面板。
- `server.js`：Express 服务入口。
- `package.json` / `package-lock.json`：Node 项目依赖和脚本。
- `README.md`：项目主页说明。

## 后端源码

- `src/imageGateway.js`：统一图片生成网关，根据配置选择 Provider。
- `src/historyStore.js`：本地生成历史记录存储。
- `src/modelConfigStore.js`：模型配置读取、保存和公开配置脱敏。
- `src/lib/requestNormalizer.js`：把前端尺寸、风格、质量、参数转换为后端生成参数。
- `src/providers/automatic1111.js`：调用 Stable Diffusion WebUI/AUTOMATIC1111。
- `src/providers/comfyui.js`：调用 ComfyUI，支持内置或外部 workflow。
- `src/providers/openaiCompatible.js`：OpenAI 兼容接口基础请求封装。
- `src/providers/textModel.js`：文字模型提示词增强。
- `src/providers/imageModel.js`：图像模型生成适配。
- `src/providers/visionModel.js`：视觉评估适配。
- `src/referenceKnowledge.js`：教学参考案例数据。
- `src/reportBuilder.js`：报告和演示脚本生成辅助。
- `src/utils.js`：通用工具函数。

## 品牌和图片资源

- `assets/musheng-ai-logo.png`：透明底正式 logo。
- `assets/musheng-ai-logo-original.png`：logo 原图备份。
- `assets/style-ming-elegance.png`：明式风格示例图。
- `assets/style-modern-minimal.png`：新中式/现代简洁示例图。
- `assets/style-vintage-walnut.png`：复古胡桃木示例图。
- `assets/style-zen-white.png`：禅意白墙示例图。

## 文档和测试

- `docs/INSTALL.md`：安装说明。
- `docs/USAGE.md`：使用说明。
- `docs/SCREENSHOTS.md`：截图说明。
- `docs/ASSET_INVENTORY.md`：公开网页资产和本地私有资料边界。
- `docs/FILE_MAP.md`：当前文件用途说明。
- `docs/NEXT_MODIFICATION_NOTES.md`：后续修改注意事项。
- `test/`：Node 内置测试运行的回归用例。

## 不推送到公开仓库的本地内容

- `.env`、`config.local.json`：本地配置。
- `.codex/`：本地 Codex 元数据。
- `data/history/`：运行时生成历史。
- `assets/generated/`：本地生成图归档。
- `docs/source/`：私有申报和原始资料。
- `submit_materials/`：提交材料包和附件。
- `tools/`：提交材料和视频构建辅助脚本。
- `tmp/`、日志、根目录压缩包：临时或导出产物。