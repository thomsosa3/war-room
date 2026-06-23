import { describe, it, expect } from "vitest";
import { schedule } from "./schedule";
import type {
  FixedEvent,
  Settings,
  Task,
  Weekday,
  WorkingHours,
} from "../lib/types";

// A Monday at 09:00 local time. (2024-01-01 was a Monday.)
const NOW = new Date(2024, 0, 1, 9, 0, 0, 0);
const MEMBER = "m1";

function workingHours(start = "09:00", end = "17:00"): WorkingHours {
  const day = { start, end, enabled: true };
  return {
    0: { ...day, enabled: false }, // Sun off
    1: { ...day },
    2: { ...day },
    3: { ...day },
    4: { ...day },
    5: { ...day },
    6: { ...day, enabled: false }, // Sat off
  } as Record<Weekday, { start: string; end: string; enabled: boolean }>;
}

const settings: Settings = {
  id: "s",
  planning_horizon_days: 14,
  default_chunk_minutes: 30,
};

let seq = 0;
function task(overrides: Partial<Task>): Task {
  seq += 1;
  return {
    id: overrides.id ?? `t${seq}`,
    title: overrides.title ?? `Task ${seq}`,
    estimated_minutes: 60,
    priority: "medium",
    deadline_type: "none",
    due_date: null,
    earliest_start: null,
    splittable: true,
    min_chunk_minutes: 30,
    recurrence: null,
    assignee_id: MEMBER,
    status: "todo",
    created_at: new Date(2024, 0, 1, 0, 0, seq).toISOString(), // distinct, ordered
    completed_at: null,
    notes: null,
    ...overrides,
  };
}

function minutes(blocks: { start: string; end: string }[]): number {
  return blocks.reduce(
    (a, b) => a + (new Date(b.end).getTime() - new Date(b.start).getTime()) / 60000,
    0
  );
}

