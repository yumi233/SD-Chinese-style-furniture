# T1 · v3 视觉基础交付报告

完成日期：2026-10-31。

## 完成范围

- 首页与工作台分别仅加载三个样式文件，顺序固定为 `ui/tokens.css` → `ui/components.css` → `css/home.css` 或 `css/workbench.css`。没有 `@import` 隐藏旧层。
- 按 PLAN 建立日夜主题、鼠尾草绿／橄榄绿、宋体标题、石板灰渐变主按钮、内高光、玻璃／带细颗粒的亚克力材质、柔和阴影和 4px 圆角／间距网格。首页原有流式间距用 `round(nearest, …, 4px)` 对齐网格。
- 所有 99 个旧变量名继续可用；`--primary` 保持纯色，避免旧 `color-mix()`／SVG 用法接收到渐变，按钮表面单独使用 `--btn`。
- 工作台保留木纹等高线和年轮评审。分段指示块由 CSS `:has(.active)` 跟随既有状态移动，不修改脚本；不支持该选择器时保留按钮激活背景。减少动态效果时关闭动画和过渡。
- 保留密度、字体、字号、色彩倾向设置。青瓷使用主题内的年轮青绿色，墨色使用正文色，默认木韵采用 v3 主色。标题始终优先宋体。
- 首页、工作台的 `<body>` 与任务开始时逐字相同；HTML 仅删除 `<head>` 中旧样式链接。未修改 JS、后端、模型配置、依赖或 Docker。既有 Dockerfile 的 `COPY . .` 已覆盖合并后的公共资源。
- 调整 `test/frontendBindings.test.js` 原有旧 CSS 引用断言，校验三层顺序和文件存在性。

## 删除与合并

| 文件 | 处理 |
| --- | --- |
| `public/ui/brand-tokens.css` | 已删除；语义色、木纹／年轮色和兼容别名并入 tokens；外观偏好规则并入 components |
| `public/css/studio.css` | 已删除；弹窗、账号、设置、历史、结果卡片和灯箱规则按原级联顺序并入 workbench 页面层 |
| `fluid.css`、`materials.css`、`studio-theme.css`、`idea-folder.css` | 当前分支原本就没有这些文件或 HTML 引用；所需玻璃、颗粒、内高光、动效和圆角已由现存三层承担，没有声称删除不存在的文件 |

## 变量表

以下为 tokens 的完整变量表。夜间栏「沿用」表示沿用对应表达式；`var()` 会随所在主题解析。`--sage` 用于视觉色块；链接、小字和绿色底上的文字使用对比度更高的 `--olive`。SVG 噪点的完整 data URI 保留在源文件。

