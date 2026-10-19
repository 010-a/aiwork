import { useCallback, useEffect, useRef, useState } from "react";
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { AppData, AppStore, Task } from "./types";
import { addDays, isDateKey, todayKey, weekStart } from "./dates";

export function emptyData(): AppData {
  return {
    schemaVersion: 1,
    tasks: [],
    projects: [],
    stages: [],
    events: [],
    reviewNotes: {},
  };
}

type Obj = Record<string, unknown>;
const badKeys = new Set(["__proto__", "constructor", "prototype"]);
function fail(message: string): never {
  throw new Error(`备份校验失败：${message}`);
}
function object(value: unknown, label: string): Obj {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(`${label}应为对象`);
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) fail(`${label}格式不正确`);
  if (Object.keys(value).some((key) => badKeys.has(key)))
    fail(`${label}包含不安全字段`);
  return value as Obj;
}
function text(
  value: unknown,
  label: string,
  max = 100_000,
  required = false,
): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
  )
    fail(`${label}不是有效文本`);
  if (required && !value.trim()) fail(`${label}不能为空`);
  return value;
}
function identifier(value: unknown, label: string): string {
  const result = text(value, label, 128, true);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(result)) fail(`${label}不是有效 ID`);
  return result;
}
function bool(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") fail(`${label}应为布尔值`);
  return value;
}
function order(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    fail("排序值应为非负有限数字");
  return value;
}
function calendarDate(value: unknown, label: string): string {
  if (!isDateKey(value)) fail(`${label}不是有效日期`);
  return value;
}
function timestamp(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  )
    fail(`${label}不是有效时间戳`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value)
    fail(`${label}不是有效时间戳`);
  return value;
}
function link(value: unknown): string {
  const result = text(value, "笔记关联", 4096);
  const trimmed = result.trim();
  // A note path is allowed; executable/web URL schemes are deliberately not opened by the app.
  // Keep safe intermediate input such as "obsidian:" / "C:" editable during autosave.
  if (
    /^[A-Za-z][A-Za-z\d+.-]*:/.test(trimmed) &&
    !/^obsidian:/i.test(trimmed) &&
    !/^[A-Za-z]:(?:[\\/]|$)/.test(trimmed)
  )
    fail("笔记关联仅支持 obsidian:// 链接或本地路径");
  return result;
}
function optional<T>(
  value: unknown,
  parse: (value: unknown) => T,
): T | undefined {
  return value === undefined ? undefined : parse(value);
}
function flag(obj: Obj): { demo?: boolean } {
  return obj.demo === undefined ? {} : { demo: bool(obj.demo, "演示标记") };
}
function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value) || value.length > 100_000)
    fail(`${label}应为数组（最多 100000 项）`);
  return value;
}
function unique(items: { id: string }[], label: string): void {
  if (new Set(items.map((item) => item.id)).size !== items.length)
    fail(`${label}存在重复 ID`);
}

