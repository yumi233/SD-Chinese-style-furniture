# T3 · 版本父子关系（负责人：GPT-6.1 Terra）

先读 `docs/v3/PLAN.md` 和 `AGENTS.md`。

目标：工作台要把历史记录画成版本树，所以每条生成记录需要可选地记录「从哪一版改来」。

1. 生成相关接口（`/generate`、`/agent/run`、`/generation-tasks` 的 POST）接收一个可选参数 `parentId`，字符串，最长 80 字符。服务端校验：这个 id 必须是当前用户自己的历史记录，否则返回 400 并给出明确的错误信息。
2. 在历史记录里保存 `parentId`；`GET /history` 和 `GET /history/:id` 返回这个字段。旧记录没有该字段也必须兼容。
3. 删除父记录时，子记录保留，`parentId` 置为 null。
4. 补充测试：保存、读取、不属于自己的 id 返回 400、删除父记录后子记录的 `parentId` 为 null、旧记录兼容。测试放在现有的 test 文件里，或新建 `test/versionParent.test.js`。
5. 在 `docs/PROJECT_OVERVIEW.md` 的接口说明里补一行。按 `docs/RELEASE_RULES.md` 判断需不需要改 Docker 文件，在报告里说明结论。
6. 允许修改：`src/` 中与历史和生成相关的文件、`test/`、`docs/PROJECT_OVERVIEW.md`、`docs/v3/tasks/T3-REPORT.md`。不要碰 `public/`。
7. `npm test`、`make check` 通过。只提交一次，提交信息以 `Record version parent on generation history` 开头。最后用中文回复：做了什么、怎么验证的、有什么风险。
