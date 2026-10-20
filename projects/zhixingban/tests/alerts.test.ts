import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
  businessDaysBetween,
  calendarDaysBetween,
  DEFAULT_ALERT_RULES,
  getAlerts,
  getTargetAlerts,
  getTargetEntries,
} from "../src/alerts";
import {
  applyCheckpointCompletion,
  applyMonitorUpdate,
  applyProgress,
  applyProjectUpdate,
  applyTaskUpdate,
  createDemoData,
  createPersistence,
  emptyData,
  exportBackup,
  initializeMonitoring,
  parseBackup,
  removeDemo,
  reconcileBlockTransitions,
  validateData,
} from "../src/store";
import type { AppData, MonitorTarget, Task } from "../src/types";

const start = "2026-10-02T04:00:00.000Z"; // Friday in both UTC and China.
const friday = "2026-10-09";
const time = (date: string) => `${date}T04:00:00.000Z`;
const taskTarget: MonitorTarget = { type: "task", id: "task" };
const projectTarget: MonitorTarget = { type: "project", id: "project" };

function task(patch: Partial<Task> = {}): Task {
  return {
    id: "task",
    title: "排查图像读取问题",
    notes: "",
    status: "doing",
    inbox: false,
    important: false,
    order: 0,
    projectId: "project",
    createdAt: start,
    updatedAt: start,
    monitor: { preset: "bug", startedAt: start },
    ...patch,
  };
}

function fixture(patch: Partial<Task> = {}): AppData {
  return {
    ...emptyData(),
    projects: [
      {
        id: "project",
        title: "图像分析",
        goal: "验证分割流程",
        description: "",
        color: "#4586ED",
        archived: false,
        createdAt: start,
        updatedAt: start,
        monitor: { startedAt: start },
      },
    ],
    tasks: [task(patch)],
    monitoring: {
      enabledAt: start,
      rules: structuredClone(DEFAULT_ALERT_RULES),
      entries: [],
    },
  };
}
const rulesFor = (data: AppData, target = taskTarget, date = friday) =>
  getTargetAlerts(data, target, date).map((alert) => alert.rule);