/** Return a fresh, validated snapshot. No current data is changed by parsing or validation. */
export function validateData(input: unknown): AppData {
  const root = object(input, "备份");
  if (root.schemaVersion !== 1) fail("不支持此数据版本");
  const projects = array(root.projects, "项目").map((value) => {
    const item = object(value, "项目");
    const color = text(item.color, "项目颜色", 7);
    if (!/^#[\da-f]{6}$/i.test(color)) fail("项目颜色应为 #RRGGBB");
    return {
      id: identifier(item.id, "项目 ID"),
      title: text(item.title, "项目标题", 500, true),
      goal: text(item.goal, "项目目标"),
      description: text(item.description, "项目说明"),
      color,
      archived: bool(item.archived, "归档状态"),
      blockedReason: optional(item.blockedReason, (value) =>
        text(value, "项目阻碍", 10_000),
      ),
      obsidianUrl: optional(item.obsidianUrl, link),
      createdAt: timestamp(item.createdAt, "项目创建时间"),
      updatedAt: timestamp(item.updatedAt, "项目更新时间"),
      ...flag(item),
    };
  });
  const stages = array(root.stages, "阶段").map((value) => {
    const item = object(value, "阶段");
    return {
      id: identifier(item.id, "阶段 ID"),
      projectId: identifier(item.projectId, "阶段项目 ID"),
      title: text(item.title, "阶段标题", 500, true),
      order: order(item.order),
      ...flag(item),
    };
  });
  const tasks = array(root.tasks, "任务").map((value) => {
    const item = object(value, "任务");
    if (!["todo", "doing", "paused", "done"].includes(String(item.status)))
      fail("任务状态无效");
    const dependsOn = optional(item.dependsOn, (value) =>
      array(value, "前置任务").map((id) => identifier(id, "前置任务 ID")),
    );
    if (dependsOn && new Set(dependsOn).size !== dependsOn.length)
      fail("前置任务不能重复");
    const task: Task = {
      id: identifier(item.id, "任务 ID"),
      title: text(item.title, "任务标题", 500, true),
      notes: text(item.notes, "任务说明"),
      status: item.status as Task["status"],
      inbox: bool(item.inbox, "收集状态"),
      important: bool(item.important, "重要标记"),
      order: order(item.order),
      projectId: optional(item.projectId, (value) =>
        identifier(value, "任务项目 ID"),
      ),
      stageId: optional(item.stageId, (value) =>
        identifier(value, "任务阶段 ID"),
      ),
      plannedDate: optional(item.plannedDate, (value) =>
        calendarDate(value, "计划日期"),
      ),
      dueDate: optional(item.dueDate, (value) =>
        calendarDate(value, "截止日期"),
      ),
      blockedReason: optional(item.blockedReason, (value) =>
        text(value, "任务阻碍", 10_000),
      ),
      dependsOn,
      obsidianUrl: optional(item.obsidianUrl, link),
      createdAt: timestamp(item.createdAt, "任务创建时间"),
      updatedAt: timestamp(item.updatedAt, "任务更新时间"),
      completedAt: optional(item.completedAt, (value) =>
        timestamp(value, "任务完成时间"),
      ),
      ...flag(item),
    };
    if ((task.status === "done") !== Boolean(task.completedAt))
      fail("任务完成状态与完成时间不一致");
    if (task.projectId && task.inbox) fail("归入项目的任务不能同时留在收集箱");
    return task;
  });
  const events = array(root.events, "日程").map((value) => {
    const item = object(value, "日程");
    const startTime = text(item.startTime, "开始时间", 5),
      endTime = text(item.endTime, "结束时间", 5);
    if (
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime) ||
      endTime <= startTime
    )
      fail("日程结束时间必须晚于开始时间");
    return {
      id: identifier(item.id, "日程 ID"),
      title: text(item.title, "日程标题", 500, true),
      date: calendarDate(item.date, "日程日期"),
      startTime,
      endTime,
      notes: text(item.notes, "日程说明"),
      ...flag(item),
    };
  });
  unique(projects, "项目");
  unique(stages, "阶段");
  unique(tasks, "任务");
  unique(events, "日程");
  const projectIds = new Set(projects.map((project) => project.id)),
    taskIds = new Set(tasks.map((task) => task.id));
  const stageMap = new Map(stages.map((stage) => [stage.id, stage]));
  for (const stage of stages)
    if (!projectIds.has(stage.projectId)) fail("阶段引用的项目不存在");
  for (const task of tasks) {
    if (task.projectId && !projectIds.has(task.projectId))
      fail("任务引用的项目不存在");
    if (
      task.stageId &&
      (!stageMap.has(task.stageId) ||
        stageMap.get(task.stageId)?.projectId !== task.projectId)
    )
      fail("任务阶段与项目不一致");
    if (task.dependsOn?.some((id) => id === task.id || !taskIds.has(id)))
      fail("前置任务不存在或引用自身");
  }
  // Iterative cycle detection avoids recursion overflow on a large valid backup.
  const edges = new Map(tasks.map((task) => [task.id, task.dependsOn ?? []]));
  const marks = new Map<string, number>();
  for (const task of tasks) {
    if (marks.get(task.id) === 2) continue;
    const stack: { id: string; leave: boolean }[] = [
      { id: task.id, leave: false },
    ];
    while (stack.length) {
      const { id, leave } = stack.pop()!;
      if (leave) {
        marks.set(id, 2);
        continue;
      }
      if (marks.get(id) === 1) fail("前置任务存在循环依赖");
      if (marks.get(id) === 2) continue;
      marks.set(id, 1);
      stack.push({ id, leave: true });
      for (const dependency of edges.get(id) ?? [])
        stack.push({ id: dependency, leave: false });
    }
  }
  const notes = object(root.reviewNotes, "回顾笔记");
  const reviewNotes: Record<string, string> = {};
  for (const [week, note] of Object.entries(notes)) {
    calendarDate(week, "回顾周日期");
    if (weekStart(week) !== week) fail("回顾笔记日期应为周一");
    reviewNotes[week] = text(note, "回顾笔记");
  }
  return { schemaVersion: 1, tasks, projects, stages, events, reviewNotes };
}

