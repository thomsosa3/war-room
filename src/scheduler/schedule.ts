import {
  addDays,
  differenceInCalendarDays,
  getDay,
  startOfDay,
} from "date-fns";
import type {
  AtRiskItem,
  FixedEvent,
  ScheduledBlock,
  ScheduleResult,
  Settings,
  Task,
  Weekday,
  WorkingHours,
} from "../lib/types";
import { resolveManualBlocks } from "../lib/manual";

// ---------------------------------------------------------------------------
// Scheduling engine — a pure function that mirrors Motion's auto-scheduler.
//
//   schedule(tasks, fixedEvents, workingHours, settings, now) -> ScheduleResult
//
// Run it PER MEMBER: the caller passes only that member's todo tasks, that
// member's fixed events, and that member's working hours. The function never
// looks at other members.
//
// It is deterministic: identical inputs always yield identical output.
// ---------------------------------------------------------------------------

const MIN = 60_000; // ms per minute

interface Interval {
  start: number; // ms epoch
  end: number; // ms epoch
}

/** A single unit of work to place (a task, or one occurrence of a recurring task). */
interface Job {
  task: Task;
  occurrenceKey?: string; // present for recurring occurrences
  minutes: number;
  earliest: number; // ms, never before `now`
  due: number | null; // ms; null for none/asap
  isRecurring: boolean;
}

// ------------------------------ interval math ------------------------------