describe("local, explainable warning thresholds", () => {
  it("counts local calendar days and weekdays crossed, without treating a weekend as work", () => {
    expect(calendarDaysBetween("2026-10-02", "2026-10-09")).toBe(7);
    expect(businessDaysBetween("2026-10-02", "2026-10-03")).toBe(0);
    expect(businessDaysBetween("2026-10-02", "2026-10-04")).toBe(0);
    expect(businessDaysBetween("2026-10-02", "2026-10-05")).toBe(1);
    expect(businessDaysBetween("2026-10-02", "2026-10-16")).toBe(10);
    expect(businessDaysBetween("2026-10-05", "2026-10-02")).toBe(0);
    expect(calendarDaysBetween("2026-03-07", "2026-03-09")).toBe(2);
  });

  it("warns an active project exactly at seven calendar days and supports its own threshold", () => {
    const data = fixture();
    expect(rulesFor(data, projectTarget, "2026-10-08")).toEqual([]);
    expect(rulesFor(data, projectTarget)).toEqual(["projectStall"]);
    data.projects[0].monitor!.stallDays = 10;
    expect(rulesFor(data, projectTarget)).toEqual([]);
    expect(rulesFor(data, projectTarget, "2026-10-12")).toEqual([
      "projectStall",
    ]);
    data.monitoring!.rules.projectStall.enabled = false;
    expect(rulesFor(data, projectTarget, "2026-10-20")).toEqual([]);
  });

  it("only uses the explicit Bug preset; titles cannot silently opt a task in", () => {
    const data = fixture({ title: "改 Bug", monitor: { startedAt: start } });
    expect(rulesFor(data)).toEqual([]);
    data.tasks[0].monitor!.preset = "bug";
    expect(rulesFor(data, taskTarget, "2026-10-04")).toEqual([]);
    expect(rulesFor(data, taskTarget, "2026-10-05")).toEqual(["bugStall"]);
    const warning = getTargetAlerts(data, taskTarget, "2026-10-05")[0];
    expect(warning.title).toBe("Bug 排查停滞");
    expect(warning.reason).toContain("1 个工作日");
    expect(warning.suggestion).toContain("不是投入工时");
  });

  it("does not call an unstarted task or untouched project stalled", () => {
    const data = fixture({ status: "todo", monitor: { preset: "bug" } });
    data.projects[0].monitor = undefined;
    expect(getAlerts(data, "2026-10-30")).toEqual([]);
    const started = applyTaskUpdate(
      data,
      "task",
      { status: "doing" },
      time("2026-10-30"),
    );
    expect(started.tasks[0].monitor?.startedAt).toBe(time("2026-10-30"));
    expect(started.projects[0].monitor?.startedAt).toBe(time("2026-10-30"));
    expect(rulesFor(started, taskTarget, "2026-10-30")).toEqual([]);
  });

  it("excludes collected, finished, archived and future-planned items from elapsed-work checks", () => {
    for (const patch of [
      { inbox: true, projectId: undefined },
      { status: "done" as const, completedAt: start },
      { status: "todo" as const, plannedDate: "2026-11-01" },
    ]) {
      expect(rulesFor(fixture(patch))).toEqual([]);
    }
    const archived = fixture();
    archived.projects[0].archived = true;
    expect(getAlerts(archived, friday)).toEqual([]);
    const done = fixture({ status: "done", completedAt: start });
    expect(rulesFor(done, projectTarget, "2026-10-30")).toEqual([]);
  });

  it("deduplicates each rule for a target and puts breached promises first", () => {
    const data = fixture({
      dueDate: "2026-10-08",
      monitor: {
        preset: "bug",
        startedAt: start,
        checkpoint: {
          title: "复现故障",
          criteria: "最小样本能复现",
          date: "2026-10-07",
        },
      },
    });
    const warnings = getAlerts(data, friday);
    expect(new Set(warnings.map((alert) => alert.id)).size).toBe(
      warnings.length,
    );
    expect(warnings[0].severity).toBe("danger");
    expect(warnings.filter((alert) => alert.rule === "bugStall")).toHaveLength(
      1,
    );
  });

  it("single-target checks match full-view warnings and honor exclusions", () => {
    const data = fixture({ dueDate: "2026-10-08" });
    data.tasks.push(
      task({
        id: "done",
        status: "done",
        completedAt: start,
        dueDate: "2026-10-08",
      }),
    );
    const all = getAlerts(data, friday);
    for (const target of [
      taskTarget,
      projectTarget,
      { type: "task" as const, id: "done" },
      { type: "task" as const, id: "missing" },
    ]) {
      expect(getTargetAlerts(data, target, friday)).toEqual(
        all.filter(
          (alert) =>
            alert.target.type === target.type && alert.target.id === target.id,
        ),
      );
    }
    data.projects[0].archived = true;
    expect(getTargetAlerts(data, taskTarget, friday)).toEqual([]);
    expect(getTargetAlerts(data, projectTarget, friday)).toEqual([]);
  });
});

