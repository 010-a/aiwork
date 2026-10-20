import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  Home as HomeIcon,
  Inbox as InboxIcon,
  CalendarCheck,
  FolderOpen,
  CalendarDays,
  ChartNoAxesCombined,
  Search,
  Plus,
  Sprout,
  Database,
  Download,
  Upload,
  ShieldCheck,
  X,
  ArrowRight,
  Command,
  CircleAlert,
  Check,
  LoaderCircle,
  Palette,
  Moon,
  Sun,
  CornerDownLeft,
  ShieldAlert,
  Undo2,
  BookmarkPlus,
} from "lucide-react";
import type { Page, Task, ViewProps } from "./types";
import { useAppStore, exportBackup, parseBackup } from "./store";
import { todayKey } from "./dates";
import { getTodayTasks } from "./selectors";
import { Home, Inbox, Today } from "./pages/Core";
import Projects from "./pages/Projects";
import Calendar from "./pages/Calendar";
import Review from "./pages/Review";
import TaskDetail from "./components/TaskDetail";
import { Modal, EmptyState } from "./components/ui";
import AppearanceSettings from "./components/AppearanceSettings";
import { useAppearance } from "./appearance";
import { AlertRulesSettings } from "./components/Monitoring";
import { getAlerts } from "./alerts";
import { TemplateLibrary } from "./components/RoutineSettings";
import LocalDataTools from "./components/LocalDataTools";

