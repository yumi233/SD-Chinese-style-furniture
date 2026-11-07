# 木生 · UI 组件规则

日期：2026-11-07。适用于 `public/` 下所有页面。组件实物见 [`/lab/components.html`](../public/lab/components.html)（本地 `npm start` 后打开），本文件是规则，组件库页面是样例；两者冲突时以本文件为准并修正样例。

新增或修改界面前先读本文件。已经被用户认可的组件和动效视为冻结：只做定向增量，不顺带重构、合并或删除。

## 1. 原则

- **Avoid unnecessary secondary labels and descriptions. Let the layout do the explaining.** 不写眉题、副标题、英文括注、面板角落的说明小字。只保留输入标签、状态、错误原因和必要数字。
- **以作品为中心。** 画面主体是家具图和版本卡片，控件退到边缘；不要做成表单或仪表盘。
- **一种强调色。** 橄榄绿 `--olive` 是唯一强调色；绿色系（meadow）只出现在 ASCII 画面里。
- **参考基准** 是 wxad.design/abc：浅灰颗粒纸面、白卡片、黑字、无衬线标题、等宽数字。

## 2. 样式分层（只有三层）

`public/ui/tokens.css`（变量）→ `public/ui/components.css`（`yui-*` 组件）→ `public/css/<页面>.css`（页面布局）。

- 页面 CSS 只做布局和页面专属组合，不重新定义组件外观。两个以上页面用到的样式，移进 `components.css`。
- 不新增第四层样式文件；不在 HTML 里写颜色、圆角、阴影的字面值（组件库样例页除外）。
- 颜色、间距、圆角、阴影、动效一律用变量；变量不够时先在 `tokens.css` 补，日夜两套同时给值。

## 3. 设计变量

| 类别 | 变量 | 用法 |
| --- | --- | --- |
| 颜色 | `--paper` `--surface` `--line` `--ink` `--sub` `--muted-bg` | 页面底、卡片与输入、边框、正文、次要文字、凹槽与悬停底 |
| 强调 | `--olive` `--sage` `--sage-soft` | 编号、链接、选中、标题第二行、圆箭头；浅绿底只用于提示块和建议 |
| 按钮 | `--btn` `--btn-ink` | 主按钮渐变黑；夜间为浅色 |
| 状态 | `--danger` 及 `data-tone` | 只表达状态，不做装饰 |
| 字体 | `--font-sans` 标题与正文，`--font-mono` 数字、版本号、编号、阶段名 | 标题用无衬线，不用宋体 |
| 字号 | 76 hero · 40 section · 20 card · 15 body · 13 mono | 首页刻度；工作台用 `--text-xs…xl` |
| 间距 | `--space-1…8` = 4 8 12 16 24 32 48 64 | 所有内外边距、间隙落在 4px 网格 |
| 圆角 | `--radius-xs…4xl` = 4 8 12 16 20 24 28 32，`--radius-full` | 见第 4 节 |
| 阴影 | `--shadow-sm/md/lg`，`--inner-highlight` | sm 卡片，md 浮起的输入与面板，lg 对话框 |
| 动效 | `--motion-fast/base/slow` = 140/240/420，`--ease-standard` `--ease-spring` | 回弹只用于按下、出现、圆箭头 |

## 4. 布局规则

- **4px 网格**：尺寸、间距、圆角都是 4 的倍数。
- **同心圆角**：内圆角 = 外圆角 − 间距。例：卡片 20、内边距 8 → 图片 12；胶囊 48、内边距 4 → 圆箭头 40；凹槽 12、内边距 4 → 分段 8。
- **一条栏宽**：首页所有区块对齐 1240 栏；节奏 96（区块间）/ 64（标题到内容，手机 24）/ 24（块内）。
- **控件高度**：`--control-sm/md/lg/xl` = 32/40/44/48；手机上可点区域不小于 40。
- 支持 `corner-shape: superellipse(1.25)` 时自动启用；胶囊与圆形元素设 `corner-shape: round`。
- `[hidden]` 一律 `display: none !important`，组件不得覆盖。

## 5. 组件清单

