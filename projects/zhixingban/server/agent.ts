import { api, command } from "./client";
import { getAlerts } from "../src/alerts";
import { getPrinciples } from "../src/principles";
import { dateKey, isDateKey, todayKey, weekStart, addDays } from "../src/dates";
import type { AppData } from "../src/types";
export const commandTypes = [
  "task.add",
  "task.update",
  "task.updateMany",
  "task.reorder",
  "task.delete",
  "project.add",
  "project.update",
  "stage.add",
  "stage.update",
  "stage.delete",
  "event.add",
  "event.update",
  "event.delete",
  "progress.record",
  "monitor.update",
  "checkpoint.complete",
  "principle.save",
  "principle.delete",
  "template.save",
  "template.delete",
  "trash.restore",
  "trash.purge",
  "review.note",
];
const id = { type: "string", description: "通过 query 获取的 ID" };
export const agentTools = [
  {
    name: "zhixingban_query",
    description:
      "读取本机知行办的数据。先查询获取 ID 与 revision。review 汇总一周真实结果；不得把计划推断为进展。",
    inputSchema: {
      type: "object",
      properties: {
        resource: {
          type: "string",
          enum: [
            "state",
            "tasks",
            "projects",
            "stages",
            "events",
            "principles",
            "alerts",
            "progress",
            "review",
            "templates",
            "trash",
          ],
        },
        id,
        projectId: id,
        search: { type: "string" },
        week: {
          type: "string",
          description: "YYYY-MM-DD；自动取该周周一，默认本周",
        },
      },
      required: ["resource"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "zhixingban_apply",
    description:
      "维护本地任务、项目、阶段、日程、原则与进展。任务只需标题。计划/尝试/推测不能冒充已获得的结果，只有实际达成才能调用 checkpoint.complete。task.delete 进入回收站；project.update archived=true 归档。原则 condition 必须为明确支持的条件，文字原则用 manual，不自动执行任意文本。可传 expectedRevision 防止陈旧修改。",
    inputSchema: {
      type: "object",
      required: ["command"],
      additionalProperties: false,
      properties: {
        expectedRevision: { type: "integer", minimum: 0 },
        command: {
          type: "object",
          required: ["type"],
          properties: {
            type: { type: "string", enum: commandTypes },
            id,
            ids: { type: "array", items: id },
            title: { type: "string" },
            projectId: id,
            patch: {
              type: "object",
              description:
                "task: title,notes,status(todo/doing/paused/done),projectId,stageId,inbox,plannedDate,dueDate,important,blockedReason,dependsOn,nextAction,estimatedMinutes,obsidianUrl,recurrence。project: title,goal,description,color(#RRGGBB),archived,blockedReason,nextAction,obsidianUrl。event: title,date,startTime,endTime,notes。清除可选字段传 null。monitor: preset,paused,stallDays,followUpDate,checkpoint。日期 YYYY-MM-DD。",
            },
            target: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["task", "project"] },
                id,
              },
              required: ["type", "id"],
              additionalProperties: false,
            },
            note: { type: "string" },
            week: { type: "string" },
            principle: {
              type: "object",
              required: [
                "id",
                "title",
                "description",
                "enabled",
                "scope",
                "condition",
                "days",
                "unit",
                "action",
              ],
              properties: {
                id,
                title: { type: "string" },
                description: { type: "string" },
                enabled: { type: "boolean" },
                scope: {
                  type: "string",
                  enum: ["project", "task", "bug", "all"],
                },
                condition: {
                  type: "string",
                  enum: [
                    "stall",
                    "blocked",
                    "deadline",
                    "checkpoint",
                    "manual",
                  ],
                },
                days: { type: "integer", minimum: 0, maximum: 365 },
                unit: { type: "string", enum: ["calendar", "business"] },
                action: { type: "string" },
              },
              additionalProperties: false,
            },
            template: {
              type: "object",
              description:
                "id,title,notes 必填；可选 projectId,stageId,estimatedMinutes",
            },
          },
          additionalProperties: false,
        },
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: true },
  },
  {
    name: "zhixingban_backup",
    description:
      "在本机备份目录创建完整快照，包含已完成事项、回收站、原则和进展。",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
];
export async function runAgentTool(
  name: string,
  args: Record<string, unknown>,
  actor: "cli" | "mcp",
) {
  if (name === "zhixingban_backup")
    return api("backups", { method: "POST", body: "{}" });
  if (name === "zhixingban_apply") {
    let c = args.command as { type: string; id?: string };
    if (!c || !commandTypes.includes(c.type))
      throw new Error("操作不受支持，请先查看 schema");
    if (
      ["task.add", "project.add", "stage.add", "event.add"].includes(c.type) &&
      !c.id
    )
      c = { ...c, id: crypto.randomUUID() };
    const after = await command(
      c,
      actor,
      args.expectedRevision as number | undefined,
    );
    return {
      revision: after.revision,
      updatedAt: after.updatedAt,
      id: c.id,
      created: after.created,
    };
  }
  if (name !== "zhixingban_query") throw new Error("工具不存在");
  const { data, revision } = (await api("state")) as {
    data: AppData;
    revision: number;
  };
  const resource = args.resource;
  if (resource === "state") return { revision, data };
  if (resource === "alerts")
    return { revision, alerts: getAlerts(data, todayKey()) };
  if (resource === "review") {
    const date = args.week ?? todayKey();
    if (!isDateKey(date)) throw new Error("周日期无效");
    const start = weekStart(date),
      end = addDays(start, 6);
    const inWeek = (at?: string) =>
      at && dateKey(new Date(at)) >= start && dateKey(new Date(at)) <= end;
    return {
      revision,
      start,
      end,
      completed: data.tasks.filter((t) => inWeek(t.completedAt)),
      results:
        data.monitoring?.entries.filter(
          (e) => e.kind !== "adjustment" && inWeek(e.at),
        ) ?? [],
      adjustments:
        data.monitoring?.entries.filter(
          (e) => e.kind === "adjustment" && inWeek(e.at),
        ) ?? [],
      currentAlerts: getAlerts(data, todayKey()),
      note: data.reviewNotes[start] ?? "",
    };
  }
  const values =
    resource === "principles"
      ? getPrinciples(data)
      : resource === "progress"
        ? (data.monitoring?.entries ?? [])
        : resource === "tasks"
          ? data.tasks
          : resource === "projects"
            ? data.projects
            : resource === "events"
              ? data.events
              : resource === "stages"
                ? data.stages
                : resource === "templates"
                  ? (data.templates ?? [])
                  : resource === "trash"
                    ? (data.trash ?? [])
                    : undefined;
  if (!values) throw new Error("查询资源无效");
  return {
    revision,
    items: values.filter(
      (item) =>
        (!args.id || item.id === args.id) &&
        (!args.projectId ||
          (item as { projectId?: string }).projectId === args.projectId) &&
        (!args.search ||
          JSON.stringify(item)
            .toLowerCase()
            .includes(String(args.search).toLowerCase())),
    ),
  };
}
