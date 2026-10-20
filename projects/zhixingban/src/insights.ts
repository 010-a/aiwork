import type { AppData, MonitorTarget, MonitoringEntry } from "./types";
import { addDays, dateKey } from "./dates";
import { calendarDaysBetween, getTargetEntries } from "./alerts";
import { isArchivedTask, isBlocked } from "./selectors";
export function progressForProject(
  data: AppData,
  projectId: string,
): MonitoringEntry[] {
  const entries = getTargetEntries(data, {
    type: "project",
    id: projectId,
  }).filter((e) => e.kind !== "adjustment");
  const logged = new Set(
    data.monitoring?.entries
      .filter((e) => e.kind === "completed" && e.entityType === "task")
      .map((e) => e.entityId),
  );
  const legacy: MonitoringEntry[] = data.tasks
    .filter(
      (t) => t.projectId === projectId && t.completedAt && !logged.has(t.id),
    )
    .map((t) => ({
      id: `legacy-${t.id}`,
      entityType: "task",
      entityId: t.id,
      projectId,
      at: t.completedAt!,
      kind: "completed",
      note: `完成任务：${t.title}`,
    }));
  return [...entries, ...legacy].sort((a, b) => b.at.localeCompare(a.at));
}
export function upcomingDays(data: AppData, today: string) {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i);
    const tasks = data.tasks.filter(
      (t) => t.status !== "done" && !isArchivedTask(t, data),
    );
    const planned = tasks.filter((t) => t.plannedDate === date),
      deadlines = tasks.filter((t) => t.dueDate === date),
      events = data.events.filter((e) => e.date === date);
    const eventMinutes = events.reduce((sum, e) => {
      const minutes = (v: string) =>
        Number(v.slice(0, 2)) * 60 + Number(v.slice(3));
      return sum + minutes(e.endTime) - minutes(e.startTime);
    }, 0);
    return {
      date,
      planned,
      deadlines,
      events,
      estimatedMinutes: planned.reduce(
        (sum, t) => sum + (t.estimatedMinutes ?? 0),
        0,
      ),
      unestimated: planned.filter((t) => !t.estimatedMinutes).length,
      eventMinutes,
    };
  });
}
export function currentBlockers(data: AppData, today: string) {
  const result: {
    target: MonitorTarget;
    title: string;
    reason: string;
    days: number;
    since?: string;
    followUp?: string;
  }[] = [];
  const sinceDate = (timestamp?: string) =>
    timestamp ? dateKey(new Date(timestamp)) : undefined;
  for (const p of data.projects.filter(
    (p) => !p.archived && p.blockedReason?.trim(),
  )) {
    const since = sinceDate(
      p.monitor?.blockedSince ?? data.monitoring?.enabledAt,
    );
    result.push({
      target: { type: "project", id: p.id },
      title: p.title,
      reason: p.blockedReason!,
      since,
      days: since ? calendarDaysBetween(since, today) : 0,
      followUp: p.monitor?.followUpDate,
    });
  }
  for (const t of data.tasks.filter(
    (t) =>
      t.status !== "done" && !isArchivedTask(t, data) && isBlocked(t, data),
  )) {
    const deps =
      t.dependsOn?.filter((id) =>
        data.tasks.some((other) => other.id === id && other.status !== "done"),
      ) ?? [];
    if (
      !t.blockedReason?.trim() &&
      !deps.length &&
      data.projects.some((p) => p.id === t.projectId && p.blockedReason?.trim())
    )
      continue;
    const since = sinceDate(
      t.monitor?.blockedSince ?? data.monitoring?.enabledAt,
    );
    result.push({
      target: { type: "task", id: t.id },
      title: t.title,
      reason: t.blockedReason?.trim() || `等待 ${deps.length} 个前置任务`,
      since,
      days: since ? calendarDaysBetween(since, today) : 0,
      followUp: t.monitor?.followUpDate,
    });
  }
  return result.sort(
    (a, b) => b.days - a.days || a.title.localeCompare(b.title),
  );
}