const navigation = [
  { id: "home", label: "任务导航", icon: HomeIcon },
  { id: "inbox", label: "收集箱", icon: InboxIcon },
  { id: "today", label: "今日执行", icon: CalendarCheck },
  { id: "projects", label: "我的项目", icon: FolderOpen },
  { id: "calendar", label: "日历安排", icon: CalendarDays },
  { id: "review", label: "每周回顾", icon: ChartNoAxesCombined },
] as const;
function download(text: string, name: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function App() {
  const store = useAppStore();
  const appearance = useAppearance();
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [undoVisible, setUndoVisible] = useState(false);
  const scrollPositions = useRef<Record<string, number>>({});
  const pageRef = useRef<Page>("home");
  const undoRef = useRef(store.undo);
  undoRef.current = store.undo;
  const [searchIndex, setSearchIndex] = useState(0);
  const [page, setPage] = useState<Page>("home"),
    [projectId, setProjectId] = useState<string>(),
    [detailId, setDetailId] = useState<string>(),
    [addPatch, setAddPatch] = useState<Partial<Task> | null>(null),
    [addTitle, setAddTitle] = useState(""),
    [search, setSearch] = useState(""),
    [backup, setBackup] = useState(false),
    [notice, setNotice] = useState(""),
    [today, setToday] = useState(todayKey);
  const searchRef = useRef<HTMLInputElement>(null),
    importRef = useRef<HTMLInputElement>(null);
  const searchResultsRef = useRef<HTMLDivElement>(null);
  const quickInputRef = useRef<HTMLInputElement>(null);
  const composingRef = useRef(false);
  const closeDetail = useCallback(() => setDetailId(undefined), []),
    closeAdd = useCallback(() => setAddPatch(null), []),
    closeBackup = useCallback(() => setBackup(false), []);
  const closeAppearance = useCallback(() => setAppearanceOpen(false), []);
  const closeRules = useCallback(() => setRulesOpen(false), []);
  const openAlertRules = useCallback(() => {
    setSearch("");
    setRulesOpen(true);
  }, []);
  const navigate = useCallback((p: Page, id?: string) => {
    scrollPositions.current[pageRef.current] = window.scrollY;
    pageRef.current = p;
    setPage(p);
    setProjectId(id);
    setSearch("");
  }, []);
  useLayoutEffect(() => {
    if (store.loaded)
      window.scrollTo({
        top: scrollPositions.current[page] ?? 0,
        behavior: "instant",
      });
  }, [page, store.loaded]);
  const quickAdd = useCallback((patch: Partial<Task> = {}) => {
    composingRef.current = false;
    setSearch("");
    setAddTitle("");
    setAddPatch(patch);
  }, []);
  const openTask = useCallback((id: string) => {
    setDetailId(id);
    setSearch("");
  }, []);
  useEffect(() => {
    const t = setInterval(() => setToday(todayKey()), 30000);
    const key = (e: KeyboardEvent) => {
      const editable = (e.target as HTMLElement)?.closest(
        "input,textarea,[contenteditable=true]",
      );
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === "z" &&
        !e.shiftKey &&
        !editable
      ) {
        e.preventDefault();
        undoRef.current();
        return;
      }
      if (document.querySelector('[role="dialog"]')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        quickAdd();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      clearInterval(t);
      document.removeEventListener("keydown", key);
    };
  }, [quickAdd]);
  useEffect(() => {
    if (!search.trim()) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !searchRef.current?.parentElement?.contains(target) &&
        !searchResultsRef.current?.contains(target)
      )
        setSearch("");
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [search]);
  useEffect(() => {
    setUndoVisible(Boolean(store.undoLabel));
    const timeout = setTimeout(() => setUndoVisible(false), 6000);
    return () => clearTimeout(timeout);
  }, [store.data, store.undoLabel]);
  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => setNotice(""), 4500);
      return () => clearTimeout(t);
    }
  }, [notice]);
  useEffect(() => {
    if (detailId && !store.data.tasks.some((t) => t.id === detailId))
      setDetailId(undefined);
  }, [store.data.tasks, detailId]);
  const props: ViewProps = {
    store,
    today,
    openTask,
    quickAdd,
    navigate,
    openAlertRules,
  };
  const alertCount = new Set(
    getAlerts(store.data, today).map(
      (alert) => `${alert.target.type}:${alert.target.id}`,
    ),
  ).size;
  const inboxCount = store.data.tasks.filter(
    (t) => t.inbox && t.status !== "done",
  ).length;
  const todayCount = getTodayTasks(store.data, today).filter(
    (t) => t.status !== "done",
  ).length;
  const demoCount =
    store.data.tasks.filter((t) => t.demo).length +
    store.data.projects.filter((p) => p.demo).length +
    store.data.events.filter((e) => e.demo).length;
  const matches = search.trim()
    ? store.data.tasks.filter((t) =>
        (t.title + " " + t.notes)
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
      )
    : [];
  const matchedProjects = search.trim()
    ? store.data.projects.filter((p) =>
        (p.title + " " + p.goal)
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
      )
    : [];
  const searchEntries = [
    ...matchedProjects.map((project) => ({
      id: project.id,
      kind: "project" as const,
      title: project.title,
      subtitle: project.archived ? "已归档项目" : "项目",
    })),
    ...matches.map((task) => ({
      id: task.id,
      kind: "task" as const,
      title: task.title,
      subtitle:
        task.status === "done"
          ? "已完成"
          : task.inbox
            ? "收集箱"
            : store.data.projects.find(
                (project) => project.id === task.projectId,
              )?.title || "独立任务",
    })),
  ];
  const selectSearchEntry = (index: number) => {
    const entry = searchEntries[index];
    if (!entry) return;
    if (entry.kind === "project") navigate("projects", entry.id);
    else openTask(entry.id);
  };
  const add = (keepAdding = false) => {
    if (!addTitle.trim()) return;
    const id = store.addTask(addTitle.trim(), addPatch || {});
    if (!id) return;
    setNotice(keepAdding ? "已记下，继续添加下一件" : "已记下这件事");
    if (keepAdding) {
      setAddTitle("");
      quickInputRef.current?.focus();
    } else {
      setAddPatch(null);
      if (addPatch?.projectId) setDetailId(id);
    }
  };
  const importData = async (file: File) => {
    try {
      if (file.size > 20 * 1024 * 1024) throw Error("备份文件不能超过 20 MB");
      const parsed = parseBackup(await file.text());
      if (
        !confirm(
          `此备份包含 ${parsed.tasks.length} 个任务、${parsed.projects.length} 个项目。${store.loaded ? "导入会替换当前全部数据，并先下载当前数据的安全快照。" : "当前数据未能读取，无法生成安全快照。导入将用此备份覆盖本地存储。"}继续导入？`,
        )
      )
        return;
      if (store.loaded)
        download(exportBackup(store.data), `知行办-导入前快照-${today}.json`);
      store.replaceData(parsed);
      setNotice("备份已导入，六个页面已同步");
      setBackup(false);
    } catch (e) {
      setNotice(`导入失败：${e instanceof Error ? e.message : "文件不合法"}`);
    }
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("home");
          }}
        >
          <span className="brand-mark">
            <Sprout size={29} />
          </span>
          <div>
            <strong>知行办</strong>
            <small>让重要的事，有序发生</small>
          </div>
        </a>
        <div className="sidebar-label">我的工作空间</div>
        <nav aria-label="主要页面">
          {navigation.map((n) => (
            <button
              key={n.id}
              className={`nav-item ${page === n.id ? "active" : ""}`}
              aria-current={page === n.id ? "page" : undefined}
              onClick={() => navigate(n.id)}
            >
              <n.icon size={21} />
              <span>{n.label}</span>
              {n.id === "inbox" && !!inboxCount && <small>{inboxCount}</small>}
              {n.id === "today" && !!todayCount && <small>{todayCount}</small>}
            </button>
          ))}
        </nav>
        <button className="sidebar-add btn" onClick={() => quickAdd()}>
          <Plus size={18} />
          随手记一件事 <kbd>⌃ J</kbd>
        </button>
        <div className="sidebar-bottom">
          <div className="sidebar-quote">
            <div className="tiny-landscape">
              <span />
              <Sprout size={37} />
            </div>
            <p>
              专注当下，
              <br />
              一步一步，向前生长。
            </p>
          </div>
          <button
            className="backup-nav appearance-nav"
            aria-label="外观与体验"
            title="外观与体验"
            onClick={() => {
              setSearch("");
              setAppearanceOpen(true);
            }}
          >
            <Palette size={17} />
            <span>外观与体验</span>
            <small>
              {appearance.preferences.mode === "system"
                ? "自动"
                : appearance.resolvedTheme === "dark"
                  ? "深色"
                  : "浅色"}
            </small>
          </button>
          <button className="backup-nav" onClick={() => setTemplatesOpen(true)}>
            <BookmarkPlus size={17} />
            <span>常用模板</span>
          </button>
          <button className="backup-nav" onClick={() => setBackup(true)}>
            <Database size={17} />
            <span>数据与备份</span>
            <ShieldCheck size={15} />
          </button>
          <button
            className="backup-nav monitor-rules-nav"
            aria-label="预警原则"
            onClick={openAlertRules}
          >
            <ShieldAlert size={17} />
            <span>预警原则</span>
            {alertCount > 0 && <small>{alertCount}</small>}
          </button>
          <div
            className={`save-status ${store.saveState === "error" ? "save-error" : ""}`}
          >
            {store.saveState === "saving" ? <LoaderCircle size={11} /> : <i />}
            {store.saveState === "error"
              ? "保存异常，请立即导出"
              : store.saveState === "saving"
                ? "正在本地保存…"
                : store.storageMode === "service"
                  ? "已保存到本机文件"
                  : "已保存到本机浏览器"}
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="search-wrap">
            <Search size={18} />
            <input
              ref={searchRef}
              aria-label="搜索任务和项目"
              placeholder="搜索任务、项目或记录…"
              value={search}
              aria-controls={
                search.trim() ? "global-search-results" : undefined
              }
              aria-activedescendant={
                search.trim() && searchEntries.length
                  ? `search-entry-${Math.min(searchIndex, searchEntries.length - 1)}`
                  : undefined
              }
              autoComplete="off"
              onChange={(e) => {
                setSearch(e.target.value);
                setSearchIndex(0);
              }}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === "Escape") setSearch("");
                if (
                  (e.key === "ArrowDown" || e.key === "ArrowUp") &&
                  searchEntries.length
                ) {
                  e.preventDefault();
                  setSearchIndex(
                    (index) =>
                      (index +
                        (e.key === "ArrowDown" ? 1 : -1) +
                        searchEntries.length) %
                      searchEntries.length,
                  );
                }
                if (
                  e.key === "Enter" &&
                  search.trim() &&
                  searchEntries.length
                ) {
                  e.preventDefault();
                  selectSearchEntry(
                    Math.min(searchIndex, searchEntries.length - 1),
                  );
                }
              }}
            />
            {search ? (
              <button
                className="icon-btn"
                onClick={() => setSearch("")}
                aria-label="清除搜索"
              >
                <X size={15} />
              </button>
            ) : (
              <kbd>
                <Command size={11} /> K
              </kbd>
            )}
          </div>
          <div className="topbar-right">
            <button
              className="icon-btn"
              aria-label="撤销上一步"
              title={
                store.undoLabel
                  ? `撤销${store.undoLabel} · Ctrl+Z`
                  : "暂无可撤销操作"
              }
              disabled={!store.undoLabel}
              onClick={store.undo}
            >
              <Undo2 size={18} />
            </button>
            <button
              className="icon-btn theme-toggle"
              aria-label={
                appearance.resolvedTheme === "dark"
                  ? "切换到浅色模式"
                  : "切换到深色模式"
              }
              title={
                appearance.resolvedTheme === "dark"
                  ? "切换到浅色模式"
                  : "切换到深色模式"
              }
              onClick={() =>
                appearance.updatePreferences({
                  mode: appearance.resolvedTheme === "dark" ? "light" : "dark",
                })
              }
            >
              {appearance.resolvedTheme === "dark" ? (
                <Sun size={18} />
              ) : (
                <Moon size={18} />
              )}
            </button>
            <span className="local-badge">
              <span />
              本地工作空间
            </span>
            <span className="topbar-date">
              {new Intl.DateTimeFormat("zh-CN", {
                month: "long",
                day: "numeric",
                weekday: "short",
              }).format(new Date(today + "T12:00:00"))}
            </span>
            <button
              className="btn btn-primary btn-small"
              onClick={() => quickAdd()}
            >
              <Plus size={16} />
              新建任务
            </button>
          </div>
        </header>
        <main className="main-content">
          {store.storageWarning && (
            <div className="error-banner">{store.storageWarning}</div>
          )}
          {store.error && (
            <div className="error-banner">
              <CircleAlert size={18} />
              {store.error}
              <button className="btn btn-small" onClick={() => setBackup(true)}>
                导出备份
              </button>
            </div>
          )}
          {!store.loaded ? (
            <div className="loading-state">
              <LoaderCircle className="spin" />
              正在打开本地工作空间…
            </div>
          ) : (
            <>
              {!!demoCount && (
                <div className="demo-banner">
                  <span>
                    演示工作空间 · 示例仅用于体验，可与自己的任务并存。
                  </span>
                  <button
                    onClick={() => {
                      if (
                        confirm(
                          "仅清除演示任务、项目和日程？你自己的内容会保留。",
                        )
                      ) {
                        store.clearDemo();
                        setNotice("已清除演示数据");
                      }
                    }}
                  >
                    清除演示数据 <X size={13} />
                  </button>
                </div>
              )}
              <div className="page-view" key={page}>
                {page === "home" ? (
                  <Home {...props} />
                ) : page === "inbox" ? (
                  <Inbox {...props} />
                ) : page === "today" ? (
                  <Today {...props} />
                ) : page === "projects" ? (
                  <Projects {...props} selectedProjectId={projectId} />
                ) : page === "calendar" ? (
                  <Calendar {...props} />
                ) : (
                  <Review {...props} />
                )}
              </div>
              <footer className="page-footer">
                <Sprout size={13} />
                知行办 <span>·</span> 复杂的事，清楚地做。
              </footer>
            </>
          )}
        </main>
      </div>
      {search.trim() && (
        <div className="search-results card" ref={searchResultsRef}>
          <div className="search-result-head">
            搜索结果 <span>{searchEntries.length} 项 · ↑↓ 选择，回车打开</span>
          </div>
          {!matches.length && !matchedProjects.length ? (
            <EmptyState
              title="没有找到相关内容"
              description="换一个关键词，或直接新建任务。"
            />
          ) : (
            <div
              role="listbox"
              aria-label="搜索结果"
              id="global-search-results"
            >
              {searchEntries.map((entry, index) => (
                <button
                  id={`search-entry-${index}`}
                  role="option"
                  aria-selected={index === searchIndex}
                  className={`search-result-item ${index === searchIndex ? "selected" : ""}`}
                  key={`${entry.kind}-${entry.id}`}
                  onMouseEnter={() => setSearchIndex(index)}
                  onClick={() => selectSearchEntry(index)}
                >
                  {entry.kind === "project" ? (
                    <FolderOpen size={18} />
                  ) : (
                    <Check size={18} />
                  )}
                  <span>
                    <strong>{entry.title}</strong>
                    <small>{entry.subtitle}</small>
                  </span>
                  <CornerDownLeft size={15} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {templatesOpen && (
        <TemplateLibrary
          store={store}
          onClose={() => setTemplatesOpen(false)}
          onUse={(template) => {
            setTemplatesOpen(false);
            quickAdd({
              notes: template.notes,
              projectId: template.projectId,
              stageId: template.stageId,
              estimatedMinutes: template.estimatedMinutes,
              inbox: template.projectId ? false : true,
            });
            setAddTitle(template.title);
          }}
        />
      )}
      {rulesOpen && <AlertRulesSettings store={store} onClose={closeRules} />}
      {detailId && (
        <TaskDetail
          id={detailId}
          store={store}
          today={today}
          onClose={closeDetail}
        />
      )}
      {addPatch && (
        <Modal title="记下一件事" onClose={closeAdd}>
          <p className="muted">只写一句话就够了，其他的稍后再说。</p>
          {!!store.data.templates?.length && (
            <label className="quick-template-label">
              使用常用模板
              <select
                className="field"
                aria-label="快速添加模板"
                defaultValue=""
                onChange={(e) => {
                  const template = store.data.templates?.find(
                    (t) => t.id === e.target.value,
                  );
                  if (template) {
                    setAddTitle(template.title);
                    setAddPatch((patch) => ({
                      ...patch,
                      notes: template.notes,
                      projectId: template.projectId,
                      stageId: template.stageId,
                      estimatedMinutes: template.estimatedMinutes,
                      inbox: template.projectId
                        ? false
                        : (patch?.inbox ?? true),
                    }));
                  }
                }}
              >
                <option value="">不使用模板</option>
                {store.data.templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!composingRef.current) add();
            }}
          >
            <input
              className="field quick-add-input"
              ref={quickInputRef}
              aria-label="新任务标题"
              maxLength={500}
              placeholder="例如：测试 Spotiflow 分割效果"
              autoFocus
              value={addTitle}
              onChange={(e) => setAddTitle(e.target.value)}
              onCompositionStart={() => {
                composingRef.current = true;
              }}
              onCompositionEnd={() => {
                composingRef.current = false;
              }}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  add(true);
                }
              }}
            />
            <div className="quick-add-options">
              <button
                type="button"
                className={`schedule-chip ${addPatch.plannedDate === today ? "selected" : ""}`}
                aria-pressed={addPatch.plannedDate === today}
                onClick={() =>
                  setAddPatch(
                    (patch) =>
                      patch && {
                        ...patch,
                        plannedDate:
                          patch.plannedDate === today ? undefined : today,
                        inbox: patch.projectId
                          ? false
                          : patch.plannedDate === today,
                      },
                  )
                }
              >
                <CalendarDays size={14} />
                安排今天{addPatch.plannedDate === today && <Check size={12} />}
              </button>
              <span>回车保存 · Shift + 回车连续记录</span>
            </div>
            {addPatch.plannedDate && (
              <p className="muted">计划日期：{addPatch.plannedDate}</p>
            )}
            <div className="modal-actions">
              <span className="muted">
                {addPatch.projectId
                  ? "将归入当前项目"
                  : addPatch.plannedDate
                    ? "将出现在今日 / 日历中"
                    : "默认放进收集箱，无需分类"}
              </span>
              <button
                className="btn btn-ghost"
                disabled={!addTitle.trim()}
                type="button"
                onClick={() => add(true)}
              >
                保存并继续
              </button>
              <button
                className="btn btn-primary"
                disabled={!addTitle.trim()}
                type="submit"
              >
                保存任务 <Check size={16} />
              </button>
            </div>
          </form>
        </Modal>
      )}
      {appearanceOpen && (
        <AppearanceSettings {...appearance} onClose={closeAppearance} />
      )}
      {backup && (
        <Modal title="数据与备份" onClose={closeBackup}>
          <div className="backup-intro">
            <ShieldCheck size={28} />
            <div>
              <h3>你的事情，只留在你的电脑</h3>
              <p className="muted">
                {store.storageMode === "service"
                  ? "任务与 Agent 共享本机文件，自动保存并保留安全快照。"
                  : "当前为浏览器模式。使用新版启动脚本可迁移至本地文件；原数据保留。"}
              </p>
            </div>
          </div>
          <div className="backup-counts">
            <span>
              <strong>{store.data.tasks.length}</strong>任务
            </span>
            <span>
              <strong>{store.data.projects.length}</strong>项目
            </span>
            <span>
              <strong>{store.data.events.length}</strong>日程
            </span>
          </div>
          <div className="backup-actions">
            <button
              className="backup-option"
              onClick={() => {
                download(exportBackup(store.data), `知行办-备份-${today}.json`);
                setNotice("JSON 备份已下载");
              }}
            >
              <Download size={21} />
              <div>
                <strong>导出完整备份</strong>
                <small>任务、项目、阶段、日程和回顾笔记</small>
              </div>
              <ArrowRight size={16} />
            </button>
            <button
              className="backup-option"
              onClick={() => importRef.current?.click()}
            >
              <Upload size={21} />
              <div>
                <strong>从 JSON 恢复</strong>
                <small>先校验文件，确认后替换当前数据</small>
              </div>
              <ArrowRight size={16} />
            </button>
            <input
              ref={importRef}
              aria-label="导入 JSON 备份"
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importData(f);
                e.target.value = "";
              }}
            />
          </div>
          <LocalDataTools store={store} download={download} />
          <div className="backup-demo">
            <div>
              <strong>先体验一下</strong>
              <p className="muted">
                载入少量明确标记的演示数据，随时单独清除。
              </p>
            </div>
            <button
              className="btn"
              onClick={() => {
                store.loadDemo();
                setBackup(false);
                setNotice("已载入演示数据");
              }}
              disabled={!!demoCount}
            >
              载入演示
            </button>
          </div>
          <p className="backup-footnote">
            固定使用 http://127.0.0.1:5173
            。首次升级请用原浏览器打开以迁移旧数据。应用不连接任何云服务。
          </p>
        </Modal>
      )}
      {(notice ||
        (undoVisible &&
          store.undoLabel &&
          !detailId &&
          !backup &&
          !rulesOpen &&
          !templatesOpen &&
          !appearanceOpen &&
          !addPatch)) && (
        <div className="toast" role="status" key={notice}>
          <Check size={17} />
          {notice || "刚才的操作可以撤销"}
          {undoVisible && store.undoLabel && (
            <button
              className="toast-undo"
              disabled={store.saveState === "error"}
              onClick={() => {
                store.undo();
                setNotice("已撤销");
              }}
            >
              撤销
            </button>
          )}
        </div>
      )}
    </div>
  );
}
