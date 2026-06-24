import { create } from "zustand";
import { db } from "../lib/db";
import { SHARED_PASSPHRASE } from "../lib/supabase";
import { addBlock, duplicateBlock, moveBlock, removeBlock, resizeBlock } from "../lib/manual";
import type { FixedEvent, Member, Project, Settings, Task } from "../lib/types";

export type ViewKind = "day" | "week" | "month" | "agenda" | "projects";
/** "me" = this device's member, "other" = the other one. */
export type Focus = "me" | "other" | "both";

const LOCAL_MEMBER_KEY = "war-room-local-member";

interface EditingTask {
  kind: "task";
  task: Partial<Task> | null; // null = new
}
interface EditingEvent {
  kind: "event";
  event: Partial<FixedEvent> | null;
}
interface EditingProject {
  kind: "project";
  project: Partial<Project> | null;
}
type Editing = EditingTask | EditingEvent | EditingProject | { kind: "settings" } | null;

interface State {
  // gate
  unlocked: boolean;
  passphraseRequired: boolean;

  // data
  loaded: boolean;
  members: Member[];
  tasks: Task[];
  fixedEvents: FixedEvent[];
  settings: Settings;
  projects: Project[];
  syncMode: "supabase" | "local";

  // identity / view
  localMemberId: string | null;
  view: ViewKind;
  focus: Focus;
  projectFilter: string | "all"; // filter calendar views to one project
  anchor: string; // ISO date the calendar is centered on
  planNow: number; // ms; bumped to force a re-plan
  editing: Editing;

  // actions
  init: () => Promise<void>;
  refresh: () => Promise<void>;
  unlock: (passphrase: string) => boolean;
  setLocalMember: (id: string) => void;
  setView: (v: ViewKind) => void;
  setFocus: (f: Focus) => void;
  setProjectFilter: (id: string | "all") => void;
  setAnchor: (iso: string) => void;
  replan: () => void;
  openEditor: (e: Editing) => void;

