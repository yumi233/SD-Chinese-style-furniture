# Gemini 文字路由与 Flash Worker

按 [模型路由](MODEL_ROUTING.md)，Gemini 只负责面向人的文字（界面文案、参考案例文字、文档与报告正文）。Gemini 不写代码、不做审查，产出的文字随 PR 由 `gpt-6.2-astra` 审查。

## 模型发现与回退

每次文字任务先在宿主的 OpenAI 兼容端点通过 `GET /models` 检查最新 Gemini Pro（`gemini-pro-latest`）。列表中有该模型时，通过同一端点的 `POST /chat/completions` 调用。当次列表没有 Pro，或 Pro 调用经有界重试后仍失败，才回退到数字版本最高的 Gemini Flash 文本模型。Flash 也不可用时，报告并停止。

Gemini 优先读取宿主环境变量 `GEMINI_PROXY_BASE_URL` 和 `GEMINI_PROXY_API_KEY`，未提供时读取宿主 `CODEX_HOME/config.toml`（默认用户目录下的 `.codex/config.toml`）中当前 provider 的 URL、`env_key` 指向的环境变量或已有的 `experimental_bearer_token`。密钥永不写入文件、日志、回复或提交。

## Flash 回退入口

`gemini-worker` 是宿主须预装的本地 stdio MCP。它仅暴露 `gemini_flash`，通过 Chat Completions 工具调用使用 `read_files`、`apply_patch` 和 `run_tests`。该 MCP 每次从 `/models` 动态选择数字版本最高的 Gemini Flash 文本模型（例如 3.10 高于 3.9），过滤图片、语音模型。同版本优先非 Lite，其余同版本变体保留接口顺序。

当前仓库未包含 `tools/gemini-worker/`。宿主安装 Worker 及其依赖后，使用 Node.js 20+，按实际安装路径注册并重启 Codex。需要回退时若宿主未安装或未注册该 MCP，报告 Flash 入口不可用并停止。Pro 通过宿主兼容端点调用，无需依赖该 MCP。

```powershell
codex mcp add gemini-worker -- node "<宿主安装目录>/server.mjs"
```

参见 [Codex MCP 配置](https://developers.openai.com/codex/mcp)。

## 调用范围

`write_files` 仅允许文案和文档文件。

```json
{
  "task": "修正文档中指定段落，并报告结果",
  "read_files": ["README.md"],
  "write_files": ["README.md"],
  "test_files": [],
  "max_rounds": 6
}
```

路径相对固定仓库根目录，不能由模型改变根目录；宿主可通过 `GEMINI_WORKSPACE_ROOT` 设置其他受信任仓库。主调用者必须审查并授权每个路径。默认无写入与测试权限。读取每批最多 10 个文件、每文件 128 KiB；补丁只替换唯一匹配文本，不能新建、删除文件或执行 shell。禁止隐藏路径、配置密钥、历史目录、链接和 worker 自修改。操作顺序执行，最多 8 轮，每轮 10 次工具调用；失败不自动重复已经执行的工具。

`test_files` 是执行受信任项目代码的授权，只接受 `test/*.test.js/mjs/cjs`，固定使用 `node --test`，无 shell 参数；清理子进程环境中的 provider 凭据，输出截断为 24,000 字符，30 秒终止主测试进程。**这不是操作系统沙箱**：测试及其依赖仍可访问宿主权限范围、网络并派生进程；不要授权不可信测试，主进程超时不保证终止所有后代进程。路径检查也不保证抵御其他恶意本地进程并发替换文件。需要此类隔离时应在独立容器/受限用户中运行整个 worker。

送给模型的任务、上下文、批准读取的文件和测试输出会发送到配置的 provider。不要批准包含私密数据的文件或测试输出。HTTP 错误不回显原始响应。Worker 遇到 429 或 5xx 时最多请求 3 次。当次列表没有可用 Flash，或 Flash 调用经有界重试后仍失败，由调用者报告并停止。执行模式不做 Responses 协议转换，避免丢失工具调用状态或重复写入。错误后检查 diff，已完成的写入不会回滚。

## 验证

在宿主已安装的 Worker 目录中运行以下命令。

```powershell
npm test
node smoke.mjs
```

第一项使用本地测试，无付费调用；第二项真实发现并调用 Gemini，经 MCP 验证只读工具循环，会产生模型费用。

Worker 依赖和锁文件单独管理，`tools` 继续被 `.dockerignore` 排除，不进入家具 Web 应用镜像。不在网页服务中暴露 worker 路由，不改变家具生成模型配置。
