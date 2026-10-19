import { useEffect, useRef, useState } from "react";
import {
  X,
  Check,
  Play,
  Pause,
  Trash2,
  CalendarDays,
  Flag,
  ExternalLink,
  ArrowRight,
  CircleAlert,
} from "lucide-react";
import type { AppStore } from "../types";
import { isBlocked } from "../selectors";
export default function TaskDetail({
  id,
  store,
  today,
  onClose,
}: {
  id: string;
  store: AppStore;
  today: string;
  onClose: () => void;
}) {
  const task = store.data.tasks.find((t) => t.id === id);
  const ref = useRef<HTMLElement>(null);
  const [advanced, setAdvanced] = useState(false);
  useEffect(() => {
    const old = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const items = ref.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input,select,textarea,a[href]",
        );
        if (!items?.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      old?.focus();
    };
  }, [id, onClose]);
  if (!task) return null;
  const blocked = isBlocked(task, store.data);
  const stages = store.data.stages
    .filter((s) => s.projectId === task.projectId)
    .sort((a, b) => a.order - b.order);
  const patch = (p: Parameters<AppStore["updateTask"]>[1]) =>
    store.updateTask(id, p);
  return (
    <div
      className="drawer-backdrop"
      onMouseDown={(e) => {
        if (e.currentTarget === e.target) onClose();
      }}
    >
      <aside
        className="task-drawer"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="任务详情"
        tabIndex={-1}
      >
        <div className="drawer-header">
          <span>
            任务详情{" "}
            <span className="badge">
              {task.inbox
                ? "收集箱"
                : task.status === "done"
                  ? "已完成"
                  : task.status === "doing"
                    ? "进行中"
                    : task.status === "paused"
                      ? "已暂停"
                      : "待处理"}
            </span>
          </span>
          <button
            className="icon-btn"
            onClick={onClose}
            aria-label="关闭任务详情"
          >
            <X size={21} />
          </button>
        </div>
        <div className="drawer-body">
          <label className="form-label">
            任务名称
            <textarea
              className="task-title-input"
              aria-label="任务名称"
              maxLength={500}
              rows={2}
              value={task.title}
              onChange={(e) => {
                if (e.target.value.trim()) patch({ title: e.target.value });
              }}
            />
          </label>
          <div className="drawer-actions">
            <button
              className={`btn ${task.status === "done" ? "" : "btn-primary"}`}
              onClick={() =>
                patch({ status: task.status === "done" ? "todo" : "done" })
              }
            >
              <Check size={16} />
              {task.status === "done" ? "重新打开" : "标记完成"}
            </button>
            {task.status !== "done" && (
              <button
                className="btn"
                disabled={blocked}
                onClick={() =>
                  patch({
                    status: task.status === "doing" ? "paused" : "doing",
                    inbox: false,
                  })
                }
              >
                {task.status === "doing" ? (
                  <Pause size={15} />
                ) : (
                  <Play size={15} />
                )}
                {task.status === "doing" ? "暂停" : "开始 / 恢复"}
              </button>
            )}
            <button
              className={`icon-btn ${task.important ? "is-important" : ""}`}
              aria-label="标记重要任务"
              title="标记为重要"
              onClick={() => patch({ important: !task.important })}
            >
              <Flag size={18} />
            </button>
          </div>
          {blocked && (
            <div className="inline-warning">
              <CircleAlert size={16} />
              有阻碍，处理后即可继续。完成按钮仍可手动使用。
            </div>
          )}
          <div className="detail-fields">
            <label className="form-label">
              所属项目
              <select
                className="field"
                aria-label="所属项目"
                value={task.projectId || ""}
                onChange={(e) =>
                  patch({
                    projectId: e.target.value || undefined,
                    stageId: undefined,
                    inbox: e.target.value ? false : task.inbox,
                  })
                }
              >
                <option value="">暂不归类</option>
                {store.data.projects
                  .filter((p) => !p.archived || p.id === task.projectId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                      {p.archived ? "（已归档）" : ""}
                    </option>
                  ))}
              </select>
            </label>
            {!!stages.length && (
              <label className="form-label">
                所在阶段
                <select
                  className="field"
                  value={task.stageId || ""}
                  onChange={(e) =>
                    patch({ stageId: e.target.value || undefined })
                  }
                >
                  <option value="">不划分阶段</option>
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="form-grid">
              <label className="form-label">
                计划做的日期
                <input
                  className="field"
                  type="date"
                  aria-label="计划做的日期"
                  value={task.plannedDate || ""}
                  onChange={(e) =>
                    patch({
                      plannedDate: e.target.value || undefined,
                      inbox: e.target.value ? false : task.inbox,
                    })
                  }
                />
              </label>
              <label className="form-label">
                必须完成的截止日期
                <input
                  className="field"
                  type="date"
                  aria-label="必须完成的截止日期"
                  value={task.dueDate || ""}
                  onChange={(e) =>
                    patch({ dueDate: e.target.value || undefined })
                  }
                />
              </label>
            </div>
            <button
              className="text-link"
              onClick={() => patch({ plannedDate: today, inbox: false })}
            >
              <CalendarDays size={15} />
              安排到今天
            </button>
            <label className="form-label">
              补充说明
              <textarea
                className="field"
                rows={4}
                placeholder="记下需要的背景，或一个具体的小步骤…"
                value={task.notes}
                onChange={(e) => patch({ notes: e.target.value })}
              />
            </label>
            <label className="form-label">
              当前卡点
              <textarea
                className="field"
                rows={2}
                placeholder="没有阻碍就留空"
                value={task.blockedReason || ""}
                onChange={(e) => patch({ blockedReason: e.target.value })}
              />
            </label>
            <button
              className="advanced-toggle"
              aria-expanded={advanced}
              onClick={() => setAdvanced(!advanced)}
            >
              {advanced ? "收起" : "展开"}更多选项{" "}
              <ArrowRight
                size={14}
                style={{ transform: advanced ? "rotate(90deg)" : undefined }}
              />
            </button>
            {advanced && (
              <div className="advanced-fields">
                <label className="form-label">
                  等待哪些任务完成
                  <select
                    className="field"
                    multiple
                    aria-label="前置任务"
                    value={task.dependsOn || []}
                    onChange={(e) =>
                      patch({
                        dependsOn: Array.from(e.target.selectedOptions).map(
                          (o) => o.value,
                        ),
                      })
                    }
                  >
                    {store.data.tasks
                      .filter(
                        (t) =>
                          t.id !== task.id &&
                          (t.status !== "done" ||
                            task.dependsOn?.includes(t.id)),
                      )
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                          {t.status === "done" ? "（已完成）" : ""}
                        </option>
                      ))}
                  </select>
                  <small className="muted">
                    按住 Ctrl 可多选或取消；前置任务未完成时不建议开始。
                  </small>
                </label>
                <label className="form-label">
                  Obsidian 笔记链接或路径
                  <input
                    className="field"
                    placeholder="obsidian://open?vault=…&file=…"
                    value={task.obsidianUrl || ""}
                    onChange={(e) => patch({ obsidianUrl: e.target.value })}
                  />
                </label>
                {task.obsidianUrl?.trim() && (
                  <a
                    className="text-link"
                    href={
                      task.obsidianUrl.trim().startsWith("obsidian://")
                        ? task.obsidianUrl.trim()
                        : `obsidian://open?path=${encodeURIComponent(task.obsidianUrl.trim())}`
                    }
                  >
                    <ExternalLink size={15} />在 Obsidian 中打开
                  </a>
                )}
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={task.inbox}
                    onChange={(e) => patch({ inbox: e.target.checked })}
                  />
                  移回收集箱（移除项目关联）
                </label>
              </div>
            )}
          </div>
        </div>
        <footer className="drawer-footer">
          <span className="muted">
            {store.saveState === "saved"
              ? "所有修改已自动保存"
              : store.saveState === "saving"
                ? "正在保存…"
                : "保存失败，请备份数据"}
          </span>
          <button
            className="btn btn-ghost btn-danger"
            onClick={() => {
              if (confirm("删除这件任务？此操作无法撤销。")) {
                store.deleteTasks([id]);
                onClose();
              }
            }}
          >
            <Trash2 size={15} />
            删除任务
          </button>
        </footer>
      </aside>
    </div>
  );
}
