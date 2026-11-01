# T5 · 工作台重做（负责人：GPT-6.1 Sol）

先读 `docs/v3/PLAN.md`、`AGENTS.md`、`docs/PROJECT_OVERVIEW.md`。交互参考：`git show redesign/claude:docs/redesign/claude/DESIGN.md`，原型在 `redesign/claude` 分支的 `public/proposals/claude/`（studio.*、furniture.js），可以用 `git show` 查看。DeepSeek 方案的「没有内容就收起」见 `redesign/deepseek` 分支的 `docs/redesign/deepseek/DESIGN.md`。

## 目标

把 `/studio` 重做成**以画布为主**、接**真实后端**的工作台。登录、接口调用、生成任务轮询这些现有逻辑要保留并复用，只换界面层。

## 结构

- **画布**：点阵纸底，可以拖动、滚轮或双指缩放。每条生成记录是一张版本卡片（版本号、标题、分数环、图片、底部动作：改一处 / 再来一版 / 对比 / 下载）。用历史记录的 `parentId` 连线，组成版本树。
- **浮动输入栏**（底部，圆角 28、内边距 8）：
  - 未选中版本时按钮为「生成」；选中已完成的版本时，按钮变成「修改 vN」，提交时带上 `parentId`；生成中按钮变成「停止」。
  - 单次 / 迭代切换，风格选项。参数、约束、英文提示词收进「设置」，按需展开。
- **评审面板**（右侧；手机为底部抽屉）：
  - 总分、六圈年轮、可以点的建议（点一条会把对应的修改语填进输入栏）、材质、锁定（设计记忆）、英文提示词。
  - 没有版本时不显示。
- 左上：标志、作品（历史抽屉）、作品名、设计记忆标签。右上：账号、模型状态、导出。管理员才能看到模型设置。

## 生成过程（对应真实任务状态）

1. 理解需求：描述拆成几个标签，依次弹出；
2. 起稿：卡片内用 `public/js/modules/ascii-field.js` 画一层字符起稿画面（素材可以用程序画的家具占位，或者上一版的图）；
3. 出图：继续等待时，像素块逐级收细；
4. 结果返回：**真实图片**先用 ascii-field 的 dither 或 ascii 显影，在约 1.2 秒内过渡到原图；
5. 评审：分数和年轮出现。

另外：可以随时停止。失败时写明「这次没有扣次数」（以后端返回为准，没有这个信息就不要这样写）。刷新后，通过 `GET /generation-tasks` 恢复正在进行的任务。

## 框选改一处

在卡片图上拖一个框，弹出修改气泡。后端不支持局部重绘，所以把「位置描述（左上 / 右侧扶手区域等，按框的位置换算）+ 用户的话」拼进新的描述，带上 `parentId` 生成。界面上标注「按区域描述修改」，不承诺像素级精度。

## 对比与导出

- 对比：选两张卡片，三种方式（拖动分界线 / 半透明叠看 / 左右并排）。
- 导出：一页图，包含图片、作品名、版本、六维分数，下载 PNG。

## 状态

空态、生成中、部分结果（迭代模式中的各轮）、成功、失败、已停止、断线、刷新恢复，八类状态都要有对应界面。保留一个隐藏的演示入口：`?demo=<状态>` 使用模拟数据，方便截图。

## 规则

- 原则：Avoid unnecessary secondary labels and descriptions. 删掉 REVIEW、EYEBROW 这类小标和解释性段落。
- 样式只用 tokens 和 components，不加新的散落文件。圆角必须写出同心关系的注释（外 − 间距 = 内）。
- `studio.js` 可以拆成 `public/js/studio/*.js` 多个模块。`test/frontendBindings.test.js` 里的 ID 断言可以跟着新结构更新，但要保留同等的覆盖：所有绑定的 ID 都存在、生成入口、空态、调用的是 v1 接口。
- 允许修改：`public/studio.html`、`public/js/studio.js`、`public/js/studio/`、`public/js/modules/`（不要改 ascii-field.js）、`public/css/studio.css`、`public/css/workbench.css`、`public/ui/components.css`（只能增加，不能改已有规则）、`test/`、`docs/v3/tasks/T5-REPORT.md`。不要改后端，不要改首页。
- 验证：
  - `npm test`、`make check` 通过；
  - 用本地 mock 模型服务（参考 test 里的模拟服务器）或 `?demo=` 走一遍：生成 → 评审 → 改一处 → 新版本连线 → 对比 → 停止 → 刷新恢复；
  - 在 1440 和 390 两种宽度下截图，放在 `tmp/v3/T5/`，逐张看过。
- 只提交一次（可以分多次，最后一次提交信息以 `Rebuild studio as canvas-first v3` 开头）。最后用中文说明：做了什么、怎么验证的、还剩什么风险。
