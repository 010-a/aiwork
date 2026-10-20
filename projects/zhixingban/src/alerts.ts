import { addDays, dateKey, formatDate, localDate } from "./dates";
import { isBlocked } from "./selectors";
import { getPrinciples } from "./principles";
import type {
  AlertRules,
  AppData,
  Monitor,
  MonitoringAlert,
  MonitoringEntry,
  MonitorTarget,
  Project,
  Task,
  Principle,
} from "./types";

export const DEFAULT_ALERT_RULES: AlertRules = {
  projectStall: { enabled: true, days: 7 },
  bugStall: { enabled: true, days: 1 },
  checkpoint: { enabled: true },
  deadline: { enabled: true, days: 1 },
  blocked: { enabled: true, days: 3 },
};

/** Elapsed local calendar dates, so daylight saving does not add or remove a day. */
export function calendarDaysBetween(start: string, end: string): number {
  return Math.max(
    0,
    Math.round(
      (localDate(end).getTime() - localDate(start).getTime()) / 86_400_000,
    ),
  );
}

/** Weekdays crossed after the starting date. This is not a count of hours worked. */
export function businessDaysBetween(start: string, end: string): number {
  const total = calendarDaysBetween(start, end);
  let result = Math.floor(total / 7) * 5;
  for (let index = 1; index <= total % 7; index++) {
    const weekday = localDate(addDays(start, index)).getDay();
    if (weekday !== 0 && weekday !== 6) result++;
  }
  return result;
}

const asDate = (timestamp: string) => dateKey(new Date(timestamp));
const latest = (...dates: (string | undefined)[]) =>
  dates
    .filter((date): date is string => Boolean(date))
    .sort()
    .at(-1);
const meaningful = (entry: MonitoringEntry) => entry.kind !== "adjustment";
const RULE_TITLES: Record<keyof AlertRules, string> = {
  projectStall: "项目停滞",
  bugStall: "Bug 排查停滞",
  checkpoint: "目标未达",
  deadline: "截止日期风险",
  blocked: "阻碍跟进",
};

/** Task history stays with that task. Project history uses its recorded project, not today's grouping. */
export function getTargetEntries(
  data: AppData,
  target: MonitorTarget,
): MonitoringEntry[] {
  return (data.monitoring?.entries ?? [])
    .filter((entry) =>
      target.type === "task"
        ? entry.entityType === "task" && entry.entityId === target.id
        : (entry.entityType === "project" && entry.entityId === target.id) ||
          (entry.entityType === "task" && entry.projectId === target.id),
    )
    .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
}

