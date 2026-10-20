import type { AppData, BackupInfo } from "./types";
import { createPersistence } from "./persistence";
import { emptyData, validateData } from "./domain";
export interface Persistence {
  load: () => Promise<AppData | undefined>;
  save: (data: AppData, label?: string) => Promise<void>;
  backups: () => Promise<BackupInfo[]>;
  backup: () => Promise<void>;
  readBackup: (id: string) => Promise<AppData>;
  flush: () => Promise<void>;
}
const hasContent = (data: AppData | undefined) =>
  data &&
  (data.tasks.length ||
    data.projects.length ||
    data.events.length ||
    Object.keys(data.reviewNotes).length ||
    data.monitoring ||
    data.templates?.length ||
    data.trash?.length);
export async function openStorage(): Promise<{
  persistence: Persistence;
  initial?: AppData;
  mode: "service" | "browser";
  legacyData?: AppData;
  directory?: string;
  loadError?: string;
  warning?: string;
}> {
  let response: Response;
  try {
    response = await fetch("/api/session");
  } catch {
    throw new Error("无法连接本地服务。请保留启动窗口并刷新，原数据未被覆盖。");
  }
  // Old static deployments and the standalone browser test mode remain compatible.
  if (
    response.status === 404 ||
    response.headers.get("content-type")?.includes("text/html")
  ) {
    const persistence = createPersistence();
    try {
      return {
        persistence,
        initial: await persistence.load(),
        mode: "browser",
      };
    } catch (error) {
      return {
        persistence,
        mode: "browser",
        loadError: error instanceof Error ? error.message : String(error),
      };
    }
  }
  if (!response.ok) throw new Error("本地数据服务无法访问，请检查启动窗口");
  const session = (await response.json()) as {
    token: string;
    directory: string;
  };
  let revision = 0,
    epoch = 0;
  let pending: Promise<void> = Promise.resolve();
  async function request(path: string, options: RequestInit = {}) {
    const result = await fetch(`/api/${path}`, {
      ...options,
      headers: {
        "content-type": "application/json",
        "x-zhixingban-token": session.token,
        ...options.headers,
      },
    });
    const body = await result.json();
    if (!result.ok) throw new Error(body.error ?? "本地服务操作失败");
    return body;
  }
  let first;
  let loadError: string | undefined;
  try {
    first = await request("state");
    revision = first.revision;
  } catch (error) {
    loadError = error instanceof Error ? error.message : String(error);
  }
  const persistence: Persistence = {
    async load() {
      await pending;
      const start = epoch;
      const result = await request("state");
      if (epoch !== start) return undefined;
      revision = result.revision;
      return result.initialized ? validateData(result.data) : undefined;
    },
    save(data, label = "界面修改") {
      epoch++;
      const snapshot = validateData(data);
      const operation = pending.then(async () => {
        const result = await request(loadError ? "recover" : "state", {
          method: loadError ? "POST" : "PUT",
          body: JSON.stringify({
            data: snapshot,
            expectedRevision: revision,
            label,
          }),
        });
        loadError = undefined;
        revision = result.revision;
      });
      // A failed conditional write blocks later snapshots until the page is reloaded.
      pending = operation;
      return operation;
    },
    async flush() {
      await pending;
    },
    async backups() {
      await pending;
      return (await request("backups")).backups;
    },
    async backup() {
      await pending;
      await request("backups", { method: "POST", body: "{}" });
    },
    async readBackup(id) {
      return validateData(
        (await request(`backups/${encodeURIComponent(id)}`)).data,
      );
    },
  };
  const legacy = createPersistence();
  let legacyData: AppData | undefined;
  let warning: string | undefined;
  try {
    legacyData = await legacy.load();
  } catch {
    warning =
      "旧浏览器数据未能读取，因此没有自动迁移；原 IndexedDB 保留。请从已知正常的 JSON 备份恢复，或修复原浏览器数据后再迁移。";
  } finally {
    await legacy.close();
  }
  let initial = first?.initialized ? validateData(first.data) : undefined;
  if (first && !first.initialized && hasContent(legacyData)) {
    await persistence.save(legacyData!, "迁移浏览器数据");
    initial = legacyData;
  }
  return {
    persistence,
    initial: initial ?? emptyData(),
    mode: "service",
    directory: session.directory,
    loadError,
    warning,
    legacyData: hasContent(legacyData) ? legacyData : undefined,
  };
}