| 组件 | 类名 / 属性 | 规则 |
| --- | --- | --- |
| 按钮 | `.yui-button[data-variant=primary\|secondary\|olive\|outline\|ghost\|destructive]`，`[data-size=sm\|lg\|xl]` | 一个区域只有一个 primary；secondary 是磨砂白；destructive 只用于删除 |
| 箭头按钮 | `.yui-button--arrow` + `.yui-button__arrow` | 主行动作（开始设计、打开工作台）；悬停圆箭头旋转 45° |
| 链接 | `.yui-link` | 下划线悬停收缩；不用于主行动作 |
| 图标按钮 | `.yui-icon-button` | 必须有 `aria-label` |
| 输入 | `.yui-field` > `.yui-label` + `.yui-input` / `.yui-textarea` + `.yui-field__error` | 错误用 `aria-invalid="true"`；不写说明文字 |
| 下拉 | 原生 `<select>`，由 `select.js` 自动变成 `.yui-picker` | 不手写下拉；代码读写原生 select |
| 分段 | `.yui-segmented` > `.yui-segment[aria-pressed]` | 2–4 个互斥选项；选中为白色凸起，不是绿色 |
| 标签页 | `.yui-tabs` > `.yui-tab[aria-selected]` | 编号用 `.yui-index` |
| 选项片 | `.yui-chip[data-active]` | 可多选的短选项（材质等） |
| 复选、滑杆 | 原生 `checkbox`、`range` | 样式全局生效，不另加类 |
| 徽标 | `.yui-badge[data-tone=accent\|success\|warning\|danger]` | 分数、状态；不放长句 |
| 标记 | `.yui-tag`（加号前缀）、`.yui-index`、`.yui-version`、`.yui-date`、`.yui-kbd` | 数字、版本、日期一律等宽 |
| 卡片 | `.yui-card`（`__header/__title/__body/__footer`），`[data-interactive]` | 可点卡片要能键盘聚焦 |
| 图片卡 | `.yui-media-card`，首页作品墙 `.work` | 图片比例 4:5；字符版→实图用橄榄绿扫描线显影 |
| 输入栏 | `.yui-composer`，工作台 `.studio-composer` | 全站只有一个主输入：未选版本「生成」，选中后「修改 vN」，运行中「停止」 |
| 提示 | `.yui-alert[data-tone]` | 写原因和下一步，不写泛泛的「出错了」 |
| 加载 | `.yui-spinner`、`.yui-skeleton` | 生成过程优先用字符→实图的显影，不用转圈 |
| 空态 | `.yui-empty-state` | 一句话 + 一个动作 |
| 对话框 | 原生 `<dialog>` + `.yui-dialog`（`__header/__body/__footer`） | Esc 关闭、焦点回到打开它的按钮 |
| 浮动栏 | 首页 `.dock`、`.yui-dock` | 磨砂胶囊；首屏滚走后才出现 |
| 语言切换 | `.yui-segmented.locale-switch` > `[data-locale-set=cn\|tw\|en]` | 放在每页顶栏，显示当前语言 |

新组件先在 `components.css` 写成 `yui-*`，再加进组件库页面，最后才在页面里使用。

## 6. 主题与语言

- 每个组件都要在日间和夜间各检查一次。夜间 ASCII 画面用 `filter: invert(.9) hue-rotate(180deg)`，实景照片不反色。
- 产品文案用 `data-cn` / `data-tw`，或 `data-ui-copy` / `data-ui-attrs` 标记；英文在 `public/js/modules/locale-en.js` 按简体原文补齐。新增文案三种语言必须同时可用（测试会检查 `data-cn` 都有英文）。
- 用户写的描述、作品名、模型建议不翻译、不标记。
- 英文通常比中文长 30–60%：标题、按钮、顶栏都要在英文下检查是否换行、截断或横向滚动。

## 7. 动效

- 只用三档时长和两条曲线；回弹 `--ease-spring` 用于按下（`scale(.97)`）、出现、圆箭头。
- 共享高亮（`fluid-motion.js` 的滑动指示块）是已认可的动效，保留。
- 尊重 `prefers-reduced-motion`：开启时直接显示最终状态，演示仍能逐步切换。

## 8. 可访问性

- 对比度满足 WCAG AA；焦点用 `:focus-visible` 描边，不去掉。
- 只有图标的按钮必须有 `aria-label`；选中状态用 `aria-pressed` / `aria-selected` / `aria-current`，不只靠颜色。
- 悬停能看到的内容，触屏要能按住看到，键盘要能聚焦看到。

## 9. 验收

改动界面后：

1. 在组件库页面和实际页面上，用桌面 Chromium 1440 与 iPhone WebKit 各截一次图，日夜、中英各看一遍。
2. 无横向滚动、无文字截断、无控制台错误。
3. 运行完整检查（含浏览器流程，命令见 README「测试」）：0 失败，0 跳过。
