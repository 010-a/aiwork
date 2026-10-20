import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { dataDirectory } from "./paths";
import type { Command } from "../src/commands";
let connection: { port: number; token: string } | undefined;
async function connect(autoStart = true) {
  const tryRead = async () => {
    const c = JSON.parse(
      await readFile(path.join(dataDirectory(), "connection.json"), "utf8"),
    );
    if (
      !Number.isInteger(c.port) ||
      c.port < 1 ||
      c.port > 65535 ||
      typeof c.token !== "string"
    )
      throw new Error("连接信息无效");
    const result = await fetch(`http://127.0.0.1:${c.port}/api/health`, {
      signal: AbortSignal.timeout(1000),
    });
    if (!result.ok || (await result.json()).app !== "zhixingban")
      throw new Error("未找到知行办服务");
    connection = c;
  };
  try {
    await tryRead();
    return;
  } catch {
    /* Start the same service for headless agents. */
  }
  if (!autoStart) throw new Error("本地服务未运行");
  const main = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../main.mjs",
  );
  // The client is normally emitted into chunks/, while direct entry output can be beside main.
  const entry = await readFile(main)
    .then(() => main)
    .catch(() =>
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), "main.mjs"),
    );
  const child = spawn(process.execPath, [entry], {
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();
  for (let i = 0; i < 40; i++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    try {
      await tryRead();
      return;
    } catch {
      /* Wait for the loopback service. */
    }
  }
  throw new Error(
    "本地服务未启动。请先双击 start.cmd；检查端口和数据目录是否一致。",
  );
}
export async function api(
  pathname: string,
  options: RequestInit = {},
  autoStart = true,
) {
  if (!connection) await connect(autoStart);
  const result = await fetch(
    `http://127.0.0.1:${connection!.port}/api/${pathname}`,
    {
      ...options,
      headers: {
        "content-type": "application/json",
        "x-zhixingban-token": connection!.token,
        ...options.headers,
      },
      signal: AbortSignal.timeout(15000),
    },
  );
  const body = await result.json();
  if (!result.ok) throw new Error(body.error || `HTTP ${result.status}`);
  return body;
}
export async function command(
  value: Command,
  actor: "cli" | "mcp",
  expectedRevision?: number,
) {
  return api("command", {
    method: "POST",
    body: JSON.stringify({ command: value, actor, expectedRevision }),
  });
}
