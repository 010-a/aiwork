import {
  mkdir,
  readFile,
  writeFile,
  rename,
  readdir,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { emptyData, initializeMonitoring, validateData } from "../src/domain";
import { executeCommand, type Command } from "../src/commands";
import { dateKey } from "../src/dates";
import type { AppData, BackupInfo } from "../src/types";
export interface Snapshot {
  revision: number;
  updatedAt: string;
  data: AppData;
  initialized: boolean;
}
export class ConflictError extends Error {}
export class LocalRepository {
  private queue: Promise<unknown> = Promise.resolve();
  private current?: Snapshot;
  constructor(public readonly directory: string) {}
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const operation = this.queue.catch(() => undefined).then(fn);
    this.queue = operation;
    return operation;
  }
  private async atomic(file: string, value: unknown) {
    await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    const temporary = `${file}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(value, null, 2), {
      mode: 0o600,
      flush: true,
    });
    await rename(temporary, file);
  }
  private async get(): Promise<Snapshot> {
    if (this.current) return this.current;
    try {
      const saved = JSON.parse(
        await readFile(path.join(this.directory, "data.json"), "utf8"),
      );
      if (
        !Number.isSafeInteger(saved.revision) ||
        saved.revision < 1 ||
        typeof saved.updatedAt !== "string" ||
        !Number.isFinite(Date.parse(saved.updatedAt))
      )
        throw new Error("数据文件版本信息无效");
      this.current = {
        revision: saved.revision,
        updatedAt: saved.updatedAt,
        data: validateData(saved.data),
        initialized: true,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        throw new Error(
          `读取数据文件失败，已停止写入：${error instanceof Error ? error.message : error}`,
        );
      this.current = {
        revision: 0,
        updatedAt: new Date().toISOString(),
        data: emptyData(),
        initialized: false,
      };
    }
    return this.current;
  }
  read() {
    return this.serial(async () => structuredClone(await this.get()));
  }
  private async snapshot(data: AppData, label: string) {
    const at = new Date().toISOString(),
      id = `${dateKey(new Date())}_${at.replace(/[:.]/g, "-")}_${crypto.randomUUID()}.json`;
    await this.atomic(path.join(this.directory, "backups", id), {
      at,
      label,
      data,
    });
    const files = (await readdir(path.join(this.directory, "backups")))
      .filter((f) => f.endsWith(".json"))
      .sort()
      .reverse();
    for (const old of files.slice(30))
      await unlink(path.join(this.directory, "backups", old));
  }
  private async write(
    next: AppData,
    label: string,
    actor: string,
    expected?: number,
  ): Promise<Snapshot> {
    const before = await this.get();
    if (expected !== undefined && expected !== before.revision)
      throw new ConflictError(
        "其他窗口或 Agent 已修改数据，本次写入未覆盖它。请导出当前编辑后刷新读取最新内容。",
      );
    const data = validateData(next);
    if (before.initialized) {
      const files = await readdir(path.join(this.directory, "backups")).catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return [];
          throw error;
        },
      );
      if (
        !files.some((f) => f.startsWith(dateKey(new Date()))) ||
        /替换|恢复|迁移/.test(label) ||
        actor === "cli" ||
        actor === "mcp"
      )
        await this.snapshot(
          before.data,
          label === "替换数据"
            ? "替换前快照"
            : actor === "cli" || actor === "mcp"
              ? `Agent 操作前 · ${label}`
              : "每日安全快照",
        );
    }
    const result = {
      revision: before.revision + 1,
      updatedAt: new Date().toISOString(),
      data,
      initialized: true,
      lastChange: { actor, operation: label },
    };
    await this.atomic(path.join(this.directory, "data.json"), result);
    this.current = result;
    if (!before.initialized) await this.snapshot(data, "初始安全快照");
    return structuredClone(result);
  }
  replace(data: unknown, expected: number, label: string, actor = "ui") {
    return this.serial(async () =>
      this.write(validateData(data), label, actor, expected),
    );
  }
  recover(data: unknown) {
    return this.serial(async () => {
      const valid = validateData(data);
      let broken = false;
      try {
        await this.get();
      } catch {
        broken = true;
      }
      if (!broken)
        throw new Error(
          "当前数据可正常读取，请刷新后使用常规恢复，避免覆盖新修改。",
        );
      const raw = await readFile(
        path.join(this.directory, "data.json"),
        "utf8",
      );
      await mkdir(path.join(this.directory, "recovery"), {
        recursive: true,
        mode: 0o700,
      });
      await writeFile(
        path.join(
          this.directory,
          "recovery",
          `unreadable-${Date.now()}-${crypto.randomUUID()}.json`,
        ),
        raw,
        { mode: 0o600 },
      );
      this.current = {
        revision: 0,
        updatedAt: new Date().toISOString(),
        data: emptyData(),
        initialized: false,
      };
      try {
        return await this.write(valid, "从备份恢复", "ui", 0);
      } catch (error) {
        this.current = undefined;
        throw error;
      }
    });
  }
  command(command: Command, actor: string, expected?: number) {
    return this.serial(async () => {
      const before = await this.get();
      if (expected !== undefined && before.revision !== expected)
        throw new ConflictError("数据版本已变化，请重新读取后再操作");
      const next = executeCommand(initializeMonitoring(before.data), command);
      const saved = await this.write(
        next,
        command.type === "data.replace" ? "替换数据" : command.type,
        actor,
        expected,
      );
      const created = Object.fromEntries(
        (
          [
            "tasks",
            "projects",
            "stages",
            "events",
            "templates",
            "trash",
          ] as const
        ).map((key) => [
          key,
          (saved.data[key] ?? []).filter(
            (item) =>
              !(before.data[key] ?? []).some((old) => old.id === item.id),
          ),
        ]),
      );
      return { ...saved, created };
    });
  }
  backups(): Promise<BackupInfo[]> {
    return this.serial(async () => {
      const files = await readdir(path.join(this.directory, "backups")).catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return [];
          throw error;
        },
      );
      const result = [];
      for (const id of files
        .filter((f) => f.endsWith(".json"))
        .sort()
        .reverse()) {
        const item = JSON.parse(
          await readFile(path.join(this.directory, "backups", id), "utf8"),
        );
        result.push({
          id,
          at: item.at,
          label: item.label,
          tasks: validateData(item.data).tasks.length,
        });
      }
      return result;
    });
  }
  async readBackup(id: string): Promise<AppData> {
    if (!/^[A-Za-z0-9_.-]+\.json$/.test(id)) throw new Error("备份 ID 无效");
    return validateData(
      JSON.parse(
        await readFile(path.join(this.directory, "backups", id), "utf8"),
      ).data,
    );
  }
  backup() {
    return this.serial(async () => {
      await this.snapshot((await this.get()).data, "手动备份");
    });
  }
}
