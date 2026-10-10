> 2026-10-10：首选 Codex CLI 生图，固定模型与后台任务、登录缓存、升级和回滚说明见 [生产 Codex 生图](CODEX_PRODUCTION.md)。旧配置中的默认 A1111 需要按该说明迁移。

# 木生·AI 生产部署说明

本文对应用户授权的独立生产部署，目标地址为 `https://ms.yumi233.cn`。木生·AI 仍是独立 Express 服务，部署配置位于本仓库；主站只负责入口和反向代理接入。当前部署已完成公网验收，本文记录实际边界与后续维护要求。

## 部署边界

- 正式 Compose 文件是仓库根目录的 `compose.yaml`，顶层项目名为 `furniture-ai`。
- 镜像由 `FURNITURE_IMAGE` 指定，最终发布标签为 `musheng:20260920-refactor-r1`；Compose 使用 `pull_policy: never`，不在生产命令中自动拉取或构建。
- 服务加入已存在的 external Docker network `personal-hub-edge`，网络别名为 `musheng-web`，反向代理已将 `ms.yumi233.cn` 转发到 `http://musheng-web:3000`。
- Compose 不发布宿主机端口。 `HOST=0.0.0.0` 只用于容器网络监听，公网 HTTPS、证书和路由由外部反向代理负责。
- 持久化卷固定为 `furniture-ai-data`，与开发 `docker-compose.yml` 的 `app-data` 以及 preview 使用的卷分离。不要复制测试账号、预览数据或本机 `data/`。

## 已完成部署验收

- 最终发布镜像 `musheng:20260920-refactor-r1` digest 为 `sha256:fddfc72d3eed5d4bf1f62d1bffb8c3c73225cd3e42e5d9bd0da06bada8a800f2`；容器 `furniture-ai-web-1` 为 healthy。
- Compose 实际运行确认无宿主机端口，服务为 read-only 根文件系统和非 root 用户；生产卷 `furniture-ai-data` 与 preview 卷隔离，首次验收时账号数为 0。
- `https://ms.yumi233.cn` 的根页、工作台、hero/JS 静态资源、live 和 auth/me 返回 200；history/config 未登录返回 401。
- 直接请求 `.env`、`server.js`、`compose.yaml` 和 `data` 返回 404；跨源登录返回 403，无效登录返回 401；HTTP 请求 301 到 HTTPS。
- 私有历史 PNG 响应带 `Cache-Control: private, no-store`，Cloudflare 检查返回 `CF-Cache-Status: DYNAMIC`。
- 生产镜像内 22 项测试全部通过。`backups/furniture-ai-20260920T144419Z.tar.gz` 已生成，并在隔离 tmpfs 中恢复后通过 JSON 结构验证。
- 旧 `musheng:20260920-refactor` / `sha256:c16e04a355764e6d2c5c189f62fc7a0c1fd85b5ea81f14a555e1a43fc6703675` 仅保留作回滚参考，不是当前发布版本。

## 准备和首次管理员初始化

1. 确认目标主机已有 `personal-hub-edge` 网络，并把已经审核过的镜像加载或构建为 `.env.production` 中的 `FURNITURE_IMAGE` 标签。
2. 复制模板：

   ```bash
   cp .env.production.example .env.production
   ```

3. 首次部署前保持 `MUSHENG_ADMIN_USER_IDS` 为空。执行配置检查并启动：

   ```bash
   make prod-config
   make prod-up
   make prod-ps
   ```

4. 通过受保护的 HTTPS 入口注册部署负责人自己的账号，并请求 `GET /api/v1/auth/me` 取得服务端生成的随机 `user.id`。人工核对后，仅把该 ID 写入主机上的 `.env.production`，重启服务。
5. 管理员登录后再填写模型配置。注册体中的 `id`、`role` 和管理员字段不授予权限；allowlist 为空时配置读写继续拒绝。

`.env.production` 只存在于部署主机，已被 `.gitignore` 和 `.dockerignore` 排除。不要把真实 API key、用户数据或配置文件写入仓库、镜像标签、日志或工单。

## 运行安全边界

生产服务使用 `NODE_ENV=production`、`COOKIE_SECURE=true` 和精确的 `CORS_ALLOWED_ORIGINS=https://ms.yumi233.cn`。容器根文件系统只读，数据写入专用卷的 `/app/data`，临时文件只写入受限的 `/tmp`；容器丢弃所有 Linux capabilities，并启用 `no-new-privileges`。日志使用 json-file 且按 10 MiB、3 个文件轮转。

`GET /api/v1/live` 只检查进程可响应，健康状态不代表外部模型已经可用。当前模板中的模型地址和 key 均为空，真实 A1111、ComfyUI、图像模型和视觉模型联调需要单独完成并记录。

## 备份、升级和回滚

备份命令使用正式镜像启动的临时容器，只读挂载 `furniture-ai-data`，把归档写入被忽略的 `backups/`。当前首次备份为 `backups/furniture-ai-20260920T144419Z.tar.gz`，已完成隔离恢复检查：

```bash
make prod-backup
```

归档可能包含用户、session、历史图片和模型配置，必须移入受限备份存储；不要查看、提交或公开归档内容。备份前应停止写入或安排维护窗口，恢复前先确认目标卷不是 preview 卷。

生产升级只替换 `.env.production` 中已审核的固定镜像标签，然后执行：

```bash
make prod-config
make prod-up
make prod-ps
```

回滚时改回上一已验收标签并重复同一组命令。 `prod-up` 只引用 `compose.yaml`，不会合并开发 override，也不会启用自动更新服务。

## 验证边界

提交或交接前至少执行：

```bash
docker compose --env-file .env.production.example -f compose.yaml --profile '*' config --quiet
git diff --check
```

这两项只验证 Compose 语法、变量展开和文本差异；上面的公网、权限、缓存、持久化和备份证据来自本次实际部署验收。真实模型服务仍未配置，不能把当前健康状态解释为已完成真实生图联调。
