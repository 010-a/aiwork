import { describe, expect, it } from "vitest";
import {
  parseBackup,
  emptyData,
  validateData,
  initializeMonitoring,
} from "../src/domain";
import { executeCommand } from "../src/commands";
import { getAlerts } from "../src/alerts";
import { getPrinciples } from "../src/principles";
import { nextOccurrence } from "../src/routines";
import {
  currentBlockers,
  progressForProject,
  upcomingDays,
} from "../src/insights";
import type { AppData, Principle } from "../src/types";
const start = "2026-10-01T08:00:00.000Z",
  finish = "2026-10-20T08:00:00.000Z";
function base() {
  let d = initializeMonitoring(emptyData(), start);
  d = executeCommand(
    d,
    { type: "project.add", id: "p", patch: { title: "研究项目" } },
    start,
  );
  return executeCommand(
    d,
    {
      type: "task.add",
      id: "t",
      title: "样本测试",
      patch: { projectId: "p", status: "doing", plannedDate: "2026-10-01" },
    },
    start,
  );
}
function principle(patch: Partial<Principle> = {}): Principle {
  return {
    id: "custom",
    title: "方法验证",
    description: "及时调整",
    scope: "task",
    condition: "stall",
    days: 2,
    unit: "calendar",
    action: "换一个对照",
    enabled: true,
    ...patch,
  };
}
function only(d: AppData, p: Principle) {
  return { ...d, monitoring: { ...d.monitoring!, principles: [p] } };
}
describe("原则库与解释性检查", () => {
  it("CLI 的 JSON null 清除可选字段，必填字段不能清除", () => {
    const d = executeCommand(base(), {
      type: "task.update",
      id: "t",
      patch: { plannedDate: null, estimatedMinutes: null },
    });
    expect(d.tasks[0].plannedDate).toBeUndefined();
    expect(d.tasks[0].estimatedMinutes).toBeUndefined();
    expect(() =>
      executeCommand(d, {
        type: "task.update",
        id: "t",
        patch: { title: null },
      }),
    ).toThrow();
  });
  it("支持普通任务停滞、建议文字与独立阈值", () => {
    const alerts = getAlerts(only(base(), principle()), "2026-10-20");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      rule: "custom",
      title: "方法验证",
      suggestion: "换一个对照",
      target: { type: "task", id: "t" },
    });
    expect(
      getAlerts(only(base(), principle({ days: 30 })), "2026-10-20"),
    ).toHaveLength(0);
  });
  it("文字原则、停用原则与空原则库不会触发", () => {
    expect(
      getAlerts(only(base(), principle({ condition: "manual" })), "2026-10-20"),
    ).toHaveLength(0);
    expect(
      getAlerts(only(base(), principle({ enabled: false })), "2026-10-20"),
    ).toHaveLength(0);
    let d = executeCommand(only(base(), principle()), {
      type: "principle.delete",
      id: "custom",
    });
    expect(getPrinciples(d)).toEqual([]);
    expect(getAlerts(d, "2026-10-20")).toEqual([]);
    d = validateData(JSON.parse(JSON.stringify(d)));
    expect(getPrinciples(d)).toEqual([]);
  });
  it("工作日和自然日、Bug 范围保持不同", () => {
    const d = executeCommand(
      base(),
      {
        type: "progress.record",
        target: { type: "task", id: "t" },
        note: "得到阴性结果",
      },
      "2026-10-16T08:00:00.000Z",
    );
    expect(getAlerts(only(d, principle()), "2026-10-18")).toHaveLength(1);
    expect(
      getAlerts(only(d, principle({ unit: "business" })), "2026-10-18"),
    ).toHaveLength(0);
    expect(
      getAlerts(only(d, principle({ scope: "bug" })), "2026-10-20"),
    ).toHaveLength(0);
  });
  it("字段和条件严格校验，不能用随意文本冒充程序", () => {
    expect(() =>
      validateData(
        only(base(), {
          ...principle(),
          condition: "随便判断",
        } as unknown as Principle),
      ),
    ).toThrow();
    expect(() => validateData(only(base(), principle({ days: -1 })))).toThrow();
    expect(() =>
      validateData(
        only(base(), principle({ condition: "deadline", scope: "project" })),
      ),
    ).toThrow();
  });
});
describe("回收站与重复任务", () => {
  it("导入和回收站恢复不会重置原来的阻碍观察日期", () => {
    const blocked = executeCommand(
      base(),
      { type: "task.update", id: "t", patch: { blockedReason: "等待样本" } },
      start,
    );
    const imported = executeCommand(
      emptyData(),
      { type: "data.replace", data: blocked },
      finish,
    );
    expect(imported.tasks[0].monitor?.blockedSince).toBe(start);
    const deleted = executeCommand(
      imported,
      { type: "task.delete", id: "t" },
      finish,
    );
    const restored = executeCommand(
      deleted,
      { type: "trash.restore", id: deleted.trash![0].id },
      finish,
    );
    expect(restored.tasks[0].monitor?.blockedSince).toBe(start);
  });
  it("删除后恢复任务、进展记录与依赖，并通过备份往返", () => {
    let d = executeCommand(
      base(),
      {
        type: "task.add",
        id: "dependent",
        title: "下一步",
        patch: { dependsOn: ["t"] },
      },
      start,
    );
    d = executeCommand(
      d,
      {
        type: "progress.record",
        target: { type: "task", id: "t" },
        note: "对照完成",
      },
      finish,
    );
    d = executeCommand(d, { type: "task.delete", ids: ["t"] }, finish);
    expect(d.tasks[0].dependsOn).toEqual([]);
    expect(d.monitoring!.entries).toEqual([]);
    d = validateData(JSON.parse(JSON.stringify(d)));
    d = executeCommand(d, { type: "trash.restore", id: d.trash![0].id });
    expect(d.tasks.find((t) => t.id === "t")?.title).toBe("样本测试");
    expect(d.tasks.find((t) => t.id === "dependent")?.dependsOn).toEqual(["t"]);
    expect(d.monitoring!.entries[0].note).toBe("对照完成");
  });
  it("批量恢复的依赖可以分次找回", () => {
    let d = executeCommand(
      base(),
      { type: "task.add", id: "b", title: "B", patch: { dependsOn: ["t"] } },
      start,
    );
    d = executeCommand(d, { type: "task.delete", ids: ["t", "b"] });
    const [a, b] = d.trash!;
    d = executeCommand(d, { type: "trash.restore", id: b.id });
    d = executeCommand(d, { type: "trash.restore", id: a.id });
    expect(d.tasks.find((t) => t.id === "b")?.dependsOn).toEqual(["t"]);
  });
  it("恢复时不覆盖新依赖，也不会引入环", () => {
    let d = executeCommand(
      base(),
      { type: "task.add", id: "b", title: "B", patch: { dependsOn: ["t"] } },
      start,
    );
    d = executeCommand(d, { type: "task.delete", id: "t" });
    d.trash![0].task!.dependsOn = ["b"];
    d = executeCommand(d, { type: "trash.restore", id: d.trash![0].id });
    expect(d.tasks.find((t) => t.id === "b")?.dependsOn).toEqual([]);
    expect(d.tasks.find((t) => t.id === "t")?.dependsOn).toEqual(["b"]);
  });
  it("日程可恢复，错误或冲突的回收站数据不会覆盖", () => {
    let d = executeCommand(base(), {
      type: "event.add",
      id: "e",
      patch: {
        title: "组会",
        date: "2026-10-20",
        startTime: "09:00",
        endTime: "10:00",
        notes: "",
      },
    });
    d = executeCommand(d, { type: "event.delete", id: "e" });
    d = executeCommand(d, { type: "trash.restore", id: d.trash![0].id });
    expect(d.events[0].id).toBe("e");
    expect(() =>
      validateData({
        ...d,
        trash: [
          {
            id: "bad",
            deletedAt: finish,
            entries: [],
            task: { title: "损坏" },
          },
        ],
      }),
    ).toThrow();
  });
  it("完成只产生一次下一周期，撤销可恢复完整状态", () => {
    const before = executeCommand(
      base(),
      {
        type: "task.update",
        id: "t",
        patch: {
          dueDate: "2026-10-21",
          recurrence: { interval: 1, unit: "week", mode: "schedule" },
        },
      },
      start,
    );
    let d = executeCommand(
      before,
      { type: "task.update", id: "t", patch: { status: "done" } },
      finish,
    );
    expect(d.tasks).toHaveLength(2);
    const next = d.tasks[1];
    expect(next.plannedDate).toBe("2026-10-22");
    expect(next.dueDate).toBeUndefined();
    d = executeCommand(d, {
      type: "task.update",
      id: "t",
      patch: { status: "todo" },
    });
    d = executeCommand(d, {
      type: "task.update",
      id: "t",
      patch: { status: "done" },
    });
    expect(d.tasks).toHaveLength(2);
    expect(validateData(JSON.parse(JSON.stringify(before))).tasks).toHaveLength(
      1,
    );
  });
  it("月末锚点、完成后重复与暂停正确", () => {
    const rule = {
      interval: 1,
      unit: "month",
      mode: "schedule",
      anchorDay: 31,
    } as const;
    expect(nextOccurrence("2026-01-31", "2026-01-31", rule)).toBe("2026-02-28");
    expect(nextOccurrence("2026-02-28", "2026-02-28", rule)).toBe("2026-03-31");
    expect(
      nextOccurrence("2026-01-01", "2026-10-20", {
        interval: 1,
        unit: "week",
        mode: "completion",
      }),
    ).toBe("2026-10-27");
    let d = executeCommand(base(), {
      type: "task.update",
      id: "t",
      patch: {
        recurrence: {
          interval: 1,
          unit: "day",
          mode: "schedule",
          paused: true,
        },
      },
    });
    d = executeCommand(d, {
      type: "task.update",
      id: "t",
      patch: { status: "done" },
    });
    expect(d.tasks).toHaveLength(1);
  });
});
describe("图表数据只来自已有记录", () => {
  it("项目完成不重复计数，任务移动不转移历史", () => {
    let d = executeCommand(
      base(),
      { type: "task.update", id: "t", patch: { status: "done" } },
      finish,
    );
    expect(progressForProject(d, "p")).toHaveLength(1);
    d = executeCommand(d, {
      type: "project.add",
      id: "other",
      patch: { title: "其他" },
    });
    d = executeCommand(d, {
      type: "task.update",
      id: "t",
      patch: { projectId: "other" },
    });
    expect(progressForProject(d, "p")).toHaveLength(1);
    expect(progressForProject(d, "other")).toHaveLength(0);
  });
  it("计划、截止、未估时与固定日程分开", () => {
    let d = executeCommand(base(), {
      type: "task.update",
      id: "t",
      patch: {
        plannedDate: "2026-10-20",
        dueDate: "2026-10-21",
        estimatedMinutes: 30,
      },
    });
    d = executeCommand(d, {
      type: "task.add",
      title: "未估时",
      patch: { plannedDate: "2026-10-20", inbox: false },
    });
    d = executeCommand(d, {
      type: "event.add",
      patch: {
        title: "讨论",
        date: "2026-10-20",
        startTime: "09:00",
        endTime: "10:00",
        notes: "",
      },
    });
    const days = upcomingDays(d, "2026-10-20");
    expect(days[0]).toMatchObject({
      estimatedMinutes: 30,
      unestimated: 1,
      eventMinutes: 60,
    });
    expect(days[1].deadlines).toHaveLength(1);
  });
  it("项目级阻碍不会为所有子任务重复画条", () => {
    const d = executeCommand(
      base(),
      { type: "project.update", id: "p", patch: { blockedReason: "等待样本" } },
      start,
    );
    expect(currentBlockers(d, "2026-10-20")).toHaveLength(1);
  });
});

