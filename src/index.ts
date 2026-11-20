#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig, type Config } from "./config.js";
import { ZenTaoClient } from "./client.js";
import { buildBugReport } from "./get-bug.js";

let cfg: Config;
try {
  cfg = loadConfig();
} catch (e) {
  console.error(`[zentao-bug-mcp] ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}

if (cfg.insecureTls) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  console.error("[zentao-bug-mcp] 警告: 已跳过 HTTPS 证书校验 (ZENTAO_INSECURE_TLS=1)");
}

const client = new ZenTaoClient(cfg);
const server = new McpServer({ name: "zentao-bug-mcp", version: "0.1.0" });

server.registerTool(
  "zentao_get_bug",
  {
    description:
      "获取禅道(ZenTao) bug 详情：传入 bug 链接或数字 ID，返回 bug 完整标题（含关键信息）、状态、严重程度、指派人和重现步骤文本，" +
      "并把内嵌截图/附件下载到本地，返回本地绝对路径（图片可用 Read 工具直接查看）。用于根据禅道 bug 定位并修复代码。",
    inputSchema: {
      bug: z
        .union([z.string(), z.number()])
        .transform((v) => String(v))
        .describe("禅道 bug 链接（如 http://host/zentao/bug-view-123.html 或 index.php?m=bug&f=view&bugID=123）或纯数字 bug ID"),
      downloadAttachments: z
        .boolean()
        .optional()
        .default(true)
        .describe("是否下载附件列表中的文件（内嵌截图始终下载）"),
    },
  },
  async ({ bug, downloadAttachments }) => {
    try {
      const text = await buildBugReport(client, cfg, { bug, downloadAttachments });
      return { content: [{ type: "text", text }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }] };
    }
  }
);

await server.connect(new StdioServerTransport());
console.error(`[zentao-bug-mcp] 已启动，禅道地址: ${cfg.baseUrl}`);