import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { useStore } from "../store/useStore";
import { useSchedules } from "../store/useSchedules";
import { useVisibleMembers } from "../store/selectors";
import type { Member, ScheduledBlock } from "../lib/types";
import { PRIORITY_COLOR } from "../lib/ui";
import { applyDragMove } from "../lib/manual";

interface Chip {
  taskId: string;
  title: string;
  member: Member;
  startMin: number; // minutes-since-midnight of the block (to preserve time on move)
  manualBlockId?: string;
  pinned: boolean;
  color: string;
}

export default function MonthView() {
  const anchor = new Date(useStore((s) => s.anchor));
  const planNow = useStore((s) => s.planNow);
  const setView = useStore((s) => s.setView);
  const setAnchor = useStore((s) => s.setAnchor);
  const openEditor = useStore((s) => s.openEditor);
  const updateTask = useStore((s) => s.updateTask);
  const { byMember, taskMap } = useSchedules();
  const members = useVisibleMembers();
  const today = new Date(planNow);

  const gridStart = startOfWeek(startOfMonth(anchor));
  const gridEnd = endOfWeek(endOfMonth(anchor));
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  // chips per day (one per task per day, earliest block)
  const chipsByDay = new Map<string, Chip[]>();
  for (const m of members) {
    for (const b of byMember[m.id]?.blocks ?? []) {
      const key = format(new Date(b.start), "yyyy-MM-dd");
      const task = taskMap[b.taskId];
      if (!task) continue;
      const list = chipsByDay.get(key) ?? [];
      if (list.some((c) => c.taskId === b.taskId && c.member.id === m.id)) continue; // dedupe chunks
      const start = new Date(b.start);
      list.push({
        taskId: b.taskId,
        title: task.title,
        member: m,
        startMin: start.getHours() * 60 + start.getMinutes(),
        manualBlockId: b.manualBlockId,
        pinned: Boolean((b as ScheduledBlock).pinned),
        color: PRIORITY_COLOR[task.priority],
      });
      chipsByDay.set(key, list);
    }
  }

  const onDrop = (e: React.DragEvent, day: Date) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("text/taskid");
    const min = Number(e.dataTransfer.getData("text/min") || 540); // default 9:00
    const blockId = e.dataTransfer.getData("text/blockid");
    const task = taskMap[taskId];
    if (!task) return;
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    start.setMinutes(isNaN(min) ? 540 : min);
    const block = { taskId, manualBlockId: blockId || undefined } as ScheduledBlock;
    updateTask(task.id, {
      manual_blocks: applyDragMove(task, block, start.toISOString()),
      pinned_start: null,
    });
  };

  const openDay = (day: Date) => {
    setAnchor(day.toISOString());
    setView("day");
  };

  return (
    <div className="flex h-full flex-col px-4 py-3">
      {/* weekday header */}
      <div className="grid grid-cols-7 border-b border-ground-line pb-1 text-[12px] text-ink-faint">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="px-2 text-center font-medium">
            {d}
          </div>
        ))}
      </div>

      <div
        className="grid min-h-0 flex-1 grid-cols-7"
        style={{ gridTemplateRows: `repeat(${days.length / 7}, minmax(0, 1fr))` }}
      >
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const chips = chipsByDay.get(key) ?? [];
          const inMonth = isSameMonth(day, anchor);
          const isToday = isSameDay(day, today);
          const shown = chips.slice(0, 4);
          return (
            <div
              key={key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDrop(e, day)}
              className={`flex min-h-0 flex-col border-b border-r border-ground-line/70 p-1 ${
                inMonth ? "" : "bg-ground/40"
              }`}
            >
              <button
                onClick={() => openDay(day)}
                className="mb-0.5 flex items-center justify-between px-1 text-left"
                title="Open this day"
              >
                <span
                  className={`text-[12px] ${
                    isToday
                      ? "flex h-5 w-5 items-center justify-center rounded-full bg-ember font-semibold text-ground"
                      : inMonth
                      ? "text-ink-soft"
                      : "text-ink-faint"
                  }`}
                >
                  {format(day, "d")}
                </span>
                {chips.length > 0 && (
                  <span className="text-[10px] text-ink-faint">{chips.length}</span>
                )}
              </button>

              <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
                {shown.map((c) => (
                  <div
                    key={`${c.taskId}-${c.member.id}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/taskid", c.taskId);
                      e.dataTransfer.setData("text/min", String(c.startMin));
                      if (c.manualBlockId) e.dataTransfer.setData("text/blockid", c.manualBlockId);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onClick={() => {
                      const t = taskMap[c.taskId];
                      if (t) openEditor({ kind: "task", task: t });
                    }}
                    title={`${c.title} — drag to another day to move`}
                    className="flex cursor-grab items-center gap-1 truncate rounded px-1 py-0.5 text-[11px] active:cursor-grabbing"
                    style={{ background: `${c.member.color}22`, borderLeft: `2px solid ${c.color}` }}
                  >
                    {c.pinned && <span className="text-[9px]">📌</span>}
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: c.member.color }} />
                    <span className="truncate text-ink">{c.title}</span>
                  </div>
                ))}
                {chips.length > shown.length && (
                  <button
                    onClick={() => openDay(day)}
                    className="px-1 text-left text-[10px] text-ink-faint hover:text-ink"
                  >
                    +{chips.length - shown.length} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
