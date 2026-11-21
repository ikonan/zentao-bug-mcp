import type { ZenTaoAction } from "./client.js";
import { extractImages, stepsToText, type ImageRef } from "./html.js";

const ACTION_LABELS: Record<string, string> = {
  opened: "创建",
  assigned: "指派",
  confirmed: "确认",
  edited: "编辑",
  commented: "评论",
  resolved: "解决",
  closed: "关闭",
  activated: "激活",
};

export function personName(v: unknown): string {
  if (!v) return "-";
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    const o = v as { realname?: string; account?: string };
    return o.realname || o.account || "-";
  }
  return String(v);
}

export function normalizeActions(raw: unknown): ZenTaoAction[] {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? Object.values(raw) : [];
  const actions = list.filter((a): a is ZenTaoAction => !!a && typeof a === "object");
  const dateOf = (a: ZenTaoAction) =>
    typeof a.date === "string" && /^\d{4}-\d{2}-\d{2}/.test(a.date) ? a.date : "";
  return actions
    .map((a, i) => ({ a, i }))
    .sort((x, y) => {
      const dx = dateOf(x.a);
      const dy = dateOf(y.a);
      if (dx && dy && dx !== dy) return dx < dy ? -1 : 1;
      const ix = Number(x.a.id);
      const iy = Number(y.a.id);
      if (!Number.isNaN(ix) && !Number.isNaN(iy) && ix !== iy) return ix - iy;
      return x.i - y.i;
    })
    .map(({ a }) => a);
}

export function collectCommentImages(actions: ZenTaoAction[], baseUrl: string): ImageRef[] {
  const refs: ImageRef[] = [];
  for (const a of actions) {
    if (typeof a.comment === "string") refs.push(...extractImages(a.comment, baseUrl));
  }
  return refs;
}

function plainValue(v: unknown): string {
  const s = String(v ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "(空)";
  return s.length > 80 ? s.slice(0, 80) + "…" : s;
}

function summarizeHistory(history: ZenTaoAction["history"]): string {
  const items = Array.isArray(history)
    ? history
    : history && typeof history === "object"
      ? Object.values(history)
      : [];
  const parts: string[] = [];
  for (const h of items) {
    if (!h || typeof h !== "object" || h.field === "steps") continue;
    const oldS = plainValue(h.old);
    const newS = plainValue(h.new);
    if (oldS === "(空)" && newS === "(空)") continue;
    parts.push(`${h.fieldName || h.field || "?"}: ${oldS} → ${newS}`);
  }
  return parts.join("；");
}

export function renderTimeline(
  actions: ZenTaoAction[],
  baseUrl: string,
  replacements: Map<string, string>
): string[] {
  const lines: string[] = [];
  actions.forEach((a, i) => {
    if (i > 0) lines.push("");
    const label = a.action ? (ACTION_LABELS[a.action] ?? a.action) : "动态";
    const head = [`### ${i + 1}. ${personName(a.actor)}`, label];
    if (typeof a.date === "string" && a.date) head.push(a.date);
    lines.push(head.join(" · "));
    const changes = summarizeHistory(a.history);
    if (changes) lines.push(`- 变更: ${changes}`);
    if (typeof a.comment === "string") {
      const text = stepsToText(a.comment, baseUrl, replacements);
      if (text) lines.push(text);
    }
  });
  return lines;
}