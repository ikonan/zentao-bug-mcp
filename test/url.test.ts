import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBugId } from "../src/url.js";

const BASE = "http://192.168.1.100/zentao";

test("纯数字 ID", () => {
  assert.equal(parseBugId("92535", BASE), 92535);
  assert.equal(parseBugId("  92535  ", BASE), 92535);
});

test("PATH_INFO 风格链接（真实样例）", () => {
  assert.equal(parseBugId("http://192.168.1.100/zentao/bug-view-92535.html", BASE), 92535);
  assert.equal(parseBugId("http://192.168.1.100/zentao/bug-view-92535", BASE), 92535);
});

test("GET 风格链接", () => {
  assert.equal(parseBugId("http://192.168.1.100/zentao/index.php?m=bug&f=view&bugID=92535", BASE), 92535);
  assert.equal(parseBugId("http://192.168.1.100/zentao/index.php?m=bug&f=view&id=123", BASE), 123);
});

test("host 不一致时拒绝", () => {
  assert.throws(
    () => parseBugId("http://evil.example.com/zentao/bug-view-92535.html", BASE),
    /不一致/
  );
});

test("非法输入报错", () => {
  assert.throws(() => parseBugId("不是链接", BASE), /无法识别/);
  assert.throws(() => parseBugId("http://192.168.1.100/zentao/my-work-bug.html", BASE), /未找到 bug ID/);
});