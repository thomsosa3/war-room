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
import { usePlanner } from "../store/usePlanner";
import { resolveManualBlocks } from "../lib/manual";
import { projectTag, taskColor } from "../lib/ui";
import { getDrag, setDrag } from "./planner/dragState";

interface Chip {
  taskId: string;
  blockId?: string;
  title: string;
  startMin: number;
  color: string;
  starred: boolean;
  tag: { letter: string; color: string } | null;
}

export default function MonthView() {
  const anchor = new Date(useStore((s) => s.anchor));
  const planNow = useStore((s) => s.planNow);
  const setView = useStore((s) => s.setView);
  const setAnchor = useStore((s) => s.setAnchor);
  const openEditor = useStore((s) => s.openEditor);
  const moveTaskBlock = useStore((s) => s.moveTaskBlock);
  const projectFilter = useStore((s) => s.projectFilter);
  const { blocks, taskMap, projectMap } = usePlanner();
  const today = new Date(planNow);

  const gridStart = startOfWeek(startOfMonth(anchor));
  const gridEnd = endOfWeek(endOfMonth(anchor));
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const chipsByDay = new Map<string, Chip[]>();
  for (const b of blocks) {
    const task = taskMap[b.taskId];
    if (!task) continue;
    if (projectFilter !== "all" && task.project_id !== projectFilter) continue;
    const key = format(new Date(b.start), "yyyy-MM-dd");
    const list = chipsByDay.get(key) ?? [];
    const start = new Date(b.start);
    list.push({
      taskId: b.taskId,
      blockId: b.manualBlockId,
      title: task.title,
      startMin: start.getHours() * 60 + start.getMinutes(),
      color: taskColor(task),
      starred: !!task.starred,
      tag: projectTag(task, projectMap),
    });
    chipsByDay.set(key, list);
  }

  const onDrop = (e: React.DragEvent, day: Date) => {
    e.preventDefault();
    const d = getDrag();
    setDrag(null);
    if (!d?.blockId) return;
    const task = taskMap[d.taskId];
    const block = task && resolveManualBlocks(task).find((x) => x.id === d.blockId);
    if (!task || !block) return;
    const orig = new Date(block.start);
    const start = new Date(day);
    start.setHours(orig.getHours(), orig.getMinutes(), 0, 0);
    moveTaskBlock(task.id, d.blockId, start.toISOString());
  };

  const openDay = (day: Date) => {
    setAnchor(day.toISOString());
    setView("day");
  };

  return (
    <div className="flex h-full flex-col px-4 py-3">
      <div className="grid grid-cols-7 border-b border-ground-line pb-1 text-[12px] text-ink-faint">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="px-2 text-center font-medium">
            {d}
          </div>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-7" style={{ gridTemplateRows: `repeat(${days.length / 7}, minmax(0, 1fr))` }}>
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const chips = (chipsByDay.get(key) ?? []).sort((a, b) => a.startMin - b.startMin);
          const inMonth = isSameMonth(day, anchor);
          const isToday = isSameDay(day, today);
          const shown = chips.slice(0, 4);
          return (
            <div
              key={key}
              onDragOver={(e) => getDrag()?.blockId && e.preventDefault()}
              onDrop={(e) => onDrop(e, day)}
              className={`flex min-h-0 flex-col border-b border-r border-ground-line/70 p-1 ${inMonth ? "" : "bg-ground/40"}`}
            >
              <button onClick={() => openDay(day)} className="mb-0.5 flex items-center justify-between px-1 text-left" title="Open this day">
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
                {chips.length > 0 && <span className="text-[10px] text-ink-faint">{chips.length}</span>}
              </button>

              <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
                {shown.map((c, i) => (
                  <div
                    key={`${c.blockId}-${i}`}
                    draggable
                    onDragStart={(e) => {
                      setDrag({ taskId: c.taskId, blockId: c.blockId, minutes: 60, grabOffsetPx: 0 });
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", c.title);
                    }}
                    onDragEnd={() => setDrag(null)}
                    onClick={() => {
                      const t = taskMap[c.taskId];
                      if (t) openEditor({ kind: "task", task: t });
                    }}
                    title={`${c.title} — drag to another day to move`}
                    className="flex cursor-grab items-center gap-1 truncate rounded px-1 py-0.5 text-[11px] active:cursor-grabbing"
                    style={{ background: `${c.color}22`, borderLeft: `2px solid ${c.color}` }}
                  >
                    {c.starred && <span className="text-[9px] text-ember">★</span>}
                    <span className="flex-1 truncate text-ink">{c.title}</span>
                    {c.tag && <span className="shrink-0 text-[10px] font-semibold" style={{ color: c.tag.color }}>{c.tag.letter}</span>}
                  </div>
                ))}
                {chips.length > shown.length && (
                  <button onClick={() => openDay(day)} className="px-1 text-left text-[10px] text-ink-faint hover:text-ink">
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
