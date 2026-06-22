import { useStore } from "../store/useStore";
import { useSchedules } from "../store/useSchedules";
import { upNextTaskId } from "../lib/occurrences";

/** "Who's doing what today" — each person's current top task + at-risk count. */
export default function WarRoomStatus() {
  const members = useStore((s) => s.members);
  const planNow = useStore((s) => s.planNow);
  const { byMember, taskMap, atRiskCount } = useSchedules();
  const now = new Date(planNow);

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-ground-line bg-ground px-5 py-2 text-sm">
      <span className="text-ink-faint">Right now:</span>
      {members.map((m) => {
        const blocks = byMember[m.id]?.blocks ?? [];
        const todayBlocks = blocks.filter(
          (b) => new Date(b.start).toDateString() === now.toDateString()
        );
        const id = upNextTaskId(todayBlocks, now);
        const task = id ? taskMap[id] : undefined;
        return (
          <span key={m.id} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: m.color }} />
            <span style={{ color: m.color }}>{m.name}</span>
            <span className="text-ink">
              {task ? task.title : <span className="text-ink-faint">free</span>}
            </span>
          </span>
        );
      })}
      <span className="ml-auto">
        {atRiskCount > 0 ? (
          <span className="rounded-full border border-ember/50 bg-ember/10 px-2 py-0.5 text-ember">
            ⚠ {atRiskCount} at risk
          </span>
        ) : (
          <span className="text-ink-faint">nothing at risk</span>
        )}
      </span>
    </div>
  );
}
