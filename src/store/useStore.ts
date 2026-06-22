import { create } from "zustand";
import { db } from "../lib/db";
import { SHARED_PASSPHRASE } from "../lib/supabase";
import type { FixedEvent, Member, Settings, Task } from "../lib/types";

export type ViewKind = "day" | "week" | "agenda";
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
type Editing = EditingTask | EditingEvent | { kind: "settings" } | null;

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
  syncMode: "supabase" | "local";

  // identity / view
  localMemberId: string | null;
  view: ViewKind;
  focus: Focus;
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
}

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
  syncMode: db.mode,

  localMemberId: localStorage.getItem(LOCAL_MEMBER_KEY),
  view: "day",
  focus: "me",
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
}));
