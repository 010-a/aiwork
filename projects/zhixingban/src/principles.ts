import type { AlertRules, AppData, Principle } from "./types";
import { DEFAULT_ALERT_RULES } from "./alerts";

export function defaultPrinciples(
  rules: AlertRules = DEFAULT_ALERT_RULES,
): Principle[] {
  return [
    {
      id: "projectStall",
      title: "项目停滞",
      description: "已开始的项目没有记录有效进展",
      scope: "project",
      condition: "stall",
      days: rules.projectStall.days,
      unit: "calendar",
      action:
        "检查目标、缩小范围，确定一个能推进的小步骤；阴性结果也可以记录为进展。",
      enabled: rules.projectStall.enabled,
    },
    {
      id: "bugStall",
      title: "Bug 排查停滞",
      description: "开始排查后没有记录新信息",
      scope: "bug",
      condition: "stall",
      days: rules.bugStall.days,
      unit: "business",
      action: "整理最小复现、缩小问题范围，考虑换方法或求助。",
      enabled: rules.bugStall.enabled,
    },
    {
      id: "checkpoint",
      title: "目标未达",
      description: "到了检查日期，目标尚未确认达成",
      scope: "all",
      condition: "checkpoint",
      days: 0,
      unit: "calendar",
      action: "对照达成条件检查结果，确认达成或调整目标。",
      enabled: rules.checkpoint.enabled,
    },
    {
      id: "deadline",
      title: "截止日期风险",
      description: "临近截止日期或已经逾期",
      scope: "task",
      condition: "deadline",
      days: rules.deadline.days,
      unit: "calendar",
      action: "确认剩余工作，调整执行顺序或交付范围。",
      enabled: rules.deadline.enabled,
    },
    {
      id: "blocked",
      title: "阻碍跟进",
      description: "阻碍持续过久，或到达约定跟进日",
      scope: "all",
      condition: "blocked",
      days: rules.blocked.days,
      unit: "business",
      action: "跟进样本、数据或反馈，或安排可以先做的替代任务。",
      enabled: rules.blocked.enabled,
    },
  ];
}
export function getPrinciples(data: AppData): Principle[] {
  return (
    data.monitoring?.principles ?? defaultPrinciples(data.monitoring?.rules)
  );
}
export const conditionLabels: Record<Principle["condition"], string> = {
  stall: "没有有效进展",
  blocked: "阻碍持续 / 到跟进日",
  deadline: "临近截止日期",
  checkpoint: "目标检查日期已到",
  manual: "文字原则（不自动检查）",
};
