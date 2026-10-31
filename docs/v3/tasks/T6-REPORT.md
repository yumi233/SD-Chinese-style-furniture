# T6 完成报告 · 首页与登录页

日期：2026-10-31

## 首页

- 整页重写为纸色留白与大幅 paper ASCII 主视觉。桌面首屏左侧面板实测 807×812px，导航为页面边距 16px 上的玻璃浮层；移动端面板宽度 370px、高度 506px（60svh）。
- 主视觉使用 `/assets/hero-meadow.png`、`look: "paper"`、drift、ripple 和左下 titleZone。标题为宋体双行，第二行使用 `--olive`。
- 右侧白色试玩卡圆角 24px、内边距 12px；输入框、快捷短语和石板灰按钮均为 12px 圆角。提交后跳转到编码后的 `/studio?prompt=...`。
- 「一格一格」区域复用 ASCII 模块，提供 ASCII/Dither 切换和「颗粒」「解体」滑杆；解体通过模块 ripple 让字符散开并自动回位。
- 「框住它，说一句」使用椅子局部画布和可拖动选框，支持键盘方向键移动。选中后出现修改气泡；点击「再薄一点」后以 Dither 重新显影一次，版本号更新为 v2。
- 「六圈年轮」以六个 SVG 弧线显示评分，进入视口后依次展开。
- 结尾为宋体行动标题和「打开工作台」入口；导航保留品牌、三个锚点、登录、工作台和显示偏好。
- 已删除旧圈椅滚动、视角控制、风格图库和无用首页逻辑，未保留 `making.*`、`idea-folder.*` 或旧首页专用脚本。

## 登录页

- 新增 `public/login.html`、`public/js/login.js`、`public/css/login.css`。桌面为 58/42 的 paper ASCII 面板与表单；移动端面板缩为顶部 32svh，表单在下方。
- 登录请求发送到 `/api/v1/auth/login`，注册请求发送到 `/api/v1/auth/register`；注册字段为 `displayName`、`email`、`password`。
- 支持登录/注册切换、密码显示/隐藏、字段校验、401、429、服务端错误和网络超时提示。
- `?next=` 仅接受同源站内路径，成功后跳转；默认目标为 `/studio`。
- 所有按钮、输入框和显示开关均可键盘操作，并使用现有 focus-visible、语义标签和 aria-live 错误区域。

## 验证

- `node --check public/js/home.js`、`node --check public/js/login.js`：通过。
- `node --test test/frontendBindings.test.js`：11/11 通过。
- `npm test`：86/86 通过。
- `make check`：通过。
- 无头 Chromium 1440×900、390×844：
  - `tmp/v3/T6/home-1440-first.png`
  - `tmp/v3/T6/home-1440-full.png`
  - `tmp/v3/T6/home-390-first.png`
  - `tmp/v3/T6/home-390-full.png`
  - `tmp/v3/T6/login-1440.png`
  - `tmp/v3/T6/login-390.png`
- 两种宽度均无 console/page error，`scrollWidth` 与视口宽度一致。
- 额外检查 320px 最小宽度：首页与登录页均无横向溢出或运行时错误。
- 浏览器实测：主视觉为 paper、ASCII/Dither 切换生效、两个滑杆读数更新、年轮进入视口后显示、选框气泡出现且 v1 更新为 v2。
- 使用临时 Express 实例和临时用户目录完成真实注册、退出、错误密码与再次登录：注册和登录均正确跳转 `?next=`，错误密码显示「邮箱或密码不正确。」。
- 首页表单实测跳转到包含编码 prompt 的 `/studio?prompt=...`。
- reduced-motion 下纸面画面保持静止，年轮直接显示最终状态。

## 已知限制

- 浏览器截图与交互验证覆盖本机 Chromium，未做 Firefox、Safari 和真实触屏设备验收。
- 「解体」滑杆调用模块现有 ripple 模拟字符散开再聚合，不是逐字符物理位移系统。
- 框选后的「再薄一点」是视觉演示，不写入真实版本或改写图片；正式版本树仍由工作台后端负责。
- 当前登录入口明确为 `/login.html`，没有为后端新增缺失的 `/login` 别名路由。
