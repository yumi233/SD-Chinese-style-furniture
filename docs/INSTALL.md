# 安装说明

## 环境要求

- Node.js 18+
- 本地 Stable Diffusion WebUI、ComfyUI 或可用的 OpenAI 兼容图像模型接口
- Windows 环境下建议已安装 Git

## 安装步骤

### 1. 获取项目

```bash
git clone https://github.com/yumi233/SD-Chinese-style-furniture.git
cd SD-Chinese-style-furniture
```

### 2. 安装依赖

```bash
npm install
```

### 3. 创建环境变量文件

```bash
copy .env.example .env
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

## 启动

```bash
npm start
```

启动后访问：

```text
http://127.0.0.1:3000
```

## 常见情况

### 端口占用

如果 `3000` 已经被占用，可以改端口：

```bash
set PORT=3001
npm start
```

### Git 未加入 PATH

如果终端里执行 `git` 找不到命令，请确认 Git 已安装并加入系统 PATH。
