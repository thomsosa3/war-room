import { format, isSameDay } from "date-fns";
import { useStore } from "../../store/useStore";
import { usePlanner } from "../../store/usePlanner";
import { weekDays } from "../../lib/occurrences";
import PlannerColumn from "./PlannerColumn";
import TaskPalette from "./TaskPalette";

const WEEK_PX = 44;

export default function PlannerView() {
  const view = useStore((s) => s.view); // "day" | "week"
  const anchor = new Date(useStore((s) => s.anchor));
  const planNow = useStore((s) => s.planNow);
  const projectFilter = useStore((s) => s.projectFilter);
  const { blocks, taskMap, projectMap } = usePlanner();
  const today = new Date(planNow);

  const shown = projectFilter === "all" ? blocks : blocks.filter((b) => taskMap[b.taskId]?.project_id === projectFilter);

  return (
    <div className="flex h-full min-h-0">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {view === "week" ? <WeekGrid days={weekDays(anchor)} blocks={shown} taskMap={taskMap} projectMap={projectMap} today={today} /> : (
          <div className="px-4 py-3">
            <PlannerColumn day={anchor} blocks={shown} taskMap={taskMap} projectMap={projectMap} pxPerHour={56} />
          </div>
        )}
      </div>

      <aside className="w-80 shrink-0 border-l border-ground-line bg-ground-raised">
        <TaskPalette />
      </aside>
    </div>
  );
}

function WeekGrid({
  days,
  blocks,
  taskMap,
  projectMap,
  today,
}: {
  days: Date[];
  blocks: ReturnType<typeof usePlanner>["blocks"];
  taskMap: ReturnType<typeof usePlanner>["taskMap"];
  projectMap: ReturnType<typeof usePlanner>["projectMap"];
  today: Date;
}) {
  // One shared hour range across the whole week so every column lines up with
  // the left time gutter.
  let minH = 7;
  let maxH = 21;
  for (const b of blocks) {
    const s = new Date(b.start);
    if (!days.some((d) => isSameDay(d, s))) continue;
    minH = Math.min(minH, s.getHours());
    maxH = Math.max(maxH, new Date(b.end).getHours() + 1);
  }
  minH = Math.max(0, minH);
  maxH = Math.min(24, Math.max(maxH, minH + 1));
  const hours = Array.from({ length: maxH - minH }, (_, i) => minH + i);
  const totalHeight = (maxH - minH) * WEEK_PX;

  return (
    <div>
      {/* header row: gutter spacer + day names */}
      <div className="flex">
        <div className="w-10 shrink-0" />
        <div className="grid flex-1 grid-cols-7">
          {days.map((d) => (
            <div key={d.toISOString()} className={`px-2 py-1.5 text-center text-[12px] ${isSameDay(d, today) ? "text-ember" : "text-ink-soft"}`}>
              <div className="font-medium">{format(d, "EEE")}</div>
              <div className="text-ink-faint">{format(d, "MMM d")}</div>
            </div>
          ))}
        </div>
      </div>

      {/* body row: time gutter + 7 columns (shared scale) */}
      <div className="flex pb-4">
        <div className="relative w-10 shrink-0" style={{ height: totalHeight }}>
          {hours.map((h, i) => (
            <span key={h} className="absolute right-1.5 text-[11px] tabular-nums text-ink-faint" style={{ top: i * WEEK_PX - 6 }}>
              {((h + 11) % 12) + 1}
              {h < 12 ? "a" : "p"}
            </span>
          ))}
        </div>
        <div className="grid flex-1 grid-cols-7">
          {days.map((d) => (
            <div key={d.toISOString()} className="border-r border-ground-line px-1 last:border-r-0">
              <PlannerColumn
                day={d}
                blocks={blocks}
                taskMap={taskMap}
                projectMap={projectMap}
                pxPerHour={WEEK_PX}
                compact
                rangeMin={minH}
                rangeMax={maxH}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