export function parseBackup(source: string): AppData {
  if (source.length > 30_000_000) fail("文件过大（上限 30 MB）");
  let value: unknown;
  try {
    value = JSON.parse(source.replace(/^\uFEFF/, ""));
  } catch {
    fail("文件不是有效 JSON");
  }
  return validateData(value);
}

export function exportBackup(data: AppData): string {
  return JSON.stringify(validateData(data), null, 2);
}

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
    async flush() {
      await pending;
    },
    async close() {
      await pending.catch(() => undefined);
      if (database) (await database).close();
    },
  };
}

const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const clean = (value: string | undefined) => value?.trim() || undefined;
const editableText = (value: string | undefined) =>
  value?.trim() ? value : undefined;

/** Normalizes task transitions while preserving the task's original identity and creation time. */
export function applyTaskPatch(
  task: Task,
  patch: Partial<Task>,
  data: AppData,
  timestampValue = now(),
): Task {
  const next = {
    ...task,
    ...patch,
    id: task.id,
    createdAt: task.createdAt,
    updatedAt: timestampValue,
  };
  next.projectId = clean(next.projectId);
  next.stageId = clean(next.stageId);
  next.plannedDate = clean(next.plannedDate);
  next.dueDate = clean(next.dueDate);
  next.blockedReason = editableText(next.blockedReason);
  next.obsidianUrl = editableText(next.obsidianUrl);
  if (patch.inbox === true) {
    next.projectId = undefined;
    next.stageId = undefined;
  }
  if (next.projectId) next.inbox = false;
  if (
    !next.projectId ||
    !data.stages.some(
      (stage) =>
        stage.id === next.stageId && stage.projectId === next.projectId,
    )
  )
    next.stageId = undefined;
  next.completedAt =
    next.status === "done"
      ? task.status === "done" && task.completedAt
        ? task.completedAt
        : timestampValue
      : undefined;
  return next;
}

export function removeDemo(data: AppData): AppData {
  const projects = data.projects.filter((project) => !project.demo);
  const projectIds = new Set(projects.map((project) => project.id));
  const stages = data.stages.filter(
    (stage) => !stage.demo && projectIds.has(stage.projectId),
  );
  const stageIds = new Set(stages.map((stage) => stage.id));
  const retainedTasks = data.tasks.filter((task) => !task.demo),
    taskIds = new Set(retainedTasks.map((task) => task.id));
  const tasks = retainedTasks.map((task) => ({
    ...task,
    inbox:
      task.projectId && !projectIds.has(task.projectId) ? true : task.inbox,
    projectId:
      task.projectId && projectIds.has(task.projectId)
        ? task.projectId
        : undefined,
    stageId:
      task.stageId && stageIds.has(task.stageId) ? task.stageId : undefined,
    dependsOn: task.dependsOn?.filter((id) => taskIds.has(id)),
  }));
  return {
    ...data,
    projects,
    stages,
    tasks,
    events: data.events.filter((event) => !event.demo),
  };
}

