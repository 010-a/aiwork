import { useState } from "react";
import { BookmarkPlus, Repeat2, Plus, Trash2 } from "lucide-react";
import type { AppStore, Task, TaskTemplate } from "../types";
import { Modal } from "./ui";
export function RoutineSettings({
  task,
  store,
}: {
  task: Task;
  store: AppStore;
}) {
  const [message, setMessage] = useState("");
  const recurrence = task.recurrence;
  return (
    <details className="routine-settings">
      <summary>
        <Repeat2 size={15} />
        重复、耗时与模板（可选）
      </summary>
      <div className="routine-body">
        <label className="form-label">
          预计耗时（分钟）
          <input
            className="field"
            type="number"
            key={`${task.id}-${task.estimatedMinutes}`}
            aria-label="预计耗时"
            defaultValue={task.estimatedMinutes ?? ""}
            min={1}
            max={1440}
            placeholder="留空，不需要估算每一件事"
            onBlur={(e) => {
              const value = e.target.value;
              if (!value)
                store.updateTask(task.id, { estimatedMinutes: undefined });
              else if (
                Number.isInteger(Number(value)) &&
                Number(value) >= 1 &&
                Number(value) <= 1440
              )
                store.updateTask(task.id, { estimatedMinutes: Number(value) });
              else {
                setMessage("预计耗时应为 1 至 1440 分钟，已保留原值。");
                e.target.value = String(task.estimatedMinutes ?? "");
              }
            }}
          />
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            aria-label="重复此任务"
            checked={Boolean(recurrence)}
            disabled={Boolean(task.repeatNextId)}
            onChange={(e) =>
              store.updateTask(task.id, {
                recurrence: e.target.checked
                  ? { interval: 1, unit: "week", mode: "schedule" }
                  : undefined,
              })
            }
          />
          重复此任务
        </label>
        {recurrence && !task.repeatNextId && (
          <>
            <div className="form-grid">
              <label className="form-label">
                每隔
                <input
                  className="field"
                  type="number"
                  aria-label="重复间隔"
                  defaultValue={recurrence.interval}
                  key={recurrence.interval}
                  min={1}
                  max={365}
                  onBlur={(e) => {
                    const interval = Number(e.target.value);
                    if (
                      Number.isInteger(interval) &&
                      interval >= 1 &&
                      interval <= 365
                    )
                      store.updateTask(task.id, {
                        recurrence: { ...recurrence, interval },
                      });
                    else e.target.value = String(recurrence.interval);
                  }}
                />
              </label>
              <label className="form-label">
                单位
                <select
                  className="field"
                  aria-label="重复单位"
                  value={recurrence.unit}
                  onChange={(e) =>
                    store.updateTask(task.id, {
                      recurrence: {
                        ...recurrence,
                        unit: e.target.value as "day" | "week" | "month",
                      },
                    })
                  }
                >
                  <option value="day">天</option>
                  <option value="week">周</option>
                  <option value="month">月</option>
                </select>
              </label>
            </div>
            <label className="form-label">
              从什么时候计算
              <select
                className="field"
                aria-label="重复方式"
                value={recurrence.mode}
                onChange={(e) =>
                  store.updateTask(task.id, {
                    recurrence: {
                      ...recurrence,
                      mode: e.target.value as "schedule" | "completion",
                    },
                  })
                }
              >
                <option value="schedule">按计划日期重复</option>
                <option value="completion">完成后再间隔一段时间</option>
              </select>
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={Boolean(recurrence.paused)}
                onChange={(e) =>
                  store.updateTask(task.id, {
                    recurrence: { ...recurrence, paused: e.target.checked },
                  })
                }
              />
              暂停重复
            </label>
          </>
        )}
        <p className="muted">
          完成后生成下一次任务，保留本次结果。错过的周期不补建积压；截止日期不会自动复制。
        </p>
        {task.repeatNextId && (
          <p className="muted">
            下一次任务已经生成。请在下一次任务中修改后续重复规则。
          </p>
        )}
        <button
          className="btn btn-small"
          onClick={() => {
            store.saveTemplate({
              id: crypto.randomUUID(),
              title: task.title,
              notes: task.notes,
              projectId: task.projectId,
              stageId: task.stageId,
              estimatedMinutes: task.estimatedMinutes,
              demo: task.demo,
            });
            setMessage("已保存为常用模板，可在快速添加时选择。");
          }}
        >
          <BookmarkPlus size={15} />
          存为常用模板
        </button>
        {message && (
          <p role="status" className="muted">
            {message}
          </p>
        )}
      </div>
    </details>
  );
}
export function TemplateLibrary({
  store,
  onClose,
  onUse,
}: {
  store: AppStore;
  onClose: () => void;
  onUse: (template: TaskTemplate) => void;
}) {
  const [draft, setDraft] = useState<TaskTemplate>();
  return (
    <Modal title="常用模板" onClose={onClose}>
      <p className="muted">
        为反复使用的步骤存一份模板。创建任务时复制内容，历史结果各自保留。
      </p>
      <div className="template-list">
        {(store.data.templates ?? []).map((t) => (
          <div className="template-item" key={t.id}>
            <div>
              <strong>{t.title}</strong>
              <small className="muted">
                {store.data.projects.find((p) => p.id === t.projectId)?.title ??
                  "不指定项目"}
              </small>
            </div>
            <div className="inline-actions">
              <button className="btn btn-small" onClick={() => onUse(t)}>
                使用
              </button>
              <button
                className="btn btn-ghost btn-small"
                onClick={() => setDraft({ ...t })}
              >
                编辑
              </button>
              <button
                className="icon-btn"
                aria-label={`删除模板 ${t.title}`}
                onClick={() => store.deleteTemplate(t.id)}
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>
      <button
        className="btn"
        onClick={() =>
          setDraft({ id: crypto.randomUUID(), title: "", notes: "" })
        }
      >
        <Plus size={15} />
        新建模板
      </button>
      {draft && (
        <Modal title="编辑任务模板" onClose={() => setDraft(undefined)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.title.trim()) {
                store.saveTemplate({ ...draft, title: draft.title.trim() });
                setDraft(undefined);
              }
            }}
          >
            <label className="form-label">
              模板名称
              <input
                required
                className="field"
                aria-label="模板名称"
                maxLength={500}
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>
            <label className="form-label">
              任务说明 / 检查清单
              <textarea
                className="field"
                aria-label="模板说明"
                rows={7}
                maxLength={100000}
                placeholder="可以一行一个步骤"
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </label>
            <label className="form-label">
              默认项目
              <select
                className="field"
                value={draft.projectId ?? ""}
                aria-label="模板项目"
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    projectId: e.target.value || undefined,
                    stageId: undefined,
                  })
                }
              >
                <option value="">不指定</option>
                {store.data.projects
                  .filter((p) => !p.archived)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
              </select>
            </label>
            <div className="modal-actions">
              <button className="btn btn-primary">保存模板</button>
            </div>
          </form>
        </Modal>
      )}
    </Modal>
  );
}
