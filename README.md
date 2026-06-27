# SD-Chinese-style-furniture

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

### 方式 A：Docker 启动（推荐体验者）

只需要 Docker Desktop，不需要先安装 Node.js：

```bash
git clone https://github.com/yumi233/SD-Chinese-style-furniture.git
cd SD-Chinese-style-furniture
docker compose up --build
```

打开网页：

```text
http://127.0.0.1:3000
```

默认 `docker-compose.yml` 会把容器里的历史记录和模型配置保存到 Docker volume。网页里保存的模型配置会写入容器内的 `/app/data/config.local.json`，下次启动仍会保留。

如果 Stable Diffusion WebUI 或 ComfyUI 跑在宿主机上，容器里不能使用 `127.0.0.1` 访问宿主机服务；请使用：

```text
http://host.docker.internal:7860
http://host.docker.internal:8188
```

停止服务：

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

## 文档导航

- [安装说明](./docs/INSTALL.md)
- [使用说明](./docs/USAGE.md)
- [截图说明](./docs/SCREENSHOTS.md)

## 技术结构

### 前端

- 原生 HTML
- 原生 CSS
- 原生 JavaScript

当前前端不是 React/Vue 脚手架，而是一个轻量可快速迭代的静态页面。

核心文件：

- [index.html](./index.html)
- [styles.css](./styles.css)
- [script.js](./script.js)

### 后端

- Node.js
- Express

核心文件：

- [server.js](./server.js)
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

```bash
docker compose up --build
```

容器默认监听 `3000`，访问：

```text
http://127.0.0.1:3000
```

如果本地 A1111/ComfyUI 跑在宿主机上，容器内配置请使用 `host.docker.internal`，例如 `http://host.docker.internal:7860` 和 `http://host.docker.internal:8188`。

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
PORT=3000
HISTORY_DATA_DIR=
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

### `GET /api/health`

检查后端服务和各引擎可用状态。

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

默认数据保存在 `data/history`。该目录不依赖浏览器缓存，因此关闭网页、换浏览器或
重启服务后仍能读取。迁移到另一台电脑时，需要把这个目录一起复制。

## 项目里的几个关键判断逻辑

### 为什么要区分“结构化 prompt”和“普通中文描述”

因为已经成熟的英文 SD prompt 如果再被自动强化，往往会导致：

- 结构词重复
- 光影词叠加
- 风格词冲突
- LoRA 叠加过重

所以当前逻辑会判断输入是否已经足够结构化，如果是，就尽量原样发送。

### 为什么默认尺寸收回 `512`

因为中式家具这种强调结构稳定性的题材，在 LoRA 和材质细节很多的时候：

- 更大尺寸更容易崩结构
- 结构崩坏后放大也没有意义

所以当前默认优先稳，而不是优先大图。

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

5. 结果历史管理
把每次出图的 prompt、negative、seed、LoRA、引擎配置都记录下来。

## License

当前仓库暂未附带 License 文件。

如果你准备长期公开维护，建议下一步补一个明确许可证，例如：

- MIT
- Apache-2.0
- GPL-3.0
