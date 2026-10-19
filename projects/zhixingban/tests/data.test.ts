import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { addDays, dateKey, isDateKey, weekStart } from "../src/dates";
import {
  getTodayTasks,
  isBlocked,
  projectProgress,
  recommendTasks,
} from "../src/selectors";
import {
  applyTaskPatch,
  createDemoData,
  createPersistence,
  emptyData,
  exportBackup,
  parseBackup,
  removeDemo,
  validateData,
} from "../src/store";
import type { AppData, Task } from "../src/types";

const today = "2026-10-19";
const createdAt = "2026-10-19T02:00:00.000Z";
function task(id: string, patch: Partial<Task> = {}): Task {
  return {
    id,
    title: `任务 ${id}`,
    notes: "",
    status: "todo",
    inbox: true,
    important: false,
    order: 0,
    createdAt,
    updatedAt: createdAt,
    ...patch,
  };
}
function fixture(): AppData {
  return {
    ...emptyData(),
    projects: [
      {
        id: "project",
        title: "实验分析",
        goal: "验证分割方法",
        description: "",
        color: "#4586ED",
        archived: false,
        createdAt,
        updatedAt: createdAt,
      },
    ],
    stages: [{ id: "stage", projectId: "project", title: "测试", order: 0 }],
  };
}

describe("local calendar date helpers", () => {
  it("uses local fields and handles month/year/leap boundaries", () => {
    expect(dateKey(new Date(2026, 9, 19, 23, 30))).toBe(today);
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(weekStart("2026-10-25")).toBe(today);
    expect(weekStart(today)).toBe(today);
  });
  it("rejects impossible and ambiguous dates", () => {
    for (const value of [
      "2026-02-29",
      "2026-13-01",
      "2026-1-01",
      "",
      "2026-10-19T00:00:00Z",
    ])
      expect(isDateKey(value)).toBe(false);
    expect(() => addDays("2026-02-30", 1)).toThrow("无效日期");
  });
});

describe("unified task workflow", () => {
  it("collection → project/stage → today/calendar → complete updates all selectors and survives a backup", () => {
    const data = fixture();
    let current = task("workflow");
    data.tasks.push(current);
    expect(current.inbox).toBe(true);
    current = applyTaskPatch(
      current,
      { projectId: "project", stageId: "stage" },
      data,
      createdAt,
    );
    expect(current).toMatchObject({
      projectId: "project",
      stageId: "stage",
      inbox: false,
    });
    current = applyTaskPatch(current, { plannedDate: today }, data, createdAt);
    data.tasks = [current];
    expect(getTodayTasks(data, today).map((item) => item.id)).toEqual([
      "workflow",
    ]);
    expect(
      data.tasks.filter((item) => item.plannedDate === today),
    ).toHaveLength(1);
    expect(projectProgress("project", data)).toEqual({
      done: 0,
      total: 1,
      percent: 0,
    });
    current = applyTaskPatch(
      current,
      { status: "done" },
      data,
      "2026-10-19T05:00:00.000Z",
    );
    data.tasks = [current];
    expect(projectProgress("project", data)).toEqual({
      done: 1,
      total: 1,
      percent: 100,
    });
    expect(
      data.tasks.filter((item) => item.completedAt?.startsWith(today)),
    ).toHaveLength(1);
    expect(recommendTasks(data, today)).toEqual([]);
    expect(parseBackup(exportBackup(data))).toEqual(validateData(data));
  });
  it("preserves completion history on ordinary edits and clears it on reopening", () => {
    const data = fixture();
    const finished = applyTaskPatch(
      task("a"),
      { status: "done" },
      data,
      createdAt,
    );
    const edited = applyTaskPatch(
      finished,
      { title: "修改标题", id: "wrong", createdAt: "wrong" },
      data,
      "2026-10-20T00:00:00.000Z",
    );
    expect(edited).toMatchObject({
      id: "a",
      createdAt,
      completedAt: createdAt,
    });
    expect(
      applyTaskPatch(edited, { status: "todo" }, data).completedAt,
    ).toBeUndefined();
  });
  it("clears a stage when moving its task, and clears project/stage when returning to inbox", () => {
    const data = fixture();
    const grouped = task("a", {
      projectId: "project",
      stageId: "stage",
      inbox: false,
    });
    expect(
      applyTaskPatch(grouped, { projectId: undefined }, data).stageId,
    ).toBeUndefined();
    expect(applyTaskPatch(grouped, { inbox: true }, data)).toMatchObject({
      inbox: true,
      projectId: undefined,
      stageId: undefined,
    });
  });
  it("preserves spaces during successive autosaved title, blocker and note-link edits", () => {
    const data = emptyData();
    let current = task("typing");
    for (const field of ["title", "blockedReason", "obsidianUrl"] as const) {
      const sentence =
        field === "title"
          ? "Test Spotiflow segmentation "
          : field === "blockedReason"
            ? "等待 control images 补充 "
            : "C:\\Research Notes\\实验 记录.md ";
      for (let length = 1; length <= sentence.length; length++) {
        const value = sentence.slice(0, length);
        current = applyTaskPatch(current, { [field]: value }, data, createdAt);
        expect(current[field]).toBe(value);
        expect(
          validateData({ ...data, tasks: [current] }).tasks[0][field],
        ).toBe(value);
      }
    }
    expect(
      applyTaskPatch(current, { blockedReason: "   ", obsidianUrl: " " }, data),
    ).toMatchObject({ blockedReason: undefined, obsidianUrl: undefined });
    expect(() =>
      validateData({
        ...data,
        tasks: [applyTaskPatch(current, { title: "  " }, data)],
      }),
    ).toThrow("不能为空");
  });
  it("counts all project tasks, including stages, without inventing progress for an empty project", () => {
    const data = fixture();
    data.tasks = [
      task("a", { projectId: "project", inbox: false }),
      task("b", {
        projectId: "project",
        inbox: false,
        stageId: "stage",
        status: "done",
        completedAt: createdAt,
      }),
    ];
    expect(projectProgress("project", data)).toEqual({
      done: 1,
      total: 2,
      percent: 50,
    });
    expect(projectProgress("none", data)).toEqual({
      done: 0,
      total: 0,
      percent: 0,
    });
  });
});

