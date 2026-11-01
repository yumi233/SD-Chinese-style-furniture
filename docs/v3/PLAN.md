# 木生 v3 · 共用规格

所有子任务都以本文件为准。负责人（总设计）会合并各分支，并截图验收。

## 方向

- 以作品为中心的工作台：画布为主，版本是画布上的卡片和连线（版本树）。只有一个输入栏：未选中版本时显示「生成」，选中后显示「修改 vN」。
- 主视觉是**大幅 ASCII 画面**：一块占半个屏幕的圆角面板，一张浅色高调的图片被画成密集的鼠尾草绿字符，顶部有白色渐隐。标题压在面板左下角，中文宋体大字，第二行用橄榄绿。参考：Lumio 登录页风格。
- 保留原来的组件质感：磨砂玻璃导航、亚克力面板加细颗粒、内高光、柔和阴影、滑动指示块、弹性动效。
- 项目原则：Avoid unnecessary secondary labels and descriptions. Let the layout do the explaining. 不写眉题、副标题、英文括注。

## 颜色（变量名以 `--` 开头，放在 `public/ui/tokens.css`）

| 变量 | 日间 | 夜间 |
| --- | --- | --- |
| --paper 页面底 | #F7F6F1 | #161A15 |
| --surface 卡片、输入 | #FFFFFF | #1F241E |
| --line 边框 | #E6E5DE | #2E352C |
| --ink 正文 | #2A2D29 | #E9EDE3 |
| --sub 次要文字 | #6B6F66 | #A3AA9C |
| --sage 主色 | #8FA876 | #A9C38F |
| --olive 强调、标题第二行、链接、木生光标 | #5F7044 | #C3D6A8 |
| --sage-soft 浅绿底 | #E8EEDC | #26301F |
| --btn 主按钮 | 渐变 #454A57 → #343844，加内高光 inset 0 1px 0 #ffffff26 | #E9EDE3，字色 #161A15 |
| --danger | #B8352C | #F08A80 |

ASCII 色板 meadow：#2B361F、#677D45、#AEBA78、#E5E1BD（色阶位置 0 / 0.4 / 0.74 / 1）。

字体：标题用 `"Songti SC", "Noto Serif SC", STSong, serif`；正文用 `-apple-system, "PingFang SC", "Noto Sans SC", sans-serif`；数字、版本号、阶段名用 `ui-monospace, Menlo, monospace`。对比度满足 WCAG AA。

## 圆角（帖子 004）

- token：xs 4、sm 8、md 12、lg 16、xl 20、2xl 24、3xl 28、4xl 32、full 999。
- 内圆角 = 外圆角 − 间距。所有内边距、间距、圆角都落在 4px 网格上。
- 渐进增强：`@supports (corner-shape: superellipse(1.25)) { :where(*) { corner-shape: superellipse(1.25); } }`；胶囊、圆形元素设 `corner-shape: round`。
- 旧版做法参考 `docs/v3/reference/radius.css`，只看思路，不要照搬选择器。
- 全局加一条：`[hidden] { display: none !important; }`。

## 样式层级（只保留三层）

`public/ui/tokens.css`（变量）→ `public/ui/components.css`（组件）→ `public/css/<页面>.css`。删除 brand-tokens / fluid / materials / studio-theme / idea-folder 这几层叠加。

## 动效

- 时长：140 / 240 / 420ms；回弹曲线 `cubic-bezier(.2,1.25,.3,1)`。
- 尊重 `prefers-reduced-motion`：开启时只显示静止的一帧。

## 不变的部分

- 后端接口、账号、生成任务（`/api/v1/generation-tasks`）、历史记录全部保留。
- 只能新建或修改任务里列出的文件。
- 提交前运行 `npm test` 和 `make check`。
