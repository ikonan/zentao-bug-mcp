import fs from "node:fs/promises";
import path from "node:path";
import type { Config } from "./config.js";
import type { ZenTaoClient, ZenTaoFile } from "./client.js";
import { parseBugId } from "./url.js";
import { extractImages, stepsToText } from "./html.js";

const SEVERITY: Record<number, string> = { 1: "致命", 2: "严重", 3: "一般", 4: "轻微" };

function personName(v: unknown): string {
  if (!v) return "-";
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    const o = v as { realname?: string; account?: string };
    return o.realname || o.account || "-";
  }
  return String(v);
}

function sanitize(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, "_").trim().slice(0, 80) || "file";
}

function imgExt(url: string): string {
  const u = new URL(url);
  const m = u.pathname.match(/\.(png|jpe?g|gif|webp|bmp)$/i);
  if (m) return "." + m[1].toLowerCase();
  const t = u.searchParams.get("t");
  if (t && /^(png|jpe?g|gif|webp|bmp)$/i.test(t)) return "." + t.toLowerCase();
  return ".png";
}

export async function buildBugReport(
  client: ZenTaoClient,
  cfg: Config,
  input: { bug: string; downloadAttachments?: boolean }
): Promise<string> {
  const id = parseBugId(input.bug, cfg.baseUrl);
  const bug = await client.getBug(id);
  const stepsHtml = typeof bug.steps === "string" ? bug.steps : "";
  const images = extractImages(stepsHtml, cfg.baseUrl);

  const filesRaw = bug.files;
  const allFiles: ZenTaoFile[] = Array.isArray(filesRaw)
    ? filesRaw
    : filesRaw && typeof filesRaw === "object"
      ? Object.values(filesRaw)
      : [];
  const imageFileIDs = new Set(images.map((img) => img.fileID).filter(Boolean));
  const attachments =
    input.downloadAttachments === false
      ? []
      : allFiles.filter((f) => f && f.id != null && !imageFileIDs.has(String(f.id)));

  const dir = path.join(cfg.downloadDir, `bug-${id}`);
  await fs.mkdir(dir, { recursive: true });

  const replacements = new Map<string, string>();
  const downloaded: string[] = [];
  const failures: string[] = [];
  const attLines: string[] = [];

  const tasks: Array<() => Promise<void>> = [];

  images.forEach((img, i) => {
    tasks.push(async () => {
      const name = `img-${img.fileID ?? i + 1}${imgExt(img.absoluteUrl)}`;
      const dest = path.join(dir, name);
      try {
        if (img.fileID) {
          await client.downloadFileByID(img.fileID, dest);
        } else {
          await client.downloadFile(img.absoluteUrl, dest);
        }
        replacements.set(img.key, `![${name}](${dest})`);
        downloaded.push(dest);
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        replacements.set(img.key, `[图片下载失败: ${img.absoluteUrl}（${reason}）]`);
        failures.push(`${name}: ${reason}`);
      }
    });
  });

  for (const f of attachments) {
    tasks.push(async () => {
      let name = sanitize(f.title || f.pathname || `file-${f.id}`);
      const ext = (f.extension || "").replace(/^\./, "").toLowerCase();
      if (ext && !name.toLowerCase().endsWith("." + ext)) name += "." + ext;
      name = `${f.id}-${name}`;
      const dest = path.join(dir, name);
      try {
        await client.downloadFileByID(f.id, dest);
        downloaded.push(dest);
        attLines.push(`- ${f.title || name} → ${dest}`);
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        attLines.push(`- ${f.title || name}：下载失败（${reason}）`);
        failures.push(`${name}: ${reason}`);
      }
    });
  }

  await Promise.all(tasks.map((t) => t()));

  const stepsText = stepsToText(stepsHtml, cfg.baseUrl, replacements) || "（无重现步骤）";
  const severity = bug.severity ? `${bug.severity}（${SEVERITY[bug.severity] ?? "?"}）` : "-";
  const lines = [
    `# Bug #${bug.id ?? id}: ${bug.title ?? "(无标题)"}`,
    "",
    `- 状态: ${bug.status ?? "-"} | 严重程度: ${severity} | 优先级: ${bug.pri ?? "-"}`,
    `- 指派: ${personName(bug.assignedTo)} | 创建: ${personName(bug.openedBy)} | 产品: ${bug.productID ?? "-"}`,
    `- 链接: ${cfg.baseUrl}/bug-view-${id}.html`,
    "",
    "## 重现步骤",
    stepsText,
  ];
  if (attLines.length > 0) lines.push("", "## 附件", ...attLines);
  if (downloaded.length > 0) {
    lines.push("", "## 本地文件（图片可用 Read 工具直接查看）", ...downloaded.map((p) => `- ${p}`));
  }
  if (failures.length > 0) {
    lines.push("", `⚠️ ${failures.length} 个文件下载失败（见上文标注），其余内容完整。`);
  }
  return lines.join("\n");
}