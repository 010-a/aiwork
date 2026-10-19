export type TaskStatus = "todo" | "doing" | "paused" | "done";
export type Page =
  "home" | "inbox" | "today" | "projects" | "calendar" | "review";
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
  rule: keyof AlertRules;
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
  monitoring?: {
    enabledAt: string;
    rules: AlertRules;
    entries: MonitoringEntry[];
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
}
export interface ViewProps {
  store: AppStore;
  openTask: (id: string) => void;
  quickAdd: (patch?: Partial<Task>) => void;
  navigate: (page: Page, projectId?: string) => void;
  openAlertRules?: () => void;
  today: string;
}
