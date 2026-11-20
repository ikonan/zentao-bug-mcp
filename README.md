# zentao-bug-mcp

禅道（ZenTao）bug 抓取 MCP Server：在 AI 编码助手（Qoder / Cursor / Claude Code 等）里**直接丢一个禅道 bug 链接**，自动登录禅道、获取 bug 完整标题与重现步骤、把内嵌截图和附件下载到本地，AI 直接看图修 bug。不再需要手动打开网页复制描述、下载截图。

- 适配禅道开源版 18+（含 22.x），走官方 REST API v1，无需改禅道服务端
- 只读工具，不会修改禅道上的任何数据
- 账号密码仅存在于你本机的 MCP 客户端配置中，不落盘、不上传

## 快速开始

在 MCP 客户端（Qoder 的 MCP 设置 / Cursor 的 `.cursor/mcp.json`）中添加：

```json
{
  "mcpServers": {
    "zentao": {
      "command": "npx",
      "args": ["-y", "zentao-bug-mcp"],
      "env": {
        "ZENTAO_BASE_URL": "http://your-zentao-host/zentao",
        "ZENTAO_ACCOUNT": "你的禅道账号",
        "ZENTAO_PASSWORD": "你的禅道密码"
      }
    }
  }
}
```

> `ZENTAO_BASE_URL` 是浏览器访问禅道的根地址（含子路径，如 `/zentao`），不要带 `index.php` 或 `api.php`。

然后在对话里直接说：

```
帮我修复这个 bug：http://your-zentao-host/zentao/bug-view-12345.html
```

AI 会调用 `zentao_get_bug` 拿到标题、步骤和截图本地路径，读图后定位并修复代码。

## 工具

### `zentao_get_bug`

| 参数 | 类型 | 说明 |
|---|---|---|
| `bug` | string，必填 | bug 链接（`bug-view-{id}.html` 或 `index.php?m=bug&f=view&bugID={id}`）或纯数字 ID |
| `downloadAttachments` | boolean，默认 `true` | 是否下载附件列表（内嵌截图始终下载） |

返回 Markdown 报告：完整标题、状态/严重程度/优先级/指派人、重现步骤纯文本（图片位置替换为本地路径）、附件清单、本地文件绝对路径列表。图片下载到系统临时目录 `zentao-mcp/bug-{id}/`，AI 用自身的读文件工具即可查看截图。

## 环境变量

| 变量 | 必填 | 说明 |
|---|---|---|
| `ZENTAO_BASE_URL` | ✅ | 禅道根地址，如 `http://192.168.1.100/zentao` |
| `ZENTAO_ACCOUNT` | ✅ | 禅道登录账号 |
| `ZENTAO_PASSWORD` | ✅ | 禅道登录密码 |
| `ZENTAO_DOWNLOAD_DIR` | | 图片/附件下载目录，默认系统临时目录下 `zentao-mcp/` |
| `ZENTAO_INSECURE_TLS` | | 设为 `1` 跳过 HTTPS 证书校验（内网自签名证书场景） |

## 排错

| 报错 | 原因与处理 |
|---|---|
| 禅道登录失败（账号或密码错误？） | 检查 env 中的账号密码，确认能登录禅道网页版 |
| REST API v1 不可用 | `ZENTAO_BASE_URL` 不对（少了子路径？）或禅道未开启 RESTful API（后台 → 二次开发 → 应用） |
| 无法连接禅道服务器 | 确认已连公司内网 / VPN |
| HTTPS 证书校验失败 | 内网自签名证书，设置 `ZENTAO_INSECURE_TLS: "1"` |
| 链接主机与 ZENTAO_BASE_URL 不一致 | 安全限制：只向配置的禅道主机发送凭据，换实例请改 env |
| 个别图片下载失败 | 报告中会标注原因，不影响其余内容；常见于文件已被删除 |

## 本地开发

```bash
npm install
npm run build   # tsc → dist/
npm test        # 17 个用例，含本地 mock 禅道的端到端测试
```

本地调试时客户端配置可改为 `"command": "node", "args": ["/绝对路径/zentao-mcp/dist/index.js"]`。

## License

MIT