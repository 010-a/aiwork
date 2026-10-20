import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { dateKey } from "./dates";
import type { AppData, BackupInfo } from "./types";
import { validateData } from "./domain";
interface Database extends DBSchema {
  snapshots: { key: string; value: AppData };
}

/** Each instance serializes writes, so an earlier slow save can never overwrite a newer edit. */
export function createPersistence(databaseName = "zhixingban-local-v1") {
  let database: Promise<IDBPDatabase<Database>> | undefined;
  let pending: Promise<void> = Promise.resolve();
  let knownSignature: string | undefined;
  const signature = (snapshot: AppData | undefined): string | undefined =>
    snapshot === undefined ? undefined : JSON.stringify(snapshot);
  function db() {
    database ??= openDB<Database>(databaseName, 1, {
      upgrade(result) {
        result.createObjectStore("snapshots");
      },
      blocking(_currentVersion, _blockedVersion, event) {
        (event.target as IDBDatabase | null)?.close();
      },
    });
    return database;
  }
  return {
    load(): Promise<AppData | undefined> {
      // Reads join the same queue as writes so a reload also resets the conflict baseline atomically.
      const operation = pending
        .catch(() => undefined)
        .then(async () => {
          const saved = await (await db()).get("snapshots", "current");
          // Retain the original signature even if validation fails, allowing an explicit backup recovery.
          knownSignature = signature(saved);
          return saved === undefined ? undefined : validateData(saved);
        });
      pending = operation.then(
        () => undefined,
        () => undefined,
      );
      return operation;
    },
    save(data: AppData): Promise<void> {
      const snapshot = validateData(data);
      const operation = pending
        .catch(() => undefined)
        .then(async () => {
          const connection = await db();
          const transaction = connection.transaction("snapshots", "readwrite");
          const completion = transaction.done;
          try {
            // The read and conditional write share one transaction, including across browser tabs.
            const existing = await transaction.store.get("current");
            if (signature(existing) !== knownSignature) {
              throw new Error(
                "检测到其他窗口已更新本地数据。为避免覆盖，已停止保存；请先导出当前窗口的备份，再刷新页面读取最新数据。",
              );
            }
            if (existing) {
              const keys = (await transaction.store.getAllKeys()).filter((k) =>
                k.startsWith("backup-"),
              );
              const date = dateKey(new Date());
              if (!keys.some((k) => k.startsWith(`backup-${date}-`))) {
                await transaction.store.put(
                  existing,
                  `backup-${date}-${new Date().toISOString()}-自动快照`,
                );
                for (const key of keys
                  .sort()
                  .slice(0, Math.max(0, keys.length - 29)))
                  await transaction.store.delete(key);
              }
            }
            await transaction.store.put(snapshot, "current");
            await completion;
            knownSignature = signature(snapshot);
          } catch (reason) {
            try {
              transaction.abort();
            } catch {
              /* A failed/completed transaction is already closed. */
            }
            await completion.catch(() => undefined);
            throw reason;
          }
        });
      pending = operation;
      return operation;
    },
    async backups(): Promise<BackupInfo[]> {
      await pending.catch(() => undefined);
      const connection = await db();
      const keys = (await connection.getAllKeys("snapshots")).filter((k) =>
        k.startsWith("backup-"),
      );
      return Promise.all(
        keys
          .sort()
          .reverse()
          .map(async (id) => ({
            id,
            at: id.slice(18, 42),
            label: id.slice(43),
            tasks: (await connection.get("snapshots", id))?.tasks.length ?? 0,
          })),
      );
    },
    async backup(): Promise<void> {
      await pending;
      const connection = await db(),
        current = await connection.get("snapshots", "current");
      if (!current) throw new Error("尚无可备份的数据");
      const keys = (await connection.getAllKeys("snapshots")).filter((k) =>
        k.startsWith("backup-"),
      );
      const transaction = connection.transaction("snapshots", "readwrite");
      await transaction.store.put(
        current,
        `backup-${dateKey(new Date())}-${new Date().toISOString()}-手动快照`,
      );
      for (const key of keys.sort().slice(0, Math.max(0, keys.length - 29)))
        await transaction.store.delete(key);
      await transaction.done;
    },
    async readBackup(id: string): Promise<AppData> {
      await pending.catch(() => undefined);
      if (!id.startsWith("backup-")) throw new Error("快照 ID 无效");
      return validateData(await (await db()).get("snapshots", id));
    },
    async flush() {
      await pending;
    },
    async close() {
      await pending.catch(() => undefined);
      if (database) (await database).close();
    },
  };
}