describe("schedule", () => {
  it("places tasks inside working hours starting at now", () => {
    const t = task({ estimated_minutes: 120 });
    const { blocks } = schedule([t], [], workingHours(), settings, NOW);
    expect(blocks.length).toBeGreaterThan(0);
    expect(new Date(blocks[0].start).getTime()).toBe(NOW.getTime());
    expect(minutes(blocks)).toBe(120);
  });

  it("never schedules in the past", () => {
    const t = task({ estimated_minutes: 60 });
    const { blocks } = schedule([t], [], workingHours(), settings, NOW);
    for (const b of blocks) {
      expect(new Date(b.start).getTime()).toBeGreaterThanOrEqual(NOW.getTime());
    }
  });

  it("ASAP tasks come before everything else", () => {
    const high = task({ id: "high", priority: "high", deadline_type: "hard", due_date: new Date(2024, 0, 1, 16, 0).toISOString() });
    const asap = task({ id: "asap", priority: "asap" });
    const { blocks } = schedule([high, asap], [], workingHours(), settings, NOW);
    const firstAsap = blocks.find((b) => b.taskId === "asap");
    const firstHigh = blocks.find((b) => b.taskId === "high");
    expect(new Date(firstAsap!.start).getTime()).toBeLessThan(
      new Date(firstHigh!.start).getTime()
    );
  });

  it("orders by earlier deadline first", () => {
    const later = task({ id: "later", deadline_type: "soft", due_date: new Date(2024, 0, 5, 12, 0).toISOString() });
    const sooner = task({ id: "sooner", deadline_type: "soft", due_date: new Date(2024, 0, 2, 12, 0).toISOString() });
    const { blocks } = schedule([later, sooner], [], workingHours(), settings, NOW);
    const fSooner = blocks.find((b) => b.taskId === "sooner")!;
    const fLater = blocks.find((b) => b.taskId === "later")!;
    expect(new Date(fSooner.start).getTime()).toBeLessThan(new Date(fLater.start).getTime());
  });

  it("orders by priority when deadlines are equal/absent", () => {
    const low = task({ id: "low", priority: "low" });
    const high = task({ id: "high", priority: "high" });
    const { blocks } = schedule([low, high], [], workingHours(), settings, NOW);
    const fHigh = blocks.find((b) => b.taskId === "high")!;
    const fLow = blocks.find((b) => b.taskId === "low")!;
    expect(new Date(fHigh.start).getTime()).toBeLessThan(new Date(fLow.start).getTime());
  });

  it("does not overlap fixed events", () => {
    // Fixed event 10:00-12:00 today.
    const ev: FixedEvent = {
      id: "e1",
      member_id: MEMBER,
      title: "Class",
      start_ts: new Date(2024, 0, 1, 10, 0).toISOString(),
      end_ts: new Date(2024, 0, 1, 12, 0).toISOString(),
      type: "class",
    };
    const t = task({ estimated_minutes: 180, min_chunk_minutes: 30 });
    const { blocks } = schedule([t], [ev], workingHours(), settings, NOW);
    const evStart = new Date(ev.start_ts).getTime();
    const evEnd = new Date(ev.end_ts).getTime();
    for (const b of blocks) {
      const s = new Date(b.start).getTime();
      const e = new Date(b.end).getTime();
      expect(e <= evStart || s >= evEnd).toBe(true);
    }
  });

  it("splits long tasks into chunks no smaller than min_chunk", () => {
    // Only 1 hour free today (9-10) via a fixed event blocking 10-17,
    // forcing a split across days. Task needs 90 min, min chunk 30.
    const block: FixedEvent = {
      id: "e",
      member_id: MEMBER,
      title: "Busy",
      start_ts: new Date(2024, 0, 1, 10, 0).toISOString(),
      end_ts: new Date(2024, 0, 1, 17, 0).toISOString(),
    } as FixedEvent;
    const t = task({ estimated_minutes: 90, splittable: true, min_chunk_minutes: 30 });
    const { blocks } = schedule([t], [block], workingHours(), settings, NOW);
    expect(minutes(blocks)).toBe(90);
    for (const b of blocks) {
      const dur = (new Date(b.end).getTime() - new Date(b.start).getTime()) / 60000;
      expect(dur).toBeGreaterThanOrEqual(30);
    }
    expect(blocks.length).toBeGreaterThan(1);
    expect(blocks[0].isPartialOf?.chunkCount).toBe(blocks.length);
  });

  it("keeps a non-splittable task in a single block", () => {
    const t = task({ estimated_minutes: 120, splittable: false });
    const { blocks } = schedule([t], [], workingHours(), settings, NOW);
    expect(blocks.length).toBe(1);
    expect(minutes(blocks)).toBe(120);
  });

  it("schedules a hard deadline outside hours when it can't fit in working hours", () => {
    // Fill all of today's working hours with a fixed event, then a hard-deadline
    // task due today at 18:00 must be placed outside hours.
    const fill: FixedEvent = {
      id: "f",
      member_id: MEMBER,
      title: "All day",
      start_ts: new Date(2024, 0, 1, 9, 0).toISOString(),
      end_ts: new Date(2024, 0, 1, 17, 0).toISOString(),
    } as FixedEvent;
    const t = task({
      estimated_minutes: 60,
      deadline_type: "hard",
      due_date: new Date(2024, 0, 1, 18, 0).toISOString(),
      splittable: false,
    });
    const { blocks } = schedule([t], [fill], workingHours(), settings, NOW);
    expect(blocks.length).toBe(1);
    expect(blocks[0].scheduledOutsideHours).toBe(true);
    expect(new Date(blocks[0].end).getTime()).toBeLessThanOrEqual(
      new Date(t.due_date!).getTime()
    );
  });

  it("flags a task at risk when it can't fit before its due date", () => {
    // 10h of work due tomorrow, but only ~8h working hours/day and the deadline
    // is a soft one so it slips and is flagged.
    const t = task({
      estimated_minutes: 600,
      deadline_type: "soft",
      due_date: new Date(2024, 0, 1, 17, 0).toISOString(), // today end of day
      splittable: true,
      min_chunk_minutes: 30,
    });
    const { atRisk } = schedule([t], [], workingHours(), settings, NOW);
    expect(atRisk.length).toBe(1);
    expect(atRisk[0].taskId).toBe(t.id);
    expect(atRisk[0].requiredMinutes).toBe(600);
    expect(atRisk[0].scheduledMinutes).toBeLessThan(600);
  });

  it("respects earliest_start", () => {
    const earliest = new Date(2024, 0, 3, 9, 0); // Wednesday
    const t = task({ estimated_minutes: 60, earliest_start: earliest.toISOString() });
    const { blocks } = schedule([t], [], workingHours(), settings, NOW);
    expect(new Date(blocks[0].start).getTime()).toBeGreaterThanOrEqual(earliest.getTime());
  });

  it("expands a weekly recurring task into one occurrence per matching day", () => {
    // Mon + Wed, 30 min each, over a 14-day window starting Mon Jan 1.
    const t = task({
      estimated_minutes: 30,
      recurrence: { freq: "weekly", days: [1, 3] },
    });
    const { blocks } = schedule([t], [], workingHours(), settings, NOW);
    // 14-day window covers Jan 1..14: Mondays 1,8 and Wednesdays 3,10 -> 4.
    expect(blocks.length).toBe(4);
  });

  it("is deterministic for identical inputs", () => {
    const tasks = [
      task({ id: "a", priority: "high" }),
      task({ id: "b", priority: "low", deadline_type: "soft", due_date: new Date(2024, 0, 4).toISOString() }),
      task({ id: "c", priority: "asap" }),
    ];
    const r1 = schedule(tasks, [], workingHours(), settings, NOW);
    const r2 = schedule(tasks, [], workingHours(), settings, NOW);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });

  it("places a pinned task at its exact time and flows auto tasks around it", () => {
    const pinnedStart = new Date(2024, 0, 2, 13, 0); // Tue 1pm
    const pinned = task({
      id: "pinned",
      estimated_minutes: 60,
      pinned_start: pinnedStart.toISOString(),
    });
    const auto = task({ id: "auto", estimated_minutes: 600, splittable: true });
    const { blocks } = schedule([pinned, auto], [], workingHours(), settings, NOW);

    const pinnedBlock = blocks.find((b) => b.taskId === "pinned")!;
    expect(pinnedBlock.pinned).toBe(true);
    expect(new Date(pinnedBlock.start).getTime()).toBe(pinnedStart.getTime());
    expect(new Date(pinnedBlock.end).getTime()).toBe(pinnedStart.getTime() + 60 * 60000);

    // No auto block overlaps the pinned 1–2pm window.
    const ps = pinnedStart.getTime();
    const pe = ps + 60 * 60000;
    for (const b of blocks.filter((x) => x.taskId === "auto")) {
      const s = new Date(b.start).getTime();
      const e = new Date(b.end).getTime();
      expect(e <= ps || s >= pe).toBe(true);
    }
  });

  it("places multiple manual blocks for one task across days", () => {
    const t = task({
      id: "multi",
      estimated_minutes: 120,
      manual_blocks: [
        { id: "a", start: new Date(2024, 0, 2, 13, 0).toISOString(), minutes: 60 }, // Tue 1pm
        { id: "b", start: new Date(2024, 0, 4, 15, 0).toISOString(), minutes: 60 }, // Thu 3pm
      ],
    });
    const { blocks } = schedule([t], [], workingHours(), settings, NOW);
    const mine = blocks.filter((b) => b.taskId === "multi");
    expect(mine.length).toBe(2);
    expect(mine.every((b) => b.pinned)).toBe(true);
    expect(mine[0].isPartialOf?.chunkCount).toBe(2);
    // distinct ids preserved so each is independently draggable
    expect(new Set(mine.map((b) => b.manualBlockId)).size).toBe(2);
  });

  it("does not schedule shared-backlog (unassigned) tasks", () => {
    const t = task({ assignee_id: null });
    const { blocks } = schedule([t], [], workingHours(), settings, NOW);
    expect(blocks.length).toBe(0);
  });
});
