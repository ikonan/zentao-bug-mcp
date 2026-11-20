import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";

export interface ImageRef {
  key: string;
  fileID: string | null;
  absoluteUrl: string;
}

function resolveSrc(src: string, base: URL): URL | null {
  try {
    return new URL(src, base);
  } catch {
    return null;
  }
}

export function extractImages(stepsHtml: string, baseUrl: string): ImageRef[] {
  const $ = cheerio.load(stepsHtml);
  const base = new URL(baseUrl + "/");
  const seen = new Map<string, ImageRef>();
  $("img").each((_, el) => {
    const src = $(el).attr("src");
    if (!src || src.startsWith("data:")) return;
    const abs = resolveSrc(src, base);
    if (!abs || abs.host !== base.host) return;
    const fileID = abs.searchParams.get("fileID") ?? abs.pathname.match(/file-read-(\d+)/)?.[1] ?? null;
    if (!seen.has(abs.href)) {
      seen.set(abs.href, { key: abs.href, fileID, absoluteUrl: abs.href });
    }
  });
  return [...seen.values()];
}

const BLOCK_TAGS = new Set([
  "p", "div", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6",
  "ol", "ul", "table", "blockquote", "pre", "section",
]);

export function stepsToText(stepsHtml: string, baseUrl: string, replacements: Map<string, string>): string {
  const $ = cheerio.load(stepsHtml);
  const base = new URL(baseUrl + "/");

  function walk(node: AnyNode): string {
    if (node.type === "text") return (node as unknown as { data: string }).data ?? "";
    if (node.type !== "tag") return "";
    const el = node as Element;
    const name = el.name.toLowerCase();
    if (name === "img") {
      const src = $(el).attr("src") ?? "";
      const abs = resolveSrc(src, base);
      const key = abs ? abs.href : src;
      return replacements.get(key) ?? `[图片: ${src}]`;
    }
    if (name === "br") return "\n";
    if (name === "script" || name === "style") return "";
    const inner = $(el)
      .contents()
      .toArray()
      .map(walk)
      .join("");
    if (name === "li") return `\n- ${inner.trim()}`;
    if (BLOCK_TAGS.has(name)) return `\n${inner}\n`;
    return inner;
  }

  const text = $.root().contents().toArray().map(walk).join("");
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}