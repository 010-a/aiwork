import { useCallback, useEffect, useRef, useState } from "react";
import type { AppData, AppStore, AlertRules, BackupInfo } from "./types";
import { emptyData, validateData, initializeMonitoring } from "./domain";
import { executeCommand, type Command } from "./commands";
import { openStorage, type Persistence } from "./clientStorage";
import { defaultPrinciples } from "./principles";
export * from "./domain";
export { createPersistence } from "./persistence";
const uid = () => crypto.randomUUID();
export function useAppStore(): AppStore {
  const [data, setData] = useState<AppData>(emptyData);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<AppStore["saveState"]>("saved");
  const [error, setError] = useState("");
  const [storageMode, setStorageMode] = useState<"service" | "browser">(
    "browser",
  );
  const [legacyData, setLegacyData] = useState<AppData>();
  const [dataDirectory, setDirectory] = useState<string>();
  const [storageWarning, setStorageWarning] = useState<string>();
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [undoLabel, setUndoLabel] = useState("");
  const history = useRef<{ data: AppData; label: string; at: number }[]>([]);
  const dataRef = useRef(data),
    loadedRef = useRef(false),
    pendingCount = useRef(0),
    failed = useRef(false);
  const persistence = useRef<Persistence | undefined>(undefined);
  const opening = useRef<ReturnType<typeof openStorage> | undefined>(undefined);
  const refreshBackups = useCallback(async () => {
    if (persistence.current) setBackups(await persistence.current.backups());
  }, []);
  const publish = (next: AppData) => {
    dataRef.current = next;
    setData(next);
  };
  const save = useCallback(
    (next: AppData, label: string) => {
      pendingCount.current++;
      setSaveState("saving");
      persistence
        .current!.save(next, label)
        .then(() => {
          pendingCount.current--;
          if (!pendingCount.current && !failed.current) {
            setSaveState("saved");
            setError("");
          }
        })
        .catch((reason) => {
          pendingCount.current--;
          failed.current = true;
          setSaveState("error");
          setError(
            `本地保存失败：${reason instanceof Error ? reason.message : String(reason)}。请导出当前内容后刷新，避免覆盖其他窗口或 Agent 的修改。`,
          );
        });
    },
    [refreshBackups],
  );
  useEffect(() => {
    let cancelled = false;
    opening.current ??= openStorage();
    opening.current
      .then(
        ({
          persistence: backend,
          initial,
          mode,
          legacyData,
          directory,
          loadError,
          warning,
        }) => {
          if (cancelled) return;
          persistence.current = backend;
          setStorageWarning(warning);
          setStorageMode(mode);
          setLegacyData(legacyData);
          setDirectory(directory);
          if (loadError) {
            setError(
              `无法读取原数据：${loadError}。为保护原记录，已停止写入。可从已知正常的 JSON 备份恢复。`,
            );
            setSaveState("error");
            return;
          }
          const original = initial ?? emptyData(),
            next = initializeMonitoring(original);
          publish(next);
          loadedRef.current = true;
          setLoaded(true);
          setStorageMode(mode);
          setLegacyData(legacyData);
          setDirectory(directory);
          if (next !== original) save(next, "初始化预警");
          void refreshBackups().catch(() => undefined);
        },
      )
      .catch((reason) => {
        if (!cancelled) {
          setError(
            `无法读取本地数据：${reason instanceof Error ? reason.message : reason}。原数据未覆盖。`,
          );
          setSaveState("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [save, refreshBackups]);
  useEffect(() => {
    if (storageMode !== "service" || !loaded) return;
    let busy = false;
    const poll = async () => {
      if (
        busy ||
        pendingCount.current ||
        failed.current ||
        document.visibilityState === "hidden"
      )
        return;
      busy = true;
      try {
        const before = dataRef.current;
        const next = await persistence.current!.load();
        if (
          next &&
          before === dataRef.current &&
          !pendingCount.current &&
          JSON.stringify(next) !== JSON.stringify(before)
        ) {
          publish(next);
          history.current = [];
          setUndoLabel("");
          void refreshBackups().catch(() => undefined);
        }
      } catch (reason) {
        setError(
          `读取本地服务失败：${String(reason instanceof Error ? reason.message : reason)}`,
        );
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(() => void poll(), 2000);
    window.addEventListener("focus", poll);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", poll);
    };
  }, [storageMode, loaded, refreshBackups]);
  useEffect(() => {
    if (saveState === "saved") return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState]);
  const commit = (command: Command, label: string, key = label): boolean => {
    const recover =
      command.type === "data.replace" &&
      !loadedRef.current &&
      Boolean(persistence.current);
    if ((!loadedRef.current && !recover) || failed.current) {
      setError("数据尚未就绪或保存失败，请先导出备份后刷新。");
      return false;
    }
    try {
      const before = dataRef.current,
        next = executeCommand(before, command);
      if (recover) {
        loadedRef.current = true;
        setLoaded(true);
      }
      if (JSON.stringify(before) === JSON.stringify(next)) return true;
      const last = history.current.at(-1),
        at = Date.now();
      if (!last || last.label !== key || at - last.at > 1000) {
        history.current.push({ data: before, label: key, at });
        if (history.current.length > 30) history.current.shift();
      } else last.at = at;
      setUndoLabel(label);
      publish(next);
      setError("");
      save(next, label);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return false;
    }
  };
  const replaceData = (next: AppData) => {
    commit({ type: "data.replace", data: validateData(next) }, "替换数据");
  };
  return {
    data,
    loaded,
    saveState,
    error,
    storageMode,
    legacyData,
    dataDirectory,
    storageWarning,
    backups,
    undoLabel,
    addTask(title, patch = {}) {
      const id = uid();
      return commit(
        { type: "task.add", id, title, patch },
        "新增任务",
        `新增任务-${id}`,
      )
        ? id
        : "";
    },
    updateTask(id, patch) {
      commit(
        { type: "task.update", id, patch },
        "修改任务",
        `修改任务-${id}-${Object.keys(patch).sort().join()}`,
      );
    },
    updateTasks(ids, patch) {
      commit({ type: "task.updateMany", ids, patch }, "批量修改任务", uid());
    },
    reorderTasks(ids) {
      commit({ type: "task.reorder", ids }, "调整任务顺序", uid());
    },
    deleteTasks(ids) {
      commit({ type: "task.delete", ids }, "删除任务");
    },
    addProject(patch) {
      const id = uid();
      return commit(
        { type: "project.add", id, patch },
        "新增项目",
        `新增项目-${id}`,
      )
        ? id
        : "";
    },
    updateProject(id, patch) {
      commit(
        { type: "project.update", id, patch },
        "修改项目",
        `修改项目-${id}-${Object.keys(patch).sort().join()}`,
      );
    },
    addStage(projectId, title) {
      const id = uid();
      return commit({ type: "stage.add", id, projectId, title }, "新增阶段", id)
        ? id
        : "";
    },
    updateStage(id, title) {
      commit({ type: "stage.update", id, title }, "修改阶段", id);
    },
    deleteStage(id) {
      commit({ type: "stage.delete", id }, "删除阶段");
    },
    addEvent(patch) {
      const id = uid();
      return commit({ type: "event.add", id, patch }, "新增日程", id) ? id : "";
    },
    updateEvent(id, patch) {
      commit({ type: "event.update", id, patch }, "修改日程", id);
    },
    deleteEvent(id) {
      commit({ type: "event.delete", id }, "删除日程");
    },
    setReviewNote(week, note) {
      commit({ type: "review.note", week, note }, "修改回顾笔记", week);
    },
    replaceData,
    clearDemo() {
      commit({ type: "demo.clear" }, "清除演示");
    },
    loadDemo() {
      commit({ type: "demo.load" }, "载入演示");
    },
    recordProgress(target, note) {
      commit({ type: "progress.record", target, note }, "记录进展", uid());
    },
    updateMonitor(target, patch) {
      commit(
        { type: "monitor.update", target, patch },
        "修改跟进设置",
        `${target.id}-${Object.keys(patch).sort()}`,
      );
    },
    completeCheckpoint(target) {
      commit({ type: "checkpoint.complete", target }, "确认目标达成", uid());
    },
    updateAlertRules(rules: AlertRules) {
      const current = initializeMonitoring(dataRef.current);
      replaceData({
        ...current,
        monitoring: {
          ...current.monitoring!,
          rules,
          ...(current.monitoring?.principles
            ? { principles: defaultPrinciples(rules) }
            : {}),
        },
      });
    },
    savePrinciple(principle) {
      commit({ type: "principle.save", principle }, "保存原则", principle.id);
    },
    deletePrinciple(id) {
      commit({ type: "principle.delete", id }, "删除原则", id);
    },
    restoreTrash(id) {
      commit({ type: "trash.restore", id }, "恢复已删除内容", id);
    },
    purgeTrash(id) {
      commit({ type: "trash.purge", id }, "永久删除", id);
    },
    saveTemplate(template) {
      commit({ type: "template.save", template }, "保存模板", template.id);
    },
    deleteTemplate(id) {
      commit({ type: "template.delete", id }, "删除模板", id);
    },
    undo() {
      if (failed.current || !loadedRef.current) return;
      const previous = history.current.pop();
      if (!previous) return;
      publish(previous.data);
      setUndoLabel(history.current.length ? "上一步操作" : "");
      save(previous.data, "撤销操作");
    },
    refreshBackups,
    async flushSaves() {
      if (!persistence.current) throw new Error("存储未就绪");
      await persistence.current.flush();
      if (failed.current) throw new Error("保存失败，请导出当前内容后刷新。");
    },
    async backupNow() {
      await persistence.current!.backup();
      await refreshBackups();
    },
    async readBackup(id) {
      return persistence.current!.readBackup(id);
    },
    async restoreBackup(id) {
      const snapshot = await persistence.current!.readBackup(id);
      if (loadedRef.current) await persistence.current!.backup();
      replaceData(snapshot);
    },
  };
}
