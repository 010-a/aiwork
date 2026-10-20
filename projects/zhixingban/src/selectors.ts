import type { AppData, Task } from "./types";
import { dateKey, formatDate } from "./dates";

export function isArchivedTask(task: Task, data: AppData): boolean {
  return Boolean(
    task.projectId &&
      data.projects.find((project) => project.id === task.projectId)?.archived,
  );
}

/** A finished task has no remaining blocker. Project blockers affect its unfinished tasks. */
export function isBlocked(task: Task, data: AppData): boolean {
  if (task.status === "done") return false;
  return Boolean(
    task.blockedReason?.trim() ||
      data.projects
        .find((project) => project.id === task.projectId)
        ?.blockedReason?.trim() ||
      task.dependsOn?.some(
        (id) => data.tasks.find((other) => other.id === id)?.status !== "done",
      ),
  );
}

export function projectProgress(
  projectId: string,
  data: AppData,
): { done: number; total: number; percent: number } {
  const tasks = data.tasks.filter((task) => task.projectId === projectId);
  const done = tasks.filter((task) => task.status === "done").length;
  return {
    done,
    total: tasks.length,
    percent: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
  };
}

function completedOn(task: Task, today: string): boolean {
  return Boolean(
    task.completedAt && dateKey(new Date(task.completedAt)) === today,
  );
}

export function getTodayTasks(data: AppData, today: string): Task[] {
  return data.tasks
    .filter(
      (task) =>
        !isArchivedTask(task, data) &&
        (task.plannedDate === today ||
          Boolean(
            task.dueDate &&
              task.dueDate <= today &&
              (task.status !== "done" || completedOn(task, today)),
          ) ||
          completedOn(task, today)),
    )
    .sort(
      (a, b) =>
        a.order - b.order ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id),
    );
}

export interface TaskRecommendation {
  task: Task;
  reason: string;
}

/** Explicit rules: important, overdue/due today, in progress, planned today, future due, then other tasks.
 * Within a rule: deadline, manual order, creation time, stable ID. Blocked/paused/archived tasks are omitted.
 * A future planned date is respected unless importance, a current deadline, or ongoing work overrides it.
 */
export function recommendTasks(
  data: AppData,
  today: string,
): TaskRecommendation[] {
  function rank(task: Task): number {
    if (task.important) return 0;
    if (task.dueDate && task.dueDate <= today) return 1;
    if (task.status === "doing") return 2;
    if (task.plannedDate === today) return 3;
    if (task.dueDate) return 4;
    return 5;
  }
  function reason(task: Task): string {
    if (task.important) return "你已将这件事标记为重要";
    if (task.dueDate && task.dueDate < today)
      return `已超过截止日期（${formatDate(task.dueDate)}）`;
    if (task.dueDate === today) return "今天是截止日期";
    if (task.status === "doing") return "这件事已开始，可以接着做";
    if (task.plannedDate === today) return "你已计划在今天处理";
    if (task.dueDate) return `截止日期为 ${formatDate(task.dueDate)}`;
    return task.inbox ? "收集箱中尚未安排的事项" : "按你设置的任务顺序";
  }
  return data.tasks
    .filter(
      (task) =>
        task.status !== "done" &&
        task.status !== "paused" &&
        !isArchivedTask(task, data) &&
        !isBlocked(task, data) &&
        (!task.plannedDate ||
          task.plannedDate <= today ||
          task.important ||
          task.status === "doing" ||
          Boolean(task.dueDate && task.dueDate <= today)),
    )
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (rank(a) === 1 || rank(a) === 4
          ? (a.dueDate ?? "").localeCompare(b.dueDate ?? "")
          : 0) ||
        a.order - b.order ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id),
    )
    .map((task) => ({ task, reason: reason(task) }));
}
