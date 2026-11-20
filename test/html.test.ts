import { test } from "node:test";
import assert from "node:assert/strict";
import { extractImages, stepsToText } from "../src/html.js";

const BASE = "http://127.0.0.1:8080/zentao";

test("提取两种形态的内嵌图片并补全相对路径", () => {
  const html =
    '<p><img src="/zentao/index.php?m=file&f=read&fileID=501" /></p>' +
    '<p><img src="file-read-502.png" /></p>';
  const imgs = extractImages(html, BASE);
  assert.equal(imgs.length, 2);
  assert.equal(imgs[0].fileID, "501");
  assert.equal(imgs[0].absoluteUrl, "http://127.0.0.1:8080/zentao/index.php?m=file&f=read&fileID=501");
  assert.equal(imgs[1].fileID, "502");
  assert.equal(imgs[1].absoluteUrl, "http://127.0.0.1:8080/zentao/file-read-502.png");
});

test("重复图片去重、外链和 data URI 跳过", () => {
  const html =
    '<img src="file-read-502.png" /><img src="file-read-502.png" />' +
    '<img src="https://external.example.com/a.png" /><img src="data:image/png;base64,xxx" />';
  const imgs = extractImages(html, BASE);
  assert.equal(imgs.length, 1);
  assert.equal(imgs[0].fileID, "502");
});

test("stepsToText 保留图片位置、解码实体、处理换行", () => {
  const html =
    '<p>第一步&nbsp;打开页面</p><p>点击<img src="file-read-502.png" />按钮</p><p>行一<br>行二</p><ul><li>要点A</li><li>要点B</li></ul>';
  const replacements = new Map([["http://127.0.0.1:8080/zentao/file-read-502.png", "![img](/tmp/img-502.png)"]]);
  const text = stepsToText(html, BASE, replacements);
  assert.ok(text.includes("第一步 打开页面"));
  assert.ok(text.includes("点击![img](/tmp/img-502.png)按钮"));
  assert.ok(text.includes("行一\n行二"));
  assert.ok(text.includes("- 要点A"));
  assert.ok(text.includes("- 要点B"));
});

test("真实禅道 22.4 的 img 形态（onload 属性 + t=png 参数）", () => {
  const html =
    '<p>[结果]</p><p><img onload="setImageSize(this,0)" src="/zentao/index.php?m=file&f=read&t=png&fileID=181317" alt="file-read-181317.png" /></p><p>[期望]</p>';
  const imgs = extractImages(html, BASE);
  assert.equal(imgs.length, 1);
  assert.equal(imgs[0].fileID, "181317");
  const text = stepsToText(html, BASE, new Map([[imgs[0].key, "![img](/tmp/img-181317.png)"]]));
  assert.ok(text.includes("[结果]"));
  assert.ok(text.includes("![img](/tmp/img-181317.png)"));
  assert.ok(text.includes("[期望]"));
});

test("未替换的图片保留原 URL 占位", () => {
  const text = stepsToText('<p><img src="file-read-999.png" /></p>', BASE, new Map());
  assert.ok(text.includes("[图片: file-read-999.png]"));
});