# T2 · 大幅 ASCII 效果模块（负责人：DeepSeek V4.1 Flash）

先读 `docs/v3/PLAN.md`。

做一个与页面无关、可复用的模块，把一张图片或一段视频画成大幅 ASCII / Dither。首页、登录页和工作台都会用它。

## 文件（只能新建以下文件）

- `public/js/modules/ascii-field.js`：ES 模块，导出 `mountAsciiField(host, options)` 和 `RECOMMENDED`。
- `public/ui/ascii-field.css`
- `public/lab/ascii.html`：调参实验页，包含实时面板。
- `test/asciiField.test.js`：测试纯函数（色阶查表、遮罩数值、字符映射、Bayer 量化、按滤镜分别存设置）。
- `docs/v3/tasks/T2-REPORT.md`

## 规格（帖子 003，必须完全按此实现）

设置对象：`{ filter: 'ascii'|'dither', mask, palette, inkTone, strength, size, spacing }`，两种滤镜各存一份。默认 palette 为 `meadow`。

- 推荐值：ASCII 为 mask 90、取样暗部、strength 100、size 37、spacing 0；Dither 为 mask 88、strength 100、size 15、spacing 0。
- 辅助函数：`range(v,a,b) = a + (b-a)*v/100`；亮度 `L = (0.299R + 0.587G + 0.114B)/255`；`s = strength/100`。
- 采样：把素材按 cover 方式放进约 480px 长边的采样画布，叠在白底上。有色板时先用 256 级查表重新着色（色阶 0 / 0.4 / 0.74 / 1）。每帧取约 12000 个均匀采样点，low 取第 8 百分位，high 取第 92 百分位。
- ASCII：
  - 字符从空到满为 `"  .,:;-=+xX08S#&@"`。
  - 字号 `round(range(size,7,24))`，画框宽度小于 720 时上限 22。
  - 横向格距 `max(range(spacing,8,24), 最宽字符宽度*1.08)`；行高 `max(range(spacing,9,26), "@"的高度*1.12, 字号*1.04)`；第一个格子距边缘半格。
  - 色调计算：
    - `raw` = 暗墨时 1−L，亮墨时 L；
    - `norm` = 暗墨时 (high−L)/(high−low)，亮墨时 (L−low)/(high−low)，截断到 0–1；若 high−low < 0.025，直接用 raw；
    - `mix = 0.72 + 0.14s`，`t = raw(1−mix) + norm·mix`；
    - `black = 0.22s`，`white = 1 − 0.08s`，`lev = clamp((t−black)/(white−black))`；
    - `tone = lev(1−s) + smoothstep(lev)·s`。
  - tone ≤ 0.02 时跳过；字符取 `chars[round(tone*16)]`，空格跳过。
  - 墨色：把采样色转成 HSV，`value += (1−value)(0.24 + 0.18s + 0.24tone)`，`sat *= 1.16 + 0.2s`。透明度 `clamp((0.12 + 0.7tone)(0.72 + 0.28s), 0.06, 0.94)`。
- Dither：
  - 像素块 `max(2, round(range(size,2,9)))`，宽度小于 720 时上限 7；纹理倍数 `max(1, round(range(spacing,1,4)))`；色阶数 `max(2, round(range(strength,8,2)))`；混合比 `range(strength,0.32,1)`。
  - Bayer 4×4 矩阵 `[[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]]`，阈值 `(m+0.5)/16`。
  - 先按 `1.06 + 0.18s` 把饱和度推离亮度，再逐通道计算：`scaled = c/255*(levels−1)`，`q = floor + (小数部分 > 阈值 ? 1 : 0)`，`out = c + (q/(levels−1)*255 − c)*混合比`。
  - 写入小画布，关闭平滑后放大绘制。
- 遮罩：纵向渐变，色阶位置为顶部、42%、底部。基础不透明度：浅色页用白色 54/20/38%，深色页用黑色 44/20/50%。`stop = v ≤ 50 ? base*(v/50)^1.08 : base + (100−base)*((v−50)/50)^1.08`。
- 绘制顺序：ASCII 为先画（重新着色后的）图，再画遮罩，最后画字符；Dither 为先画抖动后的图，再画遮罩。
- 切换滤镜或色板时，从上一帧淡入淡出 150ms。

## 大屏与手机清晰度（验收重点）

- 宿主元素的大小和圆角由页面决定，模块画布铺满宿主。
- 设备像素比上限 1.6，画布上限约 2048×2048。
- 宿主宽度小于 480 时，字号不小于 8px，手机上字符必须清楚可见。
- 图片：设置变化后 72ms 防抖重绘。视频：用 `requestVideoFrameCallback`，退回 `requestAnimationFrame`；可见且播放时才绘制，帧率上限 30。
- 可选的 `drift`：底图缓慢平移，每 20 秒来回一次。
- 可选的 `ripple`：指针附近半径约 80px 内的字符被推开后回位，手机上触摸同样有效。
- 开启「减弱动态效果」时只画静止的一帧，不做 drift / ripple。

## 实验页 `public/lab/ascii.html`

- 面板按规格的行顺序排列：遮罩、滤镜（两个标签）、色调（圆形色样：原色 + 五个色板）、取样（只在 ASCII 下显示）、采样强度、大小、间距。
- 每行高 46px；标签列宽 136px；滑杆轨道 22px、圆角 8；拇指 9×30、圆角 3；有数字框；50 处有吸附刻度；带「恢复推荐值」。
- 测试素材用页面里生成的渐变加形状画布，也提供一个上传本地图片的按钮。

## 验证与提交

- `node --check`、`node --test test/asciiField.test.js`、`npm test` 全部通过。
- 用无头 Chromium 截图实验页（1440 和 390 两种宽度、两种滤镜），放在 `tmp/v3/T2/`，自己看一遍。
- 只提交一次，提交信息以 `Add v3 ascii field module` 开头。最后用中文回复：做了什么、怎么验证的、有什么不足。
