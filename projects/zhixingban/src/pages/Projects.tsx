import { useEffect, useState, type FormEvent } from "react";
import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  ArrowRight,
  Check,
  ExternalLink,
  FolderKanban,
  Layers,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import type { Project, Stage, Task, ViewProps } from "../types";
import { isBlocked, projectProgress, recommendTasks } from "../selectors";
import {
  EmptyState,
  Modal,
  ProgressBar,
  SectionHeader,
  TaskRow,
} from "../components/ui";

const PROJECT_COLORS = [
  "#4e88d9",
  "#6d9c83",
  "#9280bc",
  "#d49a65",
  "#cb7d8b",
  "#5b9fac",
];

function noteHref(value: string): string | undefined {
  if (!value.trim()) return undefined;
  if (/^obsidian:\/\//i.test(value)) return value;
  if (/^[A-Za-z][A-Za-z\d+.-]*:/.test(value) && !/^[A-Za-z]:[\\/]/.test(value))
    return undefined;
  return `obsidian://open?path=${encodeURIComponent(value)}`;
}

export default function Projects({
  store,
  openTask,
  quickAdd,
  today,
  selectedProjectId,
}: ViewProps & { selectedProjectId?: string }) {
  const { data } = store;
  const [selectedId, setSelectedId] = useState(selectedProjectId);
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newGoal, setNewGoal] = useState("");
  const [newColor, setNewColor] = useState(PROJECT_COLORS[0]);
  const [editingId, setEditingId] = useState<string>();
  const [editingTitle, setEditingTitle] = useState("");
  const [editingNote, setEditingNote] = useState("");
  const [noteError, setNoteError] = useState("");
  const [addingStage, setAddingStage] = useState(false);
  const [newStageTitle, setNewStageTitle] = useState("");
  const [editingStage, setEditingStage] = useState<{
    id: string;
    title: string;
  }>();
  const [deletingStage, setDeletingStage] = useState<Stage>();

  useEffect(() => {
    if (selectedProjectId) {
      setSelectedId(selectedProjectId);
      setShowArchived(
        Boolean(
          data.projects.find((project) => project.id === selectedProjectId)
            ?.archived,
        ),
      );
    }
  }, [selectedProjectId]);

  const visibleProjects = data.projects.filter(
    (project) => project.archived === showArchived,
  );
  const project =
    visibleProjects.find((item) => item.id === selectedId) ??
    visibleProjects[0];
  const editingProject = data.projects.find((item) => item.id === editingId);
  const tasks = project
    ? data.tasks
        .filter((task) => task.projectId === project.id)
        .sort((a, b) => a.order - b.order)
    : [];
  const stages = project
    ? data.stages
        .filter((stage) => stage.projectId === project.id)
        .sort((a, b) => a.order - b.order)
    : [];
  const unassignedTasks = tasks.filter(
    (task) =>
      !task.stageId || !stages.some((stage) => stage.id === task.stageId),
  );
  const progress = project
    ? projectProgress(project.id, data)
    : { done: 0, total: 0, percent: 0 };
  const blockedTasks = tasks.filter((task) => isBlocked(task, data));
  const currentStage =
    stages.find((stage) =>
      tasks.some((task) => task.stageId === stage.id && task.status !== "done"),
    ) ??
    stages.find((stage) => !tasks.some((task) => task.stageId === stage.id));
  const next = recommendTasks(data, today).find(
    (item) => item.task.projectId === project?.id,
  );
  const projectNoteHref = project?.obsidianUrl
    ? noteHref(project.obsidianUrl.trim())
    : undefined;

  function createProject(event: FormEvent) {
    event.preventDefault();
    if (!newTitle.trim()) return;
    const id = store.addProject({
      title: newTitle.trim(),
      goal: newGoal.trim(),
      color: newColor,
    });
    if (!id) return;
    setSelectedId(id);
    setShowArchived(false);
    setCreating(false);
    setNewTitle("");
    setNewGoal("");
    setNewColor(PROJECT_COLORS[0]);
  }

  function startEditing(item: Project) {
    setEditingId(item.id);
    setEditingTitle(item.title);
    setEditingNote(item.obsidianUrl ?? "");
    setNoteError("");
  }

  function saveProjectTitle() {
    if (!editingProject) return;
    if (editingTitle.trim() && editingTitle.trim() !== editingProject.title)
      store.updateProject(editingProject.id, { title: editingTitle.trim() });
    else setEditingTitle(editingProject.title);
  }

  function saveProjectNote(): boolean {
    if (!editingProject) return true;
    const value = editingNote.trim();
    if (value && !noteHref(value)) {
      setNoteError("请输入完整的 obsidian:// 链接或本地笔记路径。");
      return false;
    }
    setNoteError("");
    if (value !== (editingProject.obsidianUrl ?? ""))
      store.updateProject(editingProject.id, {
        obsidianUrl: value || undefined,
      });
    return true;
  }

  function closeProjectEditor() {
    saveProjectTitle();
    if (saveProjectNote()) setEditingId(undefined);
  }

  function createStage(event: FormEvent) {
    event.preventDefault();
    if (!project || !newStageTitle.trim()) return;
    const id = store.addStage(project.id, newStageTitle.trim());
    if (!id) return;
    setNewStageTitle("");
    setAddingStage(false);
  }

  function saveStage(event: FormEvent) {
    event.preventDefault();
    if (!editingStage?.title.trim()) return;
    store.updateStage(editingStage.id, editingStage.title.trim());
    setEditingStage(undefined);
  }

  function renderTasks(items: Task[], stageId?: string) {
    return (
      <>
        {items.length > 0 ? (
          <div className="task-list">
            {items.map((task) => (
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
          <p className="muted project-empty-line">
            还没有任务，想到下一步时直接记下来。
          </p>
        )}
        <button
          className="btn btn-ghost"
          onClick={() =>
            quickAdd({ projectId: project!.id, stageId, inbox: false })
          }
        >
          <Plus size={15} />
          添加任务
        </button>
      </>
    );
  }

  return (
    <div className="page-stack projects-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">让每一件事，向前一步</div>
          <h1 className="page-title">项目进展</h1>
          <p className="muted">从目标到行动，看清事情正在走到哪里。</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <Plus size={17} />
          新建项目
        </button>
      </div>

      <div className="section-head">
        <div className="segmented" aria-label="项目范围">
          <button
            className={!showArchived ? "active" : ""}
            onClick={() => setShowArchived(false)}
          >
            进行中{" "}
            <span>{data.projects.filter((item) => !item.archived).length}</span>
          </button>
          <button
            className={showArchived ? "active" : ""}
            onClick={() => setShowArchived(true)}
          >
            已归档{" "}
            <span>{data.projects.filter((item) => item.archived).length}</span>
          </button>
        </div>
        <span className="muted small">进度随任务完成自动更新</span>
      </div>

      {visibleProjects.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<FolderKanban size={35} />}
            title={
              showArchived
                ? "这里会保留已归档的项目"
                : "把一件持续的事，放进一个项目"
            }
            description={
              showArchived
                ? "归档后仍可查看任务和进度，也可以随时恢复。"
                : "只需要一个名字。目标、阶段和时间安排，可以以后再补充。"
            }
            action={
              !showArchived ? (
                <button
                  className="btn btn-primary"
                  onClick={() => setCreating(true)}
                >
                  <Plus size={16} />
                  新建第一个项目
                </button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <>
          <div className="project-grid">
            {visibleProjects.map((item) => {
              const itemProgress = projectProgress(item.id, data);
              const itemBlocked = data.tasks.filter(
                (task) => task.projectId === item.id && isBlocked(task, data),
              ).length;
              return (
                <button
                  key={item.id}
                  className={`card project-card ${project?.id === item.id ? "selected" : ""}`}
                  style={{ borderTopColor: item.color }}
                  onClick={() => {
                    setSelectedId(item.id);
                    setAddingStage(false);
                    setEditingStage(undefined);
                  }}
                  aria-pressed={project?.id === item.id}
                >
                  <div className="project-card-heading">
                    <span
                      className="project-color-dot"
                      style={{ background: item.color }}
                    />
                    <strong>{item.title}</strong>
                    {item.archived && <Archive size={15} />}
                  </div>
                  <p className="muted project-goal-preview">
                    {item.goal || "目标可以慢慢想清楚，先迈出一步。"}
                  </p>
                  <ProgressBar value={itemProgress.percent} />
                  <div className="project-card-footer">
                    <span>
                      {itemProgress.done} / {itemProgress.total} 项完成
                    </span>
                    {item.blockedReason?.trim() || itemBlocked > 0 ? (
                      <span className="text-warning">
                        <AlertCircle size={13} />
                        有阻碍
                      </span>
                    ) : (
                      <span>{itemProgress.percent}%</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {project && (
            <>
              <div className="card project-summary">
                <div className="section-head">
                  <div>
                    <div className="eyebrow">
                      {project.archived ? "已归档项目" : "当前项目"}
                    </div>
                    <h2>{project.title}</h2>
                  </div>
                  <div className="inline-actions">
                    <button
                      className="btn btn-ghost"
                      onClick={() => startEditing(project)}
                    >
                      <Pencil size={15} />
                      编辑项目
                    </button>
                    <button
                      className="btn btn-ghost"
                      onClick={() => {
                        store.updateProject(project.id, {
                          archived: !project.archived,
                        });
                        setShowArchived(!project.archived);
                        setSelectedId(project.id);
                      }}
                    >
                      {project.archived ? (
                        <ArchiveRestore size={15} />
                      ) : (
                        <Archive size={15} />
                      )}
                      {project.archived ? "恢复项目" : "归档"}
                    </button>
                  </div>
                </div>
                <p className="project-goal">
                  {project.goal || "还没有填写目标。可以先从下一项任务开始。"}
                </p>
                {project.description && (
                  <p className="muted project-description">
                    {project.description}
                  </p>
                )}
                <div className="project-progress-summary">
                  <ProgressBar value={progress.percent} />
                  <strong>{progress.percent}%</strong>
                  <span className="muted">
                    已完成 {progress.done} / {progress.total} 项任务
                  </span>
                </div>
                <div className="project-meta-row">
                  <span className="badge">
                    <Layers size={13} />
                    {stages.length
                      ? currentStage
                        ? `当前阶段：${currentStage.title}`
                        : "阶段任务已完成"
                      : "按任务逐步推进"}
                  </span>
                  {projectNoteHref && (
                    <a
                      className="btn btn-ghost"
                      href={projectNoteHref}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink size={14} />
                      打开关联笔记
                    </a>
                  )}
                </div>
              </div>

              <div className="project-detail-grid">
                <section className="card project-stages">
                  <SectionHeader
                    title={stages.length ? "阶段与任务" : "项目任务"}
                    subtitle={
                      stages.length
                        ? "阶段帮助你看清路径，也可以随时调整。"
                        : "先把下一步写下来，需要时再划分阶段。"
                    }
                    action={
                      <button
                        className="btn btn-ghost"
                        onClick={() => setAddingStage(true)}
                      >
                        <Plus size={15} />
                        添加阶段
                      </button>
                    }
                  />
                  {addingStage && (
                    <form
                      className="inline-form stage-create-form"
                      onSubmit={createStage}
                    >
                      <input
                        className="field"
                        placeholder="阶段名称，例如：分析与验证"
                        aria-label="新阶段名称"
                        value={newStageTitle}
                        onChange={(event) =>
                          setNewStageTitle(event.target.value)
                        }
                        autoFocus
                        maxLength={500}
                      />
                      <button
                        className="btn btn-primary"
                        type="submit"
                        disabled={!newStageTitle.trim()}
                      >
                        添加
                      </button>
                      <button
                        className="btn btn-ghost icon-button"
                        type="button"
                        aria-label="取消添加阶段"
                        onClick={() => {
                          setAddingStage(false);
                          setNewStageTitle("");
                        }}
                      >
                        <X size={16} />
                      </button>
                    </form>
                  )}
                  {stages.map((stage, index) => {
                    const stageTasks = tasks.filter(
                      (task) => task.stageId === stage.id,
                    );
                    const stageDone = stageTasks.filter(
                      (task) => task.status === "done",
                    ).length;
                    const stageComplete =
                      stageTasks.length > 0 && stageDone === stageTasks.length;
                    return (
                      <div
                        key={stage.id}
                        className={`stage-row ${stageComplete ? "complete" : ""}`}
                      >
                        <div className="stage-number">
                          {stageComplete ? <Check size={17} /> : index + 1}
                        </div>
                        <div className="stage-body">
                          {editingStage?.id === stage.id ? (
                            <form className="inline-form" onSubmit={saveStage}>
                              <input
                                className="field"
                                value={editingStage.title}
                                onChange={(event) =>
                                  setEditingStage({
                                    id: stage.id,
                                    title: event.target.value,
                                  })
                                }
                                aria-label="编辑阶段名称"
                                autoFocus
                                maxLength={500}
                              />
                              <button
                                className="btn btn-ghost icon-button"
                                title="保存阶段名称"
                                aria-label="保存阶段名称"
                                disabled={!editingStage.title.trim()}
                              >
                                <Check size={16} />
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost icon-button"
                                aria-label="取消编辑阶段"
                                onClick={() => setEditingStage(undefined)}
                              >
                                <X size={16} />
                              </button>
                            </form>
                          ) : (
                            <div className="stage-heading">
                              <div>
                                <strong>{stage.title}</strong>
                                <span className="muted small">
                                  {stageDone} / {stageTasks.length} 完成
                                </span>
                              </div>
                              <div className="inline-actions">
                                <button
                                  className="btn btn-ghost icon-button"
                                  title="编辑阶段"
                                  aria-label={`编辑阶段：${stage.title}`}
                                  onClick={() =>
                                    setEditingStage({
                                      id: stage.id,
                                      title: stage.title,
                                    })
                                  }
                                >
                                  <Pencil size={14} />
                                </button>
                                <button
                                  className="btn btn-ghost icon-button"
                                  title="删除阶段，保留任务"
                                  aria-label={`删除阶段：${stage.title}`}
                                  onClick={() => setDeletingStage(stage)}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          )}
                          {renderTasks(stageTasks, stage.id)}
                        </div>
                      </div>
                    );
                  })}
                  {(unassignedTasks.length > 0 || stages.length === 0) && (
                    <div className={stages.length ? "unassigned-tasks" : ""}>
                      {stages.length > 0 && <h3>未分阶段</h3>}
                      {renderTasks(unassignedTasks)}
                    </div>
                  )}
                  {stages.length > 0 && unassignedTasks.length === 0 && (
                    <button
                      className="btn btn-ghost project-unassigned-add"
                      onClick={() =>
                        quickAdd({ projectId: project.id, inbox: false })
                      }
                    >
                      <Plus size={15} />
                      添加未分阶段的任务
                    </button>
                  )}
                </section>

                <aside className="page-stack project-side">
                  <section className="card next-action-card">
                    <SectionHeader title="下一步行动" />
                    {next ? (
                      <>
                        <button
                          className="project-next-task"
                          onClick={() => openTask(next.task.id)}
                        >
                          <strong>{next.task.title}</strong>
                          <ArrowRight size={17} />
                        </button>
                        <p className="muted small">{next.reason}</p>
                        <button
                          className="btn btn-primary"
                          onClick={() => {
                            store.updateTask(next.task.id, {
                              plannedDate: today,
                              inbox: false,
                            });
                            openTask(next.task.id);
                          }}
                        >
                          安排到今天
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="muted">
                          {progress.total > 0 &&
                          progress.done === progress.total
                            ? "已完成所有任务，给这段进展一个肯定。"
                            : project.archived
                              ? "项目已归档，恢复后可继续安排任务。"
                              : blockedTasks.length
                                ? "先处理下方的阻碍，再继续推进。"
                                : tasks.some((task) => task.status === "paused")
                                  ? "任务已暂停，可以在详情中恢复。"
                                  : "写下一个可以开始的小行动。"}
                        </p>
                        {!project.archived && (
                          <button
                            className="btn btn-ghost"
                            onClick={() =>
                              quickAdd({ projectId: project.id, inbox: false })
                            }
                          >
                            <Plus size={15} />
                            添加下一步
                          </button>
                        )}
                      </>
                    )}
                  </section>
                  <section className="card project-blockers">
                    <SectionHeader
                      title="当前阻碍"
                      action={
                        <button
                          className="btn btn-ghost icon-button"
                          title="编辑项目阻碍"
                          aria-label="编辑项目阻碍"
                          onClick={() => startEditing(project)}
                        >
                          <Pencil size={15} />
                        </button>
                      }
                    />
                    {project.blockedReason?.trim() && (
                      <div className="blocker-note">
                        <AlertCircle size={17} />
                        <p>{project.blockedReason}</p>
                      </div>
                    )}
                    {blockedTasks
                      .filter(
                        (task) =>
                          task.blockedReason?.trim() ||
                          task.dependsOn?.some(
                            (id) =>
                              data.tasks.find((other) => other.id === id)
                                ?.status !== "done",
                          ),
                      )
                      .map((task) => (
                        <button
                          className="project-blocked-task"
                          key={task.id}
                          onClick={() => openTask(task.id)}
                        >
                          <strong>{task.title}</strong>
                          <span className="muted small">
                            {task.blockedReason?.trim() ||
                              "正在等待前置任务完成"}
                          </span>
                        </button>
                      ))}
                    {!project.blockedReason?.trim() &&
                      blockedTasks.length === 0 && (
                        <p className="muted">
                          目前没有记录阻碍。遇到卡点时，把它写下来。
                        </p>
                      )}
                  </section>
                </aside>
              </div>
            </>
          )}
        </>
      )}

      {creating && (
        <Modal title="新建项目" onClose={() => setCreating(false)}>
          <form className="page-stack" onSubmit={createProject}>
            <label className="form-label">
              项目名称
              <input
                className="field"
                value={newTitle}
                onChange={(event) => setNewTitle(event.target.value)}
                autoFocus
                placeholder="一件想持续推进的事"
                maxLength={500}
                required
              />
            </label>
            <label className="form-label">
              想达成什么 <span className="muted">（可选）</span>
              <textarea
                className="field"
                rows={3}
                value={newGoal}
                onChange={(event) => setNewGoal(event.target.value)}
                maxLength={100000}
                placeholder="用一句话描述目标，也可以以后再填"
              />
            </label>
            <div className="form-label">
              项目颜色
              <div className="color-options">
                {PROJECT_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`color-option ${newColor === color ? "selected" : ""}`}
                    style={{ background: color }}
                    onClick={() => setNewColor(color)}
                    aria-label={`选择颜色 ${color}`}
                    aria-pressed={newColor === color}
                  >
                    {newColor === color && <Check size={17} />}
                  </button>
                ))}
              </div>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setCreating(false)}
              >
                取消
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!newTitle.trim()}
              >
                创建项目
              </button>
            </div>
          </form>
        </Modal>
      )}

      {editingProject && (
        <Modal title="编辑项目" onClose={closeProjectEditor}>
          <div className="page-stack">
            <p className="muted small">
              更改会自动保存，名称与笔记关联在离开输入框后保存。
            </p>
            <label className="form-label">
              项目名称
              <input
                className="field"
                value={editingTitle}
                onChange={(event) => setEditingTitle(event.target.value)}
                onBlur={saveProjectTitle}
                maxLength={500}
              />
            </label>
            <label className="form-label">
              项目目标
              <textarea
                className="field"
                rows={2}
                value={editingProject.goal}
                onChange={(event) =>
                  store.updateProject(editingProject.id, {
                    goal: event.target.value,
                  })
                }
                maxLength={100000}
                placeholder="想达成什么？"
              />
            </label>
            <label className="form-label">
              说明
              <textarea
                className="field"
                rows={3}
                value={editingProject.description}
                onChange={(event) =>
                  store.updateProject(editingProject.id, {
                    description: event.target.value,
                  })
                }
                maxLength={100000}
                placeholder="保留必要背景，详细过程仍可记录在 Obsidian"
              />
            </label>
            <label className="form-label">
              当前阻碍
              <textarea
                className="field"
                rows={2}
                value={editingProject.blockedReason ?? ""}
                onChange={(event) =>
                  store.updateProject(editingProject.id, {
                    blockedReason: event.target.value,
                  })
                }
                maxLength={10000}
                placeholder="等待什么？哪里卡住了？解决后清空即可"
              />
            </label>
            <details>
              <summary>笔记关联与颜色</summary>
              <div className="page-stack advanced-fields">
                <label className="form-label">
                  Obsidian 链接或笔记路径
                  <input
                    className="field"
                    value={editingNote}
                    onChange={(event) => {
                      setEditingNote(event.target.value);
                      setNoteError("");
                    }}
                    onBlur={saveProjectNote}
                    maxLength={4096}
                    aria-invalid={!!noteError}
                    aria-describedby={
                      noteError ? "project-note-error" : undefined
                    }
                    placeholder="obsidian://open?... 或完整笔记路径"
                  />
                  {noteError && (
                    <span
                      id="project-note-error"
                      className="text-warning small"
                      role="alert"
                    >
                      {noteError}
                    </span>
                  )}
                </label>
                <label className="form-label">
                  项目颜色
                  <input
                    type="color"
                    className="project-color-input"
                    value={editingProject.color}
                    onChange={(event) =>
                      store.updateProject(editingProject.id, {
                        color: event.target.value,
                      })
                    }
                  />
                </label>
              </div>
            </details>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={closeProjectEditor}>
                完成
              </button>
            </div>
          </div>
        </Modal>
      )}

      {deletingStage && (
        <Modal
          title="删除这个阶段？"
          onClose={() => setDeletingStage(undefined)}
        >
          <p>
            删除“{deletingStage.title}”后，其中的任务会保留，并移到“未分阶段”。
          </p>
          <div className="modal-actions">
            <button
              className="btn btn-ghost"
              onClick={() => setDeletingStage(undefined)}
            >
              取消
            </button>
            <button
              className="btn btn-danger"
              onClick={() => {
                store.deleteStage(deletingStage.id);
                setDeletingStage(undefined);
              }}
            >
              删除阶段
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
