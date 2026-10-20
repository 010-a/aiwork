import { useState } from "react";
import { Activity, Flag, CalendarDays, Clock3 } from "lucide-react";
import type { ViewProps } from "../types";
import { addDays, dateKey, formatDate } from "../dates";
import { currentBlockers, progressForProject, upcomingDays } from "../insights";
import { useViewState } from "../viewMemory";
export function Momentum({
  store,
  today,
  navigate,
  openTask,
  projectId,
}: ViewProps & { projectId?: string }) {
  const projects = store.data.projects.filter((p) =>
    !projectId ? !p.archived : p.id === projectId,
  );
  const dates = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
  const [selected, setSelected] = useState<{
    projectId: string;
    date: string;
  }>();
  const selectedEntries = selected
    ? progressForProject(store.data, selected.projectId).filter(
        (e) => dateKey(new Date(e.at)) === selected.date,
      )
    : [];
  return (
    <section
      className="card insights-card momentum-card"
      aria-label="项目近期进展"
    >
      <div className="insight-heading">
        <Activity size={19} />
        <div>
          <h2>项目近期进展</h2>
          <p>最近两周的结果记录与任务完成 · 点击查看来源</p>
        </div>
        <span className="insight-range">
          {formatDate(dates[0])} — {formatDate(today)}
        </span>
      </div>
      {projects.length ? (
        <div className="momentum-scroll">
          <div className="momentum-grid">
            <div className="momentum-dates">
              <span />
              {dates.map((d, i) => (
                <small key={d}>
                  {i === 0 || d.endsWith("01") ? formatDate(d) : d.slice(8)}
                </small>
              ))}
            </div>
            {projects.map((p) => {
              const entries = progressForProject(store.data, p.id);
              return (
                <div className="momentum-row" key={p.id}>
                  <button
                    className="momentum-project"
                    onClick={() => navigate("projects", p.id)}
                  >
                    <i style={{ background: p.color }} />
                    {p.title}
                  </button>
                  {dates.map((d) => {
                    const items = entries.filter(
                        (e) => dateKey(new Date(e.at)) === d,
                      ),
                      goal = items.some((e) => e.kind === "checkpoint");
                    return (
                      <button
                        className={`momentum-cell ${items.length ? (goal ? "goal" : "recorded") : ""} ${selected?.date === d && selected.projectId === p.id ? "selected" : ""}`}
                        key={d}
                        aria-label={`${p.title} ${d} ${items.length ? `${items.length} 条记录` : "暂无记录"}`}
                        onClick={() =>
                          setSelected({ projectId: p.id, date: d })
                        }
                      >
                        {items.length > 0 ? (goal ? "✓" : "•") : ""}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="muted padded">创建项目后，进展会自动汇集到这里。</p>
      )}
      <div className="insight-legend">
        <span>
          <i className="recorded" />
          有结果 / 完成记录
        </span>
        <span>
          <i className="goal" />
          目标达成
        </span>
        <span>
          <i />
          暂无记录
        </span>
      </div>
      {selected && (
        <div className="insight-selection">
          <strong>
            {
              store.data.projects.find((p) => p.id === selected.projectId)
                ?.title
            }{" "}
            · {formatDate(selected.date)}
          </strong>
          {selectedEntries.length ? (
            selectedEntries.map((e) => (
              <button
                className="insight-entry"
                key={e.id}
                onClick={() =>
                  e.entityType === "task"
                    ? openTask(e.entityId)
                    : navigate("projects", e.entityId)
                }
              >
                {e.note}
              </button>
            ))
          ) : (
            <p className="muted">这一天暂无结果记录，不代表没有工作。</p>
          )}
        </div>
      )}
      <p className="insight-footnote">
        记录次数不代表科研价值，也不用于估算目标完成百分比。
      </p>
    </section>
  );
}
export function BlockerChart(props: ViewProps) {
  const items = currentBlockers(props.store.data, props.today),
    max = Math.max(1, ...items.map((i) => i.days));
  return (
    <section className="card insights-card" aria-label="卡点持续时间">
      <div className="insight-heading">
        <Clock3 size={19} />
        <div>
          <h2>卡点持续时间</h2>
          <p>当前未解决事项 · 按已观察的自然日排序</p>
        </div>
      </div>
      {items.length ? (
        items.map((item) => (
          <button
            key={`${item.target.type}-${item.target.id}`}
            className="blocker-chart-row"
            onClick={() =>
              item.target.type === "task"
                ? props.openTask(item.target.id)
                : props.navigate("projects", item.target.id)
            }
          >
            <div>
              <strong>{item.title}</strong>
              <span>
                {item.since ? `已观察 ${item.days} 天` : "起点未记录"}
              </span>
            </div>
            <div className="blocker-bar">
              <span
                style={{ width: `${Math.max(3, (item.days / max) * 100)}%` }}
              />
            </div>
            <small>
              {item.reason}
              {item.followUp ? ` · ${formatDate(item.followUp)} 跟进` : ""}
            </small>
          </button>
        ))
      ) : (
        <p className="muted padded">当前没有记录未解决的阻碍。</p>
      )}
      <p className="insight-footnote">
        旧事项从启用预警时开始观察；经过天数不等于实际投入时间。
      </p>
    </section>
  );
}
export function UpcomingChart({
  store,
  today,
  onPick,
}: Pick<ViewProps, "store" | "today"> & { onPick: (date: string) => void }) {
  const days = upcomingDays(store.data, today),
    max = Math.max(1, ...days.map((d) => d.planned.length + d.events.length));
  const [capacity, setCapacity] = useViewState<number | null>(
    "daily-capacity",
    null,
    (v): v is number | null =>
      v === null ||
      (typeof v === "number" && Number.isInteger(v) && v >= 15 && v <= 1440),
  );
  const [picked, setPicked] = useState(today);
  const chosen = days.find((d) => d.date === picked) ?? days[0];
  return (
    <section
      className="card insights-card upcoming-card"
      aria-label="未来七天安排概览"
    >
      <div className="insight-heading">
        <CalendarDays size={19} />
        <div>
          <h2>未来七天安排</h2>
          <p>计划任务与固定日程按数量展示，截止事项单独标记</p>
        </div>
        <label className="capacity-setting">
          每日参考时长
          <input
            className="field"
            aria-label="每日参考时长"
            type="number"
            key={capacity}
            min={15}
            max={1440}
            defaultValue={capacity ?? ""}
            placeholder="可选 · 分钟"
            onBlur={(e) => {
              const n = Number(e.target.value);
              if (!e.target.value) setCapacity(null);
              else if (Number.isInteger(n) && n >= 15 && n <= 1440)
                setCapacity(n);
              else e.target.value = String(capacity ?? "");
            }}
          />
        </label>
      </div>
      <div className="upcoming-bars">
        {days.map((day) => (
          <button
            key={day.date}
            className={`upcoming-day ${picked === day.date ? "selected" : ""}`}
            aria-label={`${day.date} 计划${day.planned.length} 日程${day.events.length} 截止${day.deadlines.length}`}
            onClick={() => {
              setPicked(day.date);
              onPick(day.date);
            }}
          >
            <span className="upcoming-count">
              {day.planned.length + day.events.length || "—"}
            </span>
            <div className="upcoming-track">
              <span
                className="upcoming-event-bar"
                style={{ height: `${(day.events.length / max) * 100}%` }}
              />
              <span
                className="upcoming-task-bar"
                style={{ height: `${(day.planned.length / max) * 100}%` }}
              />
            </div>
            <strong>
              {day.date === today
                ? "今天"
                : formatDate(day.date, { weekday: "short" })}
            </strong>
            <small>{formatDate(day.date)}</small>
            <span
              className={`deadline-marker ${day.deadlines.length ? "has-deadline" : ""}`}
            >
              <Flag size={12} />
              {day.deadlines.length
                ? `${day.deadlines.length} 项截止`
                : "无截止"}
            </span>
          </button>
        ))}
      </div>
      <div className="insight-legend">
        <span>
          <i className="recorded" />
          计划任务
        </span>
        <span>
          <i className="event" />
          固定日程
        </span>
      </div>
      <div className="workload-summary">
        <strong>{formatDate(chosen.date)} · </strong>任务已估{" "}
        {chosen.estimatedMinutes} 分钟，日程合计 {chosen.eventMinutes} 分钟
        {chosen.unestimated > 0 && `，另有 ${chosen.unestimated} 项未估时`}
        {capacity !== null &&
          chosen.estimatedMinutes + chosen.eventMinutes > capacity && (
            <span className="workload-warning">
              已估安排超过参考时长，可适当挪动任务。
            </span>
          )}
      </div>
      <p className="insight-footnote">
        未估时事项不推算耗时；日程可能重叠，合计值不代表可用时间。
      </p>
    </section>
  );
}