describe("批量操作与文件备份入口", () => {
  it("批量更新和排序为单次领域操作，无效列表不产生部分更新", () => {
    let d = executeCommand(base(), {
      type: "task.add",
      id: "second",
      title: "另一件",
    });
    const before = d;
    d = executeCommand(d, {
      type: "task.updateMany",
      ids: ["t", "second"],
      patch: { plannedDate: "2026-10-20", inbox: false },
    });
    expect(d.tasks.every((t) => t.plannedDate === "2026-10-20")).toBe(true);
    expect(
      before.tasks.find((t) => t.id === "second")?.plannedDate,
    ).toBeUndefined();
    d = executeCommand(d, { type: "task.reorder", ids: ["second", "t"] });
    expect(d.tasks.find((t) => t.id === "second")?.order).toBe(0);
    expect(d.tasks.find((t) => t.id === "t")?.order).toBe(1);
    expect(() =>
      executeCommand(d, {
        type: "task.updateMany",
        ids: ["t", "missing"],
        patch: { title: "错误" },
      }),
    ).toThrow();
    expect(d.tasks.find((t) => t.id === "t")?.title).toBe("样本测试");
  });
  it("可导入服务快照与数据文件，损坏内层数据仍被拒绝", () => {
    const data = base();
    expect(
      parseBackup(JSON.stringify({ at: start, label: "安全快照", data })).tasks,
    ).toHaveLength(1);
    expect(
      parseBackup(JSON.stringify({ revision: 1, updatedAt: start, data }))
        .tasks,
    ).toHaveLength(1);
    expect(() =>
      parseBackup(
        JSON.stringify({
          at: start,
          label: "坏快照",
          data: { schemaVersion: 99 },
        }),
      ),
    ).toThrow();
  });
});