export function createDemoData(today = todayKey()): AppData {
  const time = now(),
    projectA = uid(),
    projectB = uid(),
    stageA = uid(),
    stageB = uid();
  const makeTask = (title: string, patch: Partial<Task> = {}): Task => ({
    id: uid(),
    title,
    notes: "",
    status: "todo",
    inbox: false,
    important: false,
    order: 0,
    createdAt: time,
    updatedAt: time,
    demo: true,
    ...patch,
  });
  const completed = makeTask("整理一轮实验图像", {
    projectId: projectA,
    stageId: stageA,
    status: "done",
    completedAt: time,
    plannedDate: today,
  });
  return {
    schemaVersion: 1,
    projects: [
      {
        id: projectA,
        title: "溶酶体分析",
        goal: "找到适合当前图像的分割与量化流程",
        description: "演示项目，可随时清除。详细实验记录仍保存在 Obsidian。",
        color: "#4586ED",
        archived: false,
        createdAt: time,
        updatedAt: time,
        demo: true,
      },
      {
        id: projectB,
        title: "阅读与学习",
        goal: "每周消化一篇相关文献",
        description: "演示项目",
        color: "#8B76D8",
        archived: false,
        createdAt: time,
        updatedAt: time,
        demo: true,
      },
    ],
    stages: [
      {
        id: stageA,
        projectId: projectA,
        title: "图像准备",
        order: 0,
        demo: true,
      },
      {
        id: stageB,
        projectId: projectA,
        title: "方法验证",
        order: 1,
        demo: true,
      },
    ],
    tasks: [
      completed,
      makeTask("测试 Spotiflow 分割效果", {
        projectId: projectA,
        stageId: stageB,
        plannedDate: today,
        important: true,
        status: "doing",
        order: 1,
        dependsOn: [completed.id],
        notes: "先选取 3 张有代表性的图像，比较自动分割与人工判断。",
      }),
      makeTask("确认对照组图像", {
        projectId: projectA,
        stageId: stageB,
        blockedReason: "等待补充对照组图像",
        dueDate: addDays(today, 2),
        order: 2,
      }),
      makeTask("阅读分割方法文献并记下适用条件", {
        projectId: projectB,
        plannedDate: addDays(today, 1),
        order: 3,
      }),
      makeTask("想想如何简化每周数据整理", { inbox: true, order: 4 }),
    ],
    events: [
      {
        id: uid(),
        title: "本周实验复盘",
        date: today,
        startTime: "16:00",
        endTime: "16:30",
        notes: "演示日程",
        demo: true,
      },
    ],
    reviewNotes: {},
  };
}