function parseHHMM(day: Date, hhmm: string): number {
  const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10));
  const d = new Date(day);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const cur of sorted) {
    const last = out[out.length - 1];
    if (last && cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end);
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

/** base minus union(cut). */
function subtractIntervals(base: Interval[], cut: Interval[]): Interval[] {
  const cuts = mergeIntervals(cut);
  const out: Interval[] = [];
  for (const b of base) {
    let cursor = b.start;
    for (const c of cuts) {
      if (c.end <= cursor || c.start >= b.end) continue;
      if (c.start > cursor) out.push({ start: cursor, end: Math.min(c.start, b.end) });
      cursor = Math.max(cursor, c.end);
      if (cursor >= b.end) break;
    }
    if (cursor < b.end) out.push({ start: cursor, end: b.end });
  }
  return out.filter((i) => i.end > i.start);
}

function clip(intervals: Interval[], min: number, max: number): Interval[] {
  return intervals
    .map((i) => ({ start: Math.max(i.start, min), end: Math.min(i.end, max) }))
    .filter((i) => i.end > i.start);
}

// --------------------------- recurrence expansion --------------------------

/** Expand a fixed event (optionally weekly-recurring) into concrete busy intervals in [from, to]. */
function expandFixedEvent(ev: FixedEvent, from: number, to: number): Interval[] {
  const start = new Date(ev.start_ts).getTime();
  const end = new Date(ev.end_ts).getTime();
  const durMs = Math.max(0, end - start);
  if (!ev.recurrence || ev.recurrence.freq !== "weekly" || !ev.recurrence.days?.length) {
    // one-off
    if (end <= from || start >= to) return [];
    return [{ start, end }];
  }
  // weekly: keep the time-of-day from start_ts, repeat on the given weekdays.
  const days = new Set<Weekday>(ev.recurrence.days);
  const baseStart = new Date(ev.start_ts);
  const out: Interval[] = [];
  let cursor = startOfDay(new Date(from));
  const limit = new Date(to);
  while (cursor.getTime() <= limit.getTime()) {
    if (days.has(getDay(cursor) as Weekday)) {
      const s = new Date(cursor);
      s.setHours(baseStart.getHours(), baseStart.getMinutes(), 0, 0);
      const occStart = s.getTime();
      const occEnd = occStart + durMs;
      if (occEnd > from && occStart < to) out.push({ start: occStart, end: occEnd });
    }
    cursor = addDays(cursor, 1);
  }
  return out;
}

// ------------------------------- placement ---------------------------------

interface FillResult {
  blocks: { start: number; end: number; outside: boolean }[];
  remaining: number;
  newPool: Interval[];
}

/**
 * Greedily place `remaining` minutes of `job` into the earliest usable parts of
 * `pool`, consuming the pool. Honors earliest-start, an optional deadline limit
 * (only place time before it), splittability and min-chunk size.
 */
function fill(
  pool: Interval[],
  job: Job,
  remaining: number,
  deadlineLimit: number | null,
  outside: boolean
): FillResult {
  const blocks: FillResult["blocks"] = [];
  const newPool: Interval[] = [];
  const minChunk = Math.max(1, job.task.min_chunk_minutes || 1);

  for (const interval of pool) {
    if (remaining <= 0) {
      newPool.push(interval);
      continue;
    }
    const s0 = interval.start;
    const e0 = interval.end;
    const s = Math.max(s0, job.earliest);
    const e = deadlineLimit != null ? Math.min(e0, deadlineLimit) : e0;
    if (e <= s) {
      newPool.push(interval); // unusable region for this job — leave for others
      continue;
    }
    const capMin = (e - s) / MIN;
    let place = 0;
    if (!job.task.splittable) {
      if (capMin + 1e-9 >= remaining) place = remaining;
    } else {
      const take = Math.min(capMin, remaining);
      // Don't carve a sliver smaller than the min chunk unless it finishes the task.
      if (!(take < remaining && take < minChunk)) place = take;
    }
    if (place <= 0) {
      newPool.push(interval);
      continue;
    }
    const placedEnd = s + place * MIN;
    blocks.push({ start: s, end: placedEnd, outside });
    remaining -= place;
    if (s0 < s) newPool.push({ start: s0, end: s }); // free head (before earliest)
    if (placedEnd < e0) newPool.push({ start: placedEnd, end: e0 }); // free tail
  }

  newPool.sort((a, b) => a.start - b.start);
  return { blocks, remaining, newPool };
}

// ------------------------------- ordering ----------------------------------

function priorityRank(p: Task["priority"]): number {
  switch (p) {
    case "high":
      return 0;
    case "medium":
      return 1;
    case "low":
      return 2;
    default:
      return 0; // asap handled separately
  }
}

function compareJobs(a: Job, b: Job, nowDay: Date): number {
  const aAsap = a.task.priority === "asap";
  const bAsap = b.task.priority === "asap";

  // 1. ASAP always first.
  if (aAsap !== bAsap) return aAsap ? -1 : 1;
  if (aAsap && bAsap) {
    if (a.earliest !== b.earliest) return a.earliest - b.earliest;
    return createdCmp(a, b);
  }

  // 2. Blend: deadline (by calendar day) -> priority -> recurring -> created_at.
  const aBucket = a.due == null ? Infinity : differenceInCalendarDays(new Date(a.due), nowDay);
  const bBucket = b.due == null ? Infinity : differenceInCalendarDays(new Date(b.due), nowDay);
  if (aBucket !== bBucket) return aBucket - bBucket;

  const ap = priorityRank(a.task.priority);
  const bp = priorityRank(b.task.priority);
  if (ap !== bp) return ap - bp;

  // Recurring before one-off to maintain cadence.
  const ar = a.isRecurring ? 0 : 1;
  const br = b.isRecurring ? 0 : 1;
  if (ar !== br) return ar - br;

  return createdCmp(a, b);
}

function createdCmp(a: Job, b: Job): number {
  const at = new Date(a.task.created_at).getTime();
  const bt = new Date(b.task.created_at).getTime();
  if (at !== bt) return at - bt;
  // Stable final tiebreak by id (then occurrence key) for determinism.
  if (a.task.id !== b.task.id) return a.task.id < b.task.id ? -1 : 1;
  return (a.occurrenceKey ?? "").localeCompare(b.occurrenceKey ?? "");
}

// ------------------------------ build jobs ---------------------------------

function buildJobs(tasks: Task[], now: number, windowEnd: number): Job[] {
  const jobs: Job[] = [];
  for (const task of tasks) {
    if (task.status !== "todo") continue;
    if (!task.assignee_id) continue; // shared backlog: not scheduled
    if (task.estimated_minutes <= 0) continue;
    if (resolveManualBlocks(task).length) continue; // manual tasks aren't auto-scheduled

    const taskEarliest = task.earliest_start
      ? Math.max(now, new Date(task.earliest_start).getTime())
      : now;

    if (task.recurrence && task.recurrence.freq === "weekly" && task.recurrence.days?.length) {
      // One occurrence per matching weekday in the window. Each is due (soft) by
      // end of its day so cadence is maintained.
      const days = new Set<Weekday>(task.recurrence.days);
      let cursor = startOfDay(new Date(now));
      while (cursor.getTime() < windowEnd) {
        if (days.has(getDay(cursor) as Weekday)) {
          const dayStart = cursor.getTime();
          const dayEnd = addDays(cursor, 1).getTime();
          const earliest = Math.max(taskEarliest, dayStart);
          if (earliest < dayEnd && dayEnd > now) {
            jobs.push({
              task,
              occurrenceKey: cursor.toISOString().slice(0, 10),
              minutes: task.estimated_minutes,
              earliest,
              due: dayEnd, // soft end-of-day to keep cadence
              isRecurring: true,
            });
          }
        }
        cursor = addDays(cursor, 1);
      }
      continue;
    }

    const due =
      task.priority === "asap" || task.deadline_type === "none" || !task.due_date
        ? null
        : new Date(task.due_date).getTime();

    jobs.push({
      task,
      minutes: task.estimated_minutes,
      earliest: taskEarliest,
      due,
      isRecurring: false,
    });
  }
  return jobs;
}

// -------------------------------- engine -----------------------------------

export function schedule(
  tasks: Task[],
  fixedEvents: FixedEvent[],
  workingHours: WorkingHours,
  settings: Settings,
  now: Date
): ScheduleResult {
  const nowMs = now.getTime();
  const horizon = settings.planning_horizon_days ?? 90;
  const windowEnd = addDays(startOfDay(now), horizon).getTime();
  const nowDay = startOfDay(now);

  // 1. Working-hour intervals across the window.
  const workIntervals: Interval[] = [];
  let day = startOfDay(now);
  while (day.getTime() < windowEnd) {
    const wd = getDay(day) as Weekday;
    const wh = workingHours[wd];
    if (wh && wh.enabled) {
      const s = parseHHMM(day, wh.start);
      const e = parseHHMM(day, wh.end);
      if (e > s) workIntervals.push({ start: s, end: e });
    }
    day = addDays(day, 1);
  }

  // 2a. Manual blocks: placed by dragging / the editor. One task can have several
  // blocks across days. They're immovable like fixed events — emitted as-is and
  // treated as occupied so auto tasks flow around them.
  const pinnedBlocks: ScheduledBlock[] = [];
  const pinnedBusy: Interval[] = [];
  for (const task of tasks) {
    if (task.status !== "todo" || !task.assignee_id) continue;
    const manuals = resolveManualBlocks(task)
      .filter((mb) => mb.minutes > 0)
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    manuals.forEach((mb, idx) => {
      const start = new Date(mb.start).getTime();
      const end = start + mb.minutes * MIN;
      if (end <= nowDay.getTime() || start >= windowEnd) return; // out of view
      pinnedBlocks.push({
        taskId: task.id,
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
        pinned: true,
        manualBlockId: mb.id,
        isPartialOf:
          manuals.length > 1
            ? { taskId: task.id, chunkIndex: idx, chunkCount: manuals.length }
            : undefined,
      });
      pinnedBusy.push({ start, end });
    });
  }

  // 2b. Fixed-event busy intervals (recurrence expanded) + pinned tasks.
  const busy = mergeIntervals([
    ...fixedEvents.flatMap((ev) => expandFixedEvent(ev, nowMs, windowEnd)),
    ...pinnedBusy,
  ]);

  // 3. Two pools: working-hours free, and outside-hours free (for hard deadlines).
  let workFree = clip(subtractIntervals(workIntervals, busy), nowMs, windowEnd);
  let outsideFree = clip(
    subtractIntervals([{ start: nowMs, end: windowEnd }], [...workIntervals, ...busy]),
    nowMs,
    windowEnd
  );
  workFree.sort((a, b) => a.start - b.start);
  outsideFree.sort((a, b) => a.start - b.start);

  // 4. Build & order jobs.
  const jobs = buildJobs(tasks, nowMs, windowEnd).sort((a, b) => compareJobs(a, b, nowDay));

  // 5. Place greedily.
  const outBlocks: ScheduledBlock[] = [];
  const atRisk: AtRiskItem[] = [];

  for (const job of jobs) {
    const placed: { start: number; end: number; outside: boolean }[] = [];
    let remaining = job.minutes;

    if (job.due != null) {
      // Pass 1: fit before the deadline in working hours.
      let r = fill(workFree, job, remaining, job.due, false);
      workFree = r.newPool;
      placed.push(...r.blocks);
      remaining = r.remaining;

      // Pass 2 (hard only): protect the deadline by using time outside hours.
      if (remaining > 0 && job.task.deadline_type === "hard") {
        r = fill(outsideFree, job, remaining, job.due, true);
        outsideFree = r.newPool;
        placed.push(...r.blocks);
        remaining = r.remaining;
      }

      // Pass 3: whatever still doesn't fit slips past the deadline (working hours).
      if (remaining > 0) {
        r = fill(workFree, job, remaining, null, false);
        workFree = r.newPool;
        placed.push(...r.blocks);
        remaining = r.remaining;
      }
    } else {
      // No deadline / ASAP: place earliest in working hours.
      const r = fill(workFree, job, remaining, null, false);
      workFree = r.newPool;
      placed.push(...r.blocks);
      remaining = r.remaining;
    }

    placed.sort((a, b) => a.start - b.start);

    // Emit blocks (with chunk metadata if split).
    placed.forEach((b, idx) => {
      outBlocks.push({
        taskId: job.task.id,
        start: new Date(b.start).toISOString(),
        end: new Date(b.end).toISOString(),
        scheduledOutsideHours: b.outside || undefined,
        isPartialOf:
          placed.length > 1
            ? { taskId: job.task.id, chunkIndex: idx, chunkCount: placed.length }
            : undefined,
      });
    });

    // At-risk: did the full estimate land before the due date?
    const scheduledBeforeDue =
      job.due == null
        ? placed.reduce((acc, b) => acc + (b.end - b.start) / MIN, 0)
        : placed
            .filter((b) => b.end <= job.due!)
            .reduce((acc, b) => acc + (b.end - b.start) / MIN, 0);

    if (scheduledBeforeDue + 1e-6 < job.minutes) {
      atRisk.push({
        taskId: job.task.id,
        scheduledMinutes: Math.round(scheduledBeforeDue),
        requiredMinutes: job.minutes,
        dueDate: job.due != null ? new Date(job.due).toISOString() : null,
      });
    }
  }

  outBlocks.push(...pinnedBlocks);
  outBlocks.sort((a, b) => a.start.localeCompare(b.start));
  return { blocks: outBlocks, atRisk };
}
