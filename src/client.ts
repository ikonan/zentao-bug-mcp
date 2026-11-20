import fs from "node:fs/promises";
import type { Config } from "./config.js";

export interface ZenTaoFile {
  id: number;
  title?: string;
  pathname?: string;
  extension?: string;
  size?: number;
}

export interface ZenTaoBug {
  id: number;
  title: string;
  severity?: number;
  pri?: number;
  status?: string;
  steps?: string;
  assignedTo?: unknown;
  openedBy?: unknown;
  productID?: number;
  files?: ZenTaoFile[] | Record<string, ZenTaoFile>;
  [key: string]: unknown;
}

const NETWORK_CODES = ["ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH", "ETIMEDOUT", "ECONNRESET", "EAI_AGAIN"];
const CERT_CODES =
  /SELF_SIGNED_CERT_IN_CHAIN|DEPTH_ZERO_SELF_SIGNED_CERT|UNABLE_TO_VERIFY_LEAF_SIGNATURE|CERT_HAS_EXPIRED|ERR_TLS_CERT_ALTNAME_INVALID/;

function translateNetworkError(e: unknown, baseUrl: string): Error {
  const err = e as { cause?: { code?: string }; code?: string; name?: string; message?: string };
  const code = err?.cause?.code ?? err?.code ?? "";
  if (NETWORK_CODES.includes(code)) {
    return new Error(`无法连接禅道服务器 (${baseUrl})：${code}。请确认已连接公司内网/VPN，且 ZENTAO_BASE_URL 正确。`);
  }
  if (CERT_CODES.test(code)) {
    return new Error(`HTTPS 证书校验失败 (${code})。内网自签名证书可设置环境变量 ZENTAO_INSECURE_TLS=1 跳过校验。`);
  }
  if (err?.name === "TimeoutError" || err?.name === "AbortError") {
    return new Error(`请求禅道超时 (15s)：${baseUrl}。请检查内网连通性。`);
  }
  return e instanceof Error ? e : new Error(String(e));
}

export class ZenTaoClient {
  private token: string | null = null;
  private loginPromise: Promise<string> | null = null;

  constructor(private cfg: Config) {}

  private async fetch(url: string, init: RequestInit = {}): Promise<Response> {
    try {
      return await fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(15000) });
    } catch (e) {
      throw translateNetworkError(e, this.cfg.baseUrl);
    }
  }

  private login(): Promise<string> {
    if (!this.loginPromise) {
      this.loginPromise = this.doLogin().finally(() => {
        this.loginPromise = null;
      });
    }
    return this.loginPromise;
  }

  private async doLogin(): Promise<string> {
    const res = await this.fetch(`${this.cfg.baseUrl}/api.php/v1/tokens`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account: this.cfg.account, password: this.cfg.password }),
    });
    if (res.status === 404 || (res.status >= 300 && res.status < 400)) {
      throw new Error(
        `REST API v1 不可用（登录接口返回 HTTP ${res.status}）。` +
          `请确认 ZENTAO_BASE_URL 正确（含子路径，如 http://host/zentao）且禅道已开启 RESTful API。`
      );
    }
    const text = await res.text();
    let data: { token?: string; error?: unknown };
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("REST API v1 不可用：登录接口返回了非 JSON 内容（可能是登录页 HTML）。请检查 ZENTAO_BASE_URL。");
    }
    if (!res.ok || !data.token) {
      const msg = typeof data.error === "string" ? data.error : text.slice(0, 200);
      if (res.status === 400 || res.status === 401) {
        throw new Error(`禅道登录失败（账号或密码错误？）: ${msg}`);
      }
      throw new Error(`禅道登录失败 (HTTP ${res.status}): ${msg}`);
    }
    this.token = data.token;
    return data.token;
  }

  private async isAuthFailure(res: Response): Promise<boolean> {
    if (res.status === 401) return true;
    if (res.status >= 300 && res.status < 400) {
      return /login/i.test(res.headers.get("location") ?? "");
    }
    if (res.status === 200 && (res.headers.get("content-type") ?? "").includes("json")) {
      const text = await res.clone().text();
      return /"error"/.test(text) && /(not\s*login|denied|login)/i.test(text);
    }
    return false;
  }

  private async authedFetch(url: string, init: RequestInit = {}): Promise<Response> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = this.token ?? (await this.login());
      const res = await this.fetch(url, { ...init, headers: { ...init.headers, Token: token } });
      if (await this.isAuthFailure(res)) {
        this.token = null;
        continue;
      }
      return res;
    }
    throw new Error("禅道会话反复失效：重新登录后仍未授权。请检查账号权限或禅道会话配置。");
  }

  async getBug(id: number): Promise<ZenTaoBug> {
    const res = await this.authedFetch(`${this.cfg.baseUrl}/api.php/v1/bugs/${id}`);
    if (res.status === 404) throw new Error(`Bug #${id} 不存在或当前账号无权限查看。`);
    const text = await res.text();
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`获取 bug 详情失败：返回非 JSON 内容 (HTTP ${res.status})。`);
    }
    if (!res.ok) {
      const msg = typeof data.error === "string" ? data.error : text.slice(0, 200);
      throw new Error(`获取 bug 详情失败 (HTTP ${res.status}): ${msg}`);
    }
    const bug = data.bug && typeof data.bug === "object" ? (data.bug as ZenTaoBug) : (data as unknown as ZenTaoBug);
    return bug;
  }

  async downloadFileByID(fileID: string | number, destPath: string): Promise<void> {
    const res = await this.authedFetch(`${this.cfg.baseUrl}/api.php/v1/files/${fileID}`);
    const ct = res.headers.get("content-type") ?? "";
    if (!res.ok || ct.includes("text/html") || ct.includes("json")) {
      const text = await res.text();
      throw new Error(`下载失败 (HTTP ${res.status}): ${text.slice(0, 150)}`);
    }
    await fs.writeFile(destPath, Buffer.from(await res.arrayBuffer()));
  }

  async downloadFile(absoluteUrl: string, destPath: string): Promise<void> {
    let lastErr = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = this.token ?? (await this.login());
      // 第二次尝试同时在 URL 上带 zentaosid，兼容仅认 query 会话的部署
      let url = absoluteUrl;
      if (attempt === 1) {
        const u = new URL(absoluteUrl);
        u.searchParams.set("zentaosid", token);
        url = u.href;
      }
      const res = await this.fetch(url, { headers: { Cookie: `zentaosid=${token}` } });
      if (res.status === 401 || (res.status >= 300 && res.status < 400)) {
        this.token = null;
        lastErr = `HTTP ${res.status}（被重定向，可能会话失效）`;
        continue;
      }
      const ct = res.headers.get("content-type") ?? "";
      if (!res.ok || ct.includes("text/html")) {
        throw new Error(`下载失败 (HTTP ${res.status}${ct.includes("text/html") ? "，返回了 HTML 页面而非文件" : ""})`);
      }
      await fs.writeFile(destPath, Buffer.from(await res.arrayBuffer()));
      return;
    }
    throw new Error(`下载失败：${lastErr}`);
  }
}