export type TaskStatus = "todo" | "doing" | "paused" | "done";
export type Page =
  | "home"
  | "inbox"
  | "today"
  | "projects"
  | "calendar"
  | "review";
export interface MonitorTarget {
  type: "task" | "project";
  id: string;
}
export interface Monitor {
  preset?: "standard" | "bug";
  startedAt?: string;
  resumedAt?: string;
  paused?: boolean;
  stallDays?: number;
  blockedSince?: string;
  followUpDate?: string;
  checkpoint?: {
    title: string;
    criteria: string;
    date: string;
    completedAt?: string;
  };
}
export interface AlertRules {
  projectStall: { enabled: boolean; days: number };
  bugStall: { enabled: boolean; days: number };
  checkpoint: { enabled: boolean };
  deadline: { enabled: boolean; days: number };
  blocked: { enabled: boolean; days: number };
}
export interface Principle {
  id: string;
  title: string;
  description: string;
  enabled: boolean;
  scope: "project" | "task" | "bug" | "all";
  condition: "stall" | "blocked" | "deadline" | "checkpoint" | "manual";
  days: number;
  unit: "calendar" | "business";
  action: string;
}
export interface Recurrence {
  interval: number;
  unit: "day" | "week" | "month";
  mode: "schedule" | "completion";
  paused?: boolean;
  anchorDay?: number;
}
export interface TaskTemplate {
  id: string;
  title: string;
  notes: string;
  projectId?: string;
  stageId?: string;
  estimatedMinutes?: number;
  demo?: boolean;
}
export interface TrashItem {
  id: string;
  deletedAt: string;
  task?: Task;
  event?: CalendarEvent;
  entries: MonitoringEntry[];
  dependents?: string[];
}
export interface BackupInfo {
  id: string;
  at: string;
  label: string;
  tasks: number;
}
export interface MonitoringEntry {
  id: string;
  entityType: MonitorTarget["type"];
  entityId: string;
  /** Project at the moment of progress, retained when a task is moved later. */
  projectId?: string;
  at: string;
  kind: "progress" | "completed" | "checkpoint" | "adjustment";
  note: string;
  previousDate?: string;
  newDate?: string;
  demo?: boolean;
}
export interface MonitoringAlert {
  id: string;
  rule: string;
  target: MonitorTarget;
  title: string;
  reason: string;
  suggestion: string;
  severity: "warning" | "danger";
  since: string;
}
export interface Task {
  id: string;
  title: string;
  notes: string;
  status: TaskStatus;
  inbox: boolean;
  projectId?: string;
  stageId?: string;
  plannedDate?: string;
  dueDate?: string;
  important: boolean;
  order: number;
  blockedReason?: string;
  dependsOn?: string[];
  obsidianUrl?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  demo?: boolean;
  monitor?: Monitor;
  nextAction?: string;
  estimatedMinutes?: number;
  recurrence?: Recurrence;
  repeatNextId?: string;
}
export interface Project {
  id: string;
  title: string;
  goal: string;
  description: string;
  color: string;
  archived: boolean;
  blockedReason?: string;
  obsidianUrl?: string;
  createdAt: string;
  updatedAt: string;
  demo?: boolean;
  monitor?: Monitor;
  nextAction?: string;
}
export interface Stage {
  id: string;
  projectId: string;
  title: string;
  order: number;
  demo?: boolean;
}
export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  notes: string;
  demo?: boolean;
}
export interface AppData {
  schemaVersion: 1;
  tasks: Task[];
  projects: Project[];
  stages: Stage[];
  events: CalendarEvent[];
  reviewNotes: Record<string, string>;
  templates?: TaskTemplate[];
  trash?: TrashItem[];
  monitoring?: {
    enabledAt: string;
    rules: AlertRules;
    entries: MonitoringEntry[];
    principles?: Principle[];
  };
}
export interface AppStore {
  data: AppData;
  loaded: boolean;
  saveState: "saving" | "saved" | "error";
  error: string;
  addTask: (title: string, patch?: Partial<Task>) => string;
  updateTask: (id: string, patch: Partial<Task>) => void;
  deleteTasks: (ids: string[]) => void;
  updateTasks: (ids: string[], patch: Partial<Task>) => void;
  reorderTasks: (ids: string[]) => void;
  addProject: (patch: Partial<Project>) => string;
  updateProject: (id: string, patch: Partial<Project>) => void;
  addStage: (projectId: string, title: string) => string;
  updateStage: (id: string, title: string) => void;
  deleteStage: (id: string) => void;
  addEvent: (patch: Omit<CalendarEvent, "id">) => string;
  updateEvent: (id: string, patch: Partial<CalendarEvent>) => void;
  deleteEvent: (id: string) => void;
  setReviewNote: (week: string, note: string) => void;
  replaceData: (data: AppData) => void;
  clearDemo: () => void;
  loadDemo: () => void;
  recordProgress: (target: MonitorTarget, note: string) => void;
  updateMonitor: (target: MonitorTarget, patch: Partial<Monitor>) => void;
  completeCheckpoint: (target: MonitorTarget) => void;
  updateAlertRules: (rules: AlertRules) => void;
  savePrinciple: (principle: Principle) => void;
  deletePrinciple: (id: string) => void;
  undo: () => void;
  undoLabel: string;
  restoreTrash: (id: string) => void;
  purgeTrash: (id: string) => void;
  saveTemplate: (template: TaskTemplate) => void;
  deleteTemplate: (id: string) => void;
  storageMode: "browser" | "service";
  backups: BackupInfo[];
  backupNow: () => Promise<void>;
  restoreBackup: (id: string) => Promise<void>;
  readBackup: (id: string) => Promise<AppData>;
  refreshBackups: () => Promise<void>;
  flushSaves: () => Promise<void>;
  legacyData?: AppData;
  dataDirectory?: string;
  storageWarning?: string;
}
export interface ViewProps {
  store: AppStore;
  openTask: (id: string) => void;
  quickAdd: (patch?: Partial<Task>) => void;
  navigate: (page: Page, projectId?: string) => void;
  openAlertRules?: () => void;
  today: string;
}
