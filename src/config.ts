import os from "node:os";
import path from "node:path";

export interface Config {
  baseUrl: string;
  account: string;
  password: string;
  downloadDir: string;
  insecureTls: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const required = ["ZENTAO_BASE_URL", "ZENTAO_ACCOUNT", "ZENTAO_PASSWORD"] as const;
  const missing = required.filter((k) => !env[k]?.trim());
  if (missing.length > 0) {
    throw new Error(`缺少环境变量: ${missing.join(", ")}。请在 MCP 客户端配置的 env 中设置。`);
  }
  const baseUrl = env.ZENTAO_BASE_URL!.trim().replace(/\/+$/, "");
  try {
    new URL(baseUrl);
  } catch {
    throw new Error(`ZENTAO_BASE_URL 不是合法的 URL: ${baseUrl}`);
  }
  return {
    baseUrl,
    account: env.ZENTAO_ACCOUNT!.trim(),
    password: env.ZENTAO_PASSWORD!,
    downloadDir: env.ZENTAO_DOWNLOAD_DIR?.trim() || path.join(os.tmpdir(), "zentao-mcp"),
    insecureTls: env.ZENTAO_INSECURE_TLS === "1",
  };
}