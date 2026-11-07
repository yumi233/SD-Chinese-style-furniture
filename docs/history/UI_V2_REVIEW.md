# 木生 Fluid UI · 第一阶段验收

2026-10-30 更新。按最新要求，先研究设计垂点、建立组件库，再展开所有主要界面的设计与网页实现。由当前主模型直接完成；Figma 使用 Figwright 后台接口，无新模型委派、前台鼠标或键盘操作。

## 最新验收状态

用户已明确认可基础组件，当前进入动效打磨；新增「灵感册」见 [动效验收](MOTION_REVIEW.md)。基础组件满意不代表新增画布功能已获验收，本轮继续限于 UI。

## 验收入口

连接同一 Tailscale 网络后访问：

- 组件库：<http://100.95.199.23:3417/components.html>
- 首页：<http://100.95.199.23:3417/>
- 工作台：<http://100.95.199.23:3417/studio>
- Figma：<https://www.figma.com/design/vRYR2Mh2mhZgu7hFR3m9ER>

预览仍为 Mac 上已有的隔离本地服务，端口仅由回环与 Tailscale 代理提供。没有更新正式线上容器。测试账号不属于生产站，真实模型尚未在本轮调用。

## 本次材质与交互修订

用户认为上一版过于平淡，继续研究了参考站的 Liquid Glass、交互层级、Springen、Spross 四篇文章，并在隔离的 Chromium 中查看真实演示。设计提炼和技术边界见 [参考研究](FLUID_UI_REFERENCE.md)。

- 主页：悬浮玻璃导航、错层透明板、轻微前后景位移、随指针变化的边缘高光；椅凳/桌案/柜架可直接切换，键盘可操作。
- 工作台：输入区域与工具浮层采用密度更高的磨砂亚克力；保留原工具栏、作品区和评审结构。登录、历史、设置浮层从触发方向展开，背景模糊降低干扰。
- 组件库：新增并列玻璃/亚克力样板，背景光滑块可实际调节；共享高亮回弹、滑块按压反馈、原生 Dialog/Popover 退出过渡。
- 日夜两套材质；支持减少动态效果、减少透明度与高对比度。无 backdrop-filter 时保留不透明底色。不使用全屏 SVG 位移滤镜；这是一套 CSS 玻璃/亚克力模拟，不宣称物理折射。

新增正式文件为 `public/ui/materials.css`、`public/js/modules/material-motion.js`，三个页面引用同一套材质。无新增依赖，无生产发布。

本轮 Figwright `use_file` 返回“no Figma file is connected”。已告知用户重新运行插件；当前网页修订尚未同步 Figma，下面的 Figma 数量与画板说明属于上一版，不能当作本次材质稿的验收证据。

## 设计成果

Figma 通过 Figwright 0.7.0 创建并读回核实：

- `01 · 木生组件库`：44 个组件状态、10 个变体集，覆盖按钮、输入、切换、状态、浮层、选择、滑块、卡片与空态。
- 21 个基础变量、10 个深色变量，5 个文字样式；Starter 使用浅、深两套独立集合。组件颜色绑定变量，相关组合使用自动布局。
- 按钮的悬停与按压变体有 Smart Animate 原型过渡，已通过 `get_reactions` 读回；首页入口连接工作台画板。
- `02 · 完整界面`：首页、空态工作台、生成状态、历史、设置、登录、结果与细化。
- `03 · 移动端`：首页、工作台、登录。

网页完成统一的浅灰/白/黑灰/蓝色主题，应用于主页、竖向工具栏、设计输入、评审、五个工具面板、结果卡片、历史、登录注册和设置。保留原有接口及数据绑定。

`/components.html` 可实际体验共享高亮、鼠标与键盘切换、按钮忙碌状态、错误输入、开关、选择器、范围滑块、跟随触发点的 Popover、Dialog、Drawer 和合并提示。演示明确标为组件演示，不调用真实模型或伪造生成结果。