describe("honest actionable recommendations", () => {
  it("orders important, urgent deadlines, doing, planned today and future deadline, excluding blockers and paused/archived tasks", () => {
    const data = fixture();
    data.projects[0].archived = true;
    data.tasks = [
      task("future", { dueDate: addDays(today, 10) }),
      task("today", { plannedDate: today }),
      task("doing", { status: "doing" }),
      task("due", { dueDate: today }),
      task("overdue", { dueDate: addDays(today, -1) }),
      task("important", { important: true }),
      task("paused", { status: "paused", important: true }),
      task("blocked", { blockedReason: "等待样本", important: true }),
      task("archived", { inbox: false, projectId: "project", important: true }),
    ];
    const recommendations = recommendTasks(data, today);
    expect(recommendations.map((item) => item.task.id)).toEqual([
      "important",
      "overdue",
      "due",
      "doing",
      "today",
      "future",
    ]);
    expect(recommendations.map((item) => item.reason)).toEqual(
      expect.arrayContaining([
        "你已将这件事标记为重要",
        "今天是截止日期",
        "你已计划在今天处理",
      ]),
    );
  });
  it("only treats an unmet dependency as blocking; completing it releases the dependent task", () => {
    const data = fixture();
    data.tasks = [
      task("first"),
      task("next", { dependsOn: ["first"], important: true }),
    ];
    expect(isBlocked(data.tasks[1], data)).toBe(true);
    expect(recommendTasks(data, today).map((item) => item.task.id)).toEqual([
      "first",
    ]);
    data.tasks[0] = {
      ...data.tasks[0],
      status: "done",
      completedAt: createdAt,
    };
    expect(isBlocked(data.tasks[1], data)).toBe(false);
    expect(recommendTasks(data, today)[0].task.id).toBe("next");
  });
  it("includes unfinished overdue tasks and today completions, without repeating old overdue completions", () => {
    const data = emptyData();
    const yesterday = addDays(today, -1);
    data.tasks = [
      task("planned", { plannedDate: today }),
      task("overdue", { dueDate: yesterday }),
      task("old-done", {
        dueDate: yesterday,
        status: "done",
        completedAt: "2026-10-17T12:00:00.000Z",
      }),
      task("done-today", {
        status: "done",
        completedAt: new Date(2026, 9, 19, 12).toISOString(),
      }),
    ];
    expect(getTodayTasks(data, today).map((item) => item.id)).toEqual([
      "done-today",
      "overdue",
      "planned",
    ]);
  });
  it("respects manual ordering when recommendations share a rule", () => {
    const data = emptyData();
    data.tasks = [
      task("second", { plannedDate: today, order: 2 }),
      task("first", { plannedDate: today, order: 1 }),
    ];
    expect(recommendTasks(data, today).map((item) => item.task.id)).toEqual([
      "first",
      "second",
    ]);
  });
  it("respects a future plan unless importance, an urgent deadline, or ongoing work overrides it", () => {
    const data = emptyData();
    const future = addDays(today, 3);
    data.tasks = [
      task("future-planned", { plannedDate: future }),
      task("future-inbox", { inbox: true, plannedDate: future }),
      task("future-planned-due-later", {
        plannedDate: future,
        dueDate: addDays(today, 4),
      }),
      task("important", { plannedDate: future, important: true }),
      task("urgent", { plannedDate: future, dueDate: today }),
      task("ongoing", { plannedDate: future, status: "doing" }),
      task("unscheduled-with-deadline", { dueDate: future }),
      task("inbox"),
    ];
    const recommendations = recommendTasks(data, today);
    expect(recommendations.map((item) => item.task.id)).toEqual([
      "important",
      "urgent",
      "ongoing",
      "unscheduled-with-deadline",
      "inbox",
    ]);
    expect(
      recommendations.find(
        (item) => item.task.id === "unscheduled-with-deadline",
      )?.reason,
    ).toBe("截止日期为 10/22");
  });
});

