# SD-Chinese-style-furniture

一个面向中式家具场景的本地 AI 生图项目。

它不是传统 Stable Diffusion 那种“参数很多、学习成本高”的控制台，而是一个更偏产品化的网页工具：

- 用自然语言描述中式家具画面
- 自动把中文提示词翻译成英文关键词
- 自动做中式家具场景增强
- 接入本地 `Stable Diffusion WebUI / AUTOMATIC1111`
- 接入本地 `ComfyUI`
- 在网页里完成生成、预览、下载、再次生成和继续细化

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

### 5. Stable Diffusion / ComfyUI 双后端

后端提供统一网关，前端只调用：

- `POST /api/generate`

后端会根据当前配置转发到：

- `AUTOMATIC1111 / Stable Diffusion WebUI`
- `ComfyUI`

### 6. 本地模型连接面板

网页顶部的 `连接本地模型` 按钮已经可用，可以在页面里直接修改：

- 默认引擎
- Stable Diffusion 地址
- LoRA 模型选择
- ComfyUI 地址
- ComfyUI checkpoint
- ComfyUI workflow 文件路径

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

### 1. 克隆项目

```bash
git clone https://github.com/yumi233/SD-Chinese-style-furniture.git
cd SD-Chinese-style-furniture
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

```bash
copy .env.example .env
```

### 4. 启动服务

```bash
npm start
```

### 5. 打开网页

```text
http://127.0.0.1:3000
```

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
DEFAULT_ENGINE=automatic1111
AUTO1111_BASE_URL=http://127.0.0.1:7860
AUTO1111_LORA=
COMFYUI_BASE_URL=http://127.0.0.1:8188
COMFYUI_CHECKPOINT=
COMFYUI_WORKFLOW_FILE=
```

说明：

- `AUTO1111_LORA`：默认 LoRA 名称
- `COMFYUI_CHECKPOINT`：ComfyUI 走默认 workflow 时的 checkpoint
- `COMFYUI_WORKFLOW_FILE`：自定义 workflow 文件

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

- `images[0].url`

可以直接被前端作为图片地址使用。

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

### 1. 中文翻译还不是完整 LLM 翻译

目前是“词典优先 + 局部替换”的方式，不是完整语义大模型翻译。

优点：

- 稳
- 可控
- 适合垂直领域

限制：

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

3. 中文翻译升级  
把当前词典翻译升级成“本地 LLM 翻译 + 家具领域规则修正”。

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
