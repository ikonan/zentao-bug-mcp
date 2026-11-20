export function parseBugId(input: string, baseUrl: string): number {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`无法识别的 bug 参数："${input}"。请提供禅道 bug 链接或纯数字 ID。`);
  }

  const base = new URL(baseUrl);
  if (url.host !== base.host) {
    throw new Error(
      `链接主机 (${url.host}) 与 ZENTAO_BASE_URL (${base.host}) 不一致。` +
        `出于凭据安全，不会向其他主机发送账号密码；如需切换禅道实例请修改环境变量。`
    );
  }

  const queryId = url.searchParams.get("bugID") ?? url.searchParams.get("id");
  if (queryId && /^\d+$/.test(queryId)) return Number(queryId);

  const pathMatch = url.pathname.match(/bug-view-(\d+)(?:\.html)?/);
  if (pathMatch) return Number(pathMatch[1]);

  throw new Error(
    `链接中未找到 bug ID: ${trimmed}。支持 bug-view-{id}.html 或 index.php?m=bug&f=view&bugID={id} 风格。`
  );
}