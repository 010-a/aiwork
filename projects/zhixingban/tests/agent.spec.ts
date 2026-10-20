import { test, expect } from "@playwright/test";
import { spawn, execFile, type ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
const execute = promisify(execFile);
const port = 5186,
  origin = `http://127.0.0.1:${port}`;
let directory: string, service: ChildProcess, token: string;
let environment: NodeJS.ProcessEnv;
async function api(route: string, options: RequestInit = {}) {
  const result = await fetch(`${origin}/api/${route}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      "x-zhixingban-token": token,
      ...options.headers,
    },
  });
  const value = await result.json();
  if (!result.ok) throw new Error(value.error);
  return value;
}
async function cli(action: string, value: unknown) {
  const file = path.join(directory, `input-${crypto.randomUUID()}.json`);
  await writeFile(file, JSON.stringify(value));
  const { stdout } = await execute(
    process.execPath,
    ["service-dist/cli.mjs", action, "--file", file],
    { env: environment },
  );
  return JSON.parse(stdout);
}
test.beforeAll(async () => {
  const temporaryRoot = path.resolve("work/service-tests");
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(path.join(temporaryRoot, "instance-"));
  environment = {
    ...process.env,
    ZHIXINGBAN_DATA_DIR: directory,
    ZHIXINGBAN_PORT: String(port),
    TZ: "Asia/Shanghai",
  };
  service = spawn(process.execPath, ["service-dist/main.mjs"], {
    env: environment,
    stdio: "pipe",
  });
  let output = "";
  service.stderr?.on("data", (data) => {
    output += data;
  });
  for (let i = 0; i < 100; i++) {
    try {
      const health = await fetch(`${origin}/api/health`);
      if (health.ok) break;
    } catch {
      /* Startup */
    }
    if (service.exitCode !== null) throw new Error(`服务启动失败：${output}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  token = (await (await fetch(`${origin}/api/session`)).json()).token;
});
test.afterAll(async () => {
  if (directory) {
    await execute(process.execPath, ["service-dist/cli.mjs", "stop"], {
      env: environment,
    }).catch(() => undefined);
  }
  if (service?.exitCode === null) {
    const ended = new Promise((resolve) => service.once("exit", resolve));
    service.kill("SIGTERM");
    await ended;
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});
test("旧浏览器数据迁移到文件，刷新和新浏览器共享内容，原数据保留", async ({
  page,
  browser,
}) => {
  await page.route("**/api/session", (route) =>
    route.fulfill({ status: 404, body: "{}" }),
  );
  await page.goto(origin);
  await page.keyboard.press("Control+j");
  await page.getByLabel("新任务标题").fill("迁移前的真实记录");
  await page.getByLabel("新任务标题").press("Enter");
  await expect(
    page.getByText("已保存到本机浏览器", { exact: true }),
  ).toBeVisible();
  await page.unroute("**/api/session");
  await page.reload();
  await expect(
    page.getByText("已保存到本机文件", { exact: true }),
  ).toBeVisible();
  expect((await api("state")).data.tasks[0].title).toBe("迁移前的真实记录");
  const context = await browser.newContext();
  const other = await context.newPage();
  await other.goto(origin);
  await other
    .getByRole("navigation")
    .getByRole("button", { name: /^收集箱/ })
    .click();
  await expect(
    other.getByRole("button", { name: "查看 迁移前的真实记录", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "数据与备份", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "导出浏览器旧数据（原记录保留）" }),
  ).toBeVisible();
  await context.close();
});
test("CLI 与 MCP 写入同一份数据，界面自动更新，完成流转与备份一致", async ({
  page,
}) => {
  test.slow();
  await page.goto(origin);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: /^收集箱/ })
    .click();
  const project = await cli("apply", {
    type: "project.add",
    patch: { title: "Agent 实验" },
  });
  const projectId = project.created.projects[0].id;
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const added = await cli("apply", {
    type: "task.add",
    title: "Agent 新增任务",
    patch: {
      projectId,
      inbox: false,
      plannedDate: today,
      nextAction: "检查样本质量",
    },
  });
  const id = added.created.tasks[0].id;
  await page
    .getByRole("navigation")
    .getByRole("button", { name: /^今日执行/ })
    .click();
  await expect(
    page.locator(".task-row").filter({ hasText: "Agent 新增任务" }),
  ).toBeVisible({ timeout: 15000 });
  const mcp = spawn(process.execPath, ["service-dist/mcp.mjs"], {
    env: environment,
    stdio: "pipe",
  });
  let buffer = "";
  let sequence = 0;
  const replies = new Map<number, (v: any) => void>();
  mcp.stdout!.on("data", (data) => {
    buffer += String(data);
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const item = JSON.parse(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      replies.get(item.id)?.(item);
      replies.delete(item.id);
    }
  });
  const rpc = (method: string, params: unknown = {}) =>
    new Promise<any>((resolve, reject) => {
      const n = ++sequence;
      const timeout = setTimeout(
        () => reject(new Error("MCP 请求超时")),
        15000,
      );
      replies.set(n, (value) => {
        clearTimeout(timeout);
        resolve(value);
      });
      mcp.stdin!.write(
        JSON.stringify({ jsonrpc: "2.0", id: n, method, params }) + "\n",
      );
    });
  try {
    expect(
      (
        await rpc("initialize", {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test", version: "1" },
        })
      ).result.serverInfo.name,
    ).toBe("zhixingban");
    expect((await rpc("tools/list")).result.tools).toHaveLength(3);
    const recorded = await rpc("tools/call", {
      name: "zhixingban_apply",
      arguments: {
        command: {
          type: "progress.record",
          target: { type: "task", id },
          note: "代表性样本验证完成，未发现改进",
        },
      },
    });
    expect(recorded.result.isError).toBeUndefined();
    await rpc("tools/call", {
      name: "zhixingban_apply",
      arguments: {
        command: {
          type: "principle.save",
          principle: {
            id: "agent-principle",
            title: "验证后再扩大样本",
            description: "批量处理前先验证",
            scope: "all",
            condition: "manual",
            days: 0,
            unit: "calendar",
            action: "检查代表样本",
            enabled: true,
          },
        },
      },
    });
    await cli("apply", { type: "task.update", id, patch: { status: "done" } });
    await expect(
      page.locator(".task-row.is-done").filter({ hasText: "Agent 新增任务" }),
    ).toBeVisible({ timeout: 15000 });
    const review = await cli("query", { resource: "review" });
    expect(review.completed.some((t: { id: string }) => t.id === id)).toBe(
      true,
    );
    expect(
      review.results.some((e: { note: string }) =>
        e.note.includes("未发现改进"),
      ),
    ).toBe(true);
    await cli("apply", {
      type: "task.update",
      id,
      patch: { plannedDate: null, estimatedMinutes: null },
    });
    expect(
      (await cli("query", { resource: "tasks", id })).items[0].plannedDate,
    ).toBeUndefined();
    await cli("backup", {});
    const backups = (await api("backups")).backups;
    expect(backups.length).toBeGreaterThan(1);
    const saved = (await api(`backups/${backups[0].id}`)).data;
    expect(
      saved.monitoring.principles.some(
        (p: { id: string }) => p.id === "agent-principle",
      ),
    ).toBe(true);
  } finally {
    mcp.kill("SIGTERM");
  }
});
test("接口拒绝跨站和未授权请求，陈旧快照不覆盖，数据目录禁止双开", async () => {
  expect((await fetch(`${origin}/api/state`)).status).toBe(401);
  expect(
    (
      await fetch(`${origin}/api/session`, {
        headers: { Origin: "https://example.com" },
      })
    ).status,
  ).toBe(403);
  const old = await api("state");
  await cli("apply", { type: "task.add", title: "并发保护" });
  const stale = await fetch(`${origin}/api/state`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "x-zhixingban-token": token,
    },
    body: JSON.stringify({ data: old.data, expectedRevision: old.revision }),
  });
  expect(stale.status).toBe(409);
  await expect(
    execute(process.execPath, ["service-dist/main.mjs"], {
      env: { ...environment, ZHIXINGBAN_PORT: "5187" },
    }),
  ).rejects.toThrow();
  expect(
    (await api("state")).data.tasks.some(
      (t: { title: string }) => t.title === "并发保护",
    ),
  ).toBe(true);
});

