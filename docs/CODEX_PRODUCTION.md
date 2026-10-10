# 生产 Codex 生图

2026-10-10，基于已合并 [PR #1](https://github.com/yumi233/SD-Chinese-style-furniture/pull/1)（`1e3e648`）。保留制图台、等高线与年轮评审；增加生产 CLI 生图。发布标记：`20261010-codex-r1`。

## 行为

- 首选 `codexCli`，固定 `gpt-6.1-sol` / `high`，CLI 固定 `0.159.2`。在线 `imageModel` 保留，切换需其连接已配置。CLI 的路径、模型、登录文件只由宿主环境指定，HTTP 配置不能覆盖。
- HTML 将 CSS 与 JS 映射到同一构建版本目录，ESM 相对模块一并隔离缓存；源版式和样式保持 PR #1 不变。
- 普通生成与智能体均使用 `POST /api/v1/generation-tasks` 返回 202；每 2 秒轮询自己的任务，刷新从活动任务恢复。`requestId` 防止重复提交；全局一次执行一个任务，每账号每小时最多 20 次，智能体最多 3 轮。
- 普通登录用户可以使用首选生图；管理员仍仅由随机 ID 白名单授予，默认拒绝。未登录、跨 Origin 和其他账号的任务/图片均拒绝访问。
- 智能体先持久化每轮图像再评审，同一任务更新一条历史；评审失败保留图片并标记待人工评审。没有评审结果时不伪造评分。
- CLI 生成只能使用内置 image_generation；评审禁用所有工具。禁用 shell、子代理、Apps、Plugins、联网搜索、宿主 Skill 和用户规则；每个任务有独立 HOME，使用 read-only sandbox。用户描述作为不可信设计数据处理，不作为执行指令。
- 只接收经过文件类型/图像头/大小/路径校验的真实图片；参考原图副本不能冒充生成结果。合法已写完的图片在 CLI 收尾响应中断时保留。

## 部署

使用仓库 `compose.yaml`、`.env.production.example` 和 Makefile。独立 Stack `furniture-ai`，现有 `furniture-ai-data` 与 `personal-hub-edge`/`musheng-web` 保留，不发布宿主端口，不修改 DNS 或 Tunnel。实际环境文件不提交，`MUSHENG_CODEX_AUTH_FILE` 指向现有可信的服务器登录文件，只读挂载。

生产容器首次调用将登录缓存私有复制到 `/app/data/codex-auth/auth.json`，后续刷新令牌原子保存于生产卷；绝不改写宿主 Codex 的登录文件。缓存和备份包含凭据，均不得公开。重新授权后，如需要换用新种子，应停止生图、备份并移除旧缓存，再启动；不自动覆盖有效缓存。

已有生产 `config.local.json` 优先于环境变量；升级时仅将其 `defaultEngine` 改为 `codexCli`，保留其他配置与密钥。备份后切换固定镜像：

```sh
make prod-backup
make prod-config
make prod-up
make prod-ps
```

健康检查只证明 CLI 可执行/登录文件可读取；上线必须另做一次真实家具生图，并检查任务完成、图片可下载和历史持久化。测试环境账号与卷不得复制到生产。

## 回滚

保留上一份 Compose、实际环境文件和固定旧镜像；切回旧镜像时，恢复升级前的默认引擎（旧版不识别 codexCli）。只在确有损坏时恢复整个数据备份，避免覆盖上线后新增的用户与图片。不得使用 `down -v`。

## 验证记录

- `make check`：62 项测试通过；覆盖登录权限、任务归属、重复提交、重启恢复、图片保存失败、CLI 超时、输出校验和凭据刷新。
- 开发、源码构建和生产全部 Compose Profiles 配置通过；只验证配置时不代表已部署。
- 独立容器实际生成家具 PNG（GPT-6.1 Sol，1,753,829 字节），正常完成，无收尾警告。
- 生产验收结果在部署结束后补充；未执行的验证不计为通过。