describe("meaningful progress and adjustment history", () => {
  it("does not start a legacy parent anew when an ongoing task's title is edited", () => {
    const data = fixture();
    data.projects[0].monitor = undefined;
    expect(rulesFor(data, projectTarget)).toContain("projectStall");
    const edited = applyTaskUpdate(
      data,
      "task",
      { title: "修改说明文字" },
      time(friday),
    );
    expect(edited.projects[0].monitor).toBeUndefined();
    expect(rulesFor(edited, projectTarget)).toContain("projectStall");
  });

  it("counts a negative result as progress for both task and project", () => {
    const before = fixture();
    expect(rulesFor(before, projectTarget)).toContain("projectStall");
    const after = applyProgress(
      before,
      taskTarget,
      "  阴性结果：已排除输入图像损坏。  ",
      time(friday),
    );
    expect(after.monitoring!.entries[0]).toMatchObject({
      kind: "progress",
      note: "阴性结果：已排除输入图像损坏。",
      projectId: "project",
    });
    expect(getAlerts(after, friday)).toEqual([]);
    expect(rulesFor(after, projectTarget, "2026-10-16")).toContain(
      "projectStall",
    );
    expect(() => applyProgress(before, taskTarget, "   ")).toThrow(
      "请用一句话",
    );
    expect(before.monitoring!.entries).toEqual([]);
  });

  it("does not count editing or moving dates as progress, and retains the original dates", () => {
    const data = fixture({ dueDate: "2026-10-08" });
    const edited = applyTaskUpdate(
      data,
      "task",
      {
        title: "更新标题",
        notes: "补充说明",
        dueDate: "2026-11-01",
        plannedDate: friday,
      },
      time(friday),
    );
    expect(rulesFor(edited)).toContain("bugStall");
    expect(rulesFor(edited, projectTarget)).toContain("projectStall");
    expect(edited.monitoring!.entries).toHaveLength(1);
    expect(edited.monitoring!.entries[0]).toMatchObject({
      kind: "adjustment",
      previousDate: "2026-10-08",
      newDate: "2026-11-01",
    });
    const sameDate = applyTaskUpdate(
      edited,
      "task",
      { dueDate: "2026-11-01" },
      time(friday),
    );
    expect(sameDate.monitoring!.entries).toHaveLength(1);
    const removedDate = applyTaskUpdate(
      sameDate,
      "task",
      { dueDate: undefined },
      time(friday),
    );
    expect(removedDate.monitoring!.entries[1]).toMatchObject({
      previousDate: "2026-11-01",
      newDate: undefined,
    });
  });

  it("records completion once, updates the parent and freezes historical project membership", () => {
    let data = fixture();
    data.tasks.push(
      task({ id: "remaining", monitor: undefined, status: "todo" }),
    );
    data.projects.push({ ...data.projects[0], id: "other" });
    data = applyTaskUpdate(data, "task", { status: "done" }, time(friday));
    expect(data.monitoring!.entries).toHaveLength(1);
    expect(rulesFor(data, projectTarget)).toEqual([]);
    data = applyTaskUpdate(
      data,
      "task",
      { title: "改标题", projectId: "other" },
      time("2026-10-12"),
    );
    expect(data.monitoring!.entries).toHaveLength(1);
    expect(getTargetEntries(data, projectTarget)[0].projectId).toBe("project");
    expect(getTargetEntries(data, { type: "project", id: "other" })).toEqual(
      [],
    );
    expect(getTargetEntries(data, taskTarget)).toHaveLength(1);
  });

  it("recognizes legacy child completions while keeping ordinary updatedAt out of progress", () => {
    const data = fixture();
    data.tasks.push(
      task({
        id: "finished",
        status: "done",
        completedAt: time(friday),
        monitor: undefined,
      }),
    );
    data.projects[0].updatedAt = time(friday);
    expect(rulesFor(data, projectTarget)).toEqual([]);
    data.tasks.pop();
    expect(rulesFor(data, projectTarget)).toContain("projectStall");
  });

  it("does not revive a completed task's frozen progress when it is moved into a new project", () => {
    let data = fixture();
    data = applyTaskUpdate(
      data,
      "task",
      { status: "done" },
      time("2026-10-05"),
    );
    data.projects.push({
      ...data.projects[0],
      id: "new",
      createdAt: time("2026-10-19"),
      updatedAt: time("2026-10-19"),
      monitor: undefined,
    });
    data.tasks.push(
      task({
        id: "unstarted",
        status: "todo",
        projectId: "new",
        monitor: undefined,
      }),
    );
    data = applyTaskUpdate(
      data,
      "task",
      { projectId: "new" },
      time("2026-10-19"),
    );
    expect(getTargetEntries(data, { type: "project", id: "new" })).toEqual([]);
    expect(
      rulesFor(data, { type: "project", id: "new" }, "2026-10-30"),
    ).toEqual([]);
  });

  it("pauses and resumes observation without making a fictitious progress entry", () => {
    const data = fixture();
    const paused = applyMonitorUpdate(
      data,
      taskTarget,
      { paused: true },
      time(friday),
    );
    expect(paused.tasks[0].status).toBe("paused");
    expect(rulesFor(paused)).toEqual([]);
    const resumed = applyMonitorUpdate(
      paused,
      taskTarget,
      { paused: false },
      time("2026-10-12"),
    );
    expect(resumed.tasks[0]).toMatchObject({
      status: "doing",
      monitor: { resumedAt: time("2026-10-12") },
    });
    expect(rulesFor(resumed, taskTarget, "2026-10-12")).toEqual([]);
    expect(rulesFor(resumed, taskTarget, "2026-10-13")).toContain("bugStall");
    expect(resumed.monitoring!.entries).toEqual([]);
    const projectPaused = applyMonitorUpdate(
      data,
      projectTarget,
      { paused: true },
      time(friday),
    );
    expect(rulesFor(projectPaused, projectTarget)).toEqual([]);
  });
});