设计来源及全目录覆盖见 [参考研究](FLUID_UI_REFERENCE.md)。采用的是视觉秩序与功能动效原则，没有照搬站点的作品或私有字体，也没有把每个实验形式都塞进家具工具。

## 本轮检查与桌面接管状态

- `make check`：71 项通过，0 失败；新模块额外语法检查通过。
- 工作流检查 30 项、响应式检查 16 项、组件检查 19 项；材质专项 14 项（图形切换、快速切换、键盘、指针响应、减少动态效果、透明度降级、弹窗开闭和真实业务弹窗来源）。
- 本轮所有测试日志和实际截图在 `tmp/material-ui/logs/` 与 `tmp/material-ui/shots/`；上一版证据保留在 `tmp/fluid-ui/`。
- 专项检查发现工作台容器为 `.profile-modal` / `.config-modal` / `.history-modal` 而非 `.modal`，已修正实际业务浮层的动效挂载，并重新检查。
- 用户后来明确要求使用 `$computer-use`，覆盖此前不操作桌面的偏好。本次读取匹配版本技能并尝试原生 Figma/Chrome 窗口读取；两者返回 `permission_denied`，窗口存在但辅助功能读取持续被拒。权限页明确显示 granted；最初据工具提示让用户重置权限的判断不成立，已向用户纠正。随后按用户要求通过 ChatGPT 随附 cua_repl 原生模块实测，应用列表可读，但 Chrome 返回 cgWindowNotFound，Figma 出现 .dua 目标映射错误。未成功读取或操作窗口，不能据此归因于用户未授权。临时诊断进程结束，无永久配置修改。

## 上一版实际检查

- `make check`：71 项测试通过、0 失败；项目规定的语法检查通过。
- 另对 `public/js/library.js`、`public/js/modules/fluid-motion.js` 做语法检查。
- 工作流浏览器检查：30 项通过。包括主题与语言、风格入口、五个工具面板开关、智能体模式、注册、登录失败保留输入与重试、历史空态、Esc 和焦点返回、偏好保存及手机弹窗边界。
- 组件库浏览器检查：19 项通过。包括键盘切换、共享高亮、Dialog/Drawer/Popover 开关、焦点恢复、Popover 定位、连续提示合并、忙碌防重复、滑块、开关、减少动态效果和手机适配。
- 响应式检查：16 项通过。首页、工作台、组件库在 320 / 390 / 768 / 1024 / 1440 像素宽度无横向溢出；无浏览器 JS 异常。
- 亲自查看实际桌面/手机截图、深色主页/工作台、登录/注册/设置、工具面板、组件库与 Figma 导出图。Figma 是可编辑设计稿；最终动态行为以网页交互预览为准。
- `git diff --check` 通过。

证据位于 `tmp/fluid-ui/logs/`：`check-final.txt`、`browser-check.json`、`library-check.json`、`responsive-check.json`、`figma-verification.json`。完整 MCP 操作记录在 `figwright.jsonl`。

关键截图在 `tmp/fluid-ui/shots/`：`home-final.png`、`home-final-mobile.png`、`home-night-final.png`、`studio-final.png`、`studio-night-final.png`、`components-desktop.png`、`components-mobile.png`、`login-desktop.png`、`register-desktop.png`、`settings-desktop.png`、`settings-mobile-large.png`。Figma 截图在其 `figma-library/`、`figma-final/` 子目录。

## 交付边界

本轮完整推进 UI 第一阶段，新增画布的缩放、平移、框选、版本分支以及 Pi 网页生图接入仍待后续阶段。没有提交、推送、正式发布或调用真实图片模型。没有把静态测试或组件演示当作实际生图成功。

当前修改与已有未提交内容保留；上一版主要界面文件在 `tmp/fluid-ui/before/`。本地研究和检查资料已被现有 `tmp` Docker 排除规则覆盖，正式组件与资源均位于 `public/`。

按用户要求，继续停在 UI 第一阶段，待视觉验收后再开始画布功能。
