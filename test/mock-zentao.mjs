import http from "node:http";

const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

const bug123 = {
  id: 123,
  title: "登录页验证码不刷新",
  severity: 2,
  pri: 3,
  status: "active",
  assignedTo: { account: "zhangsan", realname: "张三" },
  openedBy: "lisi",
  productID: 5,
  steps:
    '<p>1. 打开登录页</p><p>2. 点击验证码图片<img onload="setImageSize(this,0)" src="/zentao/index.php?m=file&f=read&t=png&fileID=501" alt="file-read-501.png" /></p>' +
    "<p>验证码没有变化&nbsp;再试一次</p><p><img src=\"file-read-502.png\" /></p>" +
    '<p><img src="/zentao/index.php?m=file&f=read&t=png&fileID=501" /></p>',
  files: [{ id: 503, title: "日志.txt", pathname: "202611/abc.txt", extension: "txt", size: 100 }],
  actions: [
    { id: "1", actor: "lisi", action: "opened", date: "2026-11-01 09:00:00", comment: "<br />", history: [] },
    {
      id: "2",
      actor: "wangwu",
      action: "commented",
      date: "2026-11-02 10:00:00",
      comment: '<p>复现了，见截图<img src="/zentao/index.php?m=file&f=read&t=png&fileID=601" /></p>',
      history: [],
    },
    {
      id: "3",
      actor: "zhangsan",
      action: "edited",
      date: "2026-11-03 10:00:00",
      comment: '<p>补充说明<img src="file-read-501.png" /></p>',
      history: [],
    },
    {
      id: "4",
      actor: "yangxuan",
      action: "resolved",
      date: "2026-11-04 10:00:00",
      comment: "<br />",
      history: [
        { field: "resolution", old: "", new: "fixed", fieldName: "解决方案" },
        { field: "status", old: "active", new: "resolved", fieldName: "状态" },
      ],
    },
  ],
};

const bug124 = {
  id: 124,
  title: "含失效截图的 bug",
  severity: 3,
  pri: 3,
  status: "active",
  steps: '<p>步骤一</p><p><img src="/zentao/file-read-999.png" /></p><p>步骤二</p>',
  files: [],
};

const bug125 = {
  id: 125,
  title: "Record 形态 actions 的 bug",
  severity: 3,
  pri: 3,
  status: "active",
  steps: "<p>步骤</p>",
  files: [],
  actions: {
    "1": {
      id: "1",
      actor: "tester",
      action: "activated",
      date: "2026-11-05 10:00:00",
      comment: '<p>还有问题<img src="/zentao/data/upload/1/x.png" /></p>',
      history: [],
    },
    "2": {
      id: "2",
      actor: "tester",
      action: "commented",
      date: "2026-11-06 10:00:00",
      comment: '<p>失效图<img src="/zentao/index.php?m=file&f=read&t=png&fileID=999" /></p>',
      history: [],
    },
  },
};

export async function startMockZenTao() {
  const state = {
    validTokens: new Set(),
    restEnabled: true,
    tokenCounter: 0,
    fileHits: {},
  };
  const hit = (id) => {
    state.fileHits[id] = (state.fileHits[id] ?? 0) + 1;
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    const p = url.pathname;
    const json = (status, obj) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(obj));
    };
    const toLogin = () => {
      res.writeHead(302, { location: "/zentao/user-login.html" });
      res.end();
    };

    if (p === "/zentao/api.php/v1/tokens" && req.method === "POST") {
      if (!state.restEnabled) return toLogin();
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        let parsed = {};
        try {
          parsed = JSON.parse(body || "{}");
        } catch {}
        const { account, password } = parsed;
        if (account === "dev" && password === "pass123") {
          const token = `mock-sid-${++state.tokenCounter}`;
          state.validTokens.add(token);
          return json(201, { token });
        }
        return json(400, { error: "账号或密码不正确" });
      });
      return;
    }

    const bugMatch = p.match(/^\/zentao\/api\.php\/v1\/bugs\/(\d+)$/);
    if (bugMatch) {
      if (!state.restEnabled) return toLogin();
      const token = req.headers["token"];
      if (!state.validTokens.has(token)) return json(401, { error: "Not login" });
      const id = Number(bugMatch[1]);
      if (id === 123) return json(200, bug123);
      if (id === 124) return json(200, bug124);
      if (id === 125) return json(200, bug125);
      return json(404, { error: "Bug not found" });
    }

    const restFile = p.match(/^\/zentao\/api\.php\/v1\/files\/(\d+)$/);
    if (restFile) {
      if (!state.restEnabled) return toLogin();
      const token = req.headers["token"];
      if (!state.validTokens.has(token)) return json(401, { error: "Not login" });
      const id = restFile[1];
      hit(id);
      if (id === "999") return json(404, { error: "File not found" });
      if (id === "503") {
        res.writeHead(200, { "content-type": "text/plain" });
        return res.end("log content");
      }
      res.writeHead(200, { "content-type": "image/png" });
      return res.end(PNG_1x1);
    }

    const fileID = url.searchParams.get("fileID") ?? p.match(/file-read-(\d+)/)?.[1];
    if (fileID != null && (p === "/zentao/index.php" || /file-read-/.test(p))) {
      const cookie = req.headers.cookie ?? "";
      const sid = cookie.match(/zentaosid=([^;]+)/)?.[1] ?? url.searchParams.get("zentaosid");
      if (!state.validTokens.has(sid)) return toLogin();
      hit(fileID);
      if (fileID === "999") {
        res.writeHead(404, { "content-type": "text/plain" });
        return res.end("not found");
      }
      if (fileID === "503") {
        res.writeHead(200, { "content-type": "text/plain" });
        return res.end("log content");
      }
      res.writeHead(200, { "content-type": "image/png" });
      return res.end(PNG_1x1);
    }

    if (p.startsWith("/zentao/data/upload/")) {
      const cookie = req.headers.cookie ?? "";
      const sid = cookie.match(/zentaosid=([^;]+)/)?.[1] ?? url.searchParams.get("zentaosid");
      if (!state.validTokens.has(sid)) return toLogin();
      hit("upload:" + p);
      res.writeHead(200, { "content-type": "image/png" });
      return res.end(PNG_1x1);
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  return {
    url: `http://127.0.0.1:${port}/zentao`,
    state,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}