import { useEffect, useReducer, useRef, useState } from "react";
import { isSameDay } from "date-fns";
import type { Project, ScheduledBlock, Task } from "../../lib/types";
import { blocksOnDay } from "../../lib/occurrences";
import { fmtRange, taskColor, tint } from "../../lib/ui";
import { useStore } from "../../store/useStore";
import { getDrag, setDrag, SNAP_MIN } from "./dragState";

interface Props {
  day: Date;
  blocks: ScheduledBlock[];
  taskMap: Record<string, Task>;
  projectMap: Record<string, Project>;
  pxPerHour?: number;
  compact?: boolean;
}

interface Menu {
  x: number;
  y: number;
  block: ScheduledBlock;
  task: Task;
}

function minutesSinceMidnight(d: Date) {
  return d.getHours() * 60 + d.getMinutes();
}

export default function PlannerColumn({
  day,
  blocks,
  taskMap,
  projectMap,
  pxPerHour = 56,
  compact = false,
}: Props) {
  const openEditor = useStore((s) => s.openEditor);
  const addTaskBlock = useStore((s) => s.addTaskBlock);
  const moveTaskBlock = useStore((s) => s.moveTaskBlock);
  const resizeTaskBlock = useStore((s) => s.resizeTaskBlock);
  const duplicateTaskBlock = useStore((s) => s.duplicateTaskBlock);
  const removeTaskBlock = useStore((s) => s.removeTaskBlock);
  const toggleStar = useStore((s) => s.toggleStar);
  const toggleDone = useStore((s) => s.toggleDone);

  const innerRef = useRef<HTMLDivElement>(null);
  const dayBlocks = blocksOnDay(blocks, day);

  // live "now" tick
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // resize state (pointer)
  const resizeRef = useRef<{ block: ScheduledBlock; startY: number; startMin: number; minutes: number } | null>(null);
  const [, force] = useReducer((n: number) => n + 1, 0);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [dropY, setDropY] = useState<number | null>(null);

  // hour range — fit the day's blocks, default 7..21
  let minH = 7;
  let maxH = 21;
  for (const b of dayBlocks) {
    minH = Math.min(minH, new Date(b.start).getHours());
    maxH = Math.max(maxH, new Date(b.end).getHours() + 1);
  }
  minH = Math.max(0, minH);
  maxH = Math.min(24, Math.max(maxH, minH + 1));

  const topFor = (d: Date) => ((minutesSinceMidnight(d) - minH * 60) / 60) * pxPerHour;
  const minsToPx = (m: number) => (m / 60) * pxPerHour;
  const hours = Array.from({ length: maxH - minH }, (_, i) => minH + i);
  const totalHeight = (maxH - minH) * pxPerHour;
  const showNow = isSameDay(day, now);

  const snap = (mins: number) => Math.round(mins / SNAP_MIN) * SNAP_MIN;
  const minutesAtClientY = (clientY: number, offsetPx = 0) => {
    const top = innerRef.current?.getBoundingClientRect().top ?? 0;
    const px = clientY - top - offsetPx;
    return Math.max(0, Math.min(snap(minH * 60 + (px / pxPerHour) * 60), 24 * 60 - SNAP_MIN));
  };
  const dateAt = (mins: number) => {
    const d = new Date(day);
    d.setHours(0, 0, 0, 0);
    d.setMinutes(mins);
    return d;
  };

  // ---- HTML5 drop (palette item or moving a block) ----
  const onDragOver = (e: React.DragEvent) => {
    if (!getDrag()) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const d = getDrag()!;
    setDropY(minsToPx(minutesAtClientY(e.clientY, d.grabOffsetPx) - minH * 60));
  };
  const onDrop = (e: React.DragEvent) => {
    const d = getDrag();
    setDropY(null);
    if (!d) return;
    e.preventDefault();
    const mins = minutesAtClientY(e.clientY, d.grabOffsetPx);
    const start = dateAt(mins).toISOString();
    if (d.blockId) moveTaskBlock(d.taskId, d.blockId, start);
    else addTaskBlock(d.taskId, start, d.minutes);
    setDrag(null);
  };

  // ---- resize via bottom edge (pointer) ----
  const onResizeDown = (e: React.PointerEvent, block: ScheduledBlock) => {
    e.stopPropagation();
    e.preventDefault();
    const mins = (new Date(block.end).getTime() - new Date(block.start).getTime()) / 60000;
    resizeRef.current = { block, startY: e.clientY, startMin: mins, minutes: mins };
    try {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
    force();
  };
  const onResizeMove = (e: React.PointerEvent) => {
    const r = resizeRef.current;
    if (!r) return;
    const deltaMin = ((e.clientY - r.startY) / pxPerHour) * 60;
    r.minutes = Math.max(SNAP_MIN, snap(r.startMin + deltaMin));
    force();
  };
  const onResizeUp = () => {
    const r = resizeRef.current;
    if (!r) return;
    resizeTaskBlock(r.block.taskId, r.block.manualBlockId!, r.minutes);
    resizeRef.current = null;
    force();
  };

  return (
    <div
      className="relative"
      style={{ height: totalHeight }}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragLeave={() => setDropY(null)}
    >
      {hours.map((h, i) => (
        <div key={h} className="absolute left-0 right-0 border-t border-ground-line/60" style={{ top: i * pxPerHour }}>
          {!compact && (
            <span className="absolute -top-2 left-1 text-[11px] tabular-nums text-ink-faint">
              {((h + 11) % 12) + 1}
              {h < 12 ? "a" : "p"}
            </span>
          )}
        </div>
      ))}

      {dropY != null && (
        <div className="pointer-events-none absolute left-8 right-1 z-30 rounded border border-dashed border-pine" style={{ top: dropY, height: minsToPx(60) }} />
      )}

      <div ref={innerRef} className="absolute inset-y-0" style={{ left: compact ? 4 : 34, right: 4 }}>
        {dayBlocks.map((b, i) => {
          const task = taskMap[b.taskId];
          if (!task) return null;
          const color = taskColor(task, projectMap);
          const s = new Date(b.start);
          const isResizing = resizeRef.current?.block.manualBlockId === b.manualBlockId;
          const minutes = isResizing
            ? resizeRef.current!.minutes
            : (new Date(b.end).getTime() - s.getTime()) / 60000;
          const height = Math.max(20, minsToPx(minutes));
          return (
            <div
              key={`${b.manualBlockId}-${i}`}
              draggable
              onDragStart={(e) => {
                const top = innerRef.current?.getBoundingClientRect().top ?? 0;
                setDrag({
                  taskId: b.taskId,
                  blockId: b.manualBlockId,
                  minutes,
                  grabOffsetPx: e.clientY - (top + topFor(s)),
                });
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", task.title);
              }}
              onDragEnd={() => setDrag(null)}
              onClick={() => openEditor({ kind: "task", task })}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY, block: b, task });
              }}
              className="group absolute left-0 right-0 cursor-grab overflow-hidden rounded-md border px-2 py-1 text-left active:cursor-grabbing"
              style={{
                top: topFor(s),
                height,
                background: tint(color, 0.24),
                borderColor: color,
                boxShadow: task.starred ? "0 0 0 1px #e0913f, 0 0 8px rgba(224,145,63,0.35)" : undefined,
                zIndex: isResizing ? 20 : undefined,
              }}
              title={`${task.title} · ${fmtRange(b.start, new Date(s.getTime() + minutes * 60000).toISOString())}`}
            >
              <div className="flex items-center gap-1">
                <span className="truncate text-[12px] font-medium text-ink">{task.title}</span>
                {b.isPartialOf && (
                  <span className="ml-auto shrink-0 text-[10px] text-ink-faint">
                    {b.isPartialOf.chunkIndex + 1}/{b.isPartialOf.chunkCount}
                  </span>
                )}
                {task.starred && <span className="ml-auto shrink-0 text-[10px] text-ember">★</span>}
              </div>
              {!compact && height > 32 && (
                <div className="truncate text-[11px] text-ink-soft">
                  {fmtRange(b.start, new Date(s.getTime() + minutes * 60000).toISOString())}
                </div>
              )}
              {/* resize handle */}
              <div
                onPointerDown={(e) => onResizeDown(e, b)}
                onPointerMove={onResizeMove}
                onPointerUp={onResizeUp}
                draggable={false}
                onDragStart={(e) => e.preventDefault()}
                className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
                style={{ touchAction: "none" }}
                title="Drag to resize"
              />
            </div>
          );
        })}

        {dayBlocks.length === 0 && !compact && (
          <div className="absolute left-0 top-2 text-[12px] text-ink-faint">Drag a task here.</div>
        )}
      </div>

      {showNow && (
        <div className="pointer-events-none absolute left-0 right-0 z-10" style={{ top: topFor(now) }}>
          <div className="relative">
            <div className="absolute -left-0.5 -top-1 h-2 w-2 rounded-full bg-ember" />
            <div className="border-t border-ember" />
          </div>
        </div>
      )}

      {menu && (
        <ContextMenu
          menu={menu}
          onClose={() => setMenu(null)}
          actions={{
            edit: () => openEditor({ kind: "task", task: menu.task }),
            addBlock: () => duplicateTaskBlock(menu.block.taskId, menu.block.manualBlockId!),
            markDone: () => toggleDone(menu.task),
            del: () => removeTaskBlock(menu.block.taskId, menu.block.manualBlockId!),
            star: () => toggleStar(menu.task.id),
          }}
          starred={!!menu.task.starred}
        />
      )}
    </div>
  );
}

