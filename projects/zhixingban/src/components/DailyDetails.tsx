import { useState } from "react";
import { ArrowRight, ExternalLink, RotateCcw, Play } from "lucide-react";
import type { AppStore, MonitorTarget, Task, ViewProps } from "../types";
import { getTargetEntries } from "../alerts";
import { progressForProject, currentBlockers } from "../insights";
import { formatDate } from "../dates";
import { isArchivedTask, recommendTasks } from "../selectors";
import { noteHref } from "../notes";
import { Modal } from "./ui";

export function ResumeCard({
  store,
  target,
  today,
  openTask,
}: {
  store: AppStore;
  target: MonitorTarget;
  today: string;
  openTask: (id: string) => void;
}) {
  const entity =
    target.type === "project"
      ? store.data.projects.find((p) => p.id === target.id)
      : store.data.tasks.find((t) => t.id === target.id);
  if (!entity) return null;
  const last = (
    target.type === "project"
      ? progressForProject(store.data, target.id)
      : getTargetEntries(store.data, target)
  ).find((e) => e.kind !== "adjustment");
  const next = recommendTasks(store.data, today).find((r) =>
    target.type === "project"
      ? r.task.projectId === target.id
      : r.task.id === target.id,
  )?.task;
  const lastTask =
    last?.entityType === "task"
      ? store.data.tasks.find((t) => t.id === last.entityId)
      : undefined;
  const href = noteHref(entity.obsidianUrl || lastTask?.obsidianUrl);
  const blockers = currentBlockers(store.data, today).filter(
    (item) =>
      (item.target.type === target.type && item.target.id === target.id) ||
      (target.type === "project" &&
        item.target.type === "task" &&
        store.data.tasks.find((t) => t.id === item.target.id)?.projectId ===
          target.id),
  );
  return (
    <section className="card resume-card" aria-label="继续上次工作">
      <div className="resume-heading">
        <RotateCcw size={19} />
        <h2>继续上次工作</h2>
        {last && (
          <small className="muted">
            {new Date(last.at).toLocaleDateString("zh-CN")}
          </small>
        )}
      </div>
      <div className="resume-result">
        <span className="eyebrow">上次留下的结果</span>
        <p>{last?.note ?? "尚无进展记录。获得结果时再记一句就好。"}</p>
        {last?.entityType === "task" && (
          <button className="text-link" onClick={() => openTask(last.entityId)}>
            查看来源任务
            <ArrowRight size={13} />
          </button>
        )}
      </div>
      {blockers.slice(0, 2).map((item) => (
        <p className="resume-blocker" key={item.target.id}>
          当前卡点：{item.reason}
        </p>
      ))}
      <label className="form-label">
        下一小步（可选）
        <textarea
          className="field"
          rows={2}
          aria-label="下一小步"
          maxLength={10000}
          placeholder={
            next ? `已有任务：${next.title}` : "下次打开时，从哪里接着做？"
          }
          value={entity.nextAction ?? ""}
          onChange={(e) =>
            target.type === "project"
              ? store.updateProject(entity.id, { nextAction: e.target.value })
              : store.updateTask(entity.id, { nextAction: e.target.value })
          }
        />
      </label>
      <div className="inline-actions">
        {next && (
          <button className="btn btn-small" onClick={() => openTask(next.id)}>
            <Play size={14} />
            {next.status === "doing" ? "继续" : "查看下一件事"}
          </button>
        )}
        {href && (
          <a className="text-link" href={href}>
            <ExternalLink size={14} />
            打开 Obsidian 笔记
          </a>
        )}
      </div>
    </section>
  );
}
export function Carryover({ store, today, openTask }: ViewProps) {
  const [moving, setMoving] = useState<Task>();
  const [date, setDate] = useState(today);
  const [selected, setSelected] = useState<string[]>([]);
  const tasks = store.data.tasks
    .filter(
      (t) =>
        t.status !== "done" &&
        !t.inbox &&
        t.plannedDate &&
        t.plannedDate < today &&
        !isArchivedTask(t, store.data),
    )
    .sort((a, b) => a.plannedDate!.localeCompare(b.plannedDate!));
  if (!tasks.length) return null;
  const chosen = tasks.filter((t) => selected.includes(t.id));
  function update(ids: string[], patch: Partial<Task>) {
    store.updateTasks(ids, patch);
    setSelected([]);
  }
  return (
    <details className="card carryover-card" open={undefined}>
      <summary>
        <RotateCcw size={17} />
        之前安排但未完成 <span className="badge">{tasks.length}</span>
        <small>有空再整理</small>
      </summary>
      <div className="carryover-body">
        <p className="muted">原计划保留在这里。调整计划不会修改截止日期。</p>
        <div className="carryover-toolbar">
          <label className="check-label">
            <input
              type="checkbox"
              aria-label="选择全部未完成计划"
              checked={chosen.length === tasks.length}
              onChange={(e) =>
                setSelected(e.target.checked ? tasks.map((t) => t.id) : [])
              }
            />
            全选
          </label>
          {chosen.length > 0 && (
            <>
              <button
                className="btn btn-small"
                onClick={() =>
                  update(
                    chosen.map((t) => t.id),
                    { plannedDate: today },
                  )
                }
              >
                今天继续（{chosen.length}）
              </button>
              <button
                className="btn btn-ghost btn-small"
                onClick={() =>
                  update(
                    chosen.map((t) => t.id),
                    { plannedDate: undefined },
                  )
                }
              >
                暂不安排
              </button>
            </>
          )}
        </div>
        {tasks.map((task) => (
          <div className="carryover-row" key={task.id}>
            <input
              type="checkbox"
              aria-label={`整理 ${task.title}`}
              checked={selected.includes(task.id)}
              onChange={(e) =>
                setSelected(
                  e.target.checked
                    ? [...selected, task.id]
                    : selected.filter((id) => id !== task.id),
                )
              }
            />
            <button
              className="carryover-title"
              onClick={() => openTask(task.id)}
            >
              <strong>{task.title}</strong>
              <small>
                原计划 {formatDate(task.plannedDate!)}
                {task.dueDate ? ` · 截止 ${formatDate(task.dueDate)}` : ""}
              </small>
            </button>
            <div className="inline-actions">
              <button
                className="btn btn-small"
                onClick={() => update([task.id], { plannedDate: today })}
              >
                今天继续
              </button>
              <button
                className="btn btn-ghost btn-small"
                onClick={() => {
                  setMoving(task);
                  setDate(today);
                }}
              >
                另选日期
              </button>
              <button
                className="btn btn-ghost btn-small"
                onClick={() => update([task.id], { plannedDate: undefined })}
              >
                暂不安排
              </button>
            </div>
          </div>
        ))}
      </div>
      {moving && (
        <Modal title="重新安排计划" onClose={() => setMoving(undefined)}>
          <p>{moving.title}</p>
          <label className="form-label">
            计划日期
            <input
              className="field"
              type="date"
              aria-label="重新安排日期"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <div className="modal-actions">
            <button
              className="btn btn-primary"
              disabled={!date}
              onClick={() => {
                update([moving.id], { plannedDate: date });
                setMoving(undefined);
              }}
            >
              保存日期
            </button>
          </div>
        </Modal>
      )}
    </details>
  );
}
