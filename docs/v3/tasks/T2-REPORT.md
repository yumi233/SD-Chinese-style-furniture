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
