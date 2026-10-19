import { useEffect, useId, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Flag,
  Plus,
  ShieldCheck,
} from "lucide-react";
import type {
  AlertRules,
  AppStore,
  Monitor,
  MonitorTarget,
  ViewProps,
} from "../types";
import {
  DEFAULT_ALERT_RULES,
  getAlerts,
  getTargetAlerts,
  getTargetEntries,
} from "../alerts";
import { formatDate, isDateKey } from "../dates";
import { Modal } from "./ui";
import "../monitoring.css";

function timestampLabel(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AlertsSection({
  store,
  today,
  openTask,
  navigate,
  compact = false,
  onOpenRules,
}: Pick<ViewProps, "store" | "today" | "openTask" | "navigate"> & {
  compact?: boolean;
  onOpenRules?: () => void;
}) {
  const [all, setAll] = useState(false);
  const alerts = getAlerts(store.data, today);
  const groups = new Map<string, typeof alerts>();
  for (const alert of alerts) {
    const key = `${alert.target.type}:${alert.target.id}`;
    groups.set(key, [...(groups.get(key) ?? []), alert]);
  }
  const grouped = [...groups.entries()];
  if (compact && !grouped.length) return null;
  const limit = compact ? 3 : 4;
  return (
    <section
      className={`card monitoring-alerts ${grouped.length ? "has-alerts" : "is-clear"}`}
      aria-label="需要调整"
    >
      <div className="monitoring-heading">
        <div className="monitoring-heading-title">
          {grouped.length ? (
            <AlertTriangle size={21} />
          ) : (
            <ShieldCheck size={21} />
          )}
          <div>
            <h2>{grouped.length ? "需要调整" : "目前没有需要调整的事项"}</h2>
            <p>
              {grouped.length
                ? `${grouped.length} 件事值得检查 · 说明原因，找到下一步`
                : "已开始的项目与任务会按预警原则持续检查。"}
            </p>
          </div>
        </div>
        {onOpenRules && (
          <button className="text-link" onClick={onOpenRules}>
            查看原则 <ArrowRight size={14} />
          </button>
        )}
      </div>
      {!!grouped.length && (
        <div className="monitor-alert-list">
          {(all ? grouped : grouped.slice(0, limit)).map(([key, items]) => {
            const target = items[0].target;
            const entity =
              target.type === "task"
                ? store.data.tasks.find((item) => item.id === target.id)
                : store.data.projects.find((item) => item.id === target.id);
            if (!entity) return null;
            const danger = items.some((item) => item.severity === "danger");
            return (
              <article
                key={key}
                className={`monitor-alert-group ${danger ? "danger" : "warning"}`}
                data-monitor-target={key}
              >
                <div className="monitor-alert-top">
                  <span
                    className={`monitor-severity ${danger ? "danger" : "warning"}`}
                  >
                    <AlertTriangle size={14} />
                    {danger ? "已偏离约定" : "需要检查"}
                  </span>
                  <span className="muted">
                    {target.type === "project" ? "项目" : "任务"}
                  </span>
                </div>
                <h3>{entity.title}</h3>
                <div className="monitor-alert-reasons">
                  {items.map((item) => (
                    <p key={item.id}>
                      <strong>{item.title}</strong>
                      <span>{item.reason}</span>
                    </p>
                  ))}
                </div>
                <p className="monitor-suggestion">{items[0].suggestion}</p>
                <button
                  className="text-link"
                  aria-label={`处理预警 ${entity.title}`}
                  onClick={() =>
                    target.type === "task"
                      ? openTask(target.id)
                      : navigate("projects", target.id)
                  }
                >
                  查看并调整 <ArrowRight size={15} />
                </button>
              </article>
            );
          })}
        </div>
      )}
      {grouped.length > limit && (
        <button
          className="text-link monitor-show-more"
          onClick={() => setAll(!all)}
        >
          {all ? "收起" : `查看全部 ${grouped.length} 件事`}
        </button>
      )}
    </section>
  );
}

function NumberSetting({
  value,
  min = 1,
  label,
  onSave,
  placeholder,
}: {
  value?: number;
  min?: number;
  label: string;
  onSave: (value: number | undefined) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value === undefined ? "" : String(value));
  const [error, setError] = useState("");
  useEffect(() => setDraft(value === undefined ? "" : String(value)), [value]);
  function save() {
    if (!draft && placeholder) {
      onSave(undefined);
      setError("");
      return;
    }
    const number = Number(draft);
    if (!draft || !Number.isInteger(number) || number < min || number > 365) {
      setError(`请输入 ${min}～365 的整数。`);
      setDraft(value === undefined ? "" : String(value));
      return;
    }
    setError("");
    if (number !== value) onSave(number);
  }
  return (
    <span className="monitor-number-setting">
      <input
        className="field"
        type="number"
        min={min}
        max={365}
        step={1}
        aria-label={label}
        aria-invalid={Boolean(error)}
        value={draft}
        placeholder={placeholder}
        onChange={(event) => {
          setDraft(event.target.value);
          setError("");
        }}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
      {error && <small role="alert">{error}</small>}
    </span>
  );
}

export function MonitorPanel({
  store,
  target,
  today,
}: {
  store: AppStore;
  target: MonitorTarget;
  today: string;
}) {
  const [recording, setRecording] = useState(false);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [checkpointTitle, setCheckpointTitle] = useState("");
  const [criteria, setCriteria] = useState("");
  const [date, setDate] = useState("");
  const titleId = useId();
  const entity =
    target.type === "task"
      ? store.data.tasks.find((item) => item.id === target.id)
      : store.data.projects.find((item) => item.id === target.id);
  const monitor = entity?.monitor;
  const checkpoint = monitor?.checkpoint;
  useEffect(() => {
    setRecording(false);
    setNote("");
    setMessage("");
  }, [target.type, target.id]);
  useEffect(() => {
    setCheckpointTitle(checkpoint?.title ?? "");
    setCriteria(checkpoint?.criteria ?? "");
    setDate(checkpoint?.date ?? "");
  }, [
    target.type,
    target.id,
    checkpoint?.title,
    checkpoint?.criteria,
    checkpoint?.date,
  ]);
  if (!entity) return null;
  const task =
    target.type === "task"
      ? store.data.tasks.find((item) => item.id === target.id)
      : undefined;
  const project =
    target.type === "project"
      ? store.data.projects.find((item) => item.id === target.id)
      : undefined;
  const inactive =
    task?.status === "done" ||
    project?.archived ||
    (task?.projectId &&
      store.data.projects.find((item) => item.id === task.projectId)?.archived);
  const alerts = getTargetAlerts(store.data, target, today);
  const entries = [...getTargetEntries(store.data, target)].sort((a, b) =>
    b.at.localeCompare(a.at),
  );
  const latest = entries.find((entry) =>
    ["progress", "completed", "checkpoint"].includes(entry.kind),
  );
  const rules = store.data.monitoring?.rules ?? DEFAULT_ALERT_RULES;
  const bug = monitor?.preset === "bug";
  const stallDefault =
    target.type === "project" ? rules.projectStall.days : rules.bugStall.days;
  const update = (patch: Partial<Monitor>) =>
    store.updateMonitor(target, patch);
  function saveProgress(event: FormEvent) {
    event.preventDefault();
    if (!note.trim()) return;
    store.recordProgress(target, note.trim());
    setNote("");
    setRecording(false);
    setMessage("有效进展已记录，预警已重新检查。");
  }
  function saveCheckpoint(event: FormEvent) {
    event.preventDefault();
    if (!checkpointTitle.trim() || !isDateKey(date)) {
      setMessage("请填写检查目标和有效的检查日期。");
      return;
    }
    update({
      checkpoint: {
        title: checkpointTitle.trim(),
        criteria: criteria.trim(),
        date,
        completedAt:
          checkpoint?.title === checkpointTitle.trim() &&
          checkpoint?.criteria === criteria.trim() &&
          checkpoint?.date === date
            ? checkpoint.completedAt
            : undefined,
      },
    });
    setMessage("检查点已保存。达到目标后，请确认已达成。");
  }
  return (
    <section className="monitor-panel card" aria-labelledby={titleId}>
      <div className="monitoring-heading">
        <div className="monitoring-heading-title">
          <Clock3 size={19} />
          <div>
            <h2 id={titleId}>进展与预警</h2>
            <p>
              {latest
                ? `最近有效进展 · ${timestampLabel(latest.at)}`
                : "记录结果，让调整有据可循。"}
            </p>
          </div>
        </div>
        {!inactive && (
          <button
            className="btn btn-small"
            onClick={() => setRecording(!recording)}
          >
            <Plus size={14} />
            记录进展
          </button>
        )}
      </div>
      {!!alerts.length && (
        <div className="monitor-inline-alerts">
          {alerts.map((alert) => (
            <div
              className={`monitor-inline-alert ${alert.severity}`}
              key={alert.id}
            >
              <AlertTriangle size={15} />
              <div>
                <strong>{alert.title}</strong>
                <p>{alert.reason}</p>
                <p>{alert.suggestion}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      {recording && (
        <form className="monitor-progress-form" onSubmit={saveProgress}>
          <label className="form-label">
            这次获得了什么结果？
            <textarea
              className="field"
              aria-label="有效进展"
              maxLength={10000}
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="例如：对照测试发现这一方法不适用，下一步改用另一组参数。"
            />
          </label>
          <p className="muted">
            阴性结果、排除假设也算进展。修改标题或改期不会重置计时。
          </p>
          <div className="monitor-actions">
            <button
              className="btn btn-primary btn-small"
              disabled={!note.trim()}
            >
              保存进展
            </button>
            <button
              className="btn btn-ghost btn-small"
              type="button"
              onClick={() => setRecording(false)}
            >
              取消记录
            </button>
          </div>
        </form>
      )}
      {checkpoint && (
        <div
          className={`monitor-checkpoint ${checkpoint.completedAt ? "reached" : ""}`}
        >
          <div className="monitor-checkpoint-heading">
            {checkpoint.completedAt ? (
              <CheckCircle2 size={17} />
            ) : (
              <Flag size={17} />
            )}
            <strong>
              {checkpoint.completedAt ? "目标已达成" : "下一个检查点"}
            </strong>
            <span>{formatDate(checkpoint.date)} 检查</span>
          </div>
          <h3>{checkpoint.title}</h3>
          {checkpoint.criteria && <p>达成条件：{checkpoint.criteria}</p>}
          {!checkpoint.completedAt && !inactive && (
            <button
              className="text-link"
              onClick={() => {
                store.completeCheckpoint(target);
                setMessage("已确认目标达成，并记录为有效进展。");
              }}
            >
              <CheckCircle2 size={15} />
              确认已达成
            </button>
          )}
        </div>
      )}
      {!inactive && (
        <details className="monitor-options">
          <summary>目标检查点与跟进设置</summary>
          <div className="monitor-options-body">
            {target.type === "task" && (
              <label className="form-label">
                跟进类型
                <select
                  className="field"
                  aria-label="跟进类型"
                  value={monitor?.preset ?? "standard"}
                  onChange={(event) =>
                    update({ preset: event.target.value as Monitor["preset"] })
                  }
                >
                  <option value="standard">普通任务</option>
                  <option value="bug">Bug 排查</option>
                </select>
                <small className="muted">
                  普通任务检查日期和阻碍；Bug 开始后额外检查停滞。
                </small>
              </label>
            )}
            <div className="monitor-observation">
              <span className="muted">
                {monitor?.paused
                  ? "跟进已暂停；明确的日期风险仍保留。"
                  : monitor?.startedAt
                    ? `已开始跟进 · ${timestampLabel(monitor.startedAt)}`
                    : "尚未开始跟进；开始任务或记录进展后自动开始。"}
              </span>
              <button
                type="button"
                className="text-link"
                onClick={() =>
                  update(
                    monitor?.startedAt
                      ? {
                          paused: !monitor.paused,
                          ...(monitor.paused
                            ? { resumedAt: new Date().toISOString() }
                            : {}),
                        }
                      : { startedAt: new Date().toISOString(), paused: false },
                  )
                }
              >
                {monitor?.startedAt
                  ? monitor.paused
                    ? "恢复跟进"
                    : "暂停跟进"
                  : "开始跟进"}
              </button>
            </div>
            {(target.type === "project" || bug) && (
              <label className="form-label">
                停滞阈值（{target.type === "project" ? "自然日" : "工作日"}）
                <NumberSetting
                  label="停滞阈值"
                  value={monitor?.stallDays}
                  placeholder={`跟随原则：${stallDefault}`}
                  onSave={(value) => update({ stallDays: value })}
                />
                <small className="muted">
                  留空使用默认值。工作日仅指周一至周五，不代表实际投入工时。
                </small>
              </label>
            )}
            <label className="form-label">
              下次跟进日期
              <input
                className="field"
                type="date"
                aria-label="下次跟进日期"
                value={monitor?.followUpDate ?? ""}
                onChange={(event) =>
                  update({ followUpDate: event.target.value || undefined })
                }
              />
              <small className="muted">
                有阻碍时，在这一天提醒跟进；无需每天重复记录等待。
              </small>
            </label>
            <form className="monitor-checkpoint-form" onSubmit={saveCheckpoint}>
              <h3>约定一个可判断的目标</h3>
              <label className="form-label">
                检查目标
                <input
                  className="field"
                  aria-label="检查目标"
                  maxLength={500}
                  value={checkpointTitle}
                  onChange={(event) => setCheckpointTitle(event.target.value)}
                  placeholder="例如：完成代表性样本测试，决定是否采用这一方法"
                />
              </label>
              <label className="form-label">
                达成条件（可选）
                <textarea
                  className="field"
                  aria-label="达成条件"
                  rows={2}
                  maxLength={10000}
                  value={criteria}
                  onChange={(event) => setCriteria(event.target.value)}
                  placeholder="怎样才算达到？科学结果由你判断。"
                />
              </label>
              <label className="form-label">
                检查日期
                <input
                  className="field"
                  type="date"
                  aria-label="检查日期"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </label>
              <div className="monitor-actions">
                <button
                  className="btn btn-small"
                  disabled={!checkpointTitle.trim() || !date}
                >
                  保存检查点
                </button>
                {checkpoint && (
                  <button
                    className="text-link"
                    type="button"
                    onClick={() => {
                      update({ checkpoint: undefined });
                      setMessage("检查点已移除，调整记录已保留。");
                    }}
                  >
                    移除检查点
                  </button>
                )}
              </div>
            </form>
          </div>
        </details>
      )}
      {message && (
        <p className="monitor-feedback" role="status">
          {message}
        </p>
      )}
      {!!entries.length && (
        <details className="monitor-history">
          <summary>进展与调整记录 · {entries.length}</summary>
          <ol>
            {entries.slice(0, 20).map((entry) => (
              <li key={entry.id}>
                <span>
                  {timestampLabel(entry.at)} ·{" "}
                  {entry.kind === "adjustment"
                    ? "调整"
                    : entry.kind === "checkpoint"
                      ? "目标达成"
                      : entry.kind === "completed"
                        ? "完成"
                        : "有效进展"}
                </span>
                <p>{entry.note}</p>
                {(entry.previousDate || entry.newDate) && (
                  <small>
                    {entry.previousDate || "未设置"} →{" "}
                    {entry.newDate || "已移除"}
                  </small>
                )}
              </li>
            ))}
          </ol>
          {entries.length > 20 && (
            <p className="muted">显示最近 20 条；全部记录随 JSON 备份保存。</p>
          )}
        </details>
      )}
    </section>
  );
}

const principles: {
  id: keyof AlertRules;
  title: string;
  condition: string;
  action: string;
  unit?: string;
}[] = [
  {
    id: "projectStall",
    title: "项目停滞",
    condition: "已开始的项目没有有效进展",
    action: "缩小范围，确定一个可以验证的小步骤",
    unit: "自然日",
  },
  {
    id: "bugStall",
    title: "Bug 排查停滞",
    condition: "开始排查后没有获得新信息",
    action: "整理复现条件，换方法或求助",
    unit: "工作日",
  },
  {
    id: "checkpoint",
    title: "目标未达",
    condition: "检查日期已过，目标尚未确认达成",
    action: "判断延期、调整方法或修改目标",
  },
  {
    id: "deadline",
    title: "截止日期风险",
    condition: "临近截止日期或已经逾期",
    action: "调整顺序与交付范围",
    unit: "天前提醒",
  },
  {
    id: "blocked",
    title: "阻碍跟进",
    condition: "阻碍持续过久，或到达约定跟进日",
    action: "跟进外部条件，安排替代行动",
    unit: "工作日",
  },
];

export function AlertRulesSettings({
  store,
  onClose,
}: {
  store: AppStore;
  onClose: () => void;
}) {
  const rules = store.data.monitoring?.rules ?? DEFAULT_ALERT_RULES;
  function update(
    id: keyof AlertRules,
    patch: { enabled?: boolean; days?: number },
  ) {
    store.updateAlertRules({ ...rules, [id]: { ...rules[id], ...patch } });
  }
  return (
    <Modal title="预警原则" onClose={onClose} className="monitor-rules-modal">
      <p className="muted monitor-rules-intro">
        给调整留一个提醒。以下规则会自动检查已有数据，数值编辑完成后自动保存。
      </p>
      <div className="monitor-rules-table-wrap">
        <table className="monitor-rules-table">
          <thead>
            <tr>
              <th>启用 / 原则</th>
              <th>什么时候提醒</th>
              <th>默认阈值</th>
              <th>建议行动</th>
            </tr>
          </thead>
          <tbody>
            {principles.map((principle) => {
              const rule = rules[principle.id];
              return (
                <tr key={principle.id}>
                  <th scope="row">
                    <label>
                      <input
                        type="checkbox"
                        aria-label={`启用${principle.title}`}
                        checked={rule.enabled}
                        onChange={(event) =>
                          update(principle.id, {
                            enabled: event.target.checked,
                          })
                        }
                      />
                      {principle.title}
                    </label>
                  </th>
                  <td>{principle.condition}</td>
                  <td>
                    {"days" in rule ? (
                      <div className="monitor-rule-threshold">
                        <NumberSetting
                          label={`${principle.title}阈值`}
                          value={rule.days}
                          min={principle.id === "deadline" ? 0 : 1}
                          onSave={(value) => {
                            if (value !== undefined)
                              update(principle.id, { days: value });
                          }}
                        />
                        <span>{principle.unit}</span>
                      </div>
                    ) : (
                      "按检查日期"
                    )}
                  </td>
                  <td>{principle.action}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="monitor-principle-note">
        <ShieldCheck size={20} />
        <div>
          <strong>什么才算有效进展？</strong>
          <p>
            完成任务、确认检查点达成，或主动记录一个结果。阴性结果和排除假设也有价值。改标题、改期与打开页面不算进展。
          </p>
          <p>
            暂停、尚未开始或计划在未来的事项不触发停滞预警；已完成和已归档的事项退出检查。明确的日期风险仍会提示。
          </p>
          <p>
            旧数据从升级后开始观察；工作日按周一至周五计算，不含节假日配置，也不代表实际工时。单个项目和
            Bug 可覆盖默认停滞阈值。
          </p>
        </div>
      </div>
      <div className="modal-actions">
        <button
          className="btn btn-ghost"
          onClick={() =>
            store.updateAlertRules(structuredClone(DEFAULT_ALERT_RULES))
          }
        >
          恢复默认原则
        </button>
        <button className="btn btn-primary" onClick={onClose}>
          完成
        </button>
      </div>
    </Modal>
  );
}
