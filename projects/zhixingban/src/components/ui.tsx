import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
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

interface DialogEntry {
  element: HTMLElement;
  layer: HTMLElement;
}

const dialogs: DialogEntry[] = [];
const previousInert = new Map<HTMLElement, boolean>();
let scrollStyles: { overflow: string; paddingRight: string } | undefined;

function visible(element: HTMLElement): boolean {
  return (
    !element.matches(":disabled") &&
    !element.closest('[inert],[hidden],[aria-hidden="true"]') &&
    element.getClientRects().length > 0 &&
    getComputedStyle(element).visibility !== "hidden"
  );
}

function focusableElements(dialog: HTMLElement): HTMLElement[] {
  return Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'a[href],button,input,select,textarea,summary,[tabindex],[contenteditable="true"]',
    ),
  ).filter((element) => element.tabIndex >= 0 && visible(element));
}

function updateDialogEnvironment() {
  for (const [element, inert] of previousInert) element.inert = inert;
  previousInert.clear();
  const top = dialogs.at(-1);
  if (!top) {
    if (scrollStyles) {
      document.body.style.overflow = scrollStyles.overflow;
      document.body.style.paddingRight = scrollStyles.paddingRight;
      scrollStyles = undefined;
    }
    return;
  }
  if (!scrollStyles) {
    scrollStyles = {
      overflow: document.body.style.overflow,
      paddingRight: document.body.style.paddingRight,
    };
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0)
      document.body.style.paddingRight = `${parseFloat(getComputedStyle(document.body).paddingRight || "0") + scrollbarWidth}px`;
    document.body.style.overflow = "hidden";
  }
  for (const element of Array.from(document.body.children)) {
    if (
      !(element instanceof HTMLElement) ||
      element === top.layer ||
      ["SCRIPT", "STYLE"].includes(element.tagName)
    )
      continue;
    previousInert.set(element, element.inert);
    element.inert = true;
  }
}

/** Shared by drawers and modals so nested dialogs have one keyboard/focus owner. */
export function useDialog<T extends HTMLElement>(
  ref: RefObject<T | null>,
  onClose: () => void,
  active = true,
  focusKey?: string,
) {
  const close = useRef(onClose);
  const opener = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  close.current = onClose;
  useEffect(() => {
    const element = ref.current;
    if (!active || !element) return;
    const layer =
      element.closest<HTMLElement>("[data-dialog-layer]") ?? element;
    const entry = { element, layer };
    dialogs.push(entry);
    updateDialogEnvironment();

    const focusInitial = () => {
      const targets = focusableElements(element);
      const explicit = targets.find((target) =>
        target.matches("[autofocus],[data-autofocus]"),
      );
      const input = targets.find((target) =>
        target.matches(
          'input:not([type="checkbox"]):not([type="radio"]),textarea,select',
        ),
      );
      const current = document.activeElement;
      if (explicit) explicit.focus({ preventScroll: true });
      else if (
        !(current instanceof HTMLElement) ||
        !element.contains(current) ||
        !visible(current)
      )
        (input ?? targets[0] ?? element).focus({ preventScroll: true });
    };
    focusInitial();

    const onKey = (event: KeyboardEvent) => {
      if (dialogs.at(-1) !== entry || event.isComposing) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        close.current();
      } else if (event.key === "Tab") {
        const items = focusableElements(element);
        const first = items[0],
          last = items.at(-1);
        const current = document.activeElement;
        if (!first || !last) {
          event.preventDefault();
          element.focus();
        } else if (
          !(current instanceof HTMLElement) ||
          !element.contains(current) ||
          !items.includes(current) ||
          (event.shiftKey ? current === first : current === last)
        ) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        }
      }
    };
    const keepFocus = (event: FocusEvent) => {
      if (
        dialogs.at(-1) === entry &&
        event.target instanceof Node &&
        !element.contains(event.target)
      )
        focusInitial();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("focusin", keepFocus);
    return () => {
      const wasTop = dialogs.at(-1) === entry;
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("focusin", keepFocus);
      const index = dialogs.indexOf(entry);
      if (index >= 0) dialogs.splice(index, 1);
      updateDialogEnvironment();
      if (!wasTop) return;
      const previous = opener.current;
      const top = dialogs.at(-1);
      if (
        previous?.isConnected &&
        visible(previous) &&
        (!top || top.element.contains(previous))
      )
        previous.focus({ preventScroll: true });
      else if (top)
        (focusableElements(top.element)[0] ?? top.element).focus({
          preventScroll: true,
        });
    };
  }, [active, focusKey]);
}

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
  className = "",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialog(ref, onClose);
  return createPortal(
    <div
      className="modal-backdrop"
      data-dialog-layer
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={`modal ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
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
