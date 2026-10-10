# 安装说明

文档入口见 [文档总目录](README.md)。本地归档、交付件和参考素材由
`.dockerignore` 排除，不需要复制到镜像；文件归属见 [整理规则](ORGANIZATION.md)。

## 登录与账号

打开当前服务的工作台，点击右上角账号入口，首次使用切换到「注册」。密码为 8–256 个字符；注册完成会确认当前浏览器保存了会话，再允许生成。

本地预览与生产 `ms.yumi233.cn` 使用各自的数据卷，账号不会自动同步。使用生产站点需要在那里注册；已有账号直接登录。模型设置仅管理员可修改，普通账号可以使用服务器已配置的默认生成接口。使用 HTTPS 正式入口；反向代理部署保持 `COOKIE_SECURE=true` 和正确的 Origin 白名单。

镜像升级保留生产数据卷；不要通过删除卷处理登录问题。升级与回滚流程见 [生产 Codex 生图](CODEX_PRODUCTION.md)，移动端与认证验收见 [整改审查](AUTH_MOBILE_AUDIT.md)。

## NAS 本地发布镜像入口

已有本地 Codex Stack 的维护者可用 `compose.preview-release.yaml`，避免重建旧源码镜像。按 `.env.preview-release.example` 配置私有环境（已有部署保留原本地环境值），`FURNITURE_PREVIEW_IMAGE` 必须指向本次已验收镜像。执行 `make preview-config`、`make preview-backup`、`make preview-up`、`make preview-ps`；首次部署没有数据卷时跳过备份。

默认仅绑定 `127.0.0.1:4414`。需要原局域网入口时保留原 `MUSHENG_LOCAL_BIND`；该入口使用独立的 `furniture-ai-local-data`，不会同步生产账号。升级不要删除数据卷，回滚将镜像值切回已保留的旧标签。

## 环境要求

二选一：

- Docker Desktop 24+（推荐给只想快速体验网页的人）
- Node.js 18+（适合本地开发）

生成图片还需要至少一个可用后端：本地 Stable Diffusion WebUI、ComfyUI，或 OpenAI 兼容图像模型接口。

## Docker 安装和启动（推荐）

### 1. 获取项目

```bash
git clone https://github.com/yumi233/SD-Chinese-style-furniture.git
cd SD-Chinese-style-furniture
```

### 2. 启动容器

```bash
docker compose pull
docker compose up -d
```

启动后访问：

```text
http://127.0.0.1:3000
```

### 3. 配置模型地址

`docker-compose.yml` 默认拉取 `ghcr.io/yumi233/sd-chinese-style-furniture:latest`。每次 `main` 推送后，GitHub Actions 会自动测试、构建并发布新镜像。

默认使用这些容器内地址访问宿主机上的模型服务：

```env
AUTO1111_BASE_URL=http://host.docker.internal:7860
COMFYUI_BASE_URL=http://host.docker.internal:8188
```

如果 Stable Diffusion WebUI 或 ComfyUI 跑在同一台电脑上，网页配置里也应该使用 `host.docker.internal`，不要填 `127.0.0.1`。在容器内部，`127.0.0.1` 指向容器自己，不是宿主机。

网页里保存的模型配置会写入 Docker volume 中的 `/app/data/config.local.json`。生成历史会保存在 `/app/data/history`，重启容器不会丢失。

### 4. 后台运行和停止

后台运行：

```bash
docker compose pull
docker compose up -d
```

停止：

```bash
docker compose down
```

本地开发时如果要用当前源码构建镜像：

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
```

清空 Docker 保存的配置和历史记录：

```bash
docker compose down -v
```

如果 `3000` 端口被占用，在 `.env` 中设置 `MUSHENG_PORT=4318`，然后访问
`http://127.0.0.1:4318`。映射默认只绑定宿主机回环地址。

### 5. 手动更新

每次想更新到 GitHub 最新 Docker 镜像时运行：

```bash
docker compose pull
docker compose up -d
```

## Node.js 本地安装和启动

### 1. 获取项目

```bash
git clone https://github.com/yumi233/SD-Chinese-style-furniture.git
cd SD-Chinese-style-furniture
```

### 2. 安装依赖

```bash
npm install
```

### 3. 创建配置文件

```bash
copy config.local.example.json config.local.json
```

### 4. 按需填写配置

示例：

```env
HOST=127.0.0.1
PORT=3000
MUSHENG_PORT=3000
COOKIE_SECURE=false
MUSHENG_ADMIN_USER_IDS=
CORS_ALLOWED_ORIGINS=
DEFAULT_ENGINE=automatic1111
AUTO1111_BASE_URL=http://127.0.0.1:7860
AUTO1111_LORA=
COMFYUI_BASE_URL=http://127.0.0.1:8188
COMFYUI_CHECKPOINT=
COMFYUI_WORKFLOW_FILE=
TEXT_MODEL_ENABLED=false
TEXT_MODEL_BASE_URL=https://api.example.com/v1
TEXT_MODEL_API_KEY=
TEXT_MODEL_NAME=
IMAGE_MODEL_BASE_URL=https://api.example.com/v1
IMAGE_MODEL_API_KEY=
IMAGE_MODEL_NAME=
IMAGE_MODEL_SIZE=1024x1024
```

只使用本地 SD 时，大模型相关配置可以留空。需要并行生成时，将 `DEFAULT_ENGINE` 设置为 `automatic1111+imageModel` 或 `comfyui+imageModel`。

### 5. 启动

```bash
npm start
```

启动后访问：

```text
http://127.0.0.1:3000
```

### 账号和管理员初始化

注册或登录后，生成、智能体、历史、历史图片和报告均按当前账号隔离。配置读取和写入需要管理员 session。管理员不是按邮箱判断：先注册账号，登录后请求 `GET /api/v1/auth/me` 取得返回的随机 `user.id`，在部署环境设置 `MUSHENG_ADMIN_USER_IDS` 后重启服务。`role`、`id` 等注册字段不会自提权。运行中的 Compose 服务可以使用 `make admin-id EMAIL=you@example.com` 从容器用户文件只读查询 ID。

## 常见情况

### 端口占用

Node.js 本地启动时，如果 `3000` 已经被占用，可以改端口：

```bash
set PORT=3001
npm start
```

Docker 启动时，在 `.env` 中设置 `MUSHENG_PORT`，例如 `MUSHENG_PORT=4318`。

### Git 未加入 PATH

如果终端里执行 `git` 找不到命令，请确认 Git 已安装并加入系统 PATH。

发布规则见 [docs/RELEASE_RULES.md](./RELEASE_RULES.md)。

### 可选：Codex Gemini 执行 Worker

本地开发可按 [GEMINI_WORKER.md](./GEMINI_WORKER.md) 安装独立 stdio MCP，使用 Gemini 3.8 Flash 读取授权文件、应用精确补丁并运行授权测试。它仅供宿主 Codex 使用，依赖单独安装，`tools` 不进入 Docker 镜像，不改变 Web 应用启动配置。
