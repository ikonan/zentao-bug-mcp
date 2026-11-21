import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeActions, collectCommentImages, renderTimeline } from "../src/actions.js";
import type { ZenTaoAction } from "../src/client.js";

const BASE = "http://127.0.0.1:8080/zentao";

test("normalizeActions：数组/Record/空值/垃圾条目", () => {
  const a: ZenTaoAction = { id: "1", action: "opened", date: "2026-01-01 10:00:00" };
  const b: ZenTaoAction = { id: "2", action: "commented", date: "2026-01-02 10:00:00" };
  assert.deepEqual(normalizeActions([a, b]), [a, b]);
  assert.deepEqual(normalizeActions({ "1": a, "2": b }), [a, b]);
  assert.deepEqual(normalizeActions(undefined), []);
  assert.deepEqual(normalizeActions(null), []);
  assert.deepEqual(normalizeActions([null, "x", a]), [a]);
});

test("normalizeActions：乱序按 date 排序，date 缺失保持原序", () => {
  const late: ZenTaoAction = { id: "9", date: "2026-02-01 00:00:00" };
  const early: ZenTaoAction = { id: "1", date: "2026-01-01 00:00:00" };
  assert.deepEqual(normalizeActions([late, early]), [early, late]);
  const noDate1: ZenTaoAction = { action: "opened" };
  const noDate2: ZenTaoAction = { action: "edited" };
  assert.deepEqual(normalizeActions([noDate1, noDate2]), [noDate1, noDate2]);
});

test("collectCommentImages：提取评论图片，空评论返回空", () => {
  const actions: ZenTaoAction[] = [
    { comment: '<img src="/zentao/index.php?m=file&f=read&t=png&fileID=601" />' },
    { comment: "<br />" },
    { comment: 123 },
    {},
  ];
  const imgs = collectCommentImages(actions, BASE);
  assert.equal(imgs.length, 1);
  assert.equal(imgs[0].fileID, "601");
});

test("renderTimeline：动作映射、history 摘要、空评论只留标题", () => {
  const actions: ZenTaoAction[] = [
    {
      actor: "lisi",
      action: "opened",
      date: "2026-01-01 10:00:00",
      comment: "<br />",
      history: [],
    },
    {
      actor: { account: "yangxuan", realname: "杨轩" },
      action: "resolved",
      date: "2026-01-02 10:00:00",
      comment: "<br />",
      history: [
        { field: "resolution", old: "", new: "fixed", fieldName: "解决方案" },
        { field: "steps", old: "<p>a</p>", new: "<p>b</p>" },
        { field: "status", old: "active", new: "resolved", fieldName: "Bug状态" },
      ],
    },
    { actor: "", action: "weirdaction", comment: "<p>补充说明</p>" },
  ];
  const lines = renderTimeline(actions, BASE, new Map());
  const text = lines.join("\n");
  assert.ok(text.includes("### 1. lisi · 创建 · 2026-01-01 10:00:00"), text);
  assert.ok(text.includes("### 2. 杨轩 · 解决"), text);
  assert.ok(text.includes("- 变更: 解决方案: (空) → fixed；Bug状态: active → resolved"), text);
  assert.ok(!text.includes("steps"), text);
  assert.ok(text.includes("### 3. - · weirdaction"), text);
  assert.ok(text.includes("补充说明"), text);
  assert.equal(lines.filter((l) => l.startsWith("### ")).length, 3);
});

test("renderTimeline：评论图片用 replacements 本地化，fieldName 缺失回退 field", () => {
  const href = `${BASE}/index.php?m=file&f=read&t=png&fileID=601`;
  const replacements = new Map([[href, "![img-601.png](/tmp/img-601.png)"]]);
  const actions: ZenTaoAction[] = [
    {
      actor: "wangwu",
      action: "commented",
      comment: `<p>复现了<img src="${href}" /></p>`,
      history: { "1": { field: "pri", old: "3", new: "1" } },
    },
  ];
  const text = renderTimeline(actions, BASE, replacements).join("\n");
  assert.ok(text.includes("复现了![img-601.png](/tmp/img-601.png)"), text);
  assert.ok(text.includes("- 变更: pri: 3 → 1"), text);
});

test("renderTimeline：长 HTML 值去标签并截断", () => {
  const long = "<p>" + "字".repeat(100) + "</p>";
  const actions: ZenTaoAction[] = [
    { action: "edited", history: [{ field: "title", old: long, new: "新标题", fieldName: "标题" }] },
  ];
  const text = renderTimeline(actions, BASE, new Map()).join("\n");
  assert.ok(text.includes("标题: " + "字".repeat(80) + "… → 新标题"), text);
  assert.ok(!text.includes("<p>"), text);
});