describe("strict recoverable JSON backups", () => {
  it("round-trips Unicode notes and all entity kinds without aliases", () => {
    const data = createDemoData(today);
    data.reviewNotes[today] = "发现一个问题：先验证，再推广。";
    const restored = parseBackup(exportBackup(data));
    expect(restored).toEqual(validateData(data));
    restored.tasks[0].title = "改动";
    expect(data.tasks[0].title).not.toBe("改动");
  });
  it("accepts BOM-prefixed JSON and clean empty data", () => {
    expect(parseBackup(`\uFEFF${JSON.stringify(emptyData())}`)).toEqual(
      emptyData(),
    );
  });
  it("keeps safe partially typed Obsidian and Windows paths editable", () => {
    for (const obsidianUrl of [
      "obsidian:",
      "obsidian:/",
      "obsidian://open?vault=研究&file=记录",
      "C:",
      "C:\\Notes\\实验.md",
    ]) {
      const data = emptyData();
      data.tasks = [task("a", { obsidianUrl })];
      expect(validateData(data).tasks[0].obsidianUrl).toBe(obsidianUrl);
    }
  });
  it.each([
    [
      "wrong schema",
      (data: AppData) => {
        (data as unknown as Record<string, unknown>).schemaVersion = 2;
      },
    ],
    [
      "invalid status",
      (data: AppData) => {
        data.tasks[0].status = "unknown" as Task["status"];
      },
    ],
    [
      "invalid date",
      (data: AppData) => {
        data.tasks[0].plannedDate = "2026-02-30";
      },
    ],
    [
      "invalid timestamp",
      (data: AppData) => {
        data.tasks[0].updatedAt = "2026-02-30T00:00:00.000Z";
      },
    ],
    [
      "missing project",
      (data: AppData) => {
        data.tasks[0].projectId = "missing";
        data.tasks[0].inbox = false;
      },
    ],
    [
      "wrong stage",
      (data: AppData) => {
        data.tasks[0].stageId = "missing";
      },
    ],
    [
      "missing dependency",
      (data: AppData) => {
        data.tasks[0].dependsOn = ["missing"];
      },
    ],
    [
      "duplicate id",
      (data: AppData) => {
        data.tasks.push({ ...data.tasks[0] });
      },
    ],
    [
      "bad flag",
      (data: AppData) => {
        data.tasks[0].demo = "yes" as unknown as boolean;
      },
    ],
    [
      "unsafe link",
      (data: AppData) => {
        data.tasks[0].obsidianUrl = "javascript:alert(1)";
      },
    ],
    [
      "nonfinite order",
      (data: AppData) => {
        data.tasks[0].order = Infinity;
      },
    ],
    [
      "completed timestamp mismatch",
      (data: AppData) => {
        data.tasks[0].status = "todo";
      },
    ],
    [
      "end before start",
      (data: AppData) => {
        data.events[0].endTime = "08:00";
      },
    ],
  ])("rejects %s and leaves the original data untouched", (_label, corrupt) => {
    const original = createDemoData(today),
      before = exportBackup(original);
    const malformed = structuredClone(original);
    corrupt(malformed);
    expect(() => validateData(malformed)).toThrow("备份校验失败");
    expect(exportBackup(original)).toBe(before);
  });
  it("rejects dependency cycles, malformed arrays, prototype keys, and control characters", () => {
    const data = emptyData();
    data.tasks = [
      task("a", { dependsOn: ["b"] }),
      task("b", { dependsOn: ["a"] }),
    ];
    expect(() => validateData(data)).toThrow("循环依赖");
    expect(() => parseBackup('{"schemaVersion":1,"tasks":{}}')).toThrow();
    expect(() => parseBackup('{"__proto__":{}}')).toThrow("不安全字段");
    expect(() =>
      validateData({
        ...emptyData(),
        tasks: [task("a", { title: "a\u0000b" })],
      }),
    ).toThrow();
  });
  it("accepts a shared dependency graph without falsely reporting a cycle", () => {
    const data = emptyData();
    data.tasks = [
      task("a", { dependsOn: ["b", "c"] }),
      task("b", { dependsOn: ["d"] }),
      task("c", { dependsOn: ["d"] }),
      task("d"),
    ];
    expect(validateData(data).tasks).toHaveLength(4);
  });
});

