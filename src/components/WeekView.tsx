import { format, isSameDay } from "date-fns";
import { useStore } from "../store/useStore";
import { useSchedules } from "../store/useSchedules";
import { useVisibleMembers } from "../store/selectors";
import { weekDays } from "../lib/occurrences";
import TimelineColumn from "./TimelineColumn";

export default function WeekView() {
  const anchor = new Date(useStore((s) => s.anchor));
  const planNow = useStore((s) => s.planNow);
  const fixedEvents = useStore((s) => s.fixedEvents);
  const updateTask = useStore((s) => s.updateTask);
  const { byMember, taskMap } = useSchedules();
  const members = useVisibleMembers();
  const days = weekDays(anchor);
  const today = new Date(planNow);
  const pinTo = (taskId: string, newStart: Date) =>
    updateTask(taskId, { pinned_start: newStart.toISOString() });

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {members.map((m) => {
        const blocks = byMember[m.id]?.blocks ?? [];
        const events = fixedEvents.filter((e) => e.member_id === m.id);
        return (
          <section key={m.id} className="border-b border-ground-line">
            {members.length > 1 && (
              <div
                className="sticky top-0 z-10 flex items-center gap-2 bg-ground-raised px-4 py-1.5 text-sm font-medium"
                style={{ color: m.color }}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: m.color }} />
                {m.name}
              </div>
            )}
            <div className="grid grid-cols-7">
              {days.map((d) => (
                <div key={d.toISOString()} className="border-r border-ground-line last:border-r-0">
                  <div
                    className={`px-2 py-1.5 text-center text-[12px] ${
                      isSameDay(d, today) ? "text-ember" : "text-ink-soft"
                    }`}
                  >
                    <div className="font-medium">{format(d, "EEE")}</div>
                    <div className="text-ink-faint">{format(d, "MMM d")}</div>
                  </div>
                  <div className="px-1 pb-3">
                    <TimelineColumn
                      day={d}
                      member={m}
                      blocks={blocks}
                      events={events}
                      taskMap={taskMap}
                      pxPerHour={32}
                      compact
                      tintBg={members.length > 1}
                      onMove={pinTo}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
