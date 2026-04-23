# 安装说明

## 环境要求

- Node.js 18+
- 本地 Stable Diffusion WebUI 或 ComfyUI
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
```

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
