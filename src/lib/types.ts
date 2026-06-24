// ---------------------------------------------------------------------------
// Domain types. These mirror the Supabase tables one-to-one.
// ---------------------------------------------------------------------------

export type Priority = "asap" | "high" | "medium" | "low";
export type DeadlineType = "hard" | "soft" | "none";
export type TaskStatus = "todo" | "done";
export type FixedEventType = "class" | "work" | "gym" | "other";

/** 0 = Sunday ... 6 = Saturday (matches JS Date.getDay()). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface WorkingHoursDay {
  /** "HH:mm" 24h, e.g. "09:00" */
  start: string;
  end: string;
  enabled: boolean;
}

/** Keyed by weekday 0..6. */
export type WorkingHours = Record<Weekday, WorkingHoursDay>;

export interface Member {
  id: string;
  name: string;
  color: string; // hex, e.g. "#4f8a6b"
  working_hours: WorkingHours;
}

/** A material/supply line item for a project's shopping list. */
export interface Material {
  id: string;
  name: string;
  qty?: string | null; // free text, e.g. "12", "2 bags"
  bought: boolean;
}

/** A build project that groups tasks (Fence, Garden beds, Tree planting...). */
export interface Project {
  id: string;
  name: string;
  color: string;
  due_date?: string | null; // target finish date
  materials?: Material[] | null;
  archived: boolean;
  created_at: string;
}

export interface Recurrence {
  freq: "weekly";
  /** weekdays this repeats on, 0..6 */
  days: Weekday[];
}

/** A checklist step under a task (MAIN TASK -> sub-steps). */
export interface SubTask {
  id: string;
  title: string;
  done: boolean;
}

/** A manually placed time block for a task (one task can have several). */
export interface ManualBlock {
  id: string;
  start: string; // ISO
  minutes: number;
}

export interface Task {
  id: string;
  title: string;
  notes?: string | null;
  estimated_minutes: number;
  priority: Priority;
  deadline_type: DeadlineType;
  /** ISO timestamptz. Ignored when priority === "asap". */
  due_date?: string | null;
  /** ISO timestamptz. Don't schedule before this. */
  earliest_start?: string | null;
  splittable: boolean;
  min_chunk_minutes: number;
  recurrence?: Recurrence | null;
  /**
   * Legacy single-pin (kept for back-compat). Superseded by `manual_blocks`;
   * read as one manual block when manual_blocks is empty.
   */
  pinned_start?: string | null;
  /**
   * Manual override: when non-empty, the task is placed exactly at these blocks
   * (immovable, like fixed events) and NOT auto-scheduled. Lets one task have
   * several blocks across different days. Null/empty = fully auto-scheduled.
   */
  manual_blocks?: ManualBlock[] | null;
  /** Checklist of steps to complete the task. Does not affect scheduling. */
  subtasks?: SubTask[] | null;
  /** Project this task belongs to (null = no project). */
  project_id?: string | null;
  /** Task ids that must finish before this one can be scheduled. */
  depends_on?: string[] | null;
  /** True = job needs both members; scheduled into their shared free time. */
  needs_both?: boolean | null;
  /** Favourited — glows with a star in the planner. */
  starred?: boolean | null;
  assignee_id?: string | null; // null = shared backlog
  status: TaskStatus;
  created_at: string;
  completed_at?: string | null;
}

export interface FixedEvent {
  id: string;
  member_id: string;
  title: string;
  start_ts: string; // ISO
  end_ts: string; // ISO
  type: FixedEventType;
  recurrence?: Recurrence | null;
}

export interface Settings {
  id: string;
  planning_horizon_days: number; // default 90
  default_chunk_minutes: number; // default 30
}

// ---------------------------------------------------------------------------
// Scheduler output
// ---------------------------------------------------------------------------

export interface ScheduledBlock {
  taskId: string;
  /** ISO start/end of this block. */
  start: string;
  end: string;
  /**
   * When a task is split, every block carries the task's id here too so the UI
   * can show "1 of 3". Holds the parent task id (same as taskId) plus chunk meta.
   */
  isPartialOf?: {
    taskId: string;
    chunkIndex: number; // 0-based
    chunkCount: number;
  };
  /** True when placed outside working hours to protect a hard deadline. */
  scheduledOutsideHours?: boolean;
  /** True when this block is a manually pinned (dragged) placement. */
  pinned?: boolean;
  /** Which manual block this came from (so dragging moves just this segment). */
  manualBlockId?: string;
  /** True when this is a shared two-person block (shown on both schedules). */
  bothTask?: boolean;
}

/** A task that could not fully fit before its due date. */
export interface AtRiskItem {
  taskId: string;
  scheduledMinutes: number;
  requiredMinutes: number;
  /** ISO of the due date it can't meet, if any. */
  dueDate?: string | null;
}

export interface ScheduleResult {
  blocks: ScheduledBlock[];
  atRisk: AtRiskItem[];
}