| 变量 | 日间／共用值 | 夜间覆盖 |
| --- | --- | --- |
| `--paper` | `#F7F6F1` | `#161A15` |
| `--surface` | `#FFFFFF` | `#1F241E` |
| `--line` | `#E6E5DE` | `#2E352C` |
| `--ink` | `#2A2D29` | `#E9EDE3` |
| `--sub` | `#6B6F66` | `#A3AA9C` |
| `--sage` | `#8FA876` | `#A9C38F` |
| `--olive` | `#5F7044` | `#C3D6A8` |
| `--sage-soft` | `#E8EEDC` | `#26301F` |
| `--btn` | `linear-gradient(180deg, #454A57, #343844)` | `#E9EDE3` |
| `--btn-ink` | `#FFFFFF` | `#161A15` |
| `--btn-solid` | `#343844` | `#E9EDE3` |
| `--danger` | `#B8352C` | `#F08A80` |
| `--danger-ink` | `#FFFFFF` | `#161A15` |
| `--success` | `var(--olive)` | 沿用 |
| `--success-foreground` | `#FFFFFF` | `#161A15` |
| `--warning` | `#806020` | `#E2C58D` |
| `--warning-foreground` | `#FFFFFF` | `#161A15` |
| `--info` | `var(--olive)` | 沿用 |
| `--info-foreground` | `#FFFFFF` | `#161A15` |
| `--surface-raised` | `var(--surface)` | 沿用 |
| `--surface-overlay` | `var(--paper)` | `#2A3227` |
| `--border-strong` | `color-mix(in srgb, var(--ink) 40%, var(--line))` | 沿用 |
| `--input` | `color-mix(in srgb, var(--ink) 40%, var(--line))` | 沿用 |
| `--glass` | `color-mix(in srgb, var(--surface) 86%, transparent)` | 沿用 |
| `--acrylic` | `color-mix(in srgb, var(--surface) 94%, transparent)` | 沿用 |
| `--inner-highlight` | `inset 0 1px 0 #ffffffb3` | `inset 0 1px 0 #ffffff0f` |
| `--btn-highlight` | `inset 0 1px 0 #ffffff26` | `inset 0 1px 0 #ffffff26` |
| `--grain` | `内嵌 SVG 细颗粒，ink 色，3.5% 不透明度` | `内嵌 SVG 细颗粒，浅 ink 色，3.5% 不透明度` |
| `--shadow-sm` | `0 1px 4px #2a2d290a` | `0 1px 4px #00000033` |
| `--shadow-md` | `0 12px 32px #2a2d2914` | `0 12px 32px #00000047` |
| `--shadow-lg` | `0 24px 64px #2a2d2924` | `0 24px 64px #00000066` |
| `--art-matte` | `var(--sage-soft)` | 沿用 |
| `--contour` | `color-mix(in srgb, var(--olive) 10%, transparent)` | 沿用 |
| `--contour-index` | `color-mix(in srgb, var(--olive) 24%, transparent)` | 沿用 |
| `--contour-busy` | `color-mix(in srgb, var(--olive) 56%, transparent)` | 沿用 |
| `--ring-0` | `var(--olive)` | 沿用 |
| `--ring-1` | `#7A693F` | `#D5BE8B` |
| `--ring-2` | `#596F50` | `#A9C38F` |
| `--ring-3` | `#476D64` | `#A4C8BA` |
| `--ring-4` | `#626D51` | `#B7C79F` |
| `--ring-5` | `var(--ink)` | 沿用 |
| `--meadow-0` | `#2B361F` | 沿用 |
| `--meadow-1` | `#677D45` | 沿用 |
| `--meadow-2` | `#AEBA78` | 沿用 |
| `--meadow-3` | `#E5E1BD` | 沿用 |
| `--meadow-stop-0` | `0` | 沿用 |
| `--meadow-stop-1` | `0.4` | 沿用 |
| `--meadow-stop-2` | `0.74` | 沿用 |
| `--meadow-stop-3` | `1` | 沿用 |
| `--font-serif` | `"Songti SC", "Noto Serif SC", STSong, serif` | 沿用 |
| `--font-sans` | `-apple-system, "PingFang SC", "Noto Sans SC", sans-serif` | 沿用 |
| `--font-mono` | `ui-monospace, Menlo, monospace` | 沿用 |
| `--text-xs` | `0.75rem` | 沿用 |
| `--text-sm` | `0.875rem` | 沿用 |
| `--text-md` | `1rem` | 沿用 |
| `--text-lg` | `1.125rem` | 沿用 |
| `--text-xl` | `1.375rem` | 沿用 |
| `--text-2xl` | `clamp(1.75rem, 4vw, 2.5rem)` | 沿用 |
| `--text-3xl` | `clamp(2.25rem, 6vw, 4rem)` | 沿用 |
| `--space-1` | `4px` | 沿用 |
| `--space-2` | `8px` | 沿用 |
| `--space-3` | `12px` | 沿用 |
| `--space-4` | `16px` | 沿用 |
| `--space-5` | `24px` | 沿用 |
| `--space-6` | `32px` | 沿用 |
| `--space-7` | `48px` | 沿用 |
| `--space-8` | `64px` | 沿用 |
| `--radius-xs` | `4px` | 沿用 |
| `--radius-sm` | `8px` | 沿用 |
| `--radius-md` | `12px` | 沿用 |
| `--radius-lg` | `16px` | 沿用 |
| `--radius-xl` | `20px` | 沿用 |
| `--radius-2xl` | `24px` | 沿用 |
| `--radius-3xl` | `28px` | 沿用 |
| `--radius-4xl` | `32px` | 沿用 |
| `--radius-full` | `999px` | 沿用 |
| `--r-xs` | `var(--radius-xs)` | 沿用 |
| `--r-sm` | `var(--radius-md)` | 沿用 |
| `--r-md` | `var(--radius-lg)` | 沿用 |
| `--r-lg` | `var(--radius-2xl)` | 沿用 |
| `--r-xl` | `var(--radius-3xl)` | 沿用 |
| `--r-full` | `var(--radius-full)` | 沿用 |
| `--control-sm` | `32px` | 沿用 |
| `--control-md` | `40px` | 沿用 |
| `--control-lg` | `44px` | 沿用 |
| `--control-xl` | `48px` | 沿用 |
| `--motion-fast` | `140ms` | 沿用 |
| `--motion-base` | `240ms` | 沿用 |
| `--motion-slow` | `420ms` | 沿用 |
| `--motion-dock` | `var(--motion-slow)` | 沿用 |
| `--ease-standard` | `cubic-bezier(.2, 0, 0, 1)` | 沿用 |
| `--ease-spring` | `cubic-bezier(.2, 1.25, .3, 1)` | 沿用 |
| `--scene-feather` | `11%` | 沿用 |
| `--dock-size` | `44px` | 沿用 |
| `--site-dock-top` | `var(--space-5)` | 沿用 |
| `--site-dock-clearance` | `calc(var(--space-8) + var(--space-7))` | 沿用 |
| `--content-sm` | `42rem` | 沿用 |
| `--content-md` | `58rem` | 沿用 |
| `--content-lg` | `72rem` | 沿用 |
| `--content-xl` | `88rem` | 沿用 |
| `--workbench-canvas-min` | `20rem` | 沿用 |
| `--workbench-layer-scrim` | `28` | 沿用 |
| `--workbench-layer-panel` | `30` | 沿用 |
| `--workbench-touch-target` | `var(--control-lg)` | 沿用 |
| `--background` | `var(--paper)` | 沿用 |
| `--foreground` | `var(--ink)` | 沿用 |
| `--border` | `var(--line)` | 沿用 |
| `--card` | `var(--surface)` | 沿用 |
| `--card-foreground` | `var(--ink)` | 沿用 |
| `--popover` | `var(--surface)` | 沿用 |
| `--popover-foreground` | `var(--ink)` | 沿用 |
| `--primary` | `var(--btn-solid)` | 沿用 |
| `--primary-foreground` | `var(--btn-ink)` | 沿用 |
| `--secondary` | `var(--sage-soft)` | 沿用 |
| `--secondary-foreground` | `var(--ink)` | 沿用 |
| `--muted` | `var(--sage-soft)` | 沿用 |
| `--muted-foreground` | `var(--sub)` | 沿用 |
| `--accent` | `var(--olive)` | 沿用 |
| `--accent-foreground` | `var(--paper)` | 沿用 |
| `--destructive` | `var(--danger)` | 沿用 |
| `--destructive-foreground` | `var(--danger-ink)` | 沿用 |
| `--ring` | `var(--olive)` | 沿用 |
| `--brand-apricot` | `var(--sage)` | 沿用 |
| `--color-paper` | `var(--paper)` | 沿用 |
| `--color-ink` | `var(--ink)` | 沿用 |
| `--color-muted` | `var(--sub)` | 沿用 |
| `--color-accent` | `var(--olive)` | 沿用 |
| `--color-line` | `var(--line)` | 沿用 |
| `--color-surface` | `var(--surface)` | 沿用 |
| `--color-surface-raised` | `var(--surface-raised)` | 沿用 |
| `--color-soft` | `var(--sub)` | 沿用 |
| `--color-accent-strong` | `var(--olive)` | 沿用 |
| `--color-focus` | `var(--ring)` | 沿用 |