function ContextMenu({
  menu,
  onClose,
  actions,
  starred,
}: {
  menu: Menu;
  onClose: () => void;
  actions: { edit: () => void; addBlock: () => void; markDone: () => void; del: () => void; star: () => void };
  starred: boolean;
}) {
  useEffect(() => {
    const h = () => onClose();
    window.addEventListener("click", h);
    window.addEventListener("scroll", h, true);
    return () => {
      window.removeEventListener("click", h);
      window.removeEventListener("scroll", h, true);
    };
  }, [onClose]);

  const item = (label: string, fn: () => void) => (
    <button
      onClick={() => {
        fn();
        onClose();
      }}
      className="block w-full px-3 py-1.5 text-left text-[13px] text-ink-soft hover:bg-ground-panel hover:text-ink"
    >
      {label}
    </button>
  );

  return (
    <div
      className="fixed z-50 w-44 overflow-hidden rounded-lg border border-ground-line bg-ground-raised py-1 shadow-2xl"
      style={{ left: Math.min(menu.x, window.innerWidth - 190), top: Math.min(menu.y, window.innerHeight - 200) }}
      onClick={(e) => e.stopPropagation()}
    >
      {item("Add another block", actions.addBlock)}
      {item(starred ? "Unstar" : "★ Star", actions.star)}
      {item("Mark done", actions.markDone)}
      {item("Edit task…", actions.edit)}
      <div className="my-1 border-t border-ground-line" />
      {item("Delete this block", actions.del)}
    </div>
  );
}