  // crud (each refreshes + replans)
  saveMember: (m: Member) => Promise<void>;
  createTask: (t: Omit<Task, "id" | "created_at">) => Promise<void>;
  updateTask: (id: string, patch: Partial<Task>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  toggleDone: (t: Task) => Promise<void>;
  createEvent: (e: Omit<FixedEvent, "id">) => Promise<void>;
  updateEvent: (id: string, patch: Partial<FixedEvent>) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;
  saveSettings: (patch: Partial<Settings>) => Promise<void>;
  createProject: (p: Omit<Project, "id" | "created_at">) => Promise<void>;
  updateProject: (id: string, patch: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;

  // planner block ops
  quickAdd: (title: string, projectId?: string | null) => Promise<void>;
  addTaskBlock: (taskId: string, startISO: string, minutes?: number) => Promise<void>;
  moveTaskBlock: (taskId: string, blockId: string, startISO: string) => Promise<void>;
  resizeTaskBlock: (taskId: string, blockId: string, minutes: number) => Promise<void>;
  removeTaskBlock: (taskId: string, blockId: string) => Promise<void>;
  duplicateTaskBlock: (taskId: string, blockId: string) => Promise<void>;
  toggleStar: (taskId: string) => Promise<void>;
}

const blankTask = (title: string, projectId?: string | null): Omit<Task, "id" | "created_at"> => ({
  title,
  notes: null,
  estimated_minutes: 60,
  priority: "medium",
  deadline_type: "none",
  due_date: null,
  earliest_start: null,
  splittable: true,
  min_chunk_minutes: 30,
  recurrence: null,
  pinned_start: null,
  manual_blocks: null,
  subtasks: null,
  project_id: projectId ?? null,
  depends_on: null,
  needs_both: false,
  starred: false,
  assignee_id: null,
  status: "todo",
  completed_at: null,
});

const emptySettings: Settings = {
  id: "",
  planning_horizon_days: 90,
  default_chunk_minutes: 30,
};

export const useStore = create<State>((set, get) => ({
  unlocked: !SHARED_PASSPHRASE, // no passphrase configured => open
  passphraseRequired: Boolean(SHARED_PASSPHRASE),

  loaded: false,
  members: [],
  tasks: [],
  fixedEvents: [],
  settings: emptySettings,
  projects: [],
  syncMode: db.mode,

  localMemberId: localStorage.getItem(LOCAL_MEMBER_KEY),
  view: "day",
  focus: "me",
  projectFilter: "all",
  anchor: new Date().toISOString(),
  planNow: Date.now(),
  editing: null,

  init: async () => {
    await get().refresh();
    // Default the local member to the first one if not chosen yet.
    if (!get().localMemberId && get().members[0]) {
      get().setLocalMember(get().members[0].id);
    }
    // Live updates from the other copy -> refresh + replan.
    db.subscribe(() => {
      void get().refresh();
    });
    // Day-rollover replan: check each minute, bump plan if the day changed.
    let lastDay = new Date().getDate();
    setInterval(() => {
      const d = new Date().getDate();
      if (d !== lastDay) {
        lastDay = d;
        get().replan();
      }
    }, 60_000);
  },

  refresh: async () => {
    const snap = await db.fetchAll();
    set({
      members: snap.members,
      tasks: snap.tasks,
      fixedEvents: snap.fixedEvents,
      settings: snap.settings,
      projects: snap.projects,
      loaded: true,
      planNow: Date.now(),
    });
  },

  unlock: (passphrase) => {
    if (passphrase === SHARED_PASSPHRASE) {
      set({ unlocked: true });
      return true;
    }
    return false;
  },

  setLocalMember: (id) => {
    localStorage.setItem(LOCAL_MEMBER_KEY, id);
    set({ localMemberId: id });
  },
  setView: (view) => set({ view }),
  setFocus: (focus) => set({ focus }),
  setProjectFilter: (projectFilter) => set({ projectFilter }),
  setAnchor: (anchor) => set({ anchor }),
  replan: () => set({ planNow: Date.now() }),
  openEditor: (editing) => set({ editing }),

  saveMember: async (m) => {
    await db.upsertMember(m);
    await get().refresh();
  },
  createTask: async (t) => {
    await db.createTask(t);
    await get().refresh();
  },
  updateTask: async (id, patch) => {
    await db.updateTask(id, patch);
    await get().refresh();
  },
  deleteTask: async (id) => {
    await db.deleteTask(id);
    await get().refresh();
  },
  toggleDone: async (t) => {
    const done = t.status !== "done";
    await db.updateTask(t.id, {
      status: done ? "done" : "todo",
      completed_at: done ? new Date().toISOString() : null,
    });
    await get().refresh();
  },
  createEvent: async (e) => {
    await db.createFixedEvent(e);
    await get().refresh();
  },
  updateEvent: async (id, patch) => {
    await db.updateFixedEvent(id, patch);
    await get().refresh();
  },
  deleteEvent: async (id) => {
    await db.deleteFixedEvent(id);
    await get().refresh();
  },
  saveSettings: async (patch) => {
    await db.updateSettings(patch);
    await get().refresh();
  },
  createProject: async (p) => {
    await db.createProject(p);
    await get().refresh();
  },
  updateProject: async (id, patch) => {
    await db.updateProject(id, patch);
    await get().refresh();
  },
  deleteProject: async (id) => {
    await db.deleteProject(id);
    await get().refresh();
  },

  quickAdd: async (title, projectId) => {
    if (!title.trim()) return;
    await db.createTask(blankTask(title.trim(), projectId));
    await get().refresh();
  },
  addTaskBlock: async (taskId, startISO, minutes) => {
    const t = get().tasks.find((x) => x.id === taskId);
    if (!t) return;
    await db.updateTask(taskId, { manual_blocks: addBlock(t, startISO, minutes), pinned_start: null });
    await get().refresh();
  },
  moveTaskBlock: async (taskId, blockId, startISO) => {
    const t = get().tasks.find((x) => x.id === taskId);
    if (!t) return;
    await db.updateTask(taskId, { manual_blocks: moveBlock(t, blockId, startISO), pinned_start: null });
    await get().refresh();
  },
  resizeTaskBlock: async (taskId, blockId, minutes) => {
    const t = get().tasks.find((x) => x.id === taskId);
    if (!t) return;
    await db.updateTask(taskId, { manual_blocks: resizeBlock(t, blockId, minutes), pinned_start: null });
    await get().refresh();
  },
  removeTaskBlock: async (taskId, blockId) => {
    const t = get().tasks.find((x) => x.id === taskId);
    if (!t) return;
    await db.updateTask(taskId, { manual_blocks: removeBlock(t, blockId), pinned_start: null });
    await get().refresh();
  },
  duplicateTaskBlock: async (taskId, blockId) => {
    const t = get().tasks.find((x) => x.id === taskId);
    if (!t) return;
    await db.updateTask(taskId, { manual_blocks: duplicateBlock(t, blockId), pinned_start: null });
    await get().refresh();
  },
  toggleStar: async (taskId) => {
    const t = get().tasks.find((x) => x.id === taskId);
    if (!t) return;
    await db.updateTask(taskId, { starred: !t.starred });
    await get().refresh();
  },
}));
