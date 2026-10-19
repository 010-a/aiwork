import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import { Modal, useDialog } from "./ui";

function noteHref(value: string): string | undefined {
  const note = value.trim();
  if (!note) return undefined;
  if (/^obsidian:\/\//i.test(note)) return note;
  if (/^[A-Za-z][A-Za-z\d+.-]*:/.test(note) && !/^[A-Za-z]:[\\/]/.test(note))
    return undefined;
  return `obsidian://open?path=${encodeURIComponent(note)}`;
}

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
  const [titleDraft, setTitleDraft] = useState(task?.title ?? "");
  const [noteDraft, setNoteDraft] = useState(task?.obsidianUrl ?? "");
  const [titleMessage, setTitleMessage] = useState("");
  const [noteError, setNoteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    setTitleDraft(task?.title ?? "");
    setNoteDraft(task?.obsidianUrl ?? "");
    setTitleMessage("");
    setNoteError("");
    setAdvanced(false);
    setDeleting(false);
  }, [task?.id]);

  const saveTitle = () => {
    if (!task) return;
    const title = titleDraft.trim();
    if (!title) {
      setTitleDraft(task.title);
      setTitleMessage("任务名称不能为空，已保留原名称。");
      return;
    }
    if (title !== task.title) store.updateTask(id, { title });
    setTitleDraft(title);
  };
  const saveNote = (): boolean => {
    if (!task) return true;
    const value = noteDraft.trim();
    if (value === (task.obsidianUrl ?? "").trim()) return true;
    if (value && !noteHref(value)) {
      setNoteError("请输入完整的 obsidian:// 链接或本地笔记路径。");
      setAdvanced(true);
      return false;
    }
    store.updateTask(id, { obsidianUrl: value || undefined });
    setNoteDraft(value);
    setNoteError("");
    return true;
  };
  const closeDetail = () => {
    saveTitle();
    if (saveNote()) onClose();
  };
  useDialog(ref, closeDetail, Boolean(task), id);
  if (!task) return null;
  const blocked = isBlocked(task, store.data);
  const stages = store.data.stages
    .filter((s) => s.projectId === task.projectId)
    .sort((a, b) => a.order - b.order);
  const patch = (p: Parameters<AppStore["updateTask"]>[1]) =>
    store.updateTask(id, p);
  const noteUrl = noteHref(noteDraft);
  const hasDraft =
    titleDraft.trim() !== task.title ||
    noteDraft.trim() !== (task.obsidianUrl ?? "").trim();
  return createPortal(
    <>
      <div
        className="drawer-backdrop"
        data-dialog-layer
        onMouseDown={(e) => {
          if (e.currentTarget === e.target) closeDetail();
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
              onClick={closeDetail}
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
                value={titleDraft}
                data-autofocus
                onChange={(e) => {
                  setTitleDraft(e.target.value);
                  setTitleMessage("");
                }}
                onBlur={saveTitle}
                aria-describedby={
                  titleMessage ? "task-title-message" : undefined
                }
              />
              {titleMessage && (
                <small id="task-title-message" className="muted" role="status">
                  {titleMessage}
                </small>
              )}
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
                aria-pressed={task.important}
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
                  maxLength={100000}
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
                  maxLength={10000}
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
                      value={noteDraft}
                      maxLength={4096}
                      onChange={(e) => {
                        setNoteDraft(e.target.value);
                        setNoteError("");
                      }}
                      onBlur={saveNote}
                      aria-invalid={Boolean(noteError)}
                      aria-describedby={
                        noteError ? "task-note-error" : undefined
                      }
                    />
                    {noteError && (
                      <small
                        id="task-note-error"
                        className="text-red"
                        role="alert"
                      >
                        {noteError}
                      </small>
                    )}
                  </label>
                  {noteUrl && (
                    <a className="text-link" href={noteUrl}>
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
              {hasDraft
                ? "编辑完成后自动保存"
                : store.saveState === "saved"
                  ? "所有修改已自动保存"
                  : store.saveState === "saving"
                    ? "正在保存…"
                    : "保存失败，请备份数据"}
            </span>
            <button
              className="btn btn-ghost btn-danger"
              onClick={() => setDeleting(true)}
            >
              <Trash2 size={15} />
              删除任务
            </button>
          </footer>
        </aside>
      </div>
      {deleting && (
        <Modal
          title="删除这件任务？"
          className="confirmation-modal"
          onClose={() => setDeleting(false)}
        >
          <p className="confirmation-task-title">{task.title}</p>
          <p className="muted">
            删除后无法撤销，其他任务会自动移除对它的依赖。
          </p>
          <div className="modal-actions">
            <button
              className="btn btn-ghost"
              data-autofocus
              onClick={() => setDeleting(false)}
            >
              保留任务
            </button>
            <button
              className="btn btn-danger"
              onClick={() => {
                store.deleteTasks([id]);
                setDeleting(false);
                onClose();
              }}
            >
              <Trash2 size={15} />
              确认删除
            </button>
          </div>
        </Modal>
      )}
    </>,
    document.body,
  );
}
