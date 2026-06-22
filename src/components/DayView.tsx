import { useStore } from "../store/useStore";
import { useSchedules } from "../store/useSchedules";
import { useVisibleMembers } from "../store/selectors";
import { upNextTaskId } from "../lib/occurrences";
import TimelineColumn from "./TimelineColumn";

export default function DayView() {
  const anchor = new Date(useStore((s) => s.anchor));
  const planNow = useStore((s) => s.planNow);
  const fixedEvents = useStore((s) => s.fixedEvents);
  const { byMember, taskMap } = useSchedules();
  const members = useVisibleMembers();
  const now = new Date(planNow);

  if (members.length === 0) {
    return <Empty />;
  }

  return (
    <div className="grid h-full" style={{ gridTemplateColumns: `repeat(${members.length}, 1fr)` }}>
      {members.map((m) => {
        const blocks = byMember[m.id]?.blocks ?? [];
        const events = fixedEvents.filter((e) => e.member_id === m.id);
        const upNext = upNextTaskId(blocks, now);
        const both = members.length > 1;
        return (
          <section key={m.id} className="flex min-h-0 flex-col border-r border-ground-line last:border-r-0">
            <div
              className="flex items-center gap-2 border-b border-ground-line px-4 py-2 text-sm font-medium"
              style={{ color: m.color }}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: m.color }} />
              {m.name}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              <TimelineColumn
                day={anchor}
                member={m}
                blocks={blocks}
                events={events}
                taskMap={taskMap}
                upNextTaskId={upNext}
                tintBg={both}
              />
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Empty() {
  return (
    <div className="flex h-full items-center justify-center text-ink-soft">
      No members yet.
    </div>
  );
}
