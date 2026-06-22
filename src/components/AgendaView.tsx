import { format } from "date-fns";
import { useStore } from "../store/useStore";
import { useSchedules } from "../store/useSchedules";
import { useVisibleMembers } from "../store/selectors";
import type { Member, ScheduledBlock } from "../lib/types";
import { PRIORITY_COLOR, PRIORITY_LABEL, fmtRange, fmtDuration } from "../lib/ui";

interface Row {
  block: ScheduledBlock;
  member: Member;
}

export default function AgendaView() {
  const tasks = useStore((s) => s.tasks);
  const openEditor = useStore((s) => s.openEditor);
  const toggleDone = useStore((s) => s.toggleDone);
  const members = useStore((s) => s.members);
  const { byMember, taskMap, atRiskCount } = useSchedules();
  const visible = useVisibleMembers();

  // Flatten visible members' blocks, group by calendar date.
  const rows: Row[] = [];
  for (const m of visible) {
    for (const block of byMember[m.id]?.blocks ?? []) rows.push({ block, member: m });
  }
  rows.sort((a, b) => a.block.start.localeCompare(b.block.start));

  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = format(new Date(r.block.start), "yyyy-MM-dd");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const backlog = tasks.filter((t) => !t.assignee_id && t.status === "todo");
  const atRisk = visible.flatMap((m) =>
    (byMember[m.id]?.atRisk ?? []).map((a) => ({ ...a, member: m }))
  );

  return (
    <div className="h-full overflow-y-auto px-5 py-4">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* At risk */}
        {atRisk.length > 0 && (
          <section>
            <SectionHeader title={`At risk (${atRiskCount})`} accent />
            <div className="space-y-1.5">
              {atRisk.map((a) => {
                const t = taskMap[a.taskId];
                if (!t) return null;
                return (
                  <button
                    key={`${a.member.id}-${a.taskId}`}
                    onClick={() => openEditor({ kind: "task", task: t })}
                    className="flex w-full items-center gap-3 rounded-lg border border-ember/40 bg-ember/5 px-3 py-2 text-left"
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: a.member.color }} />
                    <span className="flex-1 truncate text-sm text-ink">{t.title}</span>
                    <span className="text-[12px] text-ember">
                      {fmtDuration(a.scheduledMinutes)} / {fmtDuration(a.requiredMinutes)} before{" "}
                      {a.dueDate ? format(new Date(a.dueDate), "MMM d") : "horizon"}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Backlog */}
        <section>
          <SectionHeader title={`Backlog — unassigned (${backlog.length})`} />
          {backlog.length === 0 ? (
            <Empty text="No unassigned tasks. Assign a task to a member and it gets scheduled." />
          ) : (
            <div className="space-y-1.5">
              {backlog.map((t) => (
                <button
                  key={t.id}
                  onClick={() => openEditor({ kind: "task", task: t })}
                  className="flex w-full items-center gap-3 rounded-lg border border-ground-line bg-ground-raised px-3 py-2 text-left"
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: PRIORITY_COLOR[t.priority] }}
                  />
                  <span className="flex-1 truncate text-sm">{t.title}</span>
                  <span className="text-[12px] text-ink-faint">
                    {PRIORITY_LABEL[t.priority]} · {fmtDuration(t.estimated_minutes)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Scheduled, grouped by date */}
        <section>
          <SectionHeader title="Scheduled" />
          {groups.size === 0 ? (
            <Empty text="No tasks yet — add one and it'll get scheduled." />
          ) : (
            <div className="space-y-4">
              {[...groups.entries()].map(([key, dayRows]) => (
                <div key={key}>
                  <div className="mb-1.5 text-[12px] font-medium uppercase tracking-wide text-ink-faint">
                    {format(new Date(key + "T00:00:00"), "EEEE, MMM d")}
                  </div>
                  <div className="space-y-1.5">
                    {dayRows.map((r, i) => {
                      const t = taskMap[r.block.taskId];
                      if (!t) return null;
                      return (
                        <div
                          key={`${r.block.taskId}-${i}`}
                          className="flex items-center gap-3 rounded-lg border border-ground-line bg-ground-raised px-3 py-2"
                        >
                          <input
                            type="checkbox"
                            checked={t.status === "done"}
                            onChange={() => toggleDone(t)}
                            className="h-4 w-4 accent-pine"
                            aria-label={`Mark ${t.title} done`}
                          />
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ background: members.find((m) => m.id === r.member.id)?.color }}
                          />
                          <button
                            onClick={() => openEditor({ kind: "task", task: t })}
                            className="flex-1 truncate text-left text-sm"
                          >
                            <span className={t.status === "done" ? "text-ink-faint line-through" : ""}>
                              {t.title}
                            </span>
                            {r.block.isPartialOf && (
                              <span className="ml-2 text-[11px] text-ink-faint">
                                ({r.block.isPartialOf.chunkIndex + 1}/{r.block.isPartialOf.chunkCount})
                              </span>
                            )}
                          </button>
                          {r.block.scheduledOutsideHours && (
                            <span className="text-[11px] text-ember">⚡ after hours</span>
                          )}
                          <span className="text-[12px] tabular-nums text-ink-soft">
                            {fmtRange(r.block.start, r.block.end)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function SectionHeader({ title, accent }: { title: string; accent?: boolean }) {
  return (
    <h2
      className={`mb-2 text-sm font-semibold ${accent ? "text-ember" : "text-ink"}`}
    >
      {title}
    </h2>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-ground-line px-4 py-6 text-center text-sm text-ink-faint">
      {text}
    </div>
  );
}
