/** Shared by the browser, local API, CLI and MCP. No browser or Node dependencies. */
import type {
  AppData,
  CalendarEvent,
  Principle,
  Project,
  Task,
  TaskTemplate,
  TrashItem,
} from "./types";
import {
  applyTaskUpdate,
  applyProjectUpdate,
  applyProgress,
  applyMonitorUpdate,
  applyCheckpointCompletion,
  validateData,
  initializeMonitoring,
  reconcileBlockTransitions,
  removeDemo,
  createDemoData,
} from "./domain";
import { getPrinciples } from "./principles";
export interface Command {
  type: string;
  [key: string]: unknown;
}
function required(value: unknown): string {
  if (typeof value !== "string" || !value.trim())
    throw new Error("请提供非空文字或 ID");
  return value;
}
function obj(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("参数必须为对象");
  const optional = new Set([
    "projectId",
    "stageId",
    "plannedDate",
    "dueDate",
    "blockedReason",
    "dependsOn",
    "obsidianUrl",
    "nextAction",
    "estimatedMinutes",
    "recurrence",
    "repeatNextId",
    "monitor",
    "stallDays",
    "followUpDate",
    "checkpoint",
  ]);
  return Object.fromEntries(
    Object.entries(value).map(([key, v]) => [
      key,
      v === null && optional.has(key)
        ? undefined
        : v && typeof v === "object" && !Array.isArray(v)
          ? obj(v)
          : v,
    ]),
  );
}
export function deleteTasks(
  data: AppData,
  ids: string[],
  time: string,
): AppData {
  const removed = new Set(ids);
  const trash: TrashItem[] = data.tasks
    .filter((t) => removed.has(t.id))
    .map((task) => ({
      id: crypto.randomUUID(),
      deletedAt: time,
      task,
      entries:
        data.monitoring?.entries.filter(
          (e) => e.entityType === "task" && e.entityId === task.id,
        ) ?? [],
      dependents: data.tasks
        .filter((t) => t.dependsOn?.includes(task.id))
        .map((t) => t.id),
    }));
  return {
    ...data,
    trash: [...(data.trash ?? []), ...trash],
    tasks: data.tasks
      .filter((t) => !removed.has(t.id))
      .map((t) => ({
        ...t,
        dependsOn: t.dependsOn?.filter((id) => !removed.has(id)),
      })),
    ...(data.monitoring
      ? {
          monitoring: {
            ...data.monitoring,
            entries: data.monitoring.entries.filter(
              (e) => e.entityType !== "task" || !removed.has(e.entityId),
            ),
          },
        }
      : {}),
  };
}
export function restoreTrash(data: AppData, id: string): AppData {
  const item = data.trash?.find((t) => t.id === id);
  if (!item) throw new Error("回收站项目不存在");
  let result = { ...data, trash: data.trash!.filter((t) => t.id !== id) };
  if (item.event) {
    if (data.events.some((e) => e.id === item.event!.id))
      throw new Error("此日程 ID 已存在");
    return { ...result, events: [...data.events, item.event] };
  }
  const original = item.task!;
  if (data.tasks.some((t) => t.id === original.id))
    throw new Error("此任务 ID 已存在");
  const projectId = data.projects.some((p) => p.id === original.projectId)
    ? original.projectId
    : undefined;
  const task = {
    ...original,
    projectId,
    stageId: data.stages.some(
      (s) => s.id === original.stageId && s.projectId === projectId,
    )
      ? original.stageId
      : undefined,
    dependsOn: original.dependsOn?.filter((id) =>
      data.tasks.some((t) => t.id === id),
    ),
  };
  result = { ...result, tasks: [...data.tasks, task] };
  // Restore links only where safe. A changed graph must never be overwritten or made cyclic.
  for (const dependent of item.dependents ?? []) {
    const candidate = {
      ...result,
      tasks: result.tasks.map((t) =>
        t.id === dependent
          ? { ...t, dependsOn: [...new Set([...(t.dependsOn ?? []), task.id])] }
          : t,
      ),
    };
    try {
      validateData(candidate);
      result = candidate;
    } catch {
      /* Current graph takes precedence. */
    }
  }
  if (data.monitoring)
    result = {
      ...result,
      monitoring: {
        ...data.monitoring,
        entries: [
          ...data.monitoring.entries,
          ...item.entries.map((e) => ({
            ...e,
            projectId: data.projects.some((p) => p.id === e.projectId)
              ? e.projectId
              : undefined,
          })),
        ],
      },
    };
  return result;
}
export function executeCommand(
  data: AppData,
  command: Command,
  time = new Date().toISOString(),
): AppData {
  let result = data;
  const id = command.id as string;
  switch (command.type) {
    case "task.add": {
      const patch = command.patch === undefined ? {} : obj(command.patch);
      const task: Task = {
        id: typeof command.id === "string" ? command.id : crypto.randomUUID(),
        title: required(command.title).trim(),
        notes: "",
        status: "todo",
        inbox: true,
        important: false,
        order: Math.max(-1, ...data.tasks.map((t) => t.order)) + 1,
        createdAt: time,
        updatedAt: time,
      };
      result = applyTaskUpdate(
        { ...data, tasks: [...data.tasks, task] },
        task.id,
        patch as Partial<Task>,
        time,
      );
      break;
    }
    case "task.update": {
      if (!data.tasks.some((t) => t.id === required(id)))
        throw new Error("任务不存在");
      result = applyTaskUpdate(
        data,
        id,
        obj(command.patch) as Partial<Task>,
        time,
      );
      break;
    }
    case "task.updateMany":
    case "task.reorder": {
      const ids = command.ids;
      if (
        !Array.isArray(ids) ||
        !ids.length ||
        ids.some((id) => typeof id !== "string") ||
        new Set(ids).size !== ids.length
      )
        throw new Error("任务 ID 列表不能为空或重复");
      if (ids.some((id) => !data.tasks.some((t) => t.id === id)))
        throw new Error("部分任务已不存在，请重新读取");
      for (const [index, taskId] of ids.entries())
        result = applyTaskUpdate(
          result,
          taskId,
          command.type === "task.reorder"
            ? { order: index }
            : (obj(command.patch) as Partial<Task>),
          time,
        );
      break;
    }
    case "task.delete": {
      const ids = command.ids ?? [required(id)];
      if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string"))
        throw new Error("任务 ID 列表无效");
      result = deleteTasks(data, ids as string[], time);
      break;
    }
    case "project.add": {
      const patch = obj(command.patch);
      const project: Project = {
        title: "新项目",
        goal: "",
        description: "",
        color: "#4586ED",
        archived: false,
        ...patch,
        id: typeof command.id === "string" ? command.id : crypto.randomUUID(),
        createdAt: time,
        updatedAt: time,
      };
      result = { ...data, projects: [...data.projects, project] };
      break;
    }
    case "project.update": {
      if (!data.projects.some((p) => p.id === required(id)))
        throw new Error("项目不存在");
      result = applyProjectUpdate(
        data,
        id,
        obj(command.patch) as Partial<Project>,
        time,
      );
      break;
    }
    case "stage.add": {
      const projectId = required(command.projectId);
      result = {
        ...data,
        stages: [
          ...data.stages,
          {
            id:
              typeof command.id === "string" ? command.id : crypto.randomUUID(),
            title: required(command.title).trim(),
            projectId,
            order:
              Math.max(
                -1,
                ...data.stages
                  .filter((s) => s.projectId === projectId)
                  .map((s) => s.order),
              ) + 1,
          },
        ],
      };
      break;
    }
    case "stage.update":
      result = {
        ...data,
        stages: data.stages.map((s) =>
          s.id === required(id) ? { ...s, title: required(command.title) } : s,
        ),
      };
      break;
    case "stage.delete":
      result = {
        ...data,
        stages: data.stages.filter((s) => s.id !== required(id)),
        tasks: data.tasks.map((t) =>
          t.stageId === id ? { ...t, stageId: undefined } : t,
        ),
        templates: data.templates?.map((t) =>
          t.stageId === id ? { ...t, stageId: undefined } : t,
        ),
      };
      break;
    case "event.add":
      result = {
        ...data,
        events: [
          ...data.events,
          {
            ...obj(command.patch),
            id:
              typeof command.id === "string" ? command.id : crypto.randomUUID(),
          } as unknown as CalendarEvent,
        ],
      };
      break;
    case "event.update":
      result = {
        ...data,
        events: data.events.map((e) =>
          e.id === required(id) ? { ...e, ...obj(command.patch), id: e.id } : e,
        ),
      };
      break;
    case "event.delete": {
      const event = data.events.find((e) => e.id === required(id));
      if (!event) throw new Error("日程不存在");
      result = {
        ...data,
        events: data.events.filter((e) => e.id !== id),
        trash: [
          ...(data.trash ?? []),
          { id: crypto.randomUUID(), deletedAt: time, event, entries: [] },
        ],
      };
      break;
    }
    case "progress.record": {
      const target = obj(command.target);
      if (target.type !== "task" && target.type !== "project")
        throw new Error("进展对象类型无效");
      const entityId = required(target.id);
      if (
        !(target.type === "task" ? data.tasks : data.projects).some(
          (e) => e.id === entityId,
        )
      )
        throw new Error("进展对象不存在");
      result = applyProgress(
        data,
        { type: target.type, id: entityId },
        required(command.note),
        time,
      );
      break;
    }
    case "monitor.update":
    case "checkpoint.complete": {
      const target = obj(command.target);
      if (target.type !== "task" && target.type !== "project")
        throw new Error("对象类型无效");
      const t = { type: target.type, id: required(target.id) } as const;
      result =
        command.type === "monitor.update"
          ? applyMonitorUpdate(data, t, obj(command.patch), time)
          : applyCheckpointCompletion(data, t, time);
      break;
    }
    case "principle.save": {
      const principle = obj(command.principle) as unknown as Principle;
      const current = initializeMonitoring(data, time),
        principles = getPrinciples(current);
      result = {
        ...current,
        monitoring: {
          ...current.monitoring!,
          rules: Object.hasOwn(current.monitoring!.rules, principle.id)
            ? {
                ...current.monitoring!.rules,
                [principle.id]: {
                  enabled: principle.enabled,
                  ...(principle.id !== "checkpoint"
                    ? {
                        days: Math.max(
                          principle.id === "deadline" ? 0 : 1,
                          principle.days,
                        ),
                      }
                    : {}),
                },
              }
            : current.monitoring!.rules,
          principles: principles.some((p) => p.id === principle.id)
            ? principles.map((p) => (p.id === principle.id ? principle : p))
            : [...principles, principle],
        },
      };
      break;
    }
    case "principle.delete": {
      const current = initializeMonitoring(data, time);
      result = {
        ...current,
        monitoring: {
          ...current.monitoring!,
          principles: getPrinciples(current).filter(
            (p) => p.id !== required(id),
          ),
        },
      };
      break;
    }
    case "template.save": {
      const template = obj(command.template) as unknown as TaskTemplate;
      result = {
        ...data,
        templates: data.templates?.some((t) => t.id === template.id)
          ? data.templates.map((t) => (t.id === template.id ? template : t))
          : [...(data.templates ?? []), template],
      };
      break;
    }
    case "template.delete":
      result = {
        ...data,
        templates: data.templates?.filter((t) => t.id !== required(id)),
      };
      break;
    case "trash.restore":
      result = restoreTrash(data, required(id));
      break;
    case "trash.purge":
      result = {
        ...data,
        trash: data.trash?.filter((t) => t.id !== required(id)),
      };
      break;
    case "review.note":
      result = {
        ...data,
        reviewNotes: {
          ...data.reviewNotes,
          [required(command.week)]:
            typeof command.note === "string"
              ? command.note
              : required(command.note),
        },
      };
      break;
    case "data.replace":
      result = initializeMonitoring(validateData(command.data), time);
      break;
    case "demo.clear":
      result = removeDemo(data);
      break;
    case "demo.load": {
      if ([...data.tasks, ...data.projects, ...data.events].some((e) => e.demo))
        break;
      const demo = createDemoData();
      result = {
        ...data,
        tasks: [...data.tasks, ...demo.tasks],
        projects: [...data.projects, ...demo.projects],
        stages: [...data.stages, ...demo.stages],
        events: [...data.events, ...demo.events],
      };
      break;
    }
    default:
      throw new Error(`未知操作：${command.type}`);
  }
  return validateData(
    command.type === "data.replace"
      ? result
      : reconcileBlockTransitions(data, result, time),
  );
}
