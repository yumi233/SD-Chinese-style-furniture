# T2 完成报告 · 大幅 ASCII 效果模块

日期：2026-10-31

## 交付内容

- `public/js/modules/ascii-field.js`
  - 导出 `mountAsciiField(host, options)`、`RECOMMENDED` 及测试所需纯函数。
  - 支持图片 URL、视频 URL、`HTMLImageElement`、`HTMLVideoElement`、Canvas、ImageBitmap。
  - ASCII 与 Dither 各自保存完整设置，默认色板均为 `meadow`。
  - 设置对象采用 `{ filter, ascii: {...}, dither: {...} }`；也接受单个滤镜的平铺设置。
  - 返回控制器提供 `setSource`、`setSettings`、`getSettings`、`getAllSettings`、`getMetrics`、`refresh`、`play`、`pause`、`setDrift`、`destroy`。
- `public/ui/ascii-field.css`
  - 双层画布 150ms 交叉淡化。
  - 实验页控件严格使用 46px 行高、136px 标签列、22px 轨道、9×30 滑块和 50 刻度。
- `public/lab/ascii.html`
  - 实时调参页，包含程序生成的渐变/家具测试画布和本地图片上传。
  - 可用 `?filter=ascii` 或 `?filter=dither` 直接打开指定滤镜。
- `test/asciiField.test.js`
  - 覆盖色阶查表、遮罩公式、字符映射、色调公式、Bayer 矩阵与量化、Dither 饱和度、12000 点采样、墨色透明度和分滤镜设置隔离。
- `docs/v3/tasks/T2-REPORT.md`
  - 本报告。

## 关键实现

- 采样画布长边固定约 480px，按 cover 绘制到白底，使用 256 级色板 LUT；每帧最多取 12000 个均匀像素，计算第 8/92 百分位亮度。
- ASCII 按暗/亮墨、百分位归一、黑白端点、平滑曲线逐格生成 17 级字符；手机宽度下字号最低为 8px。
- Dither 在缩小画布中逐块执行 4×4 Bayer 量化，再关闭平滑放大。
- 设备像素比上限 1.6，单轴画布上限 2048px。
- 图片设置变化使用 72ms 防抖；视频优先使用 `requestVideoFrameCallback`，不可用时退回 `requestAnimationFrame`，持续绘制限制为 30fps。
- 支持 20 秒周期的 drift、80px 指针/触摸 ripple；`prefers-reduced-motion` 下停止动画并重画静止帧。

`original` 之外提供了五个色板：`meadow`、`moss`、`clay`、`celadon`、`ink`。规格只固定了 `meadow` 的四级颜色，其余四组为本模块新增的配套色阶。

## 验证结果

- `node --check public/js/modules/ascii-field.js`：通过。
- `node --test test/asciiField.test.js`：8/8 通过。
- `npm test`：79/79 通过。
- `make check`：通过，包含全量测试和项目语法检查。
- 无头 Chromium 1440×1000 与 390×844，ASCII/Dither 各一张：
  - `tmp/v3/T2/1440-ascii.png`
  - `tmp/v3/T2/1440-dither.png`
  - `tmp/v3/T2/390-ascii.png`
  - `tmp/v3/T2/390-dither.png`
- 实测页面无 console error 或 page error；12000 点采样生效；所有可见控制行均为 46px，标签列为 136px。
- DPR=2 时画布实际按 1.6 倍渲染；3000×2500 宿主实测画布封顶为 2048×1707。
- 实测滤镜交叉淡化时活动画布切换；ASCII/Dither 遮罩值分别保留。
- 实测 reduced-motion 画面静止；ripple 触发后位移，并在动画结束后回到逐像素一致的静止状态。
- 用页面内 `MediaRecorder` 生成视频：原生 `requestVideoFrameCallback` 连续触发，暂停后停止；移除该 API 后 RAF 回退路径能继续更新画面。

以上四张截图已逐张目视检查；截图目录受 `.gitignore` 管理，不进入提交。

## 已知限制