describe("demo isolation and durable IndexedDB snapshots", () => {
  it("clears only marked sample records and cleans references in retained user records", () => {
    const demo = createDemoData(today);
    demo.tasks.push(
      task("real", {
        projectId: demo.projects[0].id,
        stageId: demo.stages[0].id,
        inbox: false,
        dependsOn: [demo.tasks[0].id],
      }),
    );
    demo.events.push({
      id: "real-event",
      title: "真实会议",
      date: today,
      startTime: "09:00",
      endTime: "10:00",
      notes: "",
    });
    demo.reviewNotes[today] = "真实回顾";
    const retained = removeDemo(demo);
    expect(retained.tasks).toHaveLength(1);
    expect(retained.tasks[0]).toMatchObject({
      id: "real",
      projectId: undefined,
      stageId: undefined,
      dependsOn: [],
    });
    expect(retained.events.map((item) => item.id)).toEqual(["real-event"]);
    expect(retained.reviewNotes[today]).toBe("真实回顾");
    expect(validateData(retained)).toEqual(retained);
  });
  it("starts absent, serializes rapid writes, and reloads the last edit from a new connection", async () => {
    const name = `test-${crypto.randomUUID()}`;
    const persistence = createPersistence(name);
    expect(await persistence.load()).toBeUndefined();
    const first = emptyData();
    first.tasks.push(task("first"));
    const last = emptyData();
    last.tasks.push(task("last", { title: "最后一次修改" }));
    const saves = [
      persistence.save(first),
      persistence.save(emptyData()),
      persistence.save(last),
    ];
    last.tasks[0].title = "此后内存中的修改不能影响已入队的快照";
    await Promise.all(saves);
    await persistence.flush();
    await persistence.close();
    const reopened = createPersistence(name);
    expect((await reopened.load())?.tasks[0].title).toBe("最后一次修改");
    await reopened.close();
  });
  it("rejects an invalid replacement before writing and keeps the existing saved snapshot", async () => {
    const persistence = createPersistence(`test-${crypto.randomUUID()}`);
    const original = emptyData();
    original.tasks.push(task("real"));
    await persistence.save(original);
    const invalid = { ...original, schemaVersion: 99 } as unknown as AppData;
    expect(() => persistence.save(invalid)).toThrow("不支持此数据版本");
    expect(await persistence.load()).toEqual(validateData(original));
    await persistence.close();
  });
  it("prevents stale browser tabs from overwriting a newer snapshot, and allows saving after a fresh load", async () => {
    const name = `conflict-${crypto.randomUUID()}`;
    const first = createPersistence(name),
      second = createPersistence(name);
    expect(await first.load()).toBeUndefined();
    expect(await second.load()).toBeUndefined();
    const firstData = emptyData();
    firstData.tasks.push(task("first"));
    const staleSecondData = emptyData();
    staleSecondData.tasks.push(task("second"));
    await first.save(firstData);
    await expect(second.save(staleSecondData)).rejects.toThrow(
      "其他窗口已更新",
    );
    await expect(second.save(staleSecondData)).rejects.toThrow(
      "先导出当前窗口的备份",
    );
    expect(await first.load()).toEqual(validateData(firstData));
    const latest = (await second.load())!;
    latest.tasks.push(task("second"));
    await second.save(latest);
    await expect(first.save(firstData)).rejects.toThrow("其他窗口已更新");
    expect((await first.load())?.tasks.map((item) => item.id)).toEqual([
      "first",
      "second",
    ]);
    await first.close();
    await second.close();
  });
});
