import { useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Flag,
  FolderKanban,
  NotebookPen,
} from "lucide-react";
import type { Task, ViewProps } from "../types";
import { addDays, dateKey, weekStart } from "../dates";
import { isArchivedTask, isBlocked, projectProgress } from "../selectors";
import { EmptyState, ProgressBar, TaskRow } from "../components/ui";
import { AlertsSection } from "../components/Monitoring";
import "./calendar-review.css";

const weekdayNames = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const dateOfTimestamp = (timestamp?: string) =>
  timestamp ? dateKey(new Date(timestamp)) : "";
const prettyDate = (key: string) =>
  new Date(`${key}T12:00:00`).toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
  });

export default function Review({
  store,
  openTask,
  navigate,
  today,
}: ViewProps) {
  const [week, setWeek] = useState(weekStart(today));
  const [expandedEntriesWeek, setExpandedEntriesWeek] = useState<string>();
  const { data } = store;
  const end = addDays(week, 6);
  const nextWeek = addDays(week, 7);
  const nextEnd = addDays(week, 13);
  const withinWeek = (day?: string) =>
    Boolean(day && day >= week && day <= end);
  const weeklyEntries = (data.monitoring?.entries ?? [])
    .filter(
      (entry) =>
        ["progress", "checkpoint", "adjustment"].includes(entry.kind) &&
        withinWeek(dateOfTimestamp(entry.at)),
    )
    .sort((a, b) => b.at.localeCompare(a.at));
  const weeklyProgressEntries = weeklyEntries.filter(
    (entry) => entry.kind === "progress" || entry.kind === "checkpoint",
  );
  const weeklyAdjustments = weeklyEntries.filter(
    (entry) => entry.kind === "adjustment",
  );
  const entryProjectId = (entry: (typeof weeklyEntries)[number]) =>
    entry.entityType === "project"
      ? entry.entityId
      : (entry.projectId ??
        data.tasks.find((task) => task.id === entry.entityId)?.projectId);
  const complete = data.tasks
    .filter(
      (task) =>
        task.status === "done" && withinWeek(dateOfTimestamp(task.completedAt)),
    )
    .sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));
  // Keep one completion per currently completed task, matching the chart above.
  // A recorded completion belongs to its project at that moment, including no project.
  const completedAtByTask = new Map(
    data.tasks
      .filter((task) => task.status === "done")
      .map((task) => [task.id, task.completedAt]),
  );
  const loggedCompletionProjects = new Map<string, string | undefined>();
  for (const entry of data.monitoring?.entries ?? []) {
    if (
      entry.kind === "completed" &&
      entry.entityType === "task" &&
      completedAtByTask.get(entry.entityId) === entry.at
    )
      loggedCompletionProjects.set(entry.entityId, entry.projectId);
  }
  const completionProjectId = (task: Task) =>
    loggedCompletionProjects.has(task.id)
      ? loggedCompletionProjects.get(task.id)
      : task.projectId;
  const unfinished = data.tasks
    .filter(
      (task) =>
        task.status !== "done" &&
        !isArchivedTask(task, data) &&
        ((task.plannedDate && task.plannedDate <= end) ||
          (task.dueDate && task.dueDate <= end)),
    )
    .sort((a, b) =>
      (a.dueDate || a.plannedDate || "").localeCompare(
        b.dueDate || b.plannedDate || "",
      ),
    );
  const blocked = data.tasks.filter(
    (task) =>
      task.status !== "done" &&
      !isArchivedTask(task, data) &&
      isBlocked(task, data),
  );
  const blockedProjects = data.projects.filter(
    (project) => !project.archived && project.blockedReason?.trim(),
  );
  const progressedProjects = data.projects.filter(
    (project) =>
      data.tasks.some(
        (task) =>
          task.status === "done" &&
          completionProjectId(task) === project.id &&
          withinWeek(dateOfTimestamp(task.completedAt)),
      ) ||
      weeklyProgressEntries.some(
        (entry) => entryProjectId(entry) === project.id,
      ),
  );
  const nextTasks = data.tasks
    .filter(
      (task) =>
        task.status !== "done" &&
        !isArchivedTask(task, data) &&
        ((task.plannedDate &&
          task.plannedDate >= nextWeek &&
          task.plannedDate <= nextEnd) ||
          (task.dueDate &&
            task.dueDate >= nextWeek &&
            task.dueDate <= nextEnd)),
    )
    .sort((a, b) =>
      (a.plannedDate || a.dueDate || "").localeCompare(
        b.plannedDate || b.dueDate || "",
      ),
    );
  const chart = Array.from({ length: 7 }, (_, index) => ({
    day: addDays(week, index),
    count: complete.filter(
      (task) => dateOfTimestamp(task.completedAt) === addDays(week, index),
    ).length,
  }));
  const chartMax = Math.max(...chart.map((day) => day.count), 1);
  const isCurrent = week === weekStart(today);

  function blockedReason(task: Task) {
    if (task.blockedReason?.trim()) return task.blockedReason;
    const projectReason = data.projects
      .find((project) => project.id === task.projectId)
      ?.blockedReason?.trim();
    if (projectReason) return `项目阻碍：${projectReason}`;
    const dependencies = data.tasks.filter(
      (item) => task.dependsOn?.includes(item.id) && item.status !== "done",
    );
    return dependencies.length
      ? `等待完成：${dependencies.map((item) => item.title).join("、")}`
      : "有关联任务需要先处理";
  }

  return (
    <div className="page-stack review-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">回看走过的路，再轻装向前</div>
          <h1>{isCurrent ? "本周回顾" : "每周回顾"}</h1>
          <p className="muted">
            根据已有任务自动汇总。无需重新整理，想补充时再写几句。
          </p>
        </div>
        <div className="review-period">
          <button
            className="btn btn-ghost icon-btn"
            aria-label="上一周"
            onClick={() => setWeek(addDays(week, -7))}
          >
            <ChevronLeft size={18} />
          </button>
          <span>
            {prettyDate(week)} — {prettyDate(end)}
          </span>
          <button
            className="btn btn-ghost icon-btn"
            aria-label="下一周"
            onClick={() => setWeek(addDays(week, 7))}
          >
            <ChevronRight size={18} />
          </button>
          {!isCurrent && (
            <button className="btn" onClick={() => setWeek(weekStart(today))}>
              回到本周
            </button>
          )}
        </div>
      </div>

      <div className="review-stat-grid">
        <div className="card review-stat">
          <span className="review-stat-icon green">
            <CheckCircle2 size={21} />
          </span>
          <div>
            <strong>{complete.length}</strong>
            <span>完成的任务</span>
          </div>
        </div>
        <div className="card review-stat">
          <span className="review-stat-icon blue">
            <CircleDashed size={21} />
          </span>
          <div>
            <strong>{unfinished.length}</strong>
            <span>仍需推进</span>
          </div>
        </div>
        <div className="card review-stat">
          <span className="review-stat-icon purple">
            <FolderKanban size={21} />
          </span>
          <div>
            <strong>{progressedProjects.length}</strong>
            <span>有新进展的项目</span>
          </div>
        </div>
        <div className="card review-stat">
          <span className="review-stat-icon amber">
            <Flag size={21} />
          </span>
          <div>
            <strong>
              {blocked.length} / {blockedProjects.length}
            </strong>
            <span>受阻任务 / 项目</span>
          </div>
        </div>
      </div>

      <div className="review-top-grid">
        <section className="card review-chart-card">
          <div className="section-head">
            <div>
              <h2>一点点，事情在向前</h2>
              <p className="muted">每天实际完成的任务数</p>
            </div>
            <span className="badge">共 {complete.length} 项</span>
          </div>
          <div
            className="review-chart"
            role="img"
            aria-label={`本周每天完成任务：${chart.map((day, index) => `${weekdayNames[index]} ${day.count} 项`).join("，")}`}
          >
            {chart.map((day, index) => (
              <div
                className={`review-chart-column ${day.day === today ? "current-day" : ""}`}
                key={day.day}
              >
                <strong>{day.count}</strong>
                <div className="review-bar-space">
                  <div
                    className={`chart-bar ${day.count === 0 ? "zero-bar" : ""}`}
                    style={{
                      height: day.count
                        ? `${Math.max(10, (day.count / chartMax) * 100)}%`
                        : "3px",
                    }}
                  />
                </div>
                <span>{weekdayNames[index]}</span>
                <small>{Number(day.day.slice(8))} 日</small>
              </div>
            ))}
          </div>
        </section>
        <section className="card review-note-card">
          <div className="section-head">
            <div>
              <h2>
                <NotebookPen size={18} />
                留几句话给自己
              </h2>
              <p className="muted">可选，输入后自动保存</p>
            </div>
          </div>
          <textarea
            aria-label="本周回顾笔记"
            className="review-note"
            placeholder="有什么值得记住？下周想做什么调整？也可以留空，让记录自己说话。"
            value={data.reviewNotes[week] || ""}
            onChange={(event) => store.setReviewNote(week, event.target.value)}
          />
          <div className="review-note-footer">
            {prettyDate(week)}这一周的笔记
          </div>
        </section>
      </div>

      <section className="card review-panel">
        <div className="section-head">
          <div>
            <h2>
              <NotebookPen size={18} />
              这一周，获得了什么、调整了什么
            </h2>
            <p className="muted">
              {weeklyProgressEntries.length} 条进展 · {weeklyAdjustments.length}{" "}
              条调整。阴性结果、排除假设也算有效进展。
            </p>
          </div>
          <span className="badge">{weeklyEntries.length} 条记录</span>
        </div>
        {weeklyEntries.length ? (
          <>
            <div className="review-block-list">
              {(expandedEntriesWeek === week
                ? weeklyEntries
                : weeklyEntries.slice(0, 5)
              ).map((entry) => {
                const entity =
                  entry.entityType === "project"
                    ? data.projects.find(
                        (project) => project.id === entry.entityId,
                      )
                    : data.tasks.find((task) => task.id === entry.entityId);
                const label =
                  entry.kind === "adjustment"
                    ? "调整计划"
                    : entry.kind === "checkpoint"
                      ? "目标达成"
                      : "记录进展";
                return (
                  <button
                    className="review-block review-progress-entry"
                    type="button"
                    key={entry.id}
                    disabled={!entity}
                    onClick={() =>
                      entry.entityType === "project"
                        ? navigate("projects", entry.entityId)
                        : openTask(entry.entityId)
                    }
                  >
                    <NotebookPen size={16} aria-hidden="true" />
                    <div>
                      <strong>
                        {entity?.title ?? "已删除的事项"}
                        <small> · {label}</small>
                      </strong>
                      <p>{entry.note}</p>
                      {(entry.previousDate || entry.newDate) && (
                        <p>
                          {entry.previousDate || "未设置日期"} →{" "}
                          {entry.newDate || "未设置日期"}
                        </p>
                      )}
                      <small>
                        {prettyDate(dateOfTimestamp(entry.at))} ·{" "}
                        {entry.entityType === "project" ? "项目" : "任务"}
                      </small>
                    </div>
                    {entity && <ArrowRight size={15} aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
            {weeklyEntries.length > 5 && (
              <button
                className="btn btn-ghost"
                type="button"
                aria-expanded={expandedEntriesWeek === week}
                onClick={() =>
                  setExpandedEntriesWeek(
                    expandedEntriesWeek === week ? undefined : week,
                  )
                }
              >
                {expandedEntriesWeek === week
                  ? "收起记录"
                  : `查看全部 ${weeklyEntries.length} 条记录`}
              </button>
            )}
          </>
        ) : (
          <EmptyState
            title="这一周还没有额外的进展记录"
            description="在任务或项目中记录一句发现、实验结果或调整，回顾会自动汇总；不用重复填写。"
          />
        )}
      </section>

      <div>
        <p className="muted review-caption">
          以下预警反映当前状态，不是所选周的历史快照。
        </p>
        <AlertsSection
          store={store}
          today={today}
          openTask={openTask}
          navigate={navigate}
          compact
        />
      </div>

      <div className="review-grid">
        <section className="card review-panel">
          <div className="section-head">
            <h2>
              <CheckCircle2 size={18} className="success-icon" />
              这一周，完成了这些
            </h2>
            <span className="badge">{complete.length}</span>
          </div>
          {complete.length ? (
            <div className="review-task-list">
              {complete.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  store={store}
                  openTask={openTask}
                  compact
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="这一周还没有完成记录"
              description="完成任务后会自动出现在这里，细小的进展也算数。"
            />
          )}
        </section>
        <section className="card review-panel">
          <div className="section-head">
            <h2>
              <CircleDashed size={18} />
              还有这些，慢慢推进
            </h2>
            <span className="badge">{unfinished.length}</span>
          </div>
          <p className="review-caption muted">
            截至该周末已计划或已到期、目前尚未完成的任务。
          </p>
          {unfinished.length ? (
            <div className="review-task-list">
              {unfinished.map((task) => (
                <div className="review-next-row" key={task.id}>
                  <TaskRow
                    task={task}
                    store={store}
                    openTask={openTask}
                    compact
                  />
                  <button
                    className="btn btn-ghost review-reschedule"
                    title={`计划到 ${nextWeek}`}
                    onClick={() =>
                      store.updateTask(task.id, {
                        plannedDate: nextWeek,
                        inbox: false,
                      })
                    }
                  >
                    安排下周
                    <ArrowRight size={13} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="没有留下待办"
              description="这个周期没有尚未完成的计划任务。"
            />
          )}
        </section>
      </div>

      <section className="card review-panel">
        <div className="section-head">
          <div>
            <h2>
              <FolderKanban size={18} />
              项目在怎样向前
            </h2>
            <p className="muted">
              该周有新增、完成任务或有效进展记录的项目；进度显示当前最新状态。
            </p>
          </div>
          <button
            className="btn btn-ghost"
            onClick={() => navigate("projects")}
          >
            查看项目
            <ArrowRight size={15} />
          </button>
        </div>
        {progressedProjects.length ? (
          <div className="review-project-grid">
            {progressedProjects.map((project) => {
              const progress = projectProgress(project.id, data);
              const weeklyCompleted = complete.filter(
                (task) => completionProjectId(task) === project.id,
              ).length;
              const newTasks = data.tasks.filter(
                (task) =>
                  task.projectId === project.id &&
                  withinWeek(dateOfTimestamp(task.createdAt)),
              ).length;
              const progressEntries = weeklyProgressEntries.filter(
                (entry) => entryProjectId(entry) === project.id,
              ).length;
              return (
                <button
                  className="review-project"
                  key={project.id}
                  onClick={() => navigate("projects", project.id)}
                >
                  <div className="review-project-title">
                    <span
                      className="project-color-dot"
                      style={{ background: project.color }}
                    />
                    <strong>{project.title}</strong>
                    {project.archived && <span className="badge">已归档</span>}
                    <span>{progress.percent}%</span>
                  </div>
                  <ProgressBar value={progress.percent} />
                  <div className="review-project-meta">
                    <span>
                      该周完成 {weeklyCompleted} · 新增 {newTasks}
                      {progressEntries > 0 && ` · 进展记录 ${progressEntries}`}
                    </span>
                    <span>
                      {progress.done}/{progress.total} 项完成
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="这一周暂无项目进展记录"
            description="完成项目任务、记录结果或确认目标达成后，这里会自动汇总。"
          />
        )}
      </section>

      <div className="review-grid">
        <section className="card review-panel">
          <div className="section-head">
            <div>
              <h2>
                <Flag size={18} className="warning-icon" />
                仍然卡在哪里
              </h2>
              <p className="muted">当前尚未解决的任务和项目阻碍</p>
            </div>
          </div>
          {blocked.length + blockedProjects.length ? (
            <div className="review-block-list">
              {blocked.map((task) => (
                <button
                  key={task.id}
                  className="review-block"
                  onClick={() => openTask(task.id)}
                >
                  <span className="review-block-dot" />
                  <div>
                    <strong>{task.title}</strong>
                    <p>{blockedReason(task)}</p>
                  </div>
                  <ArrowRight size={15} />
                </button>
              ))}
              {blockedProjects.map((project) => (
                <button
                  key={project.id}
                  className="review-block"
                  onClick={() => navigate("projects", project.id)}
                >
                  <span className="review-block-dot" />
                  <div>
                    <strong>
                      {project.title}
                      <small> 项目</small>
                    </strong>
                    <p>{project.blockedReason}</p>
                  </div>
                  <ArrowRight size={15} />
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              title="目前没有记录中的卡点"
              description="遇到阻碍时记在任务或项目里，就不会被遗忘。"
            />
          )}
        </section>
        <section className="card review-panel">
          <div className="section-head">
            <div>
              <h2>
                <ArrowRight size={18} />
                下周，接着做什么
              </h2>
              <p className="muted">
                {prettyDate(nextWeek)} — {prettyDate(nextEnd)}{" "}
                已安排或即将到期的任务
              </p>
            </div>
          </div>
          {nextTasks.length ? (
            <div className="review-task-list">
              {nextTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  store={store}
                  openTask={openTask}
                  compact
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="下周还没有明确安排"
              description="可以将待办安排到下周；不必为每件事都设置日期。"
              action={
                <button className="btn" onClick={() => navigate("calendar")}>
                  打开日历
                </button>
              }
            />
          )}
        </section>
      </div>
    </div>
  );
}
