import {
  addDays,
  differenceInCalendarDays,
  getDay,
  startOfDay,
} from "date-fns";
import type {
  AtRiskItem,
  FixedEvent,
  Member,
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

/** Intersection of two sorted interval lists (time both are free). */
function intervalIntersect(a: Interval[], b: Interval[]): Interval[] {
  const out: Interval[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const s = Math.max(a[i].start, b[j].start);
    const e = Math.min(a[i].end, b[j].end);
    if (e > s) out.push({ start: s, end: e });
    if (a[i].end < b[j].end) i++;
    else j++;
  }
  return out;
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

interface MemberPools {
  workFree: Interval[];
  outsideFree: Interval[];
}

/** Place a two-person job into time where ALL members are simultaneously free. */
function fillBoth(
  pools: Record<string, MemberPools>,
  members: Member[],
  job: Job,
  remaining: number,
  earliest: number,
  deadlineLimit: number | null,
  placed: { start: number; end: number; outside: boolean }[]
): number {
  let inter = pools[members[0].id].workFree;
  for (let i = 1; i < members.length; i++) {
    inter = intervalIntersect(inter, pools[members[i].id].workFree);
  }
  const localJob = { ...job, earliest };
  const r = fill(inter, localJob, remaining, deadlineLimit, false);
  // Reserve the placed time on every member's pool.
  for (const b of r.blocks) {
    for (const m of members) {
      pools[m.id].workFree = subtractIntervals(pools[m.id].workFree, [{ start: b.start, end: b.end }]);
    }
  }
  placed.push(...r.blocks);
  return r.remaining;
}

/**
 * Schedule ALL members together. Coordinated so it can honor cross-member
 * dependencies (a task waits for its blockers anywhere) and two-person tasks
 * (placed where both members are free). Returns a per-member result map.
 */
export function scheduleAll(
  tasks: Task[],
  fixedEvents: FixedEvent[],
  members: Member[],
  settings: Settings,
  now: Date
): Record<string, ScheduleResult> {
  const nowMs = now.getTime();
  const horizon = settings.planning_horizon_days ?? 90;
  const windowEnd = addDays(startOfDay(now), horizon).getTime();
  const nowDay = startOfDay(now);
  const nowDayMs = nowDay.getTime();

  const outBlocks: Record<string, ScheduledBlock[]> = {};
  const atRisk: Record<string, AtRiskItem[]> = {};
  const workIntervalsByMember: Record<string, Interval[]> = {};
  const busyByMember: Record<string, Interval[]> = {};
  for (const m of members) {
    outBlocks[m.id] = [];
    atRisk[m.id] = [];
    const wi: Interval[] = [];
    let day = startOfDay(now);
    while (day.getTime() < windowEnd) {
      const wd = getDay(day) as Weekday;
      const wh = m.working_hours[wd];
      if (wh && wh.enabled) {
        const s = parseHHMM(day, wh.start);
        const e = parseHHMM(day, wh.end);
        if (e > s) wi.push({ start: s, end: e });
      }
      day = addDays(day, 1);
    }
    workIntervalsByMember[m.id] = wi;
    busyByMember[m.id] = fixedEvents
      .filter((ev) => ev.member_id === m.id)
      .flatMap((ev) => expandFixedEvent(ev, nowMs, windowEnd));
  }

  // Dependency end-times: done tasks are satisfied at completion; auto tasks
  // gain an end-time once fully scheduled (below).
  const taskEnd = new Map<string, number>();
  for (const task of tasks) {
    if (task.status === "done") {
      taskEnd.set(task.id, task.completed_at ? new Date(task.completed_at).getTime() : nowMs);
    }
  }

  // Manual blocks (immovable). Reserve on the assignee — and on both members
  // when the task needs both. Their end-time satisfies dependents.
  for (const task of tasks) {
    if (task.status !== "todo" || !task.assignee_id) continue;
    const manuals = resolveManualBlocks(task)
      .filter((mb) => mb.minutes > 0)
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    if (!manuals.length) continue;
    const targets = task.needs_both ? members.map((m) => m.id) : [task.assignee_id];
    let lastEnd = 0;
    manuals.forEach((mb, idx) => {
      const start = new Date(mb.start).getTime();
      const end = start + mb.minutes * MIN;
      lastEnd = Math.max(lastEnd, end);
      if (end <= nowDayMs || start >= windowEnd) return;
      for (const mid of targets) {
        if (!busyByMember[mid]) continue;
        busyByMember[mid].push({ start, end });
        outBlocks[mid].push({
          taskId: task.id,
          start: new Date(start).toISOString(),
          end: new Date(end).toISOString(),
          pinned: true,
          manualBlockId: mb.id,
          bothTask: task.needs_both ? true : undefined,
          isPartialOf:
            manuals.length > 1
              ? { taskId: task.id, chunkIndex: idx, chunkCount: manuals.length }
              : undefined,
        });
      }
    });
    taskEnd.set(task.id, lastEnd || nowMs);
  }

  // Free pools per member (after fixed events + manual blocks).
  const pools: Record<string, MemberPools> = {};
  for (const m of members) {
    const busy = mergeIntervals(busyByMember[m.id]);
    const wi = workIntervalsByMember[m.id];
    pools[m.id] = {
      workFree: clip(subtractIntervals(wi, busy), nowMs, windowEnd).sort((a, b) => a.start - b.start),
      outsideFree: clip(
        subtractIntervals([{ start: nowMs, end: windowEnd }], [...wi, ...busy]),
        nowMs,
        windowEnd
      ).sort((a, b) => a.start - b.start),
    };
  }

  // Auto jobs (non-manual). Recurrence already expanded.
  const jobs = buildJobs(tasks, nowMs, windowEnd);
  const autoTaskIds = new Set(jobs.map((j) => j.task.id));
  const jobsLeftPerTask = new Map<string, number>();
  for (const j of jobs) jobsLeftPerTask.set(j.task.id, (jobsLeftPerTask.get(j.task.id) ?? 0) + 1);
  const taskRunningEnd = new Map<string, number>();
  const remainingJobs = new Set(jobs);

  const blockersSatisfied = (task: Task) =>
    (task.depends_on ?? []).every((d) => !autoTaskIds.has(d) || taskEnd.has(d));
  const maxBlockerEnd = (task: Task) => {
    let m = 0;
    for (const d of task.depends_on ?? []) {
      const e = taskEnd.get(d);
      if (e != null) m = Math.max(m, e);
    }
    return m;
  };

  // List-scheduling: repeatedly schedule the highest-priority *ready* job.
  let guard = jobs.length + 5;
  while (remainingJobs.size > 0 && guard-- > 0) {
    let ready = [...remainingJobs].filter((j) => blockersSatisfied(j.task));
    if (ready.length === 0) ready = [...remainingJobs]; // cycle/deadlock -> best effort
    ready.sort((a, b) => compareJobs(a, b, nowDay));
    const job = ready[0];
    remainingJobs.delete(job);

    const earliest = Math.max(job.earliest, maxBlockerEnd(job.task));
    const due = job.due;
    const placed: { start: number; end: number; outside: boolean }[] = [];
    let remaining = job.minutes;
    const both = !!job.task.needs_both && members.length > 1;

    if (both) {
      remaining = fillBoth(pools, members, job, remaining, earliest, due, placed);
      if (remaining > 0) remaining = fillBoth(pools, members, job, remaining, earliest, null, placed);
    } else {
      const p = pools[job.task.assignee_id!];
      if (p) {
        const localJob = { ...job, earliest };
        if (due != null) {
          let r = fill(p.workFree, localJob, remaining, due, false);
          p.workFree = r.newPool;
          placed.push(...r.blocks);
          remaining = r.remaining;
          if (remaining > 0 && job.task.deadline_type === "hard") {
            r = fill(p.outsideFree, localJob, remaining, due, true);
            p.outsideFree = r.newPool;
            placed.push(...r.blocks);
            remaining = r.remaining;
          }
          if (remaining > 0) {
            r = fill(p.workFree, localJob, remaining, null, false);
            p.workFree = r.newPool;
            placed.push(...r.blocks);
            remaining = r.remaining;
          }
        } else {
          const r = fill(p.workFree, localJob, remaining, null, false);
          p.workFree = r.newPool;
          placed.push(...r.blocks);
          remaining = r.remaining;
        }
      }
    }

    placed.sort((a, b) => a.start - b.start);
    const targets = both ? members.map((m) => m.id) : [job.task.assignee_id!];
    placed.forEach((b, idx) => {
      const blk: ScheduledBlock = {
        taskId: job.task.id,
        start: new Date(b.start).toISOString(),
        end: new Date(b.end).toISOString(),
        scheduledOutsideHours: b.outside || undefined,
        bothTask: both ? true : undefined,
        isPartialOf:
          placed.length > 1 ? { taskId: job.task.id, chunkIndex: idx, chunkCount: placed.length } : undefined,
      };
      for (const mid of targets) outBlocks[mid]?.push({ ...blk });
    });

    const scheduledBeforeDue =
      due == null
        ? placed.reduce((a, b) => a + (b.end - b.start) / MIN, 0)
        : placed.filter((b) => b.end <= due).reduce((a, b) => a + (b.end - b.start) / MIN, 0);
    if (scheduledBeforeDue + 1e-6 < job.minutes) {
      const mid = both ? members[0]?.id : job.task.assignee_id!;
      atRisk[mid]?.push({
        taskId: job.task.id,
        scheduledMinutes: Math.round(scheduledBeforeDue),
        requiredMinutes: job.minutes,
        dueDate: due != null ? new Date(due).toISOString() : null,
      });
    }

    const lastEnd = placed.length ? Math.max(...placed.map((b) => b.end)) : earliest;
    taskRunningEnd.set(job.task.id, Math.max(taskRunningEnd.get(job.task.id) ?? 0, lastEnd));
    const left = (jobsLeftPerTask.get(job.task.id) ?? 1) - 1;
    jobsLeftPerTask.set(job.task.id, left);
    if (left <= 0) taskEnd.set(job.task.id, taskRunningEnd.get(job.task.id) ?? lastEnd);
  }

  const result: Record<string, ScheduleResult> = {};
  for (const m of members) {
    outBlocks[m.id].sort((a, b) => a.start.localeCompare(b.start));
    result[m.id] = { blocks: outBlocks[m.id], atRisk: atRisk[m.id] };
  }
  return result;
}

/**
 * Single-member convenience wrapper (used by the unit tests). Delegates to
 * scheduleAll with one synthetic member.
 */
export function schedule(
  tasks: Task[],
  fixedEvents: FixedEvent[],
  workingHours: WorkingHours,
  settings: Settings,
  now: Date
): ScheduleResult {
  const M = "_solo";
  const member: Member = { id: M, name: "", color: "", working_hours: workingHours };
  const remapped = tasks.map((t) => ({
    ...t,
    assignee_id: t.assignee_id ? M : t.assignee_id,
    needs_both: false,
  }));
  const remappedEvents = fixedEvents.map((e) => ({ ...e, member_id: M }));
  return scheduleAll(remapped, remappedEvents, [member], settings, now)[M];
}
