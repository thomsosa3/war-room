import { useEffect, useReducer, useRef, useState } from "react";
import { format, isSameDay } from "date-fns";
import type { FixedEvent, Member, ScheduledBlock, Task } from "../lib/types";
import { blocksOnDay, eventsOnDay } from "../lib/occurrences";
import { EVENT_COLOR, PRIORITY_COLOR, fmtRange, tint } from "../lib/ui";
import { useStore } from "../store/useStore";

interface Props {
  day: Date;
  member: Member;
  blocks: ScheduledBlock[];
  events: FixedEvent[];
  taskMap: Record<string, Task>;
  pxPerHour?: number;
  compact?: boolean;
  upNextTaskId?: string;
  tintBg?: boolean; // member-tint the column background (Both mode)
  /** Drag-to-pin: drop a block at a new start time on this day. */
  onMove?: (taskId: string, newStart: Date) => void;
}

function minutesSinceMidnight(d: Date) {
  return d.getHours() * 60 + d.getMinutes();
}

const SNAP_MIN = 15;

interface DragState {
  taskId: string;
  key: string;
  durationMin: number;
  grabOffset: number; // px from block top to pointer
  startClientY: number;
  topPx: number; // live top of the dragged block
  moved: boolean;
}

export default function TimelineColumn({
  day,
  member,
  blocks,
  events,
  taskMap,
  pxPerHour = 56,
  compact = false,
  upNextTaskId,
  tintBg = false,
  onMove,
}: Props) {
  const openEditor = useStore((s) => s.openEditor);
  const innerRef = useRef<HTMLDivElement>(null);
  // Drag lives in a ref so the move/up handlers always read the latest value
  // (state closures can be stale across batched pointer events); `force` just
  // re-renders the dragged block at its live position.
  const dragRef = useRef<DragState | null>(null);
  const [, force] = useReducer((n: number) => n + 1, 0);

  const dayBlocks = blocksOnDay(blocks, day);
  const dayEvents = eventsOnDay(events, day);

  // live "now" tick
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Dynamic hour range so outside-hours blocks (e.g. 6 PM) are visible.
  let minH = 7;
  let maxH = 22;
  for (const b of dayBlocks) {
    minH = Math.min(minH, new Date(b.start).getHours());
    maxH = Math.max(maxH, new Date(b.end).getHours() + 1);
  }
  for (const e of dayEvents) {
    minH = Math.min(minH, e.start.getHours());
    maxH = Math.max(maxH, e.end.getHours() + 1);
  }
  minH = Math.max(0, minH);
  maxH = Math.min(24, Math.max(maxH, minH + 1));

  const topFor = (d: Date) => ((minutesSinceMidnight(d) - minH * 60) / 60) * pxPerHour;
  const heightFor = (s: Date, e: Date) =>
    Math.max(14, ((e.getTime() - s.getTime()) / 3_600_000) * pxPerHour);

  const hours = Array.from({ length: maxH - minH }, (_, i) => minH + i);
  const totalHeight = (maxH - minH) * pxPerHour;
  const showNow = isSameDay(day, now);

  // Convert a live top px (within the inner container) to a snapped start time.
  const snappedMinutes = (topPx: number, durationMin: number) => {
    const raw = minH * 60 + (topPx / pxPerHour) * 60;
    const snapped = Math.round(raw / SNAP_MIN) * SNAP_MIN;
    return Math.max(0, Math.min(snapped, 24 * 60 - durationMin));
  };
  const dateAtMinutes = (mins: number) => {
    const d = new Date(day);
    d.setHours(0, 0, 0, 0);
    d.setMinutes(mins);
    return d;
  };

  const onPointerDown = (
    e: React.PointerEvent,
    b: ScheduledBlock,
    key: string,
    s: Date,
    end: Date
  ) => {
    if (!onMove || e.button !== 0) return;
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* some pointers/browsers can't capture — drag still works without it */
    }
    const innerTop = innerRef.current?.getBoundingClientRect().top ?? 0;
    const blockTop = topFor(s);
    dragRef.current = {
      taskId: b.taskId,
      key,
      durationMin: (end.getTime() - s.getTime()) / 60000,
      grabOffset: e.clientY - (innerTop + blockTop),
      startClientY: e.clientY,
      topPx: blockTop,
      moved: false,
    };
    force();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const innerTop = innerRef.current?.getBoundingClientRect().top ?? 0;
    drag.topPx = e.clientY - innerTop - drag.grabOffset;
    drag.moved = drag.moved || Math.abs(e.clientY - drag.startClientY) > 3;
    force();
  };

  const onPointerUp = (b: ScheduledBlock, task: Task) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.moved && onMove) {
      const mins = snappedMinutes(drag.topPx, drag.durationMin);
      onMove(b.taskId, dateAtMinutes(mins));
    } else {
      openEditor({ kind: "task", task });
    }
    dragRef.current = null;
    force();
  };

  const drag = dragRef.current;

  return (
    <div
      className="relative"
      style={{
        height: totalHeight,
        background: tintBg ? tint(member.color, 0.05) : undefined,
      }}
    >
      {/* hour grid */}
      {hours.map((h, i) => (
        <div
          key={h}
          className="absolute left-0 right-0 border-t border-ground-line/60"
          style={{ top: i * pxPerHour }}
        >
          {!compact && (
            <span className="absolute -top-2 left-1 text-[11px] tabular-nums text-ink-faint">
              {((h + 11) % 12) + 1}
              {h < 12 ? "a" : "p"}
            </span>
          )}
        </div>
      ))}

      <div ref={innerRef} className="absolute inset-y-0" style={{ left: compact ? 4 : 34, right: 4 }}>
        {/* fixed events */}
        {dayEvents.map((occ, i) => (
          <button
            key={`${occ.event.id}-${i}`}
            onClick={() => openEditor({ kind: "event", event: occ.event })}
            className="absolute left-0 right-0 overflow-hidden rounded-md border px-2 py-1 text-left"
            style={{
              top: topFor(occ.start),
              height: heightFor(occ.start, occ.end),
              background: tint(EVENT_COLOR[occ.event.type], 0.28),
              borderColor: EVENT_COLOR[occ.event.type],
            }}
            title={`${occ.event.title} · ${fmtRange(occ.start.toISOString(), occ.end.toISOString())}`}
          >
            <div className="truncate text-[12px] font-medium text-ink">{occ.event.title}</div>
            {!compact && (
              <div className="truncate text-[11px] text-ink-soft">
                {fmtRange(occ.start.toISOString(), occ.end.toISOString())}
              </div>
            )}
          </button>
        ))}

        {/* scheduled task blocks */}
        {dayBlocks.map((b, i) => {
          const task = taskMap[b.taskId];
          if (!task) return null;
          const color = PRIORITY_COLOR[task.priority];
          const s = new Date(b.start);
          const e = new Date(b.end);
          const key = `${b.taskId}-${i}`;
          const isUpNext = task.id === upNextTaskId;
          const isDragging = drag?.key === key;
          const top = isDragging ? drag!.topPx : topFor(s);
          const dragMins = isDragging ? snappedMinutes(drag!.topPx, drag!.durationMin) : 0;
          return (
            <div
              key={key}
              role="button"
              tabIndex={0}
              onPointerDown={(ev) => onPointerDown(ev, b, key, s, e)}
              onPointerMove={onPointerMove}
              onPointerUp={() => onPointerUp(b, task)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") openEditor({ kind: "task", task });
              }}
              className={`absolute left-0 right-0 overflow-hidden rounded-md border px-2 py-1 text-left transition-shadow ${
                onMove ? "cursor-grab active:cursor-grabbing" : ""
              }`}
              style={{
                top,
                height: heightFor(s, e),
                background: tint(color, 0.22),
                borderColor: isUpNext ? "#e0913f" : color,
                borderStyle: b.pinned ? "solid" : "dashed",
                boxShadow: isDragging
                  ? "0 6px 16px rgba(0,0,0,0.45)"
                  : isUpNext
                  ? "0 0 0 1px #e0913f"
                  : undefined,
                opacity: isDragging ? 0.95 : 1,
                touchAction: "none",
                zIndex: isDragging ? 20 : undefined,
              }}
              title={`${task.title} · ${fmtRange(b.start, b.end)}${
                b.pinned ? " · pinned (drag to move, unpin in editor)" : " · drag to pin to a time"
              }${b.scheduledOutsideHours ? " · outside hours" : ""}`}
            >
              <div className="flex items-center gap-1">
                {b.pinned ? (
                  <span className="shrink-0 text-[10px]" aria-label="pinned">
                    📌
                  </span>
                ) : (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
                )}
                <span
                  className={`truncate text-[12px] font-medium ${
                    task.status === "done" ? "text-ink-faint line-through" : "text-ink"
                  }`}
                >
                  {task.title}
                </span>
                {b.isPartialOf && (
                  <span className="ml-auto shrink-0 text-[10px] text-ink-faint">
                    {b.isPartialOf.chunkIndex + 1}/{b.isPartialOf.chunkCount}
                  </span>
                )}
              </div>
              {!compact && (
                <div className="flex items-center gap-1.5 truncate text-[11px] text-ink-soft">
                  {isDragging
                    ? `→ ${format(dateAtMinutes(dragMins), "h:mm a")}`
                    : fmtRange(b.start, b.end)}
                  {b.pinned && !isDragging && <span className="text-pine">pinned</span>}
                  {b.scheduledOutsideHours && (
                    <span className="text-ember" title="Placed outside working hours to hit a hard deadline">
                      ⚡ after hours
                    </span>
                  )}
                  {isUpNext && <span className="text-ember">· up next</span>}
                </div>
              )}
            </div>
          );
        })}

        {dayBlocks.length === 0 && dayEvents.length === 0 && !compact && (
          <div className="absolute left-0 top-2 text-[12px] text-ink-faint">
            Nothing scheduled.
          </div>
        )}
      </div>

      {/* now line */}
      {showNow && (
        <div
          className="pointer-events-none absolute left-0 right-0 z-10"
          style={{ top: topFor(now) }}
        >
          <div className="relative">
            <div className="absolute -left-0.5 -top-1 h-2 w-2 rounded-full bg-ember" />
            <div className="border-t border-ember" />
            {!compact && (
              <span className="absolute right-1 -top-2 rounded bg-ground px-1 text-[10px] font-medium text-ember">
                now
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