describe("goals, deadlines and waiting conditions", () => {
  it("keeps explicit date promises visible in the inbox or during an observation pause", () => {
    const data = fixture({
      inbox: true,
      projectId: undefined,
      status: "paused",
      dueDate: "2026-10-08",
      blockedReason: "等待反馈",
      monitor: {
        paused: true,
        startedAt: start,
        followUpDate: friday,
        checkpoint: { title: "提交样本", criteria: "三张图像", date: friday },
      },
    });
    expect(rulesFor(data).sort()).toEqual([
      "blocked",
      "checkpoint",
      "deadline",
    ]);
    data.tasks[0].monitor!.followUpDate = "2026-10-12";
    expect(rulesFor(data).sort()).toEqual(["checkpoint", "deadline"]);
  });

  it("separates due dates from planned dates and warns on explicit promises even while paused", () => {
    const data = fixture({
      status: "paused",
      plannedDate: "2026-11-01",
      dueDate: "2026-10-10",
      monitor: {
        paused: true,
        startedAt: start,
        checkpoint: {
          title: "确认方法",
          criteria: "记录适用条件",
          date: friday,
        },
      },
    });
    const alerts = getTargetAlerts(data, taskTarget, friday);
    expect(alerts.map((item) => item.rule).sort()).toEqual([
      "checkpoint",
      "deadline",
    ]);
    expect(alerts.every((item) => item.severity === "warning")).toBe(true);
    expect(
      getTargetAlerts(data, taskTarget, "2026-10-11").every(
        (item) => item.severity === "danger",
      ),
    ).toBe(true);
    delete data.tasks[0].dueDate;
    delete data.tasks[0].monitor!.checkpoint;
    expect(rulesFor(data)).toEqual([]);
  });

  it("completes a checkpoint without completing its containing task or repeating history", () => {
    const data = fixture();
    data.tasks[0].monitor!.checkpoint = {
      title: "复现故障",
      criteria: "提供最小复现样本",
      date: "2026-10-08",
    };
    expect(rulesFor(data)).toContain("checkpoint");
    const completed = applyCheckpointCompletion(data, taskTarget, time(friday));
    expect(completed.tasks[0].status).toBe("doing");
    expect(rulesFor(completed)).toEqual([]);
    expect(completed.monitoring!.entries[0]).toMatchObject({
      kind: "checkpoint",
      note: "达成目标：复现故障",
    });
    expect(
      applyCheckpointCompletion(completed, taskTarget, time("2026-10-10")),
    ).toBe(completed);
  });

  it("retains a checkpoint's original check date when moving or removing it", () => {
    let data = fixture();
    data.projects[0].monitor!.checkpoint = {
      title: "验证流程",
      criteria: "三张图像",
      date: "2026-10-08",
    };
    data = applyMonitorUpdate(
      data,
      projectTarget,
      {
        checkpoint: {
          ...data.projects[0].monitor!.checkpoint!,
          date: "2026-10-20",
        },
      },
      time(friday),
    );
    expect(data.monitoring!.entries[0]).toMatchObject({
      kind: "adjustment",
      previousDate: "2026-10-08",
      newDate: "2026-10-20",
    });
    expect(rulesFor(data, projectTarget)).toEqual(["projectStall"]);
    data = applyMonitorUpdate(
      data,
      projectTarget,
      { checkpoint: undefined },
      time(friday),
    );
    expect(data.monitoring!.entries[1]).toMatchObject({
      kind: "adjustment",
      previousDate: "2026-10-20",
    });
  });

  it("records changed goals or criteria once, without treating the edit as progress", () => {
    let data = fixture();
    data.projects[0].monitor!.checkpoint = {
      title: "验证方法 A",
      criteria: "三张图像",
      date: "2026-10-12",
    };
    data = applyMonitorUpdate(
      data,
      projectTarget,
      {
        checkpoint: {
          title: "验证方法 B",
          criteria: "三张图像",
          date: "2026-10-12",
        },
      },
      time(friday),
    );
    expect(data.monitoring!.entries[0]).toMatchObject({
      kind: "adjustment",
      note: "调整检查目标：验证方法 A → 验证方法 B",
    });
    expect(rulesFor(data, projectTarget)).toEqual(["projectStall"]);
    data = applyMonitorUpdate(
      data,
      projectTarget,
      {
        checkpoint: {
          title: "验证方法 B",
          criteria: "五张图像",
          date: "2026-10-12",
        },
      },
      time(friday),
    );
    expect(data.monitoring!.entries[1].note).toContain("调整目标达成条件");
    data = applyMonitorUpdate(
      data,
      projectTarget,
      {
        checkpoint: {
          title: "比较 A 和 B",
          criteria: "五张图像",
          date: "2026-10-15",
        },
      },
      time(friday),
    );
    expect(data.monitoring!.entries).toHaveLength(3);
    expect(data.monitoring!.entries[2]).toMatchObject({
      kind: "adjustment",
      previousDate: "2026-10-12",
      newDate: "2026-10-15",
    });
    data = applyCheckpointCompletion(data, projectTarget, time(friday));
    expect(data.monitoring!.entries).toHaveLength(4);
    expect(data.monitoring!.entries.at(-1)!.kind).toBe("checkpoint");
  });

  it("uses three elapsed weekdays for blockers, suppresses stale warnings, and respects follow-up dates", () => {
    let data = fixture({
      blockedReason: "等待图像",
      monitor: { preset: "bug", startedAt: start, blockedSince: start },
    });
    expect(rulesFor(data, taskTarget, "2026-10-06")).toEqual([]);
    expect(rulesFor(data, taskTarget, "2026-10-07")).toEqual(["blocked"]);
    data.tasks[0].monitor!.followUpDate = "2026-10-12";
    expect(rulesFor(data)).toEqual([]);
    expect(rulesFor(data, taskTarget, "2026-10-12")).toEqual(["blocked"]);
    data = applyTaskUpdate(
      data,
      "task",
      { blockedReason: "等待图像与对照组" },
      time(friday),
    );
    expect(data.tasks[0].monitor!.blockedSince).toBe(start);
    data = applyTaskUpdate(data, "task", { blockedReason: " " }, time(friday));
    expect(data.tasks[0].monitor).toMatchObject({
      blockedSince: undefined,
      followUpDate: undefined,
      resumedAt: time(friday),
    });
    expect(rulesFor(data)).toEqual([]);
    expect(data.monitoring!.entries).toEqual([]);
  });

  it("tracks first blocker entry rather than every character of its description", () => {
    let data = fixture();
    data = applyTaskUpdate(data, "task", { blockedReason: "等" }, time(friday));
    data = applyTaskUpdate(
      data,
      "task",
      { blockedReason: "等待反馈 " },
      time("2026-10-12"),
    );
    expect(data.tasks[0].monitor!.blockedSince).toBe(time(friday));
    data = applyProjectUpdate(
      data,
      "project",
      { blockedReason: "等待设备" },
      time(friday),
    );
    data = applyProjectUpdate(
      data,
      "project",
      { blockedReason: "等待设备修复" },
      time("2026-10-12"),
    );
    expect(data.projects[0].monitor!.blockedSince).toBe(time(friday));
  });

  it("records explicit follow-up scheduling and adjustments, while automatic release stays quiet", () => {
    let data = fixture({ blockedReason: "等待反馈" });
    data = applyMonitorUpdate(
      data,
      taskTarget,
      { followUpDate: "2026-10-12" },
      time(friday),
    );
    expect(data.monitoring!.entries[0]).toMatchObject({
      kind: "adjustment",
      note: "安排下次跟进",
      newDate: "2026-10-12",
    });
    data = applyMonitorUpdate(
      data,
      taskTarget,
      { followUpDate: "2026-10-13" },
      time(friday),
    );
    expect(data.monitoring!.entries[1]).toMatchObject({
      previousDate: "2026-10-12",
      newDate: "2026-10-13",
    });
    data = applyMonitorUpdate(
      data,
      taskTarget,
      { followUpDate: "2026-10-13" },
      time(friday),
    );
    expect(data.monitoring!.entries).toHaveLength(2);
    data = applyTaskUpdate(
      data,
      "task",
      { blockedReason: undefined },
      time(friday),
    );
    expect(data.monitoring!.entries).toHaveLength(2);
    expect(data.tasks[0].monitor!.followUpDate).toBeUndefined();
    expect(rulesFor(data)).toEqual([]);
    data = applyMonitorUpdate(
      data,
      projectTarget,
      { followUpDate: "2026-10-15" },
      time(friday),
    );
    data = applyMonitorUpdate(
      data,
      projectTarget,
      { followUpDate: undefined },
      time(friday),
    );
    expect(data.monitoring!.entries.at(-1)).toMatchObject({
      note: "移除跟进日期",
      previousDate: "2026-10-15",
      newDate: undefined,
    });
  });

  it("inherits project blockers and starts a fresh observation period when they are released", () => {
    let data = fixture();
    data = applyProjectUpdate(
      data,
      "project",
      { blockedReason: "等待设备" },
      time(friday),
    );
    expect(data.tasks[0].monitor!.blockedSince).toBe(time(friday));
    expect(rulesFor(data, taskTarget, "2026-10-12")).toEqual([]);
    expect(rulesFor(data, taskTarget, "2026-10-14")).toEqual(["blocked"]);
    data = applyProjectUpdate(
      data,
      "project",
      { blockedReason: undefined },
      time("2026-10-14"),
    );
    expect(data.tasks[0].monitor).toMatchObject({
      blockedSince: undefined,
      resumedAt: time("2026-10-14"),
    });
    expect(rulesFor(data, taskTarget, "2026-10-14")).toEqual([]);
    expect(data.monitoring!.entries).toEqual([]);
  });

  it("tracks dependency entry and release on completion or deletion without inventing progress", () => {
    let data = fixture();
    data.tasks.push(task({ id: "first", status: "todo", monitor: undefined }));
    data = applyTaskUpdate(
      data,
      "task",
      { dependsOn: ["first"] },
      time(friday),
    );
    expect(data.tasks[0].monitor!.blockedSince).toBe(time(friday));
    expect(rulesFor(data, taskTarget, "2026-10-12")).toEqual([]);
    const completed = applyTaskUpdate(
      data,
      "first",
      { status: "done" },
      time("2026-10-12"),
    );
    expect(completed.tasks[0].monitor).toMatchObject({
      blockedSince: undefined,
      resumedAt: time("2026-10-12"),
    });
    expect(rulesFor(completed, taskTarget, "2026-10-12")).toEqual([]);
    expect(getTargetEntries(completed, taskTarget)).toEqual([]);
    const deleted = reconcileBlockTransitions(
      data,
      {
        ...data,
        tasks: data.tasks
          .filter((item) => item.id !== "first")
          .map((item) => ({ ...item, dependsOn: [] })),
      },
      time("2026-10-12"),
    );
    expect(deleted.tasks[0].monitor!.resumedAt).toBe(time("2026-10-12"));
    expect(rulesFor(deleted, taskTarget, "2026-10-12")).toEqual([]);
    expect(deleted.monitoring!.entries).toEqual([]);
  });

  it("does not reset the wait clock while another blocker is still present", () => {
    let data = fixture({
      blockedReason: "等待文件",
      monitor: { preset: "bug", startedAt: start, blockedSince: start },
    });
    data.projects[0].blockedReason = "等待设备";
    data = applyTaskUpdate(
      data,
      "task",
      { blockedReason: undefined },
      time(friday),
    );
    expect(data.tasks[0].monitor!.blockedSince).toBe(start);
    expect(rulesFor(data)).toEqual(["blocked"]);
    data = applyProjectUpdate(
      data,
      "project",
      { blockedReason: undefined },
      time(friday),
    );
    expect(data.tasks[0].monitor!.resumedAt).toBe(time(friday));
  });
});

