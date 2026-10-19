import { useState } from "react";
import {
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Plus,
  FolderOpen,
  GitBranch,
  Target,
  Sprout,
  CircleCheck,
  CircleAlert,
  CalendarDays,
  Inbox as InboxIcon,
  Play,
  Flag,
  Check,
  Clock3,
  ChevronRight,
  Microscope,
  BookOpen,
  Coffee,
  Layers,
  Lightbulb,
} from "lucide-react";
import type { ViewProps, Task } from "../types";
import {
  TaskRow,
  EmptyState,
  SectionHeader,
  ProgressBar,
} from "../components/ui";
import {
  getTodayTasks,
  isBlocked,
  projectProgress,
  recommendTasks,
} from "../selectors";
import { weekStart, addDays, dateKey } from "../dates";

export function Home(props: ViewProps) {
  const { store, today, navigate, openTask, quickAdd } = props;
  const { data } = store;
  const projects = data.projects.filter((p) => !p.archived),
    todayTasks = getTodayTasks(data, today),
    recs = recommendTasks(data, today),
    next = recs[0];
  const blocked = data.tasks.filter(
    (t) =>
      t.status !== "done" &&
      (t.blockedReason?.trim() ||
        t.dependsOn?.some(
          (id) =>
            data.tasks.find((other) => other.id === id)?.status !== "done",
        )) &&
      !data.projects.find((p) => p.id === t.projectId)?.archived,
  );
  const blockedProjects = projects.filter((p) => p.blockedReason?.trim());
  const monday = weekStart(today),
    sunday = addDays(monday, 6);
  const completed = data.tasks.filter(
    (t) =>
      t.completedAt &&
      dateKey(new Date(t.completedAt)) >= monday &&
      dateKey(new Date(t.completedAt)) <= sunday,
  );
  const icons = [Microscope, Layers, BookOpen, Coffee];
  const [mapMode, setMapMode] = useState<"all" | "active">("all");
  const displayed =
    mapMode === "active"
      ? projects.filter((p) => {
          const q = projectProgress(p.id, data);
          return q.done < q.total || !q.total;
        })
      : projects;
  return (
    <div className="page-stack">
      <section className="welcome">
        <div>
          <p className="eyebrow">从看清全局，到迈出一步</p>
          <h1>
            让重要的事，有序发生<span className="title-dot">。</span>
          </h1>
          <p className="muted">不用一次想清所有事，先找到眼前的下一步。</p>
        </div>
        <div className="landscape" aria-hidden="true">
          <span className="sun" />
          <span className="mountain mountain-back" />
          <span className="mountain mountain-front" />
          <Sprout className="landscape-sprout" size={52} />
        </div>
      </section>
      <section className="suggestion card">
        <div className="suggestion-icon">
          <Lightbulb size={25} />
        </div>
        <div className="suggestion-content">
          <div className="mini-label">
            下一步建议 <span className="badge amber">有据可循</span>
          </div>
          <h3>{next ? next.task.title : "从一件小事开始"}</h3>
          <p>
            {next
              ? next.reason
              : "随手记下脑中的一件事，暂时不用分类或安排日期。"}
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => (next ? openTask(next.task.id) : quickAdd())}
        >
          {next ? "查看并开始" : "记下一件事"}
          <ArrowRight size={16} />
        </button>
      </section>
      <div className="stat-grid">
        {[
          {
            icon: FolderOpen,
            label: "进行中的项目",
            value: projects.filter((p) => {
              const q = projectProgress(p.id, data);
              return q.total === 0 || q.done < q.total;
            }).length,
            unit: "个项目",
            color: "green",
            page: "projects" as const,
          },
          {
            icon: CalendarDays,
            label: "今日待办",
            value: todayTasks.filter((t) => t.status !== "done").length,
            unit: "件事情",
            color: "blue",
            page: "today" as const,
          },
          {
            icon: CircleAlert,
            label: "当前卡点",
            value: blocked.length + blockedProjects.length,
            unit: "个阻碍",
            color: "red",
            page: "projects" as const,
          },
          {
            icon: CircleCheck,
            label: "本周完成",
            value: completed.length,
            unit: "件事情",
            color: "purple",
            page: "review" as const,
          },
        ].map((s) => (
          <button
            className="stat-card card"
            key={s.label}
            onClick={() => navigate(s.page)}
          >
            <span className={`stat-icon ${s.color}`}>
              <s.icon size={23} />
            </span>
            <div>
              <span className="stat-label">{s.label}</span>
              <strong>
                {s.value}
                <small>{s.unit}</small>
              </strong>
            </div>
            <ChevronRight size={17} className="muted" />
          </button>
        ))}
      </div>
      <div className="home-grid">
        <section className="card task-map-card">
          <SectionHeader
            title="任务导航地图"
            subtitle="看见全局，也看见每一步"
            action={
              <div className="segmented small">
                <button
                  className={mapMode === "all" ? "active" : ""}
                  onClick={() => setMapMode("all")}
                >
                  全部项目
                </button>
                <button
                  className={mapMode === "active" ? "active" : ""}
                  onClick={() => setMapMode("active")}
                >
                  未完成
                </button>
              </div>
            }
          />
          {displayed.length ? (
            <div className="task-map">
              <div className="map-root">
                <div className="map-root-icon">
                  <Sprout size={30} />
                </div>
                <strong>我的任务</strong>
                <span>
                  {data.tasks.filter((t) => t.status !== "done").length}{" "}
                  件事，慢慢向前
                </span>
              </div>
              <div
                className="map-branches"
                style={
                  { "--branches": displayed.length } as React.CSSProperties
                }
              >
                {displayed.map((p, index) => {
                  const progress = projectProgress(p.id, data),
                    tasks = data.tasks.filter((t) => t.projectId === p.id),
                    nextTask = recs.find(
                      (r) => r.task.projectId === p.id,
                    )?.task;
                  const Icon = icons[index % icons.length];
                  return (
                    <button
                      className="map-node"
                      key={p.id}
                      style={{ "--node-color": p.color } as React.CSSProperties}
                      onClick={() => navigate("projects", p.id)}
                    >
                      <div className="map-node-head">
                        <span className="node-icon">
                          <Icon size={22} />
                        </span>
                        <strong>{p.title}</strong>
                        <ChevronRight size={16} />
                      </div>
                      <div className="map-node-stats">
                        <span>
                          {tasks.filter((t) => t.status === "doing").length}{" "}
                          进行中
                        </span>
                        <span>
                          {
                            tasks.filter(
                              (t) =>
                                t.status !== "done" && t.status !== "doing",
                            ).length
                          }{" "}
                          待办
                        </span>
                        <span>{progress.done} 已完成</span>
                      </div>
                      <ProgressBar value={progress.percent} />
                      <p>
                        {p.blockedReason ? (
                          <>
                            <CircleAlert size={12} /> {p.blockedReason}
                          </>
                        ) : nextTask ? (
                          `下一步 · ${nextTask.title}`
                        ) : progress.total &&
                          progress.done === progress.total ? (
                          "已完成全部任务，做得很好"
                        ) : (
                          "准备好时，添加第一步"
                        )}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <EmptyState
              icon={<GitBranch size={30} />}
              title="给重要的事，一个清楚的位置"
              description="创建项目后，它会成为地图的一条分支；也可以先收集，稍后整理。"
              action={
                <button
                  className="btn btn-primary"
                  onClick={() => navigate("projects")}
                >
                  <Plus size={16} />
                  创建第一个项目
                </button>
              }
            />
          )}
          <div className="map-footer">
            <span>
              <i className="status-dot green-dot" />
              进行中
            </span>
            <span>
              <i className="status-dot blue-dot" />
              待处理
            </span>
            <span>
              <i className="status-dot gray-dot" />
              已完成
            </span>
            <button className="text-link" onClick={() => navigate("projects")}>
              管理项目 <ArrowRight size={13} />
            </button>
          </div>
        </section>
        <div className="home-side">
          <section className="card">
            <SectionHeader
              title="当前卡点"
              action={
                <span className="count-label">
                  {blocked.length + blockedProjects.length}
                </span>
              }
            />
            {!blocked.length && !blockedProjects.length ? (
              <div className="calm-empty">
                <span className="soft-icon green">
                  <Check size={22} />
                </span>
                <h3>眼前的路，很通畅</h3>
                <p>遇到阻碍时记下来，给思绪腾点空间。</p>
              </div>
            ) : (
              <div className="blocker-list">
                {blockedProjects.map((p) => (
                  <button
                    key={p.id}
                    className="blocker-item"
                    onClick={() => navigate("projects", p.id)}
                  >
                    <CircleAlert size={18} />
                    <div>
                      <strong>{p.blockedReason}</strong>
                      <small>{p.title}</small>
                    </div>
                    <ChevronRight size={15} />
                  </button>
                ))}
                {blocked.slice(0, 3).map((t) => (
                  <button
                    key={t.id}
                    className="blocker-item"
                    onClick={() => openTask(t.id)}
                  >
                    <CircleAlert size={18} />
                    <div>
                      <strong>{t.title}</strong>
                      <small>
                        {t.blockedReason ||
                          data.projects.find((p) => p.id === t.projectId)
                            ?.blockedReason ||
                          "等待前置任务完成"}
                      </small>
                    </div>
                    <ChevronRight size={15} />
                  </button>
                ))}
              </div>
            )}
          </section>
          <section className="card">
            <SectionHeader
              title="接下来的行动"
              action={
                <button className="text-link" onClick={() => navigate("today")}>
                  今日全部 <ArrowRight size={13} />
                </button>
              }
            />
            {recs.length ? (
              <div className="next-list">
                {recs.slice(0, 3).map((r, i) => (
                  <button
                    key={r.task.id}
                    className="next-item"
                    onClick={() => openTask(r.task.id)}
                  >
                    <span className={`number ${i === 0 ? "first" : ""}`}>
                      {i + 1}
                    </span>
                    <div>
                      <strong>{r.task.title}</strong>
                      <small>{r.reason}</small>
                    </div>
                    <Play size={15} />
                  </button>
                ))}
              </div>
            ) : (
              <div className="calm-empty small-empty">
                <Target size={25} />
                <p>
                  把一件任务安排到今天，
                  <br />
                  从容开始就好。
                </p>
                <button
                  className="text-link"
                  onClick={() => quickAdd({ plannedDate: today, inbox: false })}
                >
                  添加今日任务 <Plus size={14} />
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
      {data.tasks.some((t) => !t.inbox && !t.projectId) && (
        <section className="card">
          <SectionHeader
            title="独立任务"
            subtitle="不属于任何项目的事情，也有自己的位置"
            action={
              <button
                className="text-link"
                onClick={() => quickAdd({ inbox: false })}
              >
                <Plus size={14} />
                添加独立任务
              </button>
            }
          />
          {data.tasks
            .filter((t) => !t.inbox && !t.projectId)
            .sort(
              (a, b) =>
                Number(a.status === "done") - Number(b.status === "done") ||
                a.order - b.order,
            )
            .map((t) => (
              <TaskRow key={t.id} task={t} store={store} openTask={openTask} />
            ))}
        </section>
      )}
    </div>
  );
}

export function Inbox(props: ViewProps) {
  const { store, openTask, today } = props;
  const [text, setText] = useState(""),
    [selected, setSelected] = useState<string[]>([]);
  const tasks = store.data.tasks.filter((t) => t.inbox && t.status !== "done");
  const visible = tasks;
  const add = () => {
    if (text.trim() && store.addTask(text.trim())) setText("");
  };
  const batch = (patch: Partial<Task>) => {
    selected.forEach((id) => store.updateTask(id, patch));
    setSelected([]);
  };
  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">先记录，再慢慢理清</p>
          <h1>
            收集箱 <span className="heading-count">{tasks.length}</span>
          </h1>
          <p className="muted">让想法有个落脚处。现在只需要写下来。</p>
        </div>
        <span className="outline-label">
          <InboxIcon size={16} />
          轻松收集，不急着分类
        </span>
      </div>
      <div className="capture-box card">
        <div className="capture-icon">
          <Plus size={24} />
        </div>
        <input
          aria-label="快速记录"
          maxLength={500}
          placeholder="想到什么，就写下来…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              add();
            }
          }}
        />
        <span className="key-hint">Enter ↵</span>
        <button
          className="btn btn-primary"
          disabled={!text.trim()}
          onClick={add}
        >
          收集 <ArrowRight size={16} />
        </button>
      </div>
      <section className="card inbox-list">
        <SectionHeader
          title="待整理的事情"
          subtitle="不必一次整理完，挑一件开始就好"
          action={<span className="count-label">{tasks.length} 件</span>}
        />
        {!!visible.length && (
          <div className="batch-toolbar">
            <label>
              <input
                type="checkbox"
                aria-label="全选收集任务"
                checked={visible.every((t) => selected.includes(t.id))}
                onChange={(e) =>
                  setSelected(e.target.checked ? visible.map((t) => t.id) : [])
                }
              />{" "}
              {selected.length
                ? `已选择 ${selected.length} 项`
                : "选择任务以批量整理"}
            </label>
            {!!selected.length && (
              <div className="inline-actions">
                <button
                  className="btn btn-small"
                  onClick={() => batch({ plannedDate: today, inbox: false })}
                >
                  <CalendarDays size={14} />
                  安排到今天
                </button>
                <select
                  className="field batch-select"
                  aria-label="批量归入项目"
                  value=""
                  onChange={(e) => {
                    if (e.target.value)
                      batch({ projectId: e.target.value, inbox: false });
                  }}
                >
                  <option value="">归入项目…</option>
                  {store.data.projects
                    .filter((p) => !p.archived)
                    .map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.title}
                      </option>
                    ))}
                </select>
                <button
                  className="btn btn-small"
                  onClick={() => batch({ inbox: false })}
                >
                  <Check size={14} />
                  转为任务
                </button>
                <button
                  className="btn btn-small btn-danger"
                  onClick={() => {
                    if (confirm(`删除选中的 ${selected.length} 件事？`)) {
                      store.deleteTasks(selected);
                      setSelected([]);
                    }
                  }}
                >
                  删除
                </button>
              </div>
            )}
          </div>
        )}
        {visible.length ? (
          <div>
            {visible.map((t) => (
              <div className="inbox-task" key={t.id}>
                <input
                  type="checkbox"
                  aria-label={`选择 ${t.title}`}
                  checked={selected.includes(t.id)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, t.id]
                        : selected.filter((id) => id !== t.id),
                    )
                  }
                />
                <TaskRow task={t} store={store} openTask={openTask} />
                <button
                  className="btn btn-small inbox-today"
                  onClick={() =>
                    store.updateTask(t.id, { plannedDate: today, inbox: false })
                  }
                >
                  安排今天
                </button>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="脑中的事，随时放在这里"
            description="在上方输入一句话，按回车保存。无需选项目，也无需定日期。"
          />
        )}
      </section>
      <div className="gentle-tip">
        <Lightbulb size={17} />
        <span>一个小习惯：想到时收集，有空时整理，执行时只看今天。</span>
      </div>
    </div>
  );
}

