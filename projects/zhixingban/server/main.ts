import http from "node:http";
import { readFile, mkdir, writeFile, open, unlink } from "node:fs/promises";
import path from "node:path";
import { unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { timingSafeEqual } from "node:crypto";
import { dataDirectory } from "./paths";
import { LocalRepository, ConflictError } from "./repository";
import { getAlerts } from "../src/alerts";
import { getPrinciples } from "../src/principles";
import { todayKey } from "../src/dates";
const directory = dataDirectory();
const port = Number(process.env.ZHIXINGBAN_PORT || 5173);
const repository = new LocalRepository(directory);
const token = crypto.randomUUID() + crypto.randomUUID();
let ownsLock = false;
const lockFile = path.join(directory, "service.lock");
const staticRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../dist",
);
const origins = new Set([`http://127.0.0.1:${port}`, "http://127.0.0.1:5173"]);
const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
};
const server = http.createServer(async (req, res) => {
  const json = (status: number, value: unknown) => {
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
    res.end(JSON.stringify(value));
  };
  try {
    if (
      !req.headers.host ||
      !new Set([`127.0.0.1:${port}`, "127.0.0.1:5173"]).has(req.headers.host)
    )
      return json(403, { error: "访问地址不允许" });
    if (
      (req.headers.origin && !origins.has(req.headers.origin)) ||
      req.headers["sec-fetch-site"] === "cross-site"
    )
      return json(403, { error: "仅允许本地应用访问" });
    const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
    if (url.pathname.startsWith("/api/")) {
      if (url.pathname === "/api/health" && req.method === "GET")
        return json(200, { app: "zhixingban", version: "1.4.0" });
      if (url.pathname === "/api/session" && req.method === "GET")
        return json(200, { token, directory });
      const supplied = req.headers["x-zhixingban-token"];
      if (
        typeof supplied !== "string" ||
        supplied.length !== token.length ||
        !timingSafeEqual(Buffer.from(supplied), Buffer.from(token))
      )
        return json(401, { error: "需要本机访问凭据" });
      let body: Record<string, unknown> = {};
      if (req.method === "POST" || req.method === "PUT") {
        if (!req.headers["content-type"]?.startsWith("application/json"))
          return json(415, { error: "请使用 JSON 请求" });
        let raw = "";
        for await (const chunk of req) {
          raw += chunk;
          if (Buffer.byteLength(raw) > 32 * 1024 * 1024)
            return json(413, { error: "请求超过 32 MB" });
        }
        body = JSON.parse(raw || "{}");
        if (!body || typeof body !== "object" || Array.isArray(body))
          return json(400, { error: "请求应为对象" });
      }
      if (url.pathname === "/api/shutdown" && req.method === "POST") {
        json(200, { ok: true });
        setTimeout(() => server.close(() => process.exit(0)), 50);
        return;
      }
      if (url.pathname === "/api/recover" && req.method === "POST")
        return json(200, await repository.recover(body.data));
      if (url.pathname === "/api/state" && req.method === "GET")
        return json(200, await repository.read());
      if (url.pathname === "/api/state" && req.method === "PUT") {
        if (
          !Number.isSafeInteger(body.expectedRevision) ||
          Number(body.expectedRevision) < 0
        )
          return json(400, { error: "缺少有效的数据版本" });
        return json(
          200,
          await repository.replace(
            body.data,
            Number(body.expectedRevision),
            typeof body.label === "string"
              ? body.label.slice(0, 100)
              : "界面修改",
          ),
        );
      }
      if (url.pathname === "/api/command" && req.method === "POST") {
        const expected = body.expectedRevision;
        if (
          expected !== undefined &&
          (!Number.isSafeInteger(expected) || Number(expected) < 0)
        )
          return json(400, { error: "数据版本无效" });
        if (
          !body.command ||
          typeof body.command !== "object" ||
          Array.isArray(body.command)
        )
          return json(400, { error: "缺少操作" });
        return json(
          200,
          await repository.command(
            body.command as { type: string },
            body.actor === "mcp" ? "mcp" : "cli",
            expected as number | undefined,
          ),
        );
      }
      if (url.pathname === "/api/insights" && req.method === "GET") {
        const snapshot = await repository.read();
        return json(200, {
          revision: snapshot.revision,
          today: todayKey(),
          alerts: getAlerts(snapshot.data, todayKey()),
          principles: getPrinciples(snapshot.data),
        });
      }
      if (url.pathname === "/api/backups" && req.method === "GET")
        return json(200, { backups: await repository.backups() });
      if (url.pathname === "/api/backups" && req.method === "POST") {
        await repository.backup();
        return json(200, { ok: true });
      }
      if (url.pathname.startsWith("/api/backups/") && req.method === "GET")
        return json(200, {
          data: await repository.readBackup(
            decodeURIComponent(url.pathname.slice(13)),
          ),
        });
      return json(404, { error: "接口不存在" });
    }
    if (req.method !== "GET" && req.method !== "HEAD")
      return json(405, { error: "方法不支持" });
    const pathname = decodeURIComponent(url.pathname);
    const file = path.resolve(
      staticRoot,
      "." + (pathname === "/" ? "/index.html" : pathname),
    );
    if (!file.startsWith(staticRoot + path.sep))
      return json(403, { error: "路径不允许" });
    const content = await readFile(file);
    res.writeHead(200, {
      "content-type": mime[path.extname(file)] || "application/octet-stream",
      "cache-control": file.endsWith("index.html")
        ? "no-cache"
        : "public, max-age=3600",
      "x-content-type-options": "nosniff",
    });
    res.end(req.method === "HEAD" ? undefined : content);
  } catch (error) {
    json(
      error instanceof ConflictError
        ? 409
        : (error as NodeJS.ErrnoException).code === "ENOENT"
          ? 404
          : 400,
      { error: error instanceof Error ? error.message : "操作失败" },
    );
  }
});
server.on("error", (error) => {
  console.error(`知行办服务启动失败：${error.message}`);
  process.exitCode = 1;
});
await mkdir(directory, { recursive: true, mode: 0o700 });
async function lockDirectory() {
  try {
    const handle = await open(lockFile, "wx", 0o600);
    await handle.writeFile(JSON.stringify({ pid: process.pid, port }));
    await handle.close();
    ownsLock = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    let saved;
    try {
      saved = JSON.parse(await readFile(lockFile, "utf8"));
    } catch {
      throw new Error(
        "数据目录正被其他服务打开，或锁文件损坏。请先停止旧启动窗口。",
      );
    }
    if (!Number.isInteger(saved.pid) || saved.pid < 1)
      throw new Error("锁文件无效，请先停止旧服务并检查数据目录。");
    try {
      process.kill(saved.pid, 0);
    } catch (reason) {
      if ((reason as NodeJS.ErrnoException).code === "ESRCH") {
        await unlink(lockFile);
        return lockDirectory();
      }
      throw reason;
    }
    throw new Error(
      "知行办已在运行，请使用原启动窗口。一个数据目录只能启动一个服务。",
    );
  }
}
await lockDirectory();
process.on("exit", () => {
  if (ownsLock) {
    try {
      unlinkSync(lockFile);
    } catch {
      /* Process exit must not hang. */
    }
  }
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => server.close(() => process.exit(0)));
server.listen(port, "127.0.0.1", async () => {
  await writeFile(
    path.join(directory, "connection.json"),
    JSON.stringify({ port, token }),
    { mode: 0o600 },
  );
  console.log(`知行办 http://127.0.0.1:${port} · 本地数据：${directory}`);
});
