# 设计垂点参考研究与木生 UI 转译

研究时间：2026-10-29。目录中的 30 个站内入口已抓取、提取正文并建立覆盖记录；重点阅读组件、浮层、层级、动效、字体与 UI 品质相关内容。首页与组件文章做了真实浏览器视觉检查。外链项目、所有视频及所有嵌入演示并未逐一完整播放或交互验收。

## 采用的设计语言

- 背景用浅灰，内容与浮层用白色；文字以黑灰为主，蓝色用于焦点、选择和可操作内容。
- 页面通过留白、对齐与圆形结构示意建立秩序，精简重复眉题和说明。家具图为木生原创 SVG，未搬运参考网站的作品。
- 共享高亮连接同组的切换；按压提供轻微缩放；状态变化保留操作上下文；浮层打开遵循空间层级。
- 弹出层随触发按钮定位、翻转并限制在视口内；对话框支持键盘、Esc 和焦点返回；范围滑块反馈当前值。
- 减少动态效果模式直接更新状态，按钮忙碌时阻止重复触发，失败后支持重试并保留输入。

## 重点来源与应用

| 来源 | 在木生中的应用 |
| --- | --- |
| [跳跃组件](https://wxad.design/abc/springen) | 同组工具、切换和设置导航采用一个移动高亮表面 |
| [发芽组件](https://wxad.design/abc/spross) | 浮层定位、翻转、视口边界、Esc 与焦点管理 |
| [Functional Motion](https://wxad.design/abc/functional-motion) | 反馈围绕操作结果；重复演示提示合并；保留交互上下文 |
| [层级设计](https://wxad.design/abc/designing-depth) | 背景、创作区、评审、弹窗采用清晰的空间层级 |
| [AI 交互动画建议](https://wxad.design/abc/interactive-design-in-ai) | 组件先行，状态先行，实际检查连续操作 |
| [UI 品质](https://wxad.design/abc/quality-of-ui) | 检查桌面、手机、错误、空态与键盘操作 |
| [AD UI 回顾](https://wxad.design/abc/adui) | Figma 变量、组件与网页语义变量对应 |
| [字体](https://wxad.design/abc/font-family) | 使用系统中文字体回退，不移植参考站私有字体 |

## 全站目录覆盖

| 入口 | 正文字数近似 | 读取状态 |
| --- | ---: | --- |
| [2023: 面对自我的提问与面对自我的回答](https://wxad.design/abc/2023) | 4758 | read |
| [回顾: 制作微信广告设计语言 AD UI](https://wxad.design/abc/adui) | 9892 | read |
| [回顾: 制作朋友圈广告年度评选](https://wxad.design/abc/bm) | 4076 | read |
| [转盘交互动画: 以关键参数，细化我们的感受](https://wxad.design/abc/carousel) | 3266 | read |
| [画出完美的文字圆形环绕 UI](https://wxad.design/abc/circular-text) | 2170 | read |
| [用 motion/react 实现优雅的 conic-gradient 旋转动画](https://wxad.design/abc/conic-gradient) | 4344 | read |
| [设计垂点](https://wxad.design/abc/crafts) | 148 | read |
| [做 UI 的开发](https://wxad.design/abc/deng) | 3215 | read |
| [交互动画的层级设计](https://wxad.design/abc/designing-depth) | 4608 | read |
| [关于 Drawer 组件的发散](https://wxad.design/abc/drawer) | 2499 | read |
| [Figma Make 的使用建议与更多 AI 的思考](https://wxad.design/abc/figma-make) | 5231 | read |
| [我们认真地想了想 font-family](https://wxad.design/abc/font-family) | 6238 | read |
| [Functional Motion: UI 组件库的动效设计细节](https://wxad.design/abc/functional-motion) | 5998 | read |
| [我的 CSS 生成艺术世界](https://wxad.design/abc/generative) | 7795 | read |
| [使用 AI 制作交互动画的建议](https://wxad.design/abc/interactive-design-in-ai) | 5735 | read |
| [制作点赞与投票动画](https://wxad.design/abc/likes) | 2247 | read |
| [制作流畅界面](https://wxad.design/abc/making-fluid-interfaces) | 5430 | read |
| [制作有趣的界面：朋友圈广告年度评选 2025](https://wxad.design/abc/making-fun-interfaces) | 3374 | read |
| [用户界面的品质](https://wxad.design/abc/quality-of-ui) | 4783 | read |
| [如何依靠 transform 模拟 iOS 原生滚动体验](https://wxad.design/abc/scroll-mock) | 1530 | read |
| [关于 shadcn/ui 的思考与启发](https://wxad.design/abc/shadcn) | 2345 | read |
| [小 p: 一次关于 AI 的交互实验](https://wxad.design/abc/small-p) | 2775 | read |
| [一类叫作“跳跃”的 UI 动效](https://wxad.design/abc/springen) | 5691 | read |
| [让我们继续“跳跃”](https://wxad.design/abc/springen2) | 2475 | read |
| [一类叫作“发芽”的 UI 组件](https://wxad.design/abc/spross) | 2082 | read |
| [使用 SVG 模拟 Apple Liquid Glass](https://wxad.design/abc/svg-liquid-glass) | 4872 | read |
| [用 react-spring 设计有“惯性”的交互动画](https://wxad.design/abc/trail) | 3032 | read |
| [回顾: 制作微信广告官网](https://wxad.design/abc/wxad) | 8942 | read |
| [玩一点微广 11 周年的 Demo](https://wxad.design/abc/wxad11) | 18786 | read |
| [微广 12 周年活动记录](https://wxad.design/abc/wxad12) | 1174 | read |

原始网页、正文、目录和截图保存在 `tmp/fluid-ui/research/`，不随 Docker 镜像发布。研究结论是本项目的设计判断，未把参考站所有实验形式都加入家具工具。


## 2026-10-30：材质与交互的第二轮研究

重点重新阅读并查看真实页面：

- [使用 SVG 模拟 Apple Liquid Glass](https://wxad.design/abc/svg-liquid-glass)：区分折射、边缘色散和高光。本文的 SVG backdrop 位移有浏览器兼容性与性能限制，因此本项目采用渐变边缘高光、透明背景、分层阴影与局部 backdrop blur；不扭曲正文，也不宣称完整还原 Liquid Glass。
- [交互动画的层级设计](https://wxad.design/abc/designing-depth)：前后景和背景失焦应该表达当前操作层级。本项目在模态浮层后失焦，在首页示意上采用有边界的轻微位移。
- [一类叫作“跳跃”的 UI 动效](https://wxad.design/abc/springen)：同组操作共享一块移动背景，避免每个元素各闪各的。本次扩展到主页材质控件和参数分段选择，并统一按压反馈。
- [一类叫作“发芽”的 UI 组件](https://wxad.design/abc/spross)：弹层考虑来源、位置与屏幕边界。本次补充真实业务弹窗的触发方向和原生弹层退出过渡，保留 Esc 与焦点恢复。

材质参数：导航 20px 模糊，玻璃样板 12px，亚克力 32px；模态背景 9px。微颗粒仅作用于亚克力表面，不作为折射。浅色亚克力基础色 #F8FAFB / 85%，深色 #242B34 / 91%。边缘亮线与接触阴影共同表达厚度。动态高光仅在鼠标移动时更新一帧，尊重减少动态效果。

证据在 `tmp/material-ui/`，其 reference 截图为浏览器实际页面；没有声称逐个操作了参考站全部实验。