export function Today(props: ViewProps) {
  const { store, today, openTask, quickAdd } = props;
  const tasks = getTodayTasks(store.data, today);
  const done = tasks.filter((t) => t.status === "done"),
    pending = tasks.filter((t) => t.status !== "done");
  const recommendations = recommendTasks(store.data, today).filter((r) =>
    pending.some((t) => t.id === r.task.id),
  );
  const first = recommendations[0];
  const progress = tasks.length
    ? Math.round((done.length / tasks.length) * 100)
    : 0;
  const move = (task: Task, direction: number) => {
    const ordered = [...pending].sort((a, b) => a.order - b.order);
    const i = ordered.findIndex((t) => t.id === task.id),
      j = i + direction;
    if (j < 0 || j >= ordered.length) return;
    [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
    ordered.forEach((t, n) => store.updateTask(t.id, { order: n }));
  };
  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">少一点切换，多一点专注</p>
          <h1>今天，一步一步来</h1>
          <p className="muted">
            {new Intl.DateTimeFormat("zh-CN", {
              month: "long",
              day: "numeric",
              weekday: "long",
            }).format(new Date(today + "T12:00:00"))}{" "}
            · 已完成 {done.length} / {tasks.length} 件事
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => quickAdd({ plannedDate: today, inbox: false })}
        >
          <Plus size={16} />
          添加今日任务
        </button>
      </div>
      <div className="today-grid">
        <div className="page-stack">
          <section className="focus-card">
            <div className="focus-label">
              <Target size={17} />
              现在，专注这一件<span className="badge">下一步建议</span>
            </div>
            {first ? (
              <>
                <h2>{first.task.title}</h2>
                <p>{first.reason}</p>
                <div className="focus-actions">
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      store.updateTask(first.task.id, {
                        status: "doing",
                        inbox: false,
                      });
                      openTask(first.task.id);
                    }}
                  >
                    <Play size={15} />{" "}
                    {first.task.status === "doing" ? "继续执行" : "开始这件事"}
                  </button>
                  <button
                    className="text-link"
                    onClick={() => openTask(first.task.id)}
                  >
                    查看详情 <ArrowRight size={14} />
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2>
                  {pending.length ? "先疏通眼前的阻碍" : "给今天留一点从容"}
                </h2>
                <p>
                  {pending.length
                    ? "待办任务暂时被阻塞或暂停。打开详情处理阻碍，或恢复任务后继续。"
                    : "你可以安排一件小事，或者享受已经完成后的轻松。"}
                </p>
                <button
                  className="btn btn-primary"
                  onClick={() => quickAdd({ plannedDate: today, inbox: false })}
                >
                  <Plus size={16} />
                  添加一件事
                </button>
              </>
            )}
          </section>
          <section className="card">
            <SectionHeader
              title="接下来要做"
              subtitle="上下调整顺序；有截止日期和手动标记的任务优先建议"
              action={<span className="count-label">{pending.length}</span>}
            />
            {pending.length ? (
              <div>
                {[...pending]
                  .sort((a, b) => a.order - b.order)
                  .map((t, i) => (
                    <div key={t.id} className="ordered-task">
                      <span className="order-index">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <TaskRow task={t} store={store} openTask={openTask} />
                      <div className="reorder">
                        <button
                          className="icon-btn"
                          disabled={i === 0}
                          onClick={() => move(t, -1)}
                          aria-label={`上移 ${t.title}`}
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          className="icon-btn"
                          disabled={i === pending.length - 1}
                          onClick={() => move(t, 1)}
                          aria-label={`下移 ${t.title}`}
                        >
                          <ArrowDown size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <EmptyState
                icon={<CircleCheck size={28} />}
                title="今日待办已清空"
                description="每一件完成的小事，都让你向前了一点。"
              />
            )}
          </section>
          <section className="card">
            <SectionHeader
              title="今天已完成"
              action={<span className="badge green">{done.length} 件</span>}
            />
            {done.length ? (
              done.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  store={store}
                  openTask={openTask}
                  compact
                />
              ))
            ) : (
              <p className="muted padded">完成的事情会自动留在这里。</p>
            )}
          </section>
        </div>
        <aside className="page-stack">
          <section className="card today-progress">
            <SectionHeader title="今日进度" />
            <div
              className="progress-ring"
              style={{ "--progress": `${progress}%` } as React.CSSProperties}
            >
              <div>
                <strong>
                  {progress}
                  <small>%</small>
                </strong>
                <span>慢慢来，也在前进</span>
              </div>
            </div>
            <div className="progress-summary">
              <span>
                <strong>{done.length}</strong> 已完成
              </span>
              <span>
                <strong>{pending.length}</strong> 待处理
              </span>
            </div>
          </section>
          <section className="card">
            <SectionHeader
              title="今天的固定日程"
              action={<Clock3 size={17} className="muted" />}
            />
            {store.data.events.filter((e) => e.date === today).length ? (
              store.data.events
                .filter((e) => e.date === today)
                .sort((a, b) => a.startTime.localeCompare(b.startTime))
                .map((e) => (
                  <div key={e.id} className="today-event">
                    <span>
                      {e.startTime}
                      <small>{e.endTime}</small>
                    </span>
                    <strong>{e.title}</strong>
                  </div>
                ))
            ) : (
              <div className="calm-empty small-empty">
                <CalendarDays size={24} />
                <p>
                  今天没有固定日程，
                  <br />
                  按自己的节奏来。
                </p>
              </div>
            )}
            <button
              className="text-link"
              onClick={() => props.navigate("calendar")}
            >
              查看日历 <ArrowRight size={14} />
            </button>
          </section>
          <div className="quiet-note">
            <Sprout size={24} />
            <p>
              专注行动，
              <br />
              积累看得见的改变。
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
