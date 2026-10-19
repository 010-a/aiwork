import { useEffect, useRef, type ReactNode } from "react";
import {
  Check,
  ChevronRight,
  Circle,
  Inbox,
  Play,
  Pause,
  X,
  Flag,
  AlertCircle,
} from "lucide-react";
import type { Task, AppStore } from "../types";
import { isBlocked } from "../selectors";

export function ProgressBar({ value }: { value: number }) {
  return (
    <div
      className="progress-bar"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span style={{ width: `${value}%` }} />
    </div>
  );
}
export function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-head">
      <div>
        <h2>{title}</h2>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon || <Inbox size={28} />}</div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const initial = ref.current?.querySelector<HTMLElement>(
      "input,textarea,select,button",
    );
    initial?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
      if (e.key === "Tab") {
        const items = ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]',
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
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function TaskRow({
  task,
  store,
  openTask,
  compact = false,
}: {
  task: Task;
  store: AppStore;
  openTask: (id: string) => void;
  compact?: boolean;
}) {
  const project = store.data.projects.find((p) => p.id === task.projectId);
  const blocked = isBlocked(task, store.data);
  return (
    <div
      className={`task-row ${compact ? "compact" : ""} ${task.status === "done" ? "is-done" : ""}`}
      data-task-id={task.id}
    >
      <button
        className={`task-check ${task.status === "done" ? "checked" : ""}`}
        aria-label={
          task.status === "done"
            ? `重新打开 ${task.title}`
            : `完成 ${task.title}`
        }
        onClick={() =>
          store.updateTask(task.id, {
            status: task.status === "done" ? "todo" : "done",
          })
        }
      >
        {task.status === "done" ? <Check size={14} /> : <Circle size={19} />}
      </button>
      <button className="task-main" onClick={() => openTask(task.id)}>
        <span className="task-name">{task.title}</span>
        <span className="task-meta">
          {project && (
            <span>
              <i style={{ background: project.color }} />
              {project.title}
            </span>
          )}
          {task.dueDate && (
            <span>截止 {task.dueDate.slice(5).replace("-", "/")}</span>
          )}
          {blocked && (
            <span className="text-red">
              <AlertCircle size={12} />
              有阻碍
            </span>
          )}
          {task.status === "doing" && (
            <span className="text-green">进行中</span>
          )}
          {task.status === "paused" && <span>已暂停</span>}
          {task.inbox && !project && <span>尚未整理</span>}
        </span>
      </button>
      {task.important && <Flag size={15} className="text-amber" />}
      {!compact && task.status !== "done" && !blocked && (
        <button
          className="icon-btn"
          title={task.status === "doing" ? "暂停任务" : "开始任务"}
          aria-label={
            task.status === "doing"
              ? `暂停 ${task.title}`
              : `开始 ${task.title}`
          }
          onClick={() =>
            store.updateTask(task.id, {
              status: task.status === "doing" ? "paused" : "doing",
              inbox: false,
            })
          }
        >
          {task.status === "doing" ? <Pause size={16} /> : <Play size={16} />}
        </button>
      )}
      <button
        className="icon-btn task-chevron"
        onClick={() => openTask(task.id)}
        aria-label={`查看 ${task.title}`}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
