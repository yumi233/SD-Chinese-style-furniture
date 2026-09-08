# Gemini Flash 执行 Worker

`tools/gemini-worker/server.mjs` 是独立的本地 stdio MCP。只向 Codex 暴露 `gemini_flash`，内部通过 Chat Completions tool calling 使用 `read_files`、`apply_patch` 和 `run_tests`。

## 安装与注册

需要 Node.js 20+。在仓库根目录运行：

```powershell
npm ci --prefix tools/gemini-worker
codex mcp add gemini-worker -- node "C:\Users\YUMI\Documents\中式家具ai智能体\tools\gemini-worker\server.mjs"
```

优先读取宿主环境 `GEMINI_PROXY_BASE_URL` / `GEMINI_PROXY_API_KEY`；未提供时读取 `CODEX_HOME/config.toml`（默认用户 `.codex`）当前 provider 的 URL、env_key 或既有 experimental_bearer_token。不复制、打印或保存密钥。每次通过 `/models` 动态发现，按数字版本选择最高版本的 Gemini Flash 文本模型（3.10 高于 3.9），过滤图片、语音模型。同版本优先非 Lite，其他同版本变体保留接口顺序。

注册后重启 Codex，使新工具载入。官方配置参考：https://developers.openai.com/codex/mcp

按用户偏好始终选用当前列表中的最高版本，优先于通用低成本策略；例如当前为 3.8，以后出现 3.9 则自动使用 3.9。此处“可用”指当次发现列表，不代表请求一定成功；调用失败会报错，不静默尝试其他版本。

## 调用范围

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

送给模型的任务、上下文、批准读取的文件和测试输出会发送到配置的 provider。不要批准包含私密数据的文件或测试输出。HTTP 错误不回显原始响应。429/5xx 最多请求 3 次；没有可用 Flash 或失败由调用者回退 Luna。执行模式不做 Responses 协议转换，避免丢失工具调用状态或重复写入。错误后检查 diff，已完成的写入不会回滚。

## 验证

```powershell
npm test --prefix tools/gemini-worker
node tools/gemini-worker/smoke.mjs
```

第一项使用本地测试，无付费调用；第二项真实发现并调用 Gemini，经 MCP 验证只读工具循环，会产生模型费用。

Worker 依赖和锁文件单独管理，`tools` 继续被 `.dockerignore` 排除，不进入家具 Web 应用镜像。不在网页服务中暴露 worker 路由，不改变家具生成模型配置。
