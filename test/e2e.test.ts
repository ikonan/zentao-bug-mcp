import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startMockZenTao } from "./mock-zentao.mjs";
import { ZenTaoClient } from "../src/client.js";
import { buildBugReport } from "../src/get-bug.js";
import type { Config } from "../src/config.js";

async function setup(password = "pass123") {
  const mock = await startMockZenTao();
  const downloadDir = await fs.mkdtemp(path.join(os.tmpdir(), "zentao-mcp-test-"));
  const cfg: Config = {
    baseUrl: mock.url,
    account: "dev",
    password,
    downloadDir,
    insecureTls: false,
  };
  const client = new ZenTaoClient(cfg);
  return { mock, cfg, client, downloadDir };
}

test("完整链路：链接 → 标题/步骤/图片/附件", async () => {
  const { mock, cfg, client, downloadDir } = await setup();
  try {
    const report = await buildBugReport(client, cfg, { bug: `${mock.url}/bug-view-123.html` });
    assert.ok(report.startsWith("# Bug #123: 登录页验证码不刷新"), report);
    assert.ok(report.includes("严重程度: 2（严重）"));
    assert.ok(report.includes("张三"));
    assert.ok(report.includes("验证码没有变化"));
    assert.ok(report.includes("![img-501.png]"));
    assert.ok(report.includes("![img-502.png]"));
    const dir = path.join(downloadDir, "bug-123");
    for (const f of ["img-501.png", "img-502.png", "503-日志.txt"]) {
      const stat = await fs.stat(path.join(dir, f));
      assert.ok(stat.size > 0, f);
    }
    assert.ok(report.includes("## 附件"));
    assert.ok(!report.includes("下载失败"));
    assert.ok(report.includes("## 评论与动态"));
    assert.ok(report.includes("复现了，见截图"));
    assert.ok(report.includes("wangwu"));
    assert.ok(report.includes("解决方案: (空) → fixed"));
    assert.ok(report.includes("![img-601.png]"));
    assert.ok(
      report.indexOf("## 重现步骤") < report.indexOf("## 评论与动态") &&
        report.indexOf("## 评论与动态") < report.indexOf("## 附件"),
      report
    );
    const stat601 = await fs.stat(path.join(dir, "img-601.png"));
    assert.ok(stat601.size > 0);
    // steps 两处 + 评论一处同 fileID=501（不同 href）→ 只下载一次
    assert.equal(mock.state.fileHits["501"], 1);
  } finally {
    await mock.close();
  }
});

test("includeComments=false：无评论段落、评论图不下载", async () => {
  const { mock, cfg, client, downloadDir } = await setup();
  try {
    const report = await buildBugReport(client, cfg, { bug: "123", includeComments: false });
    assert.ok(!report.includes("## 评论与动态"));
    assert.ok(!report.includes("复现了"));
    await assert.rejects(fs.stat(path.join(downloadDir, "bug-123", "img-601.png")));
    const stat501 = await fs.stat(path.join(downloadDir, "bug-123", "img-501.png"));
    assert.ok(stat501.size > 0);
  } finally {
    await mock.close();
  }
});

test("Record 形态 actions：无 fileID 图 fallback 命名、评论失效图占位", async () => {
  const { mock, cfg, client, downloadDir } = await setup();
  try {
    const report = await buildBugReport(client, cfg, { bug: "125" });
    assert.ok(report.includes("## 评论与动态"));
    assert.ok(report.includes("tester · 激活"));
    assert.ok(report.includes("还有问题"));
    assert.ok(report.includes("![img-1.png]"));
    const stat = await fs.stat(path.join(downloadDir, "bug-125", "img-1.png"));
    assert.ok(stat.size > 0);
    assert.ok(report.includes("图片下载失败"));
    assert.ok(report.includes("⚠️ 1 个文件下载失败"));
  } finally {
    await mock.close();
  }
});

test("纯 ID 输入 + 不下载附件", async () => {
  const { mock, cfg, client, downloadDir } = await setup();
  try {
    const report = await buildBugReport(client, cfg, { bug: "123", downloadAttachments: false });
    assert.ok(report.includes("# Bug #123"));
    assert.ok(!report.includes("## 附件"));
    await assert.rejects(fs.stat(path.join(downloadDir, "bug-123", "503-日志.txt")));
  } finally {
    await mock.close();
  }
});

test("密码错误给出明确提示", async () => {
  const { mock, cfg, client } = await setup("wrong-pass");
  try {
    await assert.rejects(buildBugReport(client, cfg, { bug: "123" }), /账号或密码错误/);
  } finally {
    await mock.close();
  }
});

test("token 过期后自动重新登录重试", async () => {
  const { mock, cfg, client } = await setup();
  try {
    await buildBugReport(client, cfg, { bug: "123" });
    mock.state.validTokens.clear();
    const report = await buildBugReport(client, cfg, { bug: "123" });
    assert.ok(report.includes("# Bug #123"));
  } finally {
    await mock.close();
  }
});

test("单张图片 404 不影响整体", async () => {
  const { mock, cfg, client } = await setup();
  try {
    const report = await buildBugReport(client, cfg, { bug: "124" });
    assert.ok(report.includes("# Bug #124: 含失效截图的 bug"));
    assert.ok(report.includes("步骤一"));
    assert.ok(report.includes("步骤二"));
    assert.ok(report.includes("图片下载失败"));
    assert.ok(report.includes("⚠️ 1 个文件下载失败"));
    assert.ok(!report.includes("## 评论与动态"));
  } finally {
    await mock.close();
  }
});

test("REST API 关闭（302 到登录页）给出明确提示", async () => {
  const { mock, cfg, client } = await setup();
  mock.state.restEnabled = false;
  try {
    await assert.rejects(buildBugReport(client, cfg, { bug: "123" }), /REST API v1 不可用/);
  } finally {
    await mock.close();
  }
});

test("bug 不存在", async () => {
  const { mock, cfg, client } = await setup();
  try {
    await assert.rejects(buildBugReport(client, cfg, { bug: "999" }), /不存在或当前账号无权限/);
  } finally {
    await mock.close();
  }
});

test("host 不一致拒绝发送凭据", async () => {
  const { mock, cfg, client } = await setup();
  try {
    await assert.rejects(
      buildBugReport(client, cfg, { bug: "http://evil.example.com/bug-view-123.html" }),
      /不一致/
    );
  } finally {
    await mock.close();
  }
});