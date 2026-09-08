# 项目文件整理规则

## 目录归属

| 位置 | 内容 | 发布范围 |
| --- | --- | --- |
| 根目录应用文件、`src/` | 前后端程序与依赖 | GitHub 和 Docker |
| `assets/` 顶层图片 | Logo 与风格图 | GitHub 和 Docker |
| `test/` | 回归测试 | GitHub；当前 Docker 也包含它 |
| `docs/`、根目录 `README.md` | 使用、架构、发布与协作文档 | 审查后公开，私有子目录除外 |
| Docker 文件、`.github/` | 部署与自动发布 | GitHub；工作流不进入镜像 |
| `local-archive/root-materials/` | 根目录归档的 PPT、ZIP、制作脚本和过程笔记 | 仅本地 |
| `submit_materials/`、`docs/source/` | 申报成品与原始文档 | 仅本地 |
| `deliverables/` | 团队交接等文档交付件 | 仅本地 |
| `references/`、`extracted_media/`、`slide_previews/` | 参考图、提取媒体与预览 | 仅本地 |
| `assets/generated/`、`data/history/` | 生成归档与运行历史 | 仅本地 |
| `.env`、`config.local.json` | 本机配置与凭据 | 仅本地 |
| `tools/`、缓存、日志 | 主机工具和运行产物 | 不进 Docker；Gemini worker 有独立 Git 例外 |

## 整理记录：2026-09-08

根目录散落的 PPTX、ZIP、Python 制作脚本、幻灯片文本和答辩重构笔记统一移入
`local-archive/root-materials/`，保留原文件名。本地迁移清单见
`local-archive/README.md`。没有删除旧版本，也没有认定某份答辩稿为最终版。

应用入口、公开图片、配置、历史、申报资料和素材目录保持原路径。
旧制作脚本包含本机绝对路径和外部输出路径，本轮作为历史资料归档；再次运行前
须审查输入输出路径，可能仍向旧根目录生成文件，不能视为可移植工具。

## 存放约定

- 网页图片放 `assets/`，检查授权和隐私；生成记录留在历史目录。
- 答辩稿、申报包和制作过程文件放本地归档或对应交付目录。
- 说明文档放 `docs/` 并加入[文档总目录](README.md)，避免重复维护。
- 应用入口、Compose、配置路径保持稳定。
- Git 忽略和 Docker 排除同步维护；忽略规则不会移除已跟踪文件。
- 发布前逐项审查暂存内容，不能以全目录暂存代替隐私审核。

这些排除规则不是 HTTP 访问控制。当前服务静态暴露仓库且没有认证，共享部署
前仍须按团队接管手册整改。
