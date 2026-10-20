import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { LocalRepository, ConflictError } from "../server/repository";
const directories: string[] = [];
async function repo() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "zhixingban-test-"));
  directories.push(dir);
  return new LocalRepository(dir);
}
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});
describe("本地服务数据安全", () => {
  it("并行命令串行处理，重新打开与快照保留所有数据", async () => {
    const r = await repo();
    const receipts = await Promise.all([
      r.command({ type: "task.add", id: "a", title: "实验 A" }, "cli"),
      r.command({ type: "task.add", id: "b", title: "实验 B" }, "mcp"),
    ]);
    expect(receipts[0].created.tasks.map((t: { id: string }) => t.id)).toEqual([
      "a",
    ]);
    expect(receipts[1].created.tasks.map((t: { id: string }) => t.id)).toEqual([
      "b",
    ]);
    expect((await r.read()).data.tasks).toHaveLength(2);
    expect(
      (await new LocalRepository(r.directory).read()).data.tasks,
    ).toHaveLength(2);
    await r.backup();
    const backups = await r.backups();
    expect(backups.length).toBeGreaterThanOrEqual(2);
    expect((await r.readBackup(backups[0].id)).tasks).toHaveLength(2);
  });
  it("陈旧界面快照被拒绝，不覆盖 Agent 修改", async () => {
    const r = await repo(),
      before = await r.read();
    await r.command({ type: "task.add", id: "a", title: "Agent 录入" }, "mcp");
    await expect(
      r.replace(before.data, before.revision, "界面修改"),
    ).rejects.toBeInstanceOf(ConflictError);
    expect((await r.read()).data.tasks[0].title).toBe("Agent 录入");
  });
  it("导入替换前自动备份，结构错误不改变当前数据", async () => {
    const r = await repo();
    await r.command({ type: "task.add", id: "a", title: "原始任务" }, "cli");
    await expect(
      r.replace({ schemaVersion: 99 }, 1, "替换数据"),
    ).rejects.toThrow();
    await r.command(
      { type: "task.update", id: "a", patch: { notes: "重要记录" } },
      "cli",
    );
    const current = await r.read();
    await r.replace(
      { ...current.data, tasks: [] },
      current.revision,
      "替换数据",
    );
    const backups = await r.backups();
    expect(backups.some((b) => b.label === "替换前快照")).toBe(true);
    const saved = await r.readBackup(
      backups.find((b) => b.label === "替换前快照")!.id,
    );
    expect(saved.tasks[0].notes).toBe("重要记录");
    await expect(r.readBackup("../../data.json")).rejects.toThrow();
  });
  it("显式损坏恢复先保留原文件，正常数据拒绝走损坏恢复入口", async () => {
    const r = await repo();
    await r.command({ type: "task.add", title: "重要记录" }, "cli");
    const valid = (await r.read()).data;
    await expect(r.recover(valid)).rejects.toThrow("可正常读取");
    await writeFile(path.join(r.directory, "data.json"), "unreadable-original");
    const broken = new LocalRepository(r.directory);
    await broken.recover(valid);
    expect((await broken.read()).data.tasks[0].title).toBe("重要记录");
    const { readdir } = await import("node:fs/promises");
    const file = (await readdir(path.join(r.directory, "recovery")))[0];
    expect(
      await readFile(path.join(r.directory, "recovery", file), "utf8"),
    ).toBe("unreadable-original");
  });
  it("损坏文件不能被默默清空，快照轮换最多 30 份", async () => {
    const r = await repo();
    await r.command({ type: "task.add", title: "一件事" }, "cli");
    for (let i = 0; i < 32; i++) await r.backup();
    expect(await r.backups()).toHaveLength(30);
    const dataFile = path.join(r.directory, "data.json");
    await writeFile(dataFile, "invalid");
    const bad = new LocalRepository(r.directory);
    await expect(
      bad.command({ type: "task.add", title: "覆盖" }, "cli"),
    ).rejects.toThrow("停止写入");
    expect(await readFile(dataFile, "utf8")).toBe("invalid");
  });
});