/** Pure rules: no timers, AI calls, or edits to the data being inspected. */
function computeAlerts(
  data: AppData,
  today: string,
  onlyTarget?: MonitorTarget,
  principle?: Principle,
): MonitoringAlert[] {
  if (!data.monitoring) return [];
  const { enabledAt } = data.monitoring;
  const rules = principle
    ? {
        projectStall: {
          enabled: principle.condition === "stall",
          days: principle.days,
        },
        bugStall: {
          enabled: principle.condition === "stall",
          days: principle.days,
        },
        checkpoint: { enabled: principle.condition === "checkpoint" },
        deadline: {
          enabled: principle.condition === "deadline",
          days: principle.days,
        },
        blocked: {
          enabled: principle.condition === "blocked",
          days: principle.days,
        },
      }
    : data.monitoring.rules;
  const elapsed = (start: string, end: string, defaultBusiness: boolean) =>
    (principle ? principle.unit === "business" : defaultBusiness)
      ? businessDaysBetween(start, end)
      : calendarDaysBetween(start, end);
  const alerts: MonitoringAlert[] = [];
  const archivedIds = new Set(
    data.projects
      .filter((project) => project.archived)
      .map((project) => project.id),
  );
  const loggedCompletions =
    onlyTarget?.type === "task"
      ? undefined
      : new Set(
          data.monitoring.entries
            .filter(
              (entry) =>
                entry.entityType === "task" && entry.kind === "completed",
            )
            .map((entry) => entry.entityId),
        );

  function inspect(target: MonitorTarget, entity: Task | Project) {
    if (
      principle &&
      ((principle.scope === "project" && target.type !== "project") ||
        ((principle.scope === "task" || principle.scope === "bug") &&
          target.type !== "task") ||
        (principle.scope === "bug" && entity.monitor?.preset !== "bug"))
    )
      return;
    const monitor: Monitor = entity.monitor ?? {};
    const task = target.type === "task" ? (entity as Task) : undefined;
    const projectTasks =
      target.type === "project"
        ? data.tasks.filter((item) => item.projectId === entity.id)
        : [];
    const history = getTargetEntries(data, target);
    const legacyCompletions = projectTasks
      .filter((item) => !loggedCompletions?.has(item.id))
      .map((item) => item.completedAt);
    const lastProgress = latest(
      ...history.filter(meaningful).map((entry) => entry.at),
      ...legacyCompletions,
      task?.completedAt,
    );
    const waiting = task
      ? isBlocked(task, data)
      : Boolean(entity.blockedReason?.trim());
    const add = (
      rule: keyof AlertRules,
      reason: string,
      suggestion: string,
      severity: MonitoringAlert["severity"],
      since: string,
    ) => {
      alerts.push({
        id: `${target.type}-${target.id}-${principle?.id ?? rule}`,
        rule: principle?.id ?? rule,
        target,
        title: principle?.title ?? RULE_TITLES[rule],
        reason,
        suggestion: principle?.action || suggestion,
        severity,
        since,
      });
    };

    if (
      task?.dueDate &&
      rules.deadline.enabled &&
      task.dueDate <= addDays(today, rules.deadline.days)
    ) {
      const overdue = task.dueDate < today;
      add(
        "deadline",
        overdue
          ? `截止日期已过（${formatDate(task.dueDate)}），任务尚未完成`
          : `截止日期为${task.dueDate === today ? "今天" : formatDate(task.dueDate)}，任务尚未完成`,
        "确认剩余工作，调整执行顺序或交付范围。",
        overdue ? "danger" : "warning",
        task.dueDate,
      );
    }

    const checkpoint = monitor.checkpoint;
    if (
      checkpoint &&
      !checkpoint.completedAt &&
      rules.checkpoint.enabled &&
      checkpoint.date <= today
    ) {
      const overdue = checkpoint.date < today;
      add(
        "checkpoint",
        `目标「${checkpoint.title}」${overdue ? "已过检查日期" : "今天需要检查"}，尚未确认达成`,
        "对照达成条件检查结果；可以记录进展、确认达成或调整目标。",
        overdue ? "danger" : "warning",
        checkpoint.date,
      );
    }

    const paused = monitor.paused || task?.status === "paused";
    const future = task
      ? task.plannedDate && task.plannedDate > today && task.status !== "doing"
      : projectTasks.length > 0 &&
        projectTasks
          .filter((item) => item.status !== "done")
          .every(
            (item) =>
              item.plannedDate &&
              item.plannedDate > today &&
              item.status !== "doing",
          );

    // Explicit follow-up dates remain promises, even when elapsed-work checks are paused.
    if (
      waiting &&
      rules.blocked.enabled &&
      monitor.followUpDate &&
      monitor.followUpDate <= today
    ) {
      add(
        "blocked",
        `等待事项已到跟进日期（${formatDate(monitor.followUpDate)}）`,
        "跟进样本、数据或反馈，或安排可以先做的替代任务。",
        "warning",
        monitor.followUpDate,
      );
    }
    // A date promise still deserves a reminder while paused or collected; elapsed-work checks do not.
    if (paused || future || task?.inbox) return;

    if (waiting && rules.blocked.enabled && !monitor.followUpDate) {
      const baseline = latest(monitor.blockedSince, enabledAt)!;
      const since = asDate(baseline);
      const days = elapsed(since, today, true);
      if (days >= rules.blocked.days) {
        add(
          "blocked",
          `阻碍已持续 ${days} ${principle?.unit === "calendar" ? "个自然日" : "个工作日"}，尚未解除`,
          "跟进样本、数据或反馈，或安排可以先做的替代任务。",
          "warning",
          since,
        );
      }
    }
    if (waiting) return;

    const activeChildren = projectTasks.filter(
      (item) =>
        item.status !== "done" &&
        (item.monitor?.startedAt || item.status === "doing"),
    );
    const started =
      monitor.startedAt ??
      (task?.status === "doing" ? enabledAt : undefined) ??
      latest(
        ...activeChildren.map((item) => item.monitor?.startedAt ?? enabledAt),
        ...legacyCompletions,
      ) ??
      (lastProgress ? lastProgress : undefined);
    if (!started) return;
    const baseline = latest(
      enabledAt,
      entity.createdAt,
      started,
      monitor.resumedAt,
      lastProgress,
    )!;
    const since = asDate(baseline);
    if (since > today) return;
    if (
      target.type === "project" &&
      rules.projectStall.enabled &&
      !(
        projectTasks.length > 0 &&
        projectTasks.every((item) => item.status === "done")
      )
    ) {
      const days = elapsed(since, today, false);
      if (
        days >=
        ((!principle || principle.id === "projectStall"
          ? monitor.stallDays
          : undefined) ?? rules.projectStall.days)
      ) {
        add(
          "projectStall",
          `已连续 ${days} ${principle?.unit === "business" ? "个工作日" : "天"}没有记录有效进展`,
          "检查目标、缩小范围，确定一个能推进的小步骤；阴性结果也可以记录为进展。",
          "warning",
          since,
        );
      }
    }
    if (
      task &&
      (monitor.preset === "bug" || (principle && principle.scope !== "bug")) &&
      rules.bugStall.enabled
    ) {
      const days = elapsed(since, today, true);
      if (
        days >=
        ((!principle || principle.id === "bugStall"
          ? monitor.stallDays
          : undefined) ?? rules.bugStall.days)
      ) {
        add(
          "bugStall",
          `${monitor.preset === "bug" ? "Bug 排查" : "任务开始后"}已经过 ${days} ${principle?.unit === "calendar" ? "个自然日" : "个工作日"}，没有记录新进展`,
          "整理最小复现、缩小问题范围，考虑换一种方法或求助；这里计算经过的工作日，不是投入工时。",
          "warning",
          since,
        );
      }
    }
  }

  if (!onlyTarget || onlyTarget.type === "project") {
    for (const project of data.projects) {
      if (project.archived || (onlyTarget && project.id !== onlyTarget.id))
        continue;
      inspect({ type: "project", id: project.id }, project);
    }
  }
  if (!onlyTarget || onlyTarget.type === "task") {
    for (const task of data.tasks) {
      if (
        (onlyTarget && task.id !== onlyTarget.id) ||
        task.status === "done" ||
        (task.projectId && archivedIds.has(task.projectId))
      )
        continue;
      inspect({ type: "task", id: task.id }, task);
    }
  }
  return alerts.sort(
    (a, b) =>
      Number(b.severity === "danger") - Number(a.severity === "danger") ||
      a.since.localeCompare(b.since) ||
      a.id.localeCompare(b.id),
  );
}

export function getAlerts(data: AppData, today: string): MonitoringAlert[] {
  if (!data.monitoring?.principles) return computeAlerts(data, today);
  return getPrinciples(data)
    .filter((p) => p.enabled && p.condition !== "manual")
    .flatMap((p) => computeAlerts(data, today, undefined, p))
    .sort(
      (a, b) =>
        Number(b.severity === "danger") - Number(a.severity === "danger") ||
        a.since.localeCompare(b.since) ||
        a.id.localeCompare(b.id),
    );
}

export function getTargetAlerts(
  data: AppData,
  target: MonitorTarget,
  today: string,
): MonitoringAlert[] {
  if (!data.monitoring?.principles) return computeAlerts(data, today, target);
  return getPrinciples(data)
    .filter((p) => p.enabled && p.condition !== "manual")
    .flatMap((p) => computeAlerts(data, today, target, p));
}