test("无法读取的数据可明确从快照恢复，原文件保留", async ({ page }) => {
  await api("backups", { method: "POST", body: "{}" });
  await api("shutdown", { method: "POST", body: "{}" });
  if (service.exitCode === null)
    await new Promise((resolve) => service.once("exit", resolve));
  await writeFile(path.join(directory, "data.json"), "original-corrupt-file");
  service = spawn(process.execPath, ["service-dist/main.mjs"], {
    env: environment,
    stdio: "pipe",
  });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${origin}/api/health`)).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  token = (await (await fetch(`${origin}/api/session`)).json()).token;
  await page.goto(origin);
  await expect(page.locator(".error-banner")).toContainText("无法读取");
  await page.getByRole("button", { name: "数据与备份", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .locator(".backup-snapshot")
    .first()
    .getByRole("button", { name: "恢复", exact: true })
    .click();
  await expect(
    page.getByText("已保存到本机文件", { exact: true }),
  ).toBeVisible();
  expect((await api("state")).data.tasks.length).toBeGreaterThan(0);
  const { readdir, readFile } = await import("node:fs/promises");
  const original = (await readdir(path.join(directory, "recovery")))[0];
  expect(
    await readFile(path.join(directory, "recovery", original), "utf8"),
  ).toBe("original-corrupt-file");
});

test("浏览器关闭后 CLI 可以自动启动同一服务，并可显式停止后台服务", async ({
  page,
}) => {
  test.slow();
  await page.goto(origin);
  await page.close();
  await api("shutdown", { method: "POST", body: "{}" });
  if (service.exitCode === null)
    await new Promise((resolve) => service.once("exit", resolve));
  const result = await cli("apply", {
    type: "task.add",
    title: "后台维护记录",
  });
  expect(result.created.tasks[0].title).toBe("后台维护记录");
  const queried = await cli("query", {
    resource: "tasks",
    search: "后台维护记录",
  });
  expect(queried.items).toHaveLength(1);
  const session = await (await fetch(`${origin}/api/session`)).json();
  token = session.token;
  await api("shutdown", { method: "POST", body: "{}" });
  for (let i = 0; i < 40; i++) {
    try {
      await fetch(`${origin}/api/health`);
    } catch {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
});
