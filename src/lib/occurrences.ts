import { addDays, getDay, isSameDay, startOfDay } from "date-fns";
import type { FixedEvent, ScheduledBlock, Weekday } from "./types";

export interface EventOccurrence {
  event: FixedEvent;
  start: Date;
  end: Date;
}

/** Expand a member's fixed events (incl. weekly recurrence) that fall on `day`. */
export function eventsOnDay(events: FixedEvent[], day: Date): EventOccurrence[] {
  const out: EventOccurrence[] = [];
  for (const ev of events) {
    const start = new Date(ev.start_ts);
    const end = new Date(ev.end_ts);
    const durMs = end.getTime() - start.getTime();
    if (ev.recurrence?.freq === "weekly" && ev.recurrence.days?.length) {
      if (ev.recurrence.days.includes(getDay(day) as Weekday)) {
        const s = new Date(day);
        s.setHours(start.getHours(), start.getMinutes(), 0, 0);
        out.push({ event: ev, start: s, end: new Date(s.getTime() + durMs) });
      }
    } else if (isSameDay(start, day)) {
      out.push({ event: ev, start, end });
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Scheduled blocks that fall on `day`, sorted. */
export function blocksOnDay(blocks: ScheduledBlock[], day: Date): ScheduledBlock[] {
  return blocks
    .filter((b) => isSameDay(new Date(b.start), day))
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** The task the member is doing now, or does next — its taskId, or undefined. */
export function upNextTaskId(blocks: ScheduledBlock[], now: Date): string | undefined {
  const t = now.getTime();
  const sorted = [...blocks].sort((a, b) => a.start.localeCompare(b.start));
  // Currently in progress takes precedence.
  const current = sorted.find(
    (b) => new Date(b.start).getTime() <= t && new Date(b.end).getTime() > t
  );
  if (current) return current.taskId;
  const next = sorted.find((b) => new Date(b.start).getTime() > t);
  return next?.taskId;
}

/** Days [anchor .. anchor+6] for a week column view. */
export function weekDays(anchor: Date): Date[] {
  // Week starts on Sunday to match getDay()/working-hours indexing.
  const base = startOfDay(addDays(anchor, -getDay(anchor)));
  return Array.from({ length: 7 }, (_, i) => addDays(base, i));
}
