# 新人加入步骤

这是木生 AI，中式家具图片生成工作台。GitHub 保存网页程序，Docker 用来安装和更新，实际生图由另外配置的模型服务完成。

## 项目负责人先准备

1. 把本页面和仓库链接发给新同事：https://github.com/yumi233/SD-Chinese-style-furniture 。公开仓库只下载使用无需邀请。
2. 需要修改代码的同事先注册 GitHub。仓库所有者在 Settings → Collaborators（界面可能显示 Manage access）→ Add people，按 GitHub 用户名邀请；对方接受邀请后才能推送分支。不分享自己的账户密码。
3. 指定一位技术负责人审核代码和发布，一位模型负责人提供模型地址、模型名称和团队凭据。凭据通过团队密码管理器等私密渠道提供，不写入仓库。
4. PPT、视频和申报资料通过团队资料盘另行交付，GitHub 不包含这些本地资料。

## 只使用网页：Docker 安装

1. 安装并启动 Docker Desktop，Windows 使用 Linux containers；安装 Git。
2. 打开 PowerShell，逐行运行：

```powershell
git clone https://github.com/yumi233/SD-Chinese-style-furniture.git
cd SD-Chinese-style-furniture
docker compose pull
docker compose up -d
```

3. 浏览器打开 http://127.0.0.1:3000 。如果拉取镜像提示 denied，请负责人确认 GitHub Packages 中该镜像允许公开拉取；若构建尚未完成，先查看仓库 Actions。
4. 在模型连接面板填写模型负责人给的配置。先用普通生成模式，输入家具描述，完成一次生成和下载。智能体模式还需要可读图片的视觉模型；文字增强可选。

镜像不包含 Stable Diffusion、ComfyUI、模型权重或付费额度。宿主机模型地址在容器中使用 `host.docker.internal`，例如 `http://host.docker.internal:7860`。

启用自动更新，在同一个项目目录运行：

```powershell
docker compose -f docker-compose.yml -f docker-compose.auto-update.yml up -d
```

GitHub 的 main 更新后，测试通过才会发布镜像；Watchtower 每 5 分钟检查并替换容器，更新时可能短暂中断。它需要 Docker socket 权限，只在自己的可信电脑启用。

手动更新：

```powershell
git pull --ff-only
docker compose pull
docker compose up -d
```

Watchtower 只更新镜像，不更新本地 Compose 文件；发布说明要求配置变更时仍需拉取仓库并重新执行对应启动命令。自动更新模式的停止命令是 `docker compose -f docker-compose.yml -f docker-compose.auto-update.yml down`。

模型配置和历史保存于 Docker 数据卷，正常重启或更新会保留；不要运行 `docker compose down -v`，它会删除数据卷。每个人本机的数据彼此独立，不会随 GitHub 同步。

当前应用没有用户登录和成员隔离。先各自在本机使用，不直接作为公网或团队共享服务；集中部署由技术负责人先完成[接管手册](TEAM_HANDOVER.md)里的安全整改。

## 参与开发：协作流程

1. 接受仓库邀请，阅读 [架构说明](PROJECT_OVERVIEW.md) 和 [仓库规则](../AGENTS.md)。
2. 克隆仓库并安装 Node.js 20（与当前 CI 对齐），运行 `npm ci`。
3. 用 `git switch -c codex/你的功能名称` 新建分支，修改代码，运行 `npm test`。
4. 验证当前源码的 Docker 版本：`docker compose -f docker-compose.yml -f docker-compose.local.yml up --build`。普通启动拉的是发布镜像，不包含尚未发布的本地修改。
5. 只暂存需要发布的文件，提交并推送自己的分支，在 GitHub 创建 Pull Request，请负责人审核。
6. 负责人检查测试和镜像构建通过后合并到 main；main 自动发布 GHCR 镜像。涉及运行配置、依赖或资源时，同步更新 Docker 和安装文档。

## 首次使用验收

- 网页可以打开。
- 普通生成能产出一张图片并下载。
- 重启容器后历史仍存在。
- 知道模型故障找谁、代码问题找谁，密钥不提交到 GitHub。

完整文档见 [文档总目录](README.md)。本地 Gemini worker 属于可选开发工具，不是网页使用前提；其源码本次不随网页资料发布。
