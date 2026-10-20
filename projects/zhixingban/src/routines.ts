import { addDays, dateKey, localDate } from "./dates";
import type { AppData, Recurrence, Task } from "./types";

export function nextOccurrence(
  base: string,
  today: string,
  rule: Recurrence,
): string {
  const advance = (value: string): string => {
    if (rule.unit !== "month")
      return addDays(value, rule.interval * (rule.unit === "week" ? 7 : 1));
    const d = localDate(value),
      anchor = rule.anchorDay ?? localDate(base).getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + rule.interval);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(anchor, last));
    return dateKey(d);
  };
  let result = advance(rule.mode === "completion" ? today : base);
  // Missed cycles don't generate a backlog of duplicate tasks.
  while (result <= today) result = advance(result);
  return result;
}
export function createRepeatedTask(
  data: AppData,
  previous: Task,
  completed: Task,
  time: string,
): AppData {
  const rule = completed.recurrence;
  if (
    !rule ||
    rule.paused ||
    previous.status === "done" ||
    completed.status !== "done" ||
    completed.repeatNextId
  )
    return data;
  const id = crypto.randomUUID();
  const plannedDate = nextOccurrence(
    completed.plannedDate ?? dateKey(new Date(time)),
    dateKey(new Date(time)),
    rule,
  );
  const next: Task = {
    id,
    title: completed.title,
    notes: completed.notes,
    status: "todo",
    inbox: false,
    important: completed.important,
    order: Math.max(-1, ...data.tasks.map((t) => t.order)) + 1,
    projectId: completed.projectId,
    stageId: completed.stageId,
    obsidianUrl: completed.obsidianUrl,
    nextAction: completed.nextAction,
    estimatedMinutes: completed.estimatedMinutes,
    recurrence: {
      ...rule,
      anchorDay:
        rule.anchorDay ??
        localDate(completed.plannedDate ?? dateKey(new Date(time))).getDate(),
    },
    plannedDate,
    createdAt: time,
    updatedAt: time,
    demo: completed.demo,
  };
  return {
    ...data,
    tasks: [
      ...data.tasks.map((t) =>
        t.id === completed.id ? { ...t, repeatNextId: id } : t,
      ),
      next,
    ],
  };
}
