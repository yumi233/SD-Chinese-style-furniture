# SD-Chinese-style-furniture

> **当前状态（2026-10-10）**：PR #1 的「制图台」工作台用于生产。生产首选 `codexCli`（GPT-6.1 Sol / high），普通生成与智能体使用后台任务，登录用户可以生图；在线图像 API 保留为可配置的备选。凭据只在服务器使用，配置修改仍需管理员。已补充登录竞态、手机重叠、弹窗和历史恢复整改（`20261010-auth-mobile-r5`），见 [整改审查](docs/AUTH_MOBILE_AUDIT.md)。详见 [生产 Codex 生图](docs/CODEX_PRODUCTION.md)。

一个面向中式家具场景的本地 AI 生图项目。

它不是传统 Stable Diffusion 那种“参数很多、学习成本高”的控制台，而是一个更偏产品化的网页工具：

- 用自然语言描述中式家具画面
- 自动把中文提示词翻译成英文关键词
- 自动做中式家具场景增强
- 可选接入文字大模型进行语义理解、翻译和 Prompt 优化
- 接入本地 `Stable Diffusion WebUI / AUTOMATIC1111`
- 接入本地 `ComfyUI`
- 接入 OpenAI 兼容的图像大模型，并支持与本地模型并行生成
- 在网页里完成生成、预览、下载、再次生成和继续细化
- 画布尺寸支持 16:9 / 4:3，并分别提供 720p 与 1080p

## 目录

