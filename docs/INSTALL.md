# 安装说明

文档入口见 [文档总目录](README.md)。本地归档、交付件和参考素材由
`.dockerignore` 排除，不需要复制到镜像；文件归属见 [整理规则](ORGANIZATION.md)。

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

### 4. 自动更新模式

启用 Watchtower 后，运行中的容器会自动跟随 GHCR 最新镜像更新：

```bash
docker compose -f docker-compose.yml -f docker-compose.auto-update.yml up -d
```

Watchtower 每 5 分钟检查一次 `ghcr.io/yumi233/sd-chinese-style-furniture:latest`。发现新镜像后，它会自动拉取并重启 `web` 容器。这个模式会挂载 Docker socket，只建议在自己的电脑或可信服务器上启用。

停止自动更新模式：

```bash
docker compose -f docker-compose.yml -f docker-compose.auto-update.yml down
```

### 5. 后台运行和停止

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

如果 `3000` 端口被占用，修改 `docker-compose.yml`：

```yaml
ports:
  - "3001:3000"
```

然后访问 `http://127.0.0.1:3001`。

### 6. 手动更新

如果没有启用自动更新，每次想更新到 GitHub 最新 Docker 镜像时运行：

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
PORT=3000
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

## 常见情况

### 端口占用

Node.js 本地启动时，如果 `3000` 已经被占用，可以改端口：

```bash
set PORT=3001
npm start
```

Docker 启动时，改 `docker-compose.yml` 的端口映射，例如 `3001:3000`。

### Git 未加入 PATH

如果终端里执行 `git` 找不到命令，请确认 Git 已安装并加入系统 PATH。

发布规则见 [docs/RELEASE_RULES.md](./RELEASE_RULES.md)。

### 可选：Codex Gemini 执行 Worker

本地开发可按 [GEMINI_WORKER.md](./GEMINI_WORKER.md) 安装独立 stdio MCP，使用 Gemini 3.8 Flash 读取授权文件、应用精确补丁并运行授权测试。它仅供宿主 Codex 使用，依赖单独安装，`tools` 不进入 Docker 镜像，不改变 Web 应用启动配置。