export function useAppStore(): AppStore {
  const [data, setData] = useState<AppData>(emptyData);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<AppStore["saveState"]>("saved");
  const [error, setError] = useState("");
  const dataRef = useRef(data),
    loadedRef = useRef(false),
    loadFailed = useRef(false),
    revision = useRef(0);
  const persistence = useRef<ReturnType<typeof createPersistence> | undefined>(
    undefined,
  );
  persistence.current ??= createPersistence();
  useEffect(() => {
    let cancelled = false;
    persistence
      .current!.load()
      .then((saved) => {
        if (cancelled) return;
        const initial = saved ?? emptyData();
        dataRef.current = initial;
        loadedRef.current = true;
        setData(initial);
        setLoaded(true);
      })
      .catch((reason) => {
        if (!cancelled) {
          loadFailed.current = true;
          setError(
            `无法读取本地数据：${String(reason instanceof Error ? reason.message : reason)}。为保护原数据，已停止写入。请检查浏览器存储权限后刷新，或从已知正常的备份恢复。`,
          );
          setSaveState("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);
  // Warn only while a write is pending or failed; settled local changes need no prompt.
  useEffect(() => {
    if (saveState === "saved") return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState]);

  const commit = useCallback(
    (mutate: (current: AppData) => AppData, recover = false): boolean => {
      if (!loadedRef.current && !(recover && loadFailed.current)) {
        setError("本地数据尚未加载，暂时无法修改。");
        return false;
      }
      try {
        const next = validateData(mutate(dataRef.current));
        if (recover) {
          loadedRef.current = true;
          loadFailed.current = false;
          setLoaded(true);
        }
        dataRef.current = next;
        setData(next);
        setError("");
        const current = ++revision.current;
        setSaveState("saving");
        persistence
          .current!.save(next)
          .then(() => {
            if (current === revision.current) {
              setSaveState("saved");
              setError("");
            }
          })
          .catch((reason) => {
            if (current === revision.current) {
              setSaveState("error");
              setError(
                `本地保存失败：${String(reason instanceof Error ? reason.message : reason)}。请立即导出备份；之后的修改会再次尝试保存。`,
              );
            }
          });
        return true;
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason));
        return false;
      }
    },
    [],
  );
  return {
    data,
    loaded,
    saveState,
    error,
    addTask(title, patch = {}) {
      const id = uid(),
        time = now();
      const task: Task = {
        id,
        title: title.trim(),
        notes: "",
        status: "todo",
        inbox: true,
        important: false,
        order:
          Math.max(-1, ...dataRef.current.tasks.map((item) => item.order)) + 1,
        createdAt: time,
        updatedAt: time,
      };
      return commit((current) => ({
        ...current,
        tasks: [...current.tasks, applyTaskPatch(task, patch, current, time)],
      }))
        ? id
        : "";
    },
    updateTask(id, patch) {
      commit((current) => ({
        ...current,
        tasks: current.tasks.map((task) =>
          task.id === id ? applyTaskPatch(task, patch, current) : task,
        ),
      }));
    },
    deleteTasks(ids) {
      const removed = new Set(ids);
      commit((current) => ({
        ...current,
        tasks: current.tasks
          .filter((task) => !removed.has(task.id))
          .map((task) => ({
            ...task,
            dependsOn: task.dependsOn?.filter((id) => !removed.has(id)),
          })),
      }));
    },
    addProject(patch) {
      const id = uid(),
        time = now();
      return commit((current) => ({
        ...current,
        projects: [
          ...current.projects,
          {
            title: "新项目",
            goal: "",
            description: "",
            color: "#4586ED",
            archived: false,
            ...patch,
            id,
            createdAt: time,
            updatedAt: time,
          },
        ],
      }))
        ? id
        : "";
    },
    updateProject(id, patch) {
      commit((current) => ({
        ...current,
        projects: current.projects.map((project) =>
          project.id === id
            ? {
                ...project,
                ...patch,
                id: project.id,
                createdAt: project.createdAt,
                updatedAt: now(),
              }
            : project,
        ),
      }));
    },
    addStage(projectId, title) {
      const id = uid();
      return commit((current) => ({
        ...current,
        stages: [
          ...current.stages,
          {
            id,
            projectId,
            title: title.trim(),
            order:
              Math.max(
                -1,
                ...current.stages
                  .filter((stage) => stage.projectId === projectId)
                  .map((stage) => stage.order),
              ) + 1,
          },
        ],
      }))
        ? id
        : "";
    },
    updateStage(id, title) {
      commit((current) => ({
        ...current,
        stages: current.stages.map((stage) =>
          stage.id === id ? { ...stage, title: title.trim() } : stage,
        ),
      }));
    },
    deleteStage(id) {
      commit((current) => ({
        ...current,
        stages: current.stages.filter((stage) => stage.id !== id),
        tasks: current.tasks.map((task) =>
          task.stageId === id
            ? { ...task, stageId: undefined, updatedAt: now() }
            : task,
        ),
      }));
    },
    addEvent(patch) {
      const id = uid();
      return commit((current) => ({
        ...current,
        events: [...current.events, { ...patch, id }],
      }))
        ? id
        : "";
    },
    updateEvent(id, patch) {
      commit((current) => ({
        ...current,
        events: current.events.map((event) =>
          event.id === id ? { ...event, ...patch, id: event.id } : event,
        ),
      }));
    },
    deleteEvent(id) {
      commit((current) => ({
        ...current,
        events: current.events.filter((event) => event.id !== id),
      }));
    },
    setReviewNote(week, note) {
      commit((current) => ({
        ...current,
        reviewNotes: { ...current.reviewNotes, [week]: note },
      }));
    },
    replaceData(next) {
      commit(() => next, true);
    },
    clearDemo() {
      commit(removeDemo);
    },
    loadDemo() {
      commit((current) => {
        if (
          [...current.tasks, ...current.projects, ...current.events].some(
            (item) => item.demo,
          )
        )
          return current;
        const demo = createDemoData();
        return {
          ...current,
          tasks: [...current.tasks, ...demo.tasks],
          projects: [...current.projects, ...demo.projects],
          stages: [...current.stages, ...demo.stages],
          events: [...current.events, ...demo.events],
        };
      });
    },
  };
}