- 自动提交的测试仅覆盖纯函数；浏览器、视频和动效验证使用本地无头 Chromium 脚本，未固定加入 npm 测试，以免新增 Playwright 运行依赖。
- 浏览器截图只覆盖 Chromium；Firefox/Safari 的 range 原生外观和真实 iOS/Android 触摸硬件未做实机验收。
- 按任务的文件边界，本分支未把模块接入首页、登录页或工作台，只交付可复用模块和实验页；页面接入由对应页面任务完成。

## T2b · Paper Look 增量

### 实现

- `mountAsciiField` 新增 `options.look: "paper" | "overlay"`；默认仍为 `overlay`，避免改变既有页面。
- paper 路径不绘制底图，使用 `#F5F7EF` 纸色；夜间从宿主或根节点的 `--paper` 取值。
- paper 的字符直接按原始采样亮度查 meadow 色板，颜色不透明，不做 overlay 的 HSV 提亮。
- desktop 固定为 12px、约 8×12px 网格；宿主宽度小于 480px 时固定为 9px、约 6×9px 网格。
- 顶部 36% 使用白色渐变覆盖，透明度按 `(1 - y / 0.36) ** 1.4` 计算。
- 新增可选 `titleZone: { x, y, w, h }`；使用 0–1 比例坐标，区域内字符透明度为 40%，约淡化 60%。
- 控制器新增 `setLook`、`getLook`、`setTitleZone`，`metrics.look` 同步报告当前样式。
- paper 下 drift 会平移取样内容；ripple、reduced-motion 和视频更新路径继续复用原调度逻辑。

### 实验页

- 默认素材改为 `/assets/hero-meadow.png`，默认样式改为 paper。
- 新增「纸面 / 叠图」样式切换，支持 `?look=paper|overlay`。
- 默认 `titleZone` 为左下区域 `{ x: 0, y: 0.63, w: 0.38, h: 0.37 }`。
- 1440px 桌面布局将预览宿主限制为 758px，便于模拟首页左侧大面板。

### 验证

- `node --check public/js/modules/ascii-field.js`：通过。
- `node --test test/asciiField.test.js`：11/11 通过，其中新增 paper 取色、顶部渐隐、titleZone 淡化三项测试。
- `npm test`：84/84 通过。
- `make check`：通过。
- 浏览器交互实测：paper drift 改变取样画面；密集字符区 ripple 发生位移并逐像素回到静止状态；reduced-motion 保持单帧；视频原生帧回调、暂停停止和 RAF 回退均正常。
- 无头 Chromium 截图：
  - `tmp/v3/T2b/paper-1440x900.png`：宿主 758×798，无运行时错误。
  - `tmp/v3/T2b/paper-390x844.png`：宿主 368×453，无运行时错误。
  - `tmp/v3/T2b/paper-field-1440x900.png`
  - `tmp/v3/T2b/paper-field-390x844.png`
  - `tmp/v3/T2b/paper-target-ratio.png`
  - `tmp/v3/T2b/paper-1536-no-zone.png`
  - `tmp/v3/T2b/paper-1536-zone.png`
- 并排对照：
  - `tmp/v3/T2b/compare-ascii-target.png`
  - `tmp/v3/T2b/compare-ascii-target-fair.png`
  - `tmp/v3/T2b/compare-ascii-target-no-zone.png`

### 截图结论

按目标原尺寸 1536×1024 生成的纸面效果在构图、纸色、meadow 色阶、12px/8×12px 字符节奏、顶部 36% 白化和左下留白上与 `ascii-target.png` 一致；缩小后并排比较时，主要轮廓和明暗分布对齐。仍能观察到不同运行环境的字体抗锯齿造成的细微字形边缘差异，以及启用 titleZone 后左下区域按需求额外淡化所带来的预期差异。

### 剩余限制

- paper 样式以 ASCII 为目标路径；选择 Dither 时仍沿用已有 Dither 渲染，不定义新的 paper-dither 视觉。
- 截图和动效验证仍只覆盖本机无头 Chromium，未覆盖 Firefox、Safari 与真实移动设备。
- titleZone 使用硬矩形边界；当前标题正文会覆盖该区域，实际页面接入时可用于避开标题和地面横向字符带。
