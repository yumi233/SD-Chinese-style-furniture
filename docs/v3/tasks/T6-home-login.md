# T6 · 首页与登录页（负责人：DeepSeek V4.1 Flash）

先读 `docs/v3/PLAN.md`、`docs/v3/reference/ASCII_TARGET.md`，再看 `AGENTS.md` 的界面原则。效果模块使用 `public/js/modules/ascii-field.js`，样式用 paper。

## 首页 `public/index.html`（整页重写）

版式参考 Lumio 登录页：左边是大幅 ASCII 面板，右边留白干净。

1. **首屏**
   - 桌面：左侧面板宽约 58%，高度为视口高度减去导航，圆角 32（同心关系：页面边距 16，导航是浮在上面的玻璃条）。面板里用 paper 样式渲染 `/assets/hero-meadow.png`，开启 drift 和 ripple，titleZone 设在左下。
   - 面板左下压标题，宋体大字：「一句话，」换行「长出一件家具。」第二行用橄榄绿 --olive。
   - 右侧是一张白色试玩卡片，圆角 24、内边距 12，里面的控件圆角 12：一个输入框（占位语「一把给小公寓的椅子，浅木，轻一点」）、三个可点的短语、石板灰的「开始设计」按钮。点击后跳转 `/studio?prompt=...`。
   - 手机：面板全宽，高度为视口的 60%，标题仍压在面板上；试玩卡片放在下面。
2. **一格一格**：一句宋体标题，加同一个模块的小面板。提供 ASCII / Dither 切换，以及「颗粒」「解体」两个滑杆（解体用 ripple 或位移模拟字符散开再聚合即可）。
3. **框住它，说一句**：用 `hero-meadow.png` 的椅子局部做一个可以拖框的演示。框选后出现修改气泡，点「再薄一点」，画面用 dither 重新显影一次，版本号从 v1 变成 v2，作为演示。
4. **六圈年轮**：六个维度的环，进入视口时依次画出。
5. **结尾**：一句宋体标题，加「打开工作台」按钮。

导航沿用 T1 的玻璃质感：品牌、两三个锚点、「登录」「打开工作台」。

删掉旧首页的文件夹、圈椅滚动段（`making.*`、`idea-folder.*`，如果存在）以及无用的 home 样式。

## 登录页 `public/login.html`（新建）

- 完全按截图版式：左边是 ASCII 大面板（同一张底图，paper 样式，标题「欢迎回来，」换行「继续你的作品。」，第二行用橄榄绿）；右边是表单。
- 表单包括：标题、邮箱、密码（可以切换显示）、石板灰「登录」按钮、「没有账号？注册」切换。注册模式需要填写现有注册接口要求的字段。
- 调用 `/api/v1/auth/login` 和 `/api/v1/auth/register`（字段先读 `src/http/routes.js` 确认）。成功后跳转 `?next=`，默认 `/studio`。错误信息要清楚显示。
- 手机：面板缩成顶部约 32vh 的条，表单在下面。
- 键盘可以完整操作，对比度满足 AA。

## 规则

- 允许修改：`public/index.html`、`public/login.html`、`public/js/home.js`、`public/js/login.js`、`public/css/home.css`、`public/css/login.css`；可以删除旧首页专用的文件；可以修改 `test/frontendBindings.test.js` 中首页相关的断言（保留同等覆盖），以及 `docs/v3/tasks/T6-REPORT.md`。**不要改** `public/ui/*`、studio 相关文件和后端。
- 原则：不写眉题、副标题、英文小标。
- 尊重减弱动态效果。画面不在视口内时暂停绘制。
- 验证：`npm test`、`make check` 通过。用无头 Chromium 在 1440 和 390 两种宽度下截图首页（首屏和整页）以及登录页，放在 `tmp/v3/T6/`，逐张看过。手机首屏里的字符必须清楚可见。
- 最后一次提交信息以 `Rebuild home and add login page for v3` 开头。用中文说明：做了什么、怎么验证的、还剩什么问题。
