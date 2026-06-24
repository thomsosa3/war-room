import { format, isSameDay } from "date-fns";
import { useStore } from "../../store/useStore";
import { usePlanner } from "../../store/usePlanner";
import { weekDays } from "../../lib/occurrences";
import PlannerColumn from "./PlannerColumn";
import TaskPalette from "./TaskPalette";

export default function PlannerView() {
  const view = useStore((s) => s.view); // "day" | "week"
  const anchor = new Date(useStore((s) => s.anchor));
  const planNow = useStore((s) => s.planNow);
  const projectFilter = useStore((s) => s.projectFilter);
  const { blocks, taskMap, projectMap } = usePlanner();
  const today = new Date(planNow);

  const shown = projectFilter === "all" ? blocks : blocks.filter((b) => taskMap[b.taskId]?.project_id === projectFilter);
  const days = view === "week" ? weekDays(anchor) : [anchor];

  return (
    <div className="flex h-full min-h-0">
      {/* calendar */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {view === "week" ? (
          <div className="grid grid-cols-7">
            {days.map((d) => (
              <div key={d.toISOString()} className="border-r border-ground-line last:border-r-0">
                <div className={`px-2 py-1.5 text-center text-[12px] ${isSameDay(d, today) ? "text-ember" : "text-ink-soft"}`}>
                  <div className="font-medium">{format(d, "EEE")}</div>
                  <div className="text-ink-faint">{format(d, "MMM d")}</div>
                </div>
                <div className="px-1 pb-4">
                  <PlannerColumn day={d} blocks={shown} taskMap={taskMap} projectMap={projectMap} pxPerHour={44} compact />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-4 py-3">
            <PlannerColumn day={anchor} blocks={shown} taskMap={taskMap} projectMap={projectMap} pxPerHour={56} />
          </div>
        )}
      </div>

      {/* palette */}
      <aside className="w-80 shrink-0 border-l border-ground-line bg-ground-raised">
        <TaskPalette />
      </aside>
    </div>
  );
}
