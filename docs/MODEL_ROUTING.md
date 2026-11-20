# 模型路由与委派政策

自 2026-11-19 起，项目按以下分工指定模型。

## 分工

| 工作 | 模型 |
| --- | --- |
| 全部代码实现（前后端代码、测试、脚本、Docker 和修复） | 固定 `gpt-6.2-sol` |
| 全部审查（包括 PR 的代码、截图、测试结果和文字） | 固定 `gpt-6.2-astra` |
| 全部设计和验收（包括需求澄清、优先级和冲突裁决） | 固定 `gpt-6.2-astra` |
| 面向人的文字（界面文案、参考案例文字、文档与报告正文） | 最新 Gemini Pro（`gemini-pro-latest`），不可用时回退到数字版本最高的 Gemini Flash |

不使用 Luna、Terra 和更早的 GPT 版本。Gemini 不写代码、不做审查。Gemini 写的文字随 PR 一起由 Astra 审查。

## 模型核对

- 每次派活前查当次 `/models` 列表。目标模型不在列表中，或调用经有界重试后仍失败，均视为不可用。
- Gemini Pro → 数字版本最高的 Gemini Flash 文本模型是唯一允许的回退。Flash 或其他指定模型不可用时，报告并停止。调用入口见 [Gemini Worker](GEMINI_WORKER.md)。
- 每份交付必须写明实际调用的模型 ID；不是指定模型的交付退回重做。
- Gemini 优先读取宿主环境变量 `GEMINI_PROXY_BASE_URL` 和 `GEMINI_PROXY_API_KEY`，未提供时读取宿主 `CODEX_HOME/config.toml`（默认用户目录下的 `.codex/config.toml`）中当前 provider 的 URL、`env_key` 指向的环境变量或已有的 `experimental_bearer_token`。密钥永不写入文件、日志、回复或提交。

## 委派协议

遵循“拆解 → 委派 → 审查 → 修改 → 验收”。实现与审查不由同一模型完成。每个子任务返回七项：已完成工作、文件、关键改动、测试命令、测试结果、未解决问题、风险。
