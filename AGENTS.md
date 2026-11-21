# AGENTS.md

公开仓库（GitHub ikonan/zentao-bug-mcp、npm zentao-bug-mcp）：禅道 bug 只读抓取 MCP server，唯一工具 `zentao_get_bug`，返回 Markdown 报告并把截图/附件下载到本地供 AI 读图修 bug。配套 skill 同仓：`skills/fix-zentao-bug`。

## 硬边界

- **只读禅道**：工具只抓取，不增加解决/关闭/评论等写接口——这是产品边界，新增工具同样遵守。
- **公开仓库脱敏**：真实公司禅道地址、账号、密码、真实人名只存在于用户本机 MCP env 配置；代码/测试/文档一律虚构占位（沿用 test/ 与 README 现有风格）。提交前检查 diff 不含内网 IP 与凭据。
- **host 一致性**：`src/url.ts` 的 `parseBugId` 在链接 host ≠ ZENTAO_BASE_URL 时拒发凭据；扩展链接形态时保留该检查。
- **发布由用户执行**：npm 账号带 2FA，`npm publish` 由用户在本人终端跑；agent 做到构建/测试全绿为止。

## 禅道 API 事实（开源版 22.4 实测，适配 18+）

- 只走 REST v1（`/api.php/v1`，Token header），不爬网页、不用旧版 JSON 接口。
- `GET /bugs/{id}` 响应已含 `actions`（评论/动态历史，comment 为 HTML）——无需独立评论端点。
- `actions`/`files`/`history` 可能是数组或对象（PHP 序列化 quirk），统一 `Object.values` 兜底（参照 `src/actions.ts` normalizeActions、`src/get-bug.ts` files 处理）。
- 内嵌图 src 两种形态：`?fileID=` 与 `file-read-(\d+)`；空评论常为 `"<br />"`，`stepsToText` 渲染后为空串，可直接用作空判断。
- 文件下载优先 `/api.php/v1/files/{id}`（Token header）；旧式 URL 走 cookie `zentaosid`、失败回退 query 带 sid（`src/client.ts` downloadFile）。

## 工程约定

- 测试只连本地 mock（`test/mock-zentao.mjs`，随机端口），保证无内网也能跑；下载去重断言用 `state.fileHits`。
- package.json 的 test script 是**显式文件列表**：新增测试文件必须登记进去，否则静默不跑。
- 报告是 Markdown 纯文本（非 JSON）；段落名与参数语义变更时同步 `skills/fix-zentao-bug/SKILL.md` 与 `README.md`——SKILL 依赖"重现步骤/评论与动态/本地文件"等段落名驱动读图流程。
- 文案（报告/报错/文档）中文；git 提交信息英文祈使句。

## 何时同步什么

- 改环境变量、工具参数、安装方式 → 同步 README.md（面向用户的配置/排错表）。
- 改报告结构/段落名 → 同步 skills/fix-zentao-bug/SKILL.md 的段落引用与工作流。