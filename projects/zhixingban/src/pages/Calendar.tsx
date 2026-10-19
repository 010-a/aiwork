import { useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Plus,
  Flag,
  CalendarCheck2,
  Trash2,
} from "lucide-react";
import type { CalendarEvent, ViewProps } from "../types";
import { addDays, dateKey, isDateKey, weekStart } from "../dates";
import { EmptyState, Modal, TaskRow } from "../components/ui";
import "./calendar-review.css";

type EventDraft = Omit<CalendarEvent, "id"> & { id?: string };
const localDate = (key: string) => new Date(`${key}T12:00:00`);
const dayLabel = (
  key: string,
  options: Intl.DateTimeFormatOptions = { month: "long", day: "numeric" },
) => localDate(key).toLocaleDateString("zh-CN", options);
const weekdays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

export default function Calendar({
  store,
  openTask,
  quickAdd,
  today,
}: ViewProps) {
  const [mode, setMode] = useState<"week" | "month">("week");
  const [anchor, setAnchor] = useState(today);
  const [selected, setSelected] = useState(today);
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [eventError, setEventError] = useState("");
  const { data } = store;
  const start =
    mode === "week" ? weekStart(anchor) : weekStart(`${anchor.slice(0, 7)}-01`);
  const days = Array.from({ length: mode === "week" ? 7 : 42 }, (_, index) =>
    addDays(start, index),
  );
  const selectedTasks = data.tasks.filter(
    (task) => task.plannedDate === selected || task.dueDate === selected,
  );
  const selectedEvents = data.events
    .filter((event) => event.date === selected)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const rangeLabel =
    mode === "month"
      ? dayLabel(anchor, { year: "numeric", month: "long" })
      : `${dayLabel(start, { month: "numeric", day: "numeric" })} — ${dayLabel(addDays(start, 6), { month: "numeric", day: "numeric" })}`;

  function move(direction: number) {
    let next: string;
    if (mode === "week") next = addDays(anchor, direction * 7);
    else {
      const date = localDate(anchor);
      next = dateKey(
        new Date(date.getFullYear(), date.getMonth() + direction, 1),
      );
    }
    setAnchor(next);
    setSelected(next);
  }

  function createEvent(date = selected) {
    setEventError("");
    setDraft({
      title: "",
      date,
      startTime: "09:00",
      endTime: "10:00",
      notes: "",
    });
  }

  function editEvent(event: CalendarEvent) {
    setEventError("");
    setDraft({ ...event });
  }

  function saveEvent(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    if (!draft.title.trim()) return setEventError("请填写日程名称。");
    if (!isDateKey(draft.date))
      return setEventError("请选择有效日期（1900–9999 年）。");
    if (draft.endTime <= draft.startTime)
      return setEventError(
        "结束时间需要晚于开始时间。跨天日程请分成两条记录。",
      );
    const { id, ...fields } = draft;
    if (id) store.updateEvent(id, { ...fields, title: fields.title.trim() });
    else store.addEvent({ ...fields, title: fields.title.trim() });
    setSelected(draft.date);
    setAnchor(draft.date);
    setDraft(null);
  }

  return (
    <div className="page-stack calendar-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">把时间留给重要的事</div>
          <h1>日历安排</h1>
          <p className="muted">
            计划日期告诉你什么时候做，截止日期提醒你最晚什么时候完成。
          </p>
        </div>
        <div className="calendar-heading-actions">
          <button className="btn" onClick={() => createEvent()}>
            <Clock3 size={17} /> 新建日程
          </button>
          <button
            className="btn btn-primary"
            onClick={() => quickAdd({ plannedDate: selected, inbox: false })}
          >
            <Plus size={17} /> 添加任务
          </button>
        </div>
      </div>

      <section className="card calendar-surface" aria-label="任务日历">
        <div className="calendar-toolbar">
          <div className="calendar-range">
            <div className="calendar-nav-buttons">
              <button
                className="btn btn-ghost icon-btn"
                aria-label="上一个周期"
                onClick={() => move(-1)}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                className="btn btn-ghost icon-btn"
                aria-label="下一个周期"
                onClick={() => move(1)}
              >
                <ChevronRight size={18} />
              </button>
            </div>
            <h2>{rangeLabel}</h2>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setAnchor(today);
                setSelected(today);
              }}
            >
              今天
            </button>
          </div>
          <div className="segmented" aria-label="日历视图">
            <button
              className={mode === "week" ? "active" : ""}
              aria-pressed={mode === "week"}
              onClick={() => setMode("week")}
            >
              周视图
            </button>
            <button
              className={mode === "month" ? "active" : ""}
              aria-pressed={mode === "month"}
              onClick={() => setMode("month")}
            >
              月视图
            </button>
          </div>
        </div>
        <div className="calendar-legend">
          <span>
            <span className="legend-dot planned" />
            计划任务
          </span>
          <span>
            <Flag size={12} />
            截止日期
          </span>
          <span>
            <span className="legend-dot event" />
            固定日程
          </span>
          <span className="muted">点击日期添加任务 · 点击事项查看详情</span>
        </div>
        <div
          className={`calendar-grid ${mode === "week" ? "calendar-week" : "calendar-month"}`}
        >
          {days.map((day, index) => {
            const tasks = data.tasks
              .filter(
                (task) => task.plannedDate === day || task.dueDate === day,
              )
              .sort(
                (a, b) =>
                  Number(a.status === "done") - Number(b.status === "done") ||
                  a.order - b.order,
              );
            const events = data.events
              .filter((event) => event.date === day)
              .sort((a, b) => a.startTime.localeCompare(b.startTime));
            const items = [
              ...events.map((event) => (
                <button
                  key={`event-${event.id}`}
                  className="calendar-item calendar-event"
                  onClick={() => {
                    setSelected(day);
                    editEvent(event);
                  }}
                  title={`${event.startTime}–${event.endTime} ${event.title}`}
                >
                  <span className="calendar-item-meta">
                    <Clock3 size={11} />
                    {event.startTime}–{event.endTime}
                  </span>
                  <span>{event.title}</span>
                </button>
              )),
              ...tasks.map((task) => (
                <button
                  key={`task-${task.id}`}
                  className={`calendar-item ${task.dueDate === day ? "calendar-deadline" : "calendar-planned"} ${task.status === "done" ? "calendar-completed" : ""}`}
                  onClick={() => {
                    setSelected(day);
                    openTask(task.id);
                  }}
                  title={task.title}
                >
                  <span className="calendar-item-meta">
                    {task.dueDate === day ? (
                      <>
                        <Flag size={11} />
                        {task.plannedDate === day ? "计划 · 截止" : "截止"}
                      </>
                    ) : (
                      <>
                        <CalendarCheck2 size={11} />
                        计划
                      </>
                    )}
                    {task.status === "done" && " · 已完成"}
                  </span>
                  <span>{task.title}</span>
                </button>
              )),
            ];
            return (
              <div
                key={day}
                className={`calendar-day ${day === today ? "is-today" : ""} ${day === selected ? "is-selected" : ""} ${mode === "month" && day.slice(0, 7) !== anchor.slice(0, 7) ? "outside-month" : ""}`}
              >
                {(mode === "week" || index < 7) && (
                  <div className="calendar-weekday">{weekdays[index % 7]}</div>
                )}
                <div className="calendar-day-heading">
                  <button
                    className="calendar-date-button"
                    aria-label={`${day} 添加任务`}
                    onClick={() => {
                      setSelected(day);
                      quickAdd({ plannedDate: day, inbox: false });
                    }}
                  >
                    <span className="calendar-date-number">
                      {Number(day.slice(8))}
                    </span>
                    {day === today && <small>今天</small>}
                  </button>
                  <button
                    className="calendar-day-add"
                    title="新建当天日程"
                    aria-label={`${day} 新建日程`}
                    onClick={() => createEvent(day)}
                  >
                    <Plus size={13} />
                  </button>
                </div>
                <div className="calendar-items">
                  {mode === "month" ? items.slice(0, 3) : items}
                  {mode === "month" && items.length > 3 && (
                    <button
                      className="calendar-more"
                      onClick={() => setSelected(day)}
                    >
                      另有 {items.length - 3} 项，查看全部
                    </button>
                  )}
                </div>
                {mode === "week" && items.length === 0 && (
                  <button
                    className="calendar-empty-day"
                    onClick={() => {
                      setSelected(day);
                      quickAdd({ plannedDate: day, inbox: false });
                    }}
                  >
                    <Plus size={16} />
                    <span>留一些空白</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="card calendar-day-detail">
        <div className="section-head">
          <div>
            <h2>
              {dayLabel(selected, {
                month: "long",
                day: "numeric",
                weekday: "long",
              })}
            </h2>
            <p className="muted">
              {selectedTasks.length} 个任务 · {selectedEvents.length} 个日程
            </p>
          </div>
          <button
            className="btn btn-ghost"
            onClick={() => quickAdd({ plannedDate: selected, inbox: false })}
          >
            <Plus size={16} />
            安排任务
          </button>
        </div>
        {selectedTasks.length === 0 && selectedEvents.length === 0 ? (
          <EmptyState
            icon={<CalendarDays size={28} />}
            title="这一天还没有安排"
            description="有明确计划时再安排日期，也可以为会议建立固定日程。"
            action={
              <button className="btn" onClick={() => createEvent()}>
                新建日程
              </button>
            }
          />
        ) : (
          <div className="day-detail-list">
            {selectedEvents.map((event) => (
              <button
                className="day-event-row"
                key={event.id}
                onClick={() => editEvent(event)}
              >
                <div className="event-time">
                  {event.startTime}
                  <small>{event.endTime}</small>
                </div>
                <div>
                  <strong>{event.title}</strong>
                  <span className="muted">{event.notes || "固定日程"}</span>
                </div>
                <span className="badge">日程</span>
              </button>
            ))}
            {selectedTasks.map((task) => (
              <div className="day-task-row" key={task.id}>
                <TaskRow task={task} store={store} openTask={openTask} />
                <span
                  className={`badge ${task.dueDate === selected ? "deadline-badge" : ""}`}
                >
                  {task.plannedDate === selected ? "计划做" : ""}
                  {task.plannedDate === selected && task.dueDate === selected
                    ? " · "
                    : ""}
                  {task.dueDate === selected ? "截止日" : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {draft && (
        <Modal
          title={draft.id ? "编辑日程" : "新建日程"}
          onClose={() => setDraft(null)}
        >
          <form className="event-form" onSubmit={saveEvent}>
            <label className="field">
              日程名称
              <input
                autoFocus
                required
                placeholder="例如：组会、与导师讨论"
                value={draft.title}
                onChange={(event) =>
                  setDraft({ ...draft, title: event.target.value })
                }
              />
            </label>
            <label className="field">
              日期
              <input
                required
                type="date"
                min="1900-01-01"
                max="9999-12-31"
                value={draft.date}
                onChange={(event) =>
                  setDraft({ ...draft, date: event.target.value })
                }
              />
            </label>
            <div className="event-time-fields">
              <label className="field">
                开始时间
                <input
                  required
                  type="time"
                  value={draft.startTime}
                  onChange={(event) =>
                    setDraft({ ...draft, startTime: event.target.value })
                  }
                />
              </label>
              <label className="field">
                结束时间
                <input
                  required
                  type="time"
                  value={draft.endTime}
                  onChange={(event) =>
                    setDraft({ ...draft, endTime: event.target.value })
                  }
                />
              </label>
            </div>
            <label className="field">
              备注（可选）
              <textarea
                rows={3}
                value={draft.notes}
                onChange={(event) =>
                  setDraft({ ...draft, notes: event.target.value })
                }
                placeholder="地点、准备材料或其他提醒"
              />
            </label>
            {eventError && (
              <p className="form-error" role="alert">
                {eventError}
              </p>
            )}
            <div className="event-form-actions">
              {draft.id && (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => {
                    if (window.confirm(`删除日程“${draft.title}”？`)) {
                      store.deleteEvent(draft.id!);
                      setDraft(null);
                    }
                  }}
                >
                  <Trash2 size={15} />
                  删除
                </button>
              )}
              <div className="event-form-spacer" />
              <button
                className="btn"
                type="button"
                onClick={() => setDraft(null)}
              >
                取消
              </button>
              <button type="submit" className="btn btn-primary">
                保存日程
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