- [项目定位](#项目定位)
- [功能概览](#当前功能)
- [截图区](#截图区)
- [快速开始](#快速开始)
- [文档导航](#文档导航)
- [技术结构](#技术结构)
- [API](#api)
- [当前限制](#当前已知限制)
- [后续规划](#推荐后续优化)

## 项目定位

这个项目当前重点解决的是：

- 中式家具
- 新中式空间
- 明式单品
- 室内陈设图
- 产品定妆图
- 木作、榫卯、材质表达

也就是说，它不是一个泛用型生图壳子，而是一个针对“中式家具视觉生成”做了前端交互和提示词流程优化的本地工具。

## 当前功能

### 1. 自然语言输入

网页支持直接输入中文描述，例如：

```text
一张明式圈椅放在素雅茶室中，黑胡桃木，榫卯结构，晨光斜照，留白克制，高级产品摄影
```

### 2. 中文自动翻译为英文提示词

项目内置了一套偏中式家具语境的翻译词典，会优先翻译这些高频词：

- 明式
- 新中式
- 宋韵
- 禅意
- 圈椅
- 官帽椅
- 罗汉床
- 榫卯
- 黑胡桃木
- 茶室
- 留白
- 产品摄影

### 3. 三段式提示词可视化

网页里会显示三层内容，方便排查出图问题：

- 中文原始输入
- 自动翻译英文 Prompt
- 强化后 Prompt

这对定位“翻译有问题”还是“增强有问题”非常有用。

### 4. 中式家具 Prompt 强化

对于普通自然语言输入，系统会自动附加一些更稳定的中式家具生成关键词，例如：

- physically correct structure
- refined woodworking detail
- realistic material response
- balanced studio light
- product-focused framing

如果输入本身已经是结构化英文 prompt，系统会尽量原样保留，不做过度强化。

### 5. 本地模型 / 图像大模型统一网关

后端提供统一网关，前端只调用：

- `POST /api/generate`

后端会根据当前配置转发到：

- `AUTOMATIC1111 / Stable Diffusion WebUI`
- `ComfyUI`
- OpenAI 兼容的 `Images Generations` 接口

生成模式支持：

- 只用 Stable Diffusion WebUI
- 只用 ComfyUI
- 只用图像大模型
- Stable Diffusion WebUI 与图像大模型并行
- ComfyUI 与图像大模型并行

并行模式会保留成功返回的结果。如果其中一路失败，另一路结果仍会显示，并在页面中提示失败原因。

### 6. 模型连接面板

网页顶部的 `连接本地模型` 按钮已经可用，可以在页面里直接修改：

- 默认引擎
- Stable Diffusion 地址
- LoRA 模型选择
- ComfyUI 地址
- ComfyUI checkpoint
- ComfyUI workflow 文件路径
- 文字模型开关、API Base URL、API Key、模型名称
- 图像模型 API Base URL、API Key、模型名称

文字与图像模型均使用 OpenAI 兼容接口。API Key 不会通过 `GET /api/config` 返回前端；在设置页留空会保留服务端已有密钥。

### 7. LoRA 模型支持

Stable Diffusion 路线现在不是填 checkpoint 名，而是填 `LoRA 模型选择`。

后端会自动把它拼接进 prompt：

```text
<lora:你的lora名:1>, your prompt
```

如果 prompt 里已经手写了 `<lora:...>`，后端不会重复追加。

### 8. 生成结果操作

每张结果卡片支持：

- 放大预览
- 下载图片
- 再来一版

“再来一版”支持两种思路：

- 同参数重跑
- 自动加变化词重跑

当前内置的变化方向：

- 换个角度
- 更强光影
- 更克制陈设

### 9. 继续细化上一版

当你生成过至少一张图后，主编辑区会出现“继续细化上一版”卡片：

- 显示上一版图像预览
- 显示上一版描述
- 一键把上一版内容带回输入框继续迭代

## 截图区

当前仓库已经预留了截图目录：

- [docs/screenshots](./docs/screenshots)

建议后续把这些截图补进去：

1. 首页整体界面
2. 本地模型连接面板
3. 中文原词 / 英文翻译 / 强化 Prompt 三段式面板
4. 生成结果卡片
5. 继续细化上一版卡片

README 中推荐使用这些文件名：

- `docs/screenshots/home.png`
- `docs/screenshots/model-config.png`
- `docs/screenshots/prompt-pipeline.png`
- `docs/screenshots/result-gallery.png`
- `docs/screenshots/refine-panel.png`

如果你后面把图片补上，可以直接在这里展示：

```md
![Home](./docs/screenshots/home.png)
![Model Config](./docs/screenshots/model-config.png)
![Prompt Pipeline](./docs/screenshots/prompt-pipeline.png)
```

## 快速开始

### 方式 A：Docker 启动（推荐）

只需要 Docker Desktop，不需要先安装 Node.js：

```bash
git clone https://github.com/yumi233/SD-Chinese-style-furniture.git
cd SD-Chinese-style-furniture
docker compose pull
docker compose up -d
```

打开网页：

```text
http://127.0.0.1:3000
```

默认 `docker-compose.yml` 会拉取 GitHub Container Registry 上的最新镜像：`ghcr.io/yumi233/sd-chinese-style-furniture:latest`。每次 `main` 更新后，GitHub Actions 会自动重新构建并发布这个镜像。容器里的历史记录和模型配置保存到 Docker volume，网页里保存的模型配置会写入 `/app/data/config.local.json`，下次启动仍会保留。

容器默认只绑定到宿主机回环地址。需要换端口时，在 `.env` 中设置
`MUSHENG_PORT=4318`，然后访问 `http://127.0.0.1:4318`。项目不提供自动更新覆盖文件，更新镜像时请人工执行 `docker compose pull && docker compose up -d`。

如果 Stable Diffusion WebUI 或 ComfyUI 跑在宿主机上，容器里不能使用 `127.0.0.1` 访问宿主机服务；请使用：

```text
http://host.docker.internal:7860
http://host.docker.internal:8188
```

停止普通 Docker 服务：

```bash
docker compose down
```

需要清空 Docker 保存的历史记录和配置时：

```bash
docker compose down -v
```

### 方式 B：本地 Node.js 启动

```bash
git clone https://github.com/yumi233/SD-Chinese-style-furniture.git
cd SD-Chinese-style-furniture
npm install
copy config.local.example.json config.local.json
npm start
```

然后打开：

```text
http://127.0.0.1:3000
```

后端会优先读取 `config.local.json`，用于长期固定 Stable Diffusion、ComfyUI、文字大模型、图像大模型和视觉评价模型的地址、模型名与 API Key。这个文件已加入 `.gitignore`，适合保存本机密钥；`.env` 仍可作为默认值或部署环境变量使用。

## 生产部署：`ms.yumi233.cn`

用户已授权将木生·AI 从“仅预留”推进为独立生产部署配置。正式部署使用仓库根目录的 `compose.yaml`，固定镜像由 `FURNITURE_IMAGE` 指定，服务加入外部 `personal-hub-edge` 网络并以 `musheng-web:3000` 提供给反向代理；它不发布宿主机端口，也不使用开发用的 `docker-compose.yml` 或 preview volume。

先准备已经构建并审核过的本地镜像，再复制非秘密模板：

```bash
cp .env.production.example .env.production
make prod-config
make prod-up
make prod-ps
```

生产环境的实际 `.env.production` 不提交 Git。首次注册自己的账号后，从 `GET /api/v1/auth/me` 取得服务端随机 `user.id`，人工核对后写入 `MUSHENG_ADMIN_USER_IDS` 并重启；注册请求不能自报 `id`、`role` 或管理员身份。管理员配置仍默认拒绝，未配置管理员时不要把配置读写接口当作可用。

模型地址和密钥目前留空，真实模型尚未联调；完成管理员初始化后，使用受保护的配置界面填写部署环境所需模型信息。备份通过 `make prod-backup` 在临时容器中以只读方式导出 `furniture-ai-data` 到被 Git 和 Docker 忽略的 `backups/`，备份内容可能包含密钥、用户和生成历史，必须另行限制访问。生产卷与开发/预览卷不同，不能复制测试账号或预览数据。

详细前置条件、反向代理网络、升级、回滚和验证边界见 [生产部署说明](./docs/PRODUCTION_DEPLOYMENT.md)。本次只增加配置和文档，不执行 Cloudflare 路由、启动容器或推送 Git。

## 文档导航

- [新人加入：可直接转发的安装和协作步骤](./docs/GETTING_STARTED.md)
- [文档总目录：按用途分类](./docs/README.md)
- [项目文件整理规则](./docs/ORGANIZATION.md)
- [团队接管手册：共享、分工、部署与迁移](./docs/TEAM_HANDOVER.md)
- [功能与架构说明：功能清单、代码结构与接口](./docs/PROJECT_OVERVIEW.md)
- [安装说明](./docs/INSTALL.md)
- [使用说明](./docs/USAGE.md)
- [截图说明](./docs/SCREENSHOTS.md)
- [发布规则](./docs/RELEASE_RULES.md)

## 技术结构

### 前端

- 原生 HTML
- 原生 CSS
- 原生 JavaScript

当前前端不是 React/Vue 脚手架，而是一个轻量可快速迭代的静态页面。

入口页面位于 `public/index.html`，工作台位于 `public/studio.html`；脚本和样式也按页面收在 `public/` 下。

### 后端

- Node.js
- Express

核心文件：

- [server.js](./server.js)：运行时装配和端口入口
- [src/http/app.js](./src/http/app.js)：`createApp`、静态白名单和错误边界
- [src/http/routes.js](./src/http/routes.js)：版本化 API 路由
- [src/http/middleware.js](./src/http/middleware.js)：Origin、session、限流和错误脱敏
- [src/userStore.js](./src/userStore.js)：用户、session 和原子 JSON 持久化
- [src/imageGateway.js](./src/imageGateway.js)
- [src/providers/automatic1111.js](./src/providers/automatic1111.js)
- [src/providers/comfyui.js](./src/providers/comfyui.js)
- [src/lib/requestNormalizer.js](./src/lib/requestNormalizer.js)

## 接入方式

### Stable Diffusion WebUI / AUTOMATIC1111

后端直接请求：

- `/sdapi/v1/txt2img`

当前默认参数已经尽量向更稳定的中式家具出图配置靠拢：

- `Sampler = DPM++ 2M`
- `Scheduler = Karras`
- `CFG = 7`
- `CLIP skip = 2`

### ComfyUI

支持两种方式：

1. 使用代码里的默认基础 workflow
2. 使用你自己的 `workflow.json` 模板

你可以在配置里填写：

- `ComfyUI workflow 文件路径`

## 本地运行

### Docker 运行

手动更新：

```bash
docker compose pull
docker compose up -d
```

容器默认监听 `3000`，访问：

```text
http://127.0.0.1:3000
```

如果本地 A1111/ComfyUI 跑在宿主机上，容器内配置请使用 `host.docker.internal`，例如 `http://host.docker.internal:7860` 和 `http://host.docker.internal:8188`。

如果你正在改源码，需要本地重新构建镜像：

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
```

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制一份：

```bash
copy .env.example .env
```

你可以配置：

```env
HOST=127.0.0.1
PORT=3000
MUSHENG_PORT=3000
COOKIE_SECURE=false
MUSHENG_ADMIN_USER_IDS=
CORS_ALLOWED_ORIGINS=
HISTORY_DATA_DIR=
USER_DATA_FILE=
MODEL_CONFIG_FILE=
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
VISION_MODEL_BASE_URL=https://api.example.com/v1
VISION_MODEL_API_KEY=
VISION_MODEL_NAME=
```

说明：

- `HISTORY_DATA_DIR`：可选的历史记录保存目录；留空时使用项目内的 `data/history`
- `USER_DATA_FILE`：用户和 session 文件；留空时使用项目内的 `data/users/users.json`
- `MUSHENG_ADMIN_USER_IDS`：逗号分隔的随机用户 ID；为空时拒绝所有管理员权限
- `COOKIE_SECURE`：显式控制 session cookie 的 `Secure` 属性。本地 HTTP 使用 `false`，HTTPS 部署再设为 `true`
- `CORS_ALLOWED_ORIGINS`：精确的 Origin allowlist，多个值用逗号分隔；无 Origin 的本地工具请求仍可用
- `AUTO1111_LORA`：默认 LoRA 名称
- `COMFYUI_CHECKPOINT`：ComfyUI 走默认 workflow 时的 checkpoint
- `COMFYUI_WORKFLOW_FILE`：自定义 workflow 文件
- `TEXT_MODEL_ENABLED`：是否在生成前调用文字大模型优化 Prompt
- `TEXT_MODEL_*`：OpenAI 兼容的 `POST /chat/completions` 接口配置
- `IMAGE_MODEL_*`：OpenAI 兼容的 `POST /images/generations` 接口配置
- `IMAGE_MODEL_SIZE`：图像大模型独立使用的请求尺寸，默认 `1024x1024`
- `VISION_MODEL_*`：支持图片输入的 OpenAI 兼容 `POST /chat/completions` 接口配置

如果文字模型与视觉模型使用同一个多模态 API，可以把两组 Base URL、API Key
和模型名称设置为相同值。API Key 只保存在后端，不会通过配置读取接口返回前端。

`DEFAULT_ENGINE` 可填写：

- `automatic1111`
- `comfyui`
- `imageModel`
- `automatic1111+imageModel`
- `comfyui+imageModel`

### 3. 启动

```bash
npm start
```

默认打开：

- [http://127.0.0.1:3000](http://127.0.0.1:3000)

## API

### 认证与权限

`/api/v1` 是规范路径，旧的 `/api` 路径保留兼容并使用同一套路由和中间件。注册或登录后，服务端通过 HttpOnly `musheng_session` cookie 识别用户。

- `POST /api/v1/auth/register`：注册并创建 session
- `POST /api/v1/auth/login`：登录并创建 session
- `POST /api/v1/auth/logout`：注销当前 session
- `GET /api/v1/auth/me`：读取当前用户（包含 `isAdmin`）
- `PATCH /api/v1/auth/profile`：修改显示名称和头像

生成、智能体、历史、历史图片和报告都要求登录，并按用户隔离。迁移中的无 `ownerId` 历史只对管理员可见。配置读取和写入只对管理员开放。

管理员使用随机用户 ID allowlist：先注册账号，再在已登录状态通过 `GET /api/v1/auth/me` 取得 `user.id`，把它写入部署环境的 `MUSHENG_ADMIN_USER_IDS` 并重启服务。`role`、`id` 等注册字段不会授予权限；环境变量为空时默认没有管理员。运行中的 Compose 服务可用 `make admin-id EMAIL=you@example.com` 从容器用户文件只读查询 ID。

### `GET /api/health`

检查后端网关和各引擎可用状态，模型未启动时可能返回失败项。

### `GET /api/v1/live`

只检查 Express 进程是否能响应，用于 Docker healthcheck；它不调用外部模型，不代表模型服务已就绪。

### `GET /api/engines`

返回当前支持的引擎列表和默认引擎。

### `GET /api/config`

读取当前本地模型连接配置。

### `POST /api/config`

更新当前本地模型连接配置。

### `POST /api/generate`

请求体示例：

```json
{
  "engine": "automatic1111",
  "originalPrompt": "一张明式圈椅放在素雅茶室中",
  "prompt": "Ming-style Chinese furniture, round-back armchair, walnut wood, mortise and tenon joinery, product photography",
  "enhancedPrompt": "Ming-style Chinese furniture, round-back armchair, walnut wood, mortise and tenon joinery, product photography",
  "negativePrompt": "deformed structure, wrong proportions, broken joints",
  "style": "ming",
  "quality": "hd",
  "size": 512,
  "mood": 62
}
```

返回体中的：

- `images[].url`：图片 URL 或 Data URL
- `images[].engine`：该图片的实际生成引擎
- `promptPipeline.finalPrompt`：文字模型处理后的最终 Prompt
- `errors[]`：并行模式中未成功引擎的错误信息

`images[].url` 可以直接被前端作为图片地址使用。

### `POST /api/agent/run`

执行最小智能体闭环：生成图片、视觉模型评审、修正 Prompt，并在未达到目标分数时再次生成。

请求体示例：

```json
{
  "engine": "automatic1111",
  "originalPrompt": "设计一张黑胡桃木明式圈椅，结构轻巧",
  "prompt": "Ming-style black walnut round-back armchair, lightweight structure",
  "negativePrompt": "deformed structure, broken joints",
  "style": "ming",
  "quality": "hd",
  "size": 512,
  "targetScore": 85,
  "maxRounds": 2
}
```

返回内容包括：

- `rounds[]`：每轮图片、视觉评分、问题和修正 Prompt
- `bestImage`：最高分图片
- `bestEvaluation`：最高分图片的结构、材质和风格评分
- `finalPrompt`：最后一轮使用的 Prompt

### 历史记录 API

- `GET /api/history`：读取普通生成和智能体生成历史
- `GET /api/history/:id`：读取单条历史记录
- `DELETE /api/history/:id`：删除记录及其已保存图片
- `GET /api/history/assets/:filename`：读取持久化图片

每次成功调用 `/api/generate` 或 `/api/agent/run` 后，后端都会自动保存：

- 原始需求和最终 Prompt
- 风格、尺寸、质量、模型引擎
- 生成图片
- 智能体每轮评分和修改意见

默认数据保存在 `data/history`，用户和 session 保存在 `data/users/users.json`。这些目录不依赖浏览器缓存，因此关闭网页、换浏览器或重启服务后仍能读取。迁移到另一台电脑时，需要把历史目录、用户文件和配置文件一起按部署安全要求复制。配置 API 返回脱敏字段，密钥不会返回浏览器。

## 项目里的几个关键判断逻辑

### 为什么要区分“结构化 prompt”和“普通中文描述”

因为已经成熟的英文 SD prompt 如果再被自动强化，往往会导致：

- 结构词重复
- 光影词叠加
- 风格词冲突
- LoRA 叠加过重

所以当前逻辑会判断输入是否已经足够结构化，如果是，就尽量原样发送。

### 当前默认画布尺寸

当前默认是 `16:9-720p`（1280×720），支持 16:9 / 4:3 的 720p 和 1080p；后端仍兼容旧版 `512` 等方形尺寸。图像大模型使用独立的请求尺寸配置。

## 当前已知限制

### 1. 文字大模型默认关闭

未配置或未启用文字大模型时，系统仍使用“词典优先 + 局部替换”的本地增强方式。

优点：

- 稳
- 可控
- 适合垂直领域

本地增强的限制：

- 对非常口语化或非常长的中文句子不够自然

### 2. ComfyUI 默认 workflow 还是基础版

如果你要追求更稳定的中式家具出图，建议后续把它换成你自己的专用 workflow。

### 3. 还没有自动枚举本地 LoRA 列表

现在 `LoRA 模型选择` 还是输入框。

后续建议接成：

- 从 A1111 / ComfyUI 拉模型列表
- 做成下拉选择器

### 4. 运行边界

- 用户、session、历史和模型配置使用单实例 JSON 文件；部署多个副本前需要改为带并发控制的数据库或共享存储。
- 账号登录、Origin allowlist、用户隔离和管理员 ID allowlist已在 HTTP 层启用；没有 `AUTH_ENABLED=false` 旁路。
- CI 会运行无真实付费模型的 Provider 单元测试和 HTTP 集成测试；真实模型服务的连通性、费用和输出质量仍需在部署环境单独验收。

## 推荐后续优化

如果继续做，这个项目最值得往下推进的是：

1. LoRA 下拉列表
从本地 SD 接口读取可用 LoRA，避免手输。

2. 高级参数折叠区
把 `steps / cfg / seed / clip skip / sampler / scheduler` 做成可选高级面板。

3. 更多文字/图像服务商适配
当前优先支持 OpenAI 兼容接口，后续可增加各服务商的原生请求格式和参数映射。

4. ComfyUI 专用 workflow
单独为中式家具构图、材质、木作结构、陈设控制做 workflow。

5. 完善历史参数追溯
   历史已保存 `negativePrompt` 和 `seed`；后续可补齐 LoRA 与引擎配置快照，增强结果复现能力。

## License

当前仓库暂未附带 License 文件。

如果你准备长期公开维护，建议下一步补一个明确许可证，例如：

- MIT
- Apache-2.0
- GPL-3.0

本地 Codex 可安装 [Gemini 执行 Worker](docs/GEMINI_WORKER.md)，每次自动选择接口中版本号最高的 Gemini Flash 文本模型，并按文件白名单执行读取、补丁和测试。Worker 独立安装，不进入 Docker Web 镜像。