页面局部变量：`--wb-top: 64px`、`--wb-rail: 76px`、`--wb-drawer: 360px`（1180px 以下为 320px）、`--wb-gap: 16px`；分段指示块的 `--segment-count` 为实际按钮数 2–4，`--segment-index` 为激活项索引 0–3。通用卡片的 `--card-inset: 16px` 固定几何关系，不受紧凑密度影响。既有 JS 注入的坐标／视口变量仍按原方式使用。

减少动态效果：四个 `--motion-*` 时长归零；全局禁用动画／过渡／平滑滚动，交互状态仍立即更新。连续圆角按 PLAN 在 `@supports (corner-shape: superellipse(1.25))` 中渐进增强；胶囊、头像、年轮标记、圆形按钮和滑轨保持 `round`。

## 同心圆角

单位均为 px；公式按视觉圆角与声明的内边距计算，1px 边框作为描边处理。圆形／胶囊使用 full 或 50%，贴边图片由父容器统一裁切；没有把不相邻、不同心的装饰图形硬套进嵌套公式。

| 外层 → 内层 | 外圆角 − 内边距 = 内圆角 |
| --- | --- |
| 首页导航浮层 → 偏好按钮／导航链接 | 28 − 16 = 12 |
| 工作台菜单 → 偏好按钮／导航链接 | 24 − 12 = 12 |
| 工具浮层 → 风格选项／输入框／选择框 | 28 − 16 = 12 |
| 输入栏 → 生成按钮／选择框／图标按钮 | 24 − 12 = 12 |
| 模式切换器 → 按钮／滑动指示块 | 12 − 4 = 8 |
| 参数分段控件 → 按钮／滑动指示块 | 12 − 4 = 8 |
| 账号对话框 → 登录／注册分段容器 | 32 − 16 = 16 |
| 登录／注册分段容器 → 按钮／滑动指示块 | 16 − 4 = 12 |
| 对话框 → 表单输入／选择框／登录主按钮／关闭按钮 | 32 − 16 = 16 |
| 通用卡片 → body 中的 surface／媒体卡片 | 32 − 16 = 16 |
| 通用对话框 → body 中的 surface／卡片 | 32 − 16 = 16 |
| 设置对话框 → 桌面导航项 | 32 − 16 = 16 |
| 灯箱 → 图片舞台 | 32 − 16 = 16 |
| 历史记录卡片 → 缩略图 | 20 − 4 = 16 |
| 重绘菜单 → 菜单项 | 12 − 4 = 8 |

