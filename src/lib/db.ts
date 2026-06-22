import { supabase, isSupabaseConfigured } from "./supabase";
import { DEFAULT_SETTINGS, SEED_MEMBERS, defaultWorkingHours } from "./defaults";
import type { FixedEvent, Member, Settings, Task } from "./types";

// ---------------------------------------------------------------------------
// Data access layer.
//
// Two backends behind one interface:
//   * Supabase  — the real shared source of truth (Postgres + Realtime). Used
//                 whenever VITE_SUPABASE_URL/ANON_KEY are configured. This is
//                 what makes two installed copies sync live.
//   * Local     — a localStorage fallback (with a BroadcastChannel for live
//                 updates between windows on the SAME machine). Lets you run and
//                 try the scheduler before Supabase is set up. It does NOT sync
//                 across machines — set up Supabase for that.
// ---------------------------------------------------------------------------

export interface Snapshot {
  members: Member[];
  tasks: Task[];
  fixedEvents: FixedEvent[];
  settings: Settings;
}

export interface Db {
  readonly mode: "supabase" | "local";
  fetchAll(): Promise<Snapshot>;
  upsertMember(m: Member): Promise<void>;
  createTask(t: Omit<Task, "id" | "created_at">): Promise<void>;
  updateTask(id: string, patch: Partial<Task>): Promise<void>;
  deleteTask(id: string): Promise<void>;
  createFixedEvent(e: Omit<FixedEvent, "id">): Promise<void>;
  updateFixedEvent(id: string, patch: Partial<FixedEvent>): Promise<void>;
  deleteFixedEvent(id: string): Promise<void>;
  updateSettings(patch: Partial<Settings>): Promise<void>;
  /** Subscribe to changes; returns an unsubscribe fn. */
  subscribe(onChange: () => void): () => void;
}

const uuid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });

// ----------------------------- Supabase backend ----------------------------

class SupabaseDb implements Db {
  readonly mode = "supabase" as const;

  async fetchAll(): Promise<Snapshot> {
    const sb = supabase!;
    const [members, tasks, events, settingsRows] = await Promise.all([
      sb.from("members").select("*").order("name"),
      sb.from("tasks").select("*"),
      sb.from("fixed_events").select("*"),
      sb.from("settings").select("*").limit(1),
    ]);
    if (members.error) throw members.error;
    if (tasks.error) throw tasks.error;
    if (events.error) throw events.error;

    let memberList = (members.data as Member[]) ?? [];
    // Seed the two members + settings on first run.
    if (memberList.length === 0) {
      memberList = await Promise.all(
        SEED_MEMBERS.map(async (m) => {
          const row: Member = {
            id: uuid(),
            name: m.name,
            color: m.color,
            working_hours: defaultWorkingHours(),
          };
          await sb.from("members").insert(row);
          return row;
        })
      );
    }
    let settings = (settingsRows.data?.[0] as Settings) ?? null;
    if (!settings) {
      settings = { ...DEFAULT_SETTINGS, id: uuid() };
      await sb.from("settings").insert(settings);
    }

    return {
      members: memberList,
      tasks: (tasks.data as Task[]) ?? [],
      fixedEvents: (events.data as FixedEvent[]) ?? [],
      settings,
    };
  }

  async upsertMember(m: Member) {
    const { error } = await supabase!.from("members").upsert(m);
    if (error) throw error;
  }
  async createTask(t: Omit<Task, "id" | "created_at">) {
    const row = { ...t, id: uuid(), created_at: new Date().toISOString() };
    const { error } = await supabase!.from("tasks").insert(row);
    if (error) throw error;
  }
  async updateTask(id: string, patch: Partial<Task>) {
    const { error } = await supabase!.from("tasks").update(patch).eq("id", id);
    if (error) throw error;
  }
  async deleteTask(id: string) {
    const { error } = await supabase!.from("tasks").delete().eq("id", id);
    if (error) throw error;
  }
  async createFixedEvent(e: Omit<FixedEvent, "id">) {
    const { error } = await supabase!.from("fixed_events").insert({ ...e, id: uuid() });
    if (error) throw error;
  }
  async updateFixedEvent(id: string, patch: Partial<FixedEvent>) {
    const { error } = await supabase!.from("fixed_events").update(patch).eq("id", id);
    if (error) throw error;
  }
  async deleteFixedEvent(id: string) {
    const { error } = await supabase!.from("fixed_events").delete().eq("id", id);
    if (error) throw error;
  }
  async updateSettings(patch: Partial<Settings>) {
    const { error } = await supabase!.from("settings").update(patch).neq("id", "");
    if (error) throw error;
  }

  subscribe(onChange: () => void) {
    const channel = supabase!
      .channel("war-room")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "fixed_events" }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "members" }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "settings" }, onChange)
      .subscribe();
    return () => {
      supabase!.removeChannel(channel);
    };
  }
}

// ------------------------------- Local backend ------------------------------

const LS_KEY = "war-room-data-v1";

class LocalDb implements Db {
  readonly mode = "local" as const;
  private channel: BroadcastChannel | null =
    typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("war-room") : null;

  private read(): Snapshot {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      try {
        return JSON.parse(raw) as Snapshot;
      } catch {
        /* fall through to seed */
      }
    }
    const seeded: Snapshot = {
      members: SEED_MEMBERS.map((m) => ({
        id: uuid(),
        name: m.name,
        color: m.color,
        working_hours: defaultWorkingHours(),
      })),
      tasks: [],
      fixedEvents: [],
      settings: { ...DEFAULT_SETTINGS, id: uuid() },
    };
    this.write(seeded, false);
    return seeded;
  }

  private write(s: Snapshot, notify = true) {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
    if (notify) this.channel?.postMessage("change");
  }

  async fetchAll() {
    return this.read();
  }
  async upsertMember(m: Member) {
    const s = this.read();
    const i = s.members.findIndex((x) => x.id === m.id);
    if (i >= 0) s.members[i] = m;
    else s.members.push(m);
    this.write(s);
  }
  async createTask(t: Omit<Task, "id" | "created_at">) {
    const s = this.read();
    s.tasks.push({ ...t, id: uuid(), created_at: new Date().toISOString() } as Task);
    this.write(s);
  }
  async updateTask(id: string, patch: Partial<Task>) {
    const s = this.read();
    s.tasks = s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t));
    this.write(s);
  }
  async deleteTask(id: string) {
    const s = this.read();
    s.tasks = s.tasks.filter((t) => t.id !== id);
    this.write(s);
  }
  async createFixedEvent(e: Omit<FixedEvent, "id">) {
    const s = this.read();
    s.fixedEvents.push({ ...e, id: uuid() } as FixedEvent);
    this.write(s);
  }
  async updateFixedEvent(id: string, patch: Partial<FixedEvent>) {
    const s = this.read();
    s.fixedEvents = s.fixedEvents.map((e) => (e.id === id ? { ...e, ...patch } : e));
    this.write(s);
  }
  async deleteFixedEvent(id: string) {
    const s = this.read();
    s.fixedEvents = s.fixedEvents.filter((e) => e.id !== id);
    this.write(s);
  }
  async updateSettings(patch: Partial<Settings>) {
    const s = this.read();
    s.settings = { ...s.settings, ...patch };
    this.write(s);
  }
  subscribe(onChange: () => void) {
    const handler = () => onChange();
    this.channel?.addEventListener("message", handler);
    window.addEventListener("storage", handler);
    return () => {
      this.channel?.removeEventListener("message", handler);
      window.removeEventListener("storage", handler);
    };
  }
}

export const db: Db = isSupabaseConfigured ? new SupabaseDb() : new LocalDb();