describe("optional metadata, strict backups and durable grace periods", () => {
  it("leaves old backups unchanged until first-use initialization, then keeps the same grace baseline", () => {
    const legacy = fixture({ monitor: undefined });
    delete legacy.monitoring;
    delete legacy.projects[0].monitor;
    const restored = parseBackup(exportBackup(legacy));
    expect(restored.monitoring).toBeUndefined();
    expect(restored.tasks[0].monitor).toBeUndefined();
    expect(getAlerts(restored, friday)).toEqual([]);
    const initialized = initializeMonitoring(restored, time(friday));
    expect(initialized.schemaVersion).toBe(1);
    expect(initializeMonitoring(initialized, time("2026-11-01"))).toBe(
      initialized,
    );
    expect(initialized.monitoring!.enabledAt).toBe(time(friday));
    expect(getAlerts(initialized, friday)).toEqual([]);
  });

  it("protects older active tasks from an immediate stale warning at upgrade", () => {
    const legacy = fixture();
    delete legacy.monitoring;
    const initialized = initializeMonitoring(legacy, time(friday));
    expect(getAlerts(initialized, friday)).toEqual([]);
    expect(rulesFor(initialized, taskTarget, "2026-10-12")).toContain(
      "bugStall",
    );
    expect(rulesFor(initialized, projectTarget, "2026-10-15")).toEqual([]);
    expect(rulesFor(initialized, projectTarget, "2026-10-16")).toContain(
      "projectStall",
    );
  });

  it("round-trips rules, checkpoints, progress and date-adjustment history through JSON and IndexedDB", async () => {
    let data = fixture({ dueDate: "2026-10-08" });
    data.monitoring!.rules.deadline.days = 0;
    data = applyProgress(
      data,
      taskTarget,
      "排除了一个假设",
      time("2026-10-05"),
    );
    data = applyTaskUpdate(
      data,
      "task",
      { dueDate: "2026-10-20" },
      time(friday),
    );
    data = applyMonitorUpdate(
      data,
      projectTarget,
      {
        checkpoint: {
          title: "比较算法",
          criteria: "样本对照",
          date: "2026-10-12",
        },
      },
      time(friday),
    );
    const restored = parseBackup(exportBackup(data));
    expect(restored).toEqual(validateData(data));
    const name = `warnings-${crypto.randomUUID()}`;
    const persistence = createPersistence(name);
    await persistence.load();
    await persistence.save(restored);
    await persistence.close();
    const reopened = createPersistence(name);
    const loaded = (await reopened.load())!;
    expect(loaded.monitoring!.enabledAt).toBe(start);
    expect(getAlerts(loaded, friday)).toEqual(getAlerts(data, friday));
    expect(getTargetEntries(loaded, taskTarget)).toHaveLength(2);
    await reopened.close();
  });

  it.each([
    [
      "invalid threshold",
      (data: AppData) => {
        data.monitoring!.rules.projectStall.days = 0;
      },
    ],
    [
      "noninteger threshold",
      (data: AppData) => {
        data.monitoring!.rules.bugStall.days = 1.5;
      },
    ],
    [
      "excessive threshold",
      (data: AppData) => {
        data.tasks[0].monitor!.stallDays = 366;
      },
    ],
    [
      "invalid enabled flag",
      (data: AppData) => {
        data.monitoring!.rules.blocked.enabled = "yes" as unknown as boolean;
      },
    ],
    [
      "invalid preset",
      (data: AppData) => {
        data.tasks[0].monitor!.preset = "guess" as "bug";
      },
    ],
    [
      "invalid grace time",
      (data: AppData) => {
        data.monitoring!.enabledAt = "yesterday";
      },
    ],
    [
      "invalid start time",
      (data: AppData) => {
        data.tasks[0].monitor!.startedAt = "2026-02-30T00:00:00.000Z";
      },
    ],
    [
      "invalid follow-up",
      (data: AppData) => {
        data.tasks[0].monitor!.followUpDate = "2026-02-30";
      },
    ],
    [
      "invalid checkpoint",
      (data: AppData) => {
        data.projects[0].monitor!.checkpoint = {
          title: "目标",
          criteria: "",
          date: "2026-02-30",
        };
      },
    ],
    [
      "missing target",
      (data: AppData) => {
        data.monitoring!.entries[0].entityId = "missing";
      },
    ],
    [
      "missing historical project",
      (data: AppData) => {
        data.monitoring!.entries[0].projectId = "missing";
      },
    ],
    [
      "invalid entry kind",
      (data: AppData) => {
        data.monitoring!.entries[0].kind = "opened" as "progress";
      },
    ],
    [
      "empty progress",
      (data: AppData) => {
        data.monitoring!.entries[0].note = " ";
      },
    ],
    [
      "duplicate entry",
      (data: AppData) => {
        data.monitoring!.entries.push({ ...data.monitoring!.entries[0] });
      },
    ],
  ])("rejects %s without modifying the prior snapshot", (_name, corrupt) => {
    const data = applyProgress(fixture(), taskTarget, "结果", time(friday));
    const before = exportBackup(data);
    const invalid = structuredClone(data);
    corrupt(invalid);
    expect(() => validateData(invalid)).toThrow("备份校验失败");
    expect(exportBackup(data)).toBe(before);
  });

  it("clears only demonstration history and cleans surviving historical project references", () => {
    let data = createDemoData(friday);
    data.tasks.push(
      task({ id: "real", projectId: data.projects[0].id, monitor: undefined }),
    );
    data = applyProgress(
      data,
      { type: "task", id: data.tasks[1].id },
      "演示进展",
      time(friday),
    );
    data = applyProgress(
      data,
      { type: "task", id: "real" },
      "真实进展",
      time(friday),
    );
    const cleaned = removeDemo(data);
    expect(cleaned.monitoring!.entries).toHaveLength(1);
    expect(cleaned.monitoring!.entries[0]).toMatchObject({
      note: "真实进展",
      projectId: undefined,
    });
    expect(cleaned.tasks[0].inbox).toBe(true);
    expect(validateData(cleaned)).toEqual(cleaned);
    expect(getAlerts(cleaned, friday)).toEqual([]);
  });

  it("makes demo warnings inspectable without bypassing the first-use grace period", () => {
    const demo = createDemoData(friday);
    expect(
      getAlerts(demo, friday)
        .map((alert) => alert.rule)
        .sort(),
    ).toEqual(["blocked", "checkpoint"]);
    expect(getAlerts(removeDemo(demo), friday)).toEqual([]);
  });
});