移动工具面板保持 28px 顶角、16px 内边距、12px 控件圆角；贴屏底角为 0。通用移动对话框保持 32px 顶角和 16px 内边距；现有账号／设置居中对话框继续保留四角。

## 验证与证据

- `npm test`：71/71 通过。日志：`tmp/v3/T1/npm-test.log`。
- `make check`：71/71 测试及 Makefile 中全部 JS 语法检查通过。日志：`tmp/v3/T1/make-check.log`。
- `git diff --check`：通过。旧变量集合比对：99 个旧名无缺失；当前 tokens 共 133 个变量。
- 使用本机 headless **Chrome 156.0.8078.4**，通过 CDP 实际加载 Express 服务（127.0.0.1:3431）。主验证视口为 1440×1000 与 390×844，DPR=1；使用隔离的临时浏览器配置和临时运行数据。
- `browser-audit.json`：30 个页面／交互状态全部通过；日夜首页与工作台、导航菜单、5 个工具浮层、设置、账号、减少动态效果与焦点。所有状态 `scrollWidth === viewport width`；无可见越界、图片加载失败、控制台错误、未捕获异常或网络加载失败。内部可滚动容器按实际裁切边界计算。
- `foundation-checks.json`：14 项检查全部通过，包括真实主题切换后的刷新持久化、4 对实际计算圆角、模式指示块移动、注册表单切换、大字体＋紧凑密度在 1440／390／320px 的设置界面、加载状态下减少动态效果、变量解析、控制台检查。
- 对上述截图进行了目视复核：主按钮文字、宋体标题、两种主题、移动输入栏、工具底部面板、设置与账号对话框均无明显错位。截图目录 `tmp/v3/T1/`，沿用仓库对 `tmp/` 的忽略规则，不提交生成的浏览器配置和临时数据。
- 核心文字对比度（WCAG 计算）：日间 ink/paper 12.89:1、sub/paper 4.74:1、olive/paper 4.99:1、olive/sage-soft 4.55:1；主按钮白字对渐变最亮端 ≥8.8:1。为避免 sub 在浅绿底上只有 4.33:1，状态标签和分段小字显式使用 olive。夜间使用 PLAN 指定浅色文字，未对正文降低透明度。

主要截图：

- `home-1440-day.png`、`home-1440-night.png`、`home-390-day.png`、`home-390-night.png`
- `studio-1440-day.png`、`studio-1440-night.png`、`studio-390-day.png`、`studio-390-night.png`
- `*-menu.png`、`studio-*-style.png`、`studio-*-params.png`、`studio-*-settings.png`、`studio-*-profile.png`
- `*-reduced-focus.png`、`studio-1440-agent.png`、`studio-1440-register.png`、`studio-*-large-compact.png`

## 边界与风险

- 本次验证限定于本机 Chromium；未进行 Safari／Firefox 和真机触摸验收。`corner-shape` 与滑动指示块均有普通圆角／激活背景回退。
- 未调用付费模型、提交注册表单、生成图片或写入真实账号／历史数据；已有生成链路由原 71 项测试覆盖，真实模型联调未在本任务重复执行。
- 沿用任务边界保留现有首页内容和工作台 DOM。ASCII 主视觉、首页重排和版本树属于后续任务，不作为本次已交付功能。
