import { useCallback, useEffect, useRef, useState } from "react";
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
import { Modal, TaskRow, EmptyState } from "./components/ui";

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
  const closeDetail = useCallback(() => setDetailId(undefined), []),
    closeAdd = useCallback(() => setAddPatch(null), []),
    closeBackup = useCallback(() => setBackup(false), []);
  const navigate = useCallback((p: Page, id?: string) => {
    setPage(p);
    setProjectId(id);
    setSearch("");
    window.scrollTo(0, 0);
  }, []);
  const quickAdd = useCallback((patch: Partial<Task> = {}) => {
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
    if (notice) {
      const t = setTimeout(() => setNotice(""), 4500);
      return () => clearTimeout(t);
    }
  }, [notice]);
  useEffect(() => {
    if (detailId && !store.data.tasks.some((t) => t.id === detailId))
      setDetailId(undefined);
  }, [store.data.tasks, detailId]);
  const props: ViewProps = { store, today, openTask, quickAdd, navigate };
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
  const add = () => {
    if (!addTitle.trim()) return;
    const id = store.addTask(addTitle.trim(), addPatch || {});
    if (!id) return;
    setAddPatch(null);
    setNotice("已记下这件事");
    if (addPatch?.projectId) setDetailId(id);
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
          <button className="backup-nav" onClick={() => setBackup(true)}>
            <Database size={17} />
            <span>数据与备份</span>
            <ShieldCheck size={15} />
          </button>
          <div
            className={`save-status ${store.saveState === "error" ? "save-error" : ""}`}
          >
            {store.saveState === "saving" ? <LoaderCircle size={11} /> : <i />}
            {store.saveState === "error"
              ? "保存异常，请立即导出"
              : store.saveState === "saving"
                ? "正在本地保存…"
                : "数据仅保存在本机"}
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
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setSearch("");
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
              <footer className="page-footer">
                <Sprout size={13} />
                知行办 <span>·</span> 复杂的事，清楚地做。
              </footer>
            </>
          )}
        </main>
      </div>
      {search.trim() && (
        <div className="search-results card">
          <div className="search-result-head">
            搜索结果 <span>{matches.length + matchedProjects.length} 项</span>
          </div>
          {!matches.length && !matchedProjects.length ? (
            <EmptyState
              title="没有找到相关内容"
              description="换一个关键词，或直接新建任务。"
            />
          ) : (
            <>
              {matchedProjects.map((p) => (
                <button
                  className="project-search-item"
                  key={p.id}
                  onClick={() => navigate("projects", p.id)}
                >
                  <FolderOpen size={18} />
                  <strong>{p.title}</strong>
                  <span>{p.archived ? "已归档" : "项目"}</span>
                  <ArrowRight size={15} />
                </button>
              ))}
              {matches.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  store={store}
                  openTask={openTask}
                  compact
                />
              ))}
            </>
          )}
        </div>
      )}
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
          <form
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <input
              className="field quick-add-input"
              aria-label="新任务标题"
              maxLength={500}
              placeholder="例如：测试 Spotiflow 分割效果"
              autoFocus
              value={addTitle}
              onChange={(e) => setAddTitle(e.target.value)}
            />
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
      {backup && (
        <Modal title="数据与备份" onClose={closeBackup}>
          <div className="backup-intro">
            <ShieldCheck size={28} />
            <div>
              <h3>你的事情，只留在你的电脑</h3>
              <p className="muted">
                数据按浏览器和访问地址保存。定期导出一份 JSON，换电脑也能继续。
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
            和同一个浏览器，避免找不到原有数据。应用运行时不连接任何云服务。
          </p>
        </Modal>
      )}
      {notice && (
        <div className="toast" role="status">
          <Check size={17} />
          {notice}
        </div>
      )}
    </div>
  );
}
