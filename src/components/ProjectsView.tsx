import { differenceInCalendarDays, format } from "date-fns";
import { useStore } from "../store/useStore";
import { useSchedules } from "../store/useSchedules";
import { projectProgress } from "../lib/ui";
import type { Material } from "../lib/types";

export default function ProjectsView() {
  const projects = useStore((s) => s.projects);
  const tasks = useStore((s) => s.tasks);
  const planNow = useStore((s) => s.planNow);
  const openEditor = useStore((s) => s.openEditor);
  const setView = useStore((s) => s.setView);
  const setProjectFilter = useStore((s) => s.setProjectFilter);
  const updateProject = useStore((s) => s.updateProject);
  const { byMember, taskMap } = useSchedules();
  const today = new Date(planNow);

  // Latest scheduled end per project (to judge deadline risk).
  const latestEnd: Record<string, number> = {};
  for (const mid of Object.keys(byMember)) {
    for (const b of byMember[mid].blocks) {
      const pid = taskMap[b.taskId]?.project_id;
      if (!pid) continue;
      const e = new Date(b.end).getTime();
      latestEnd[pid] = Math.max(latestEnd[pid] ?? 0, e);
    }
  }

  const openProject = (id: string) => {
    setProjectFilter(id);
    setView("week");
  };

  const toggleMaterial = (projectId: string, materials: Material[], m: Material) => {
    updateProject(projectId, {
      materials: materials.map((x) => (x.id === m.id ? { ...x, bought: !x.bought } : x)),
    });
  };

  const shopping = projects
    .map((p) => ({ project: p, items: (p.materials ?? []).filter((m) => !m.bought) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="h-full overflow-y-auto px-5 py-4">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Summer projects</h2>
          <button
            onClick={() => openEditor({ kind: "project", project: null })}
            className="rounded-lg bg-pine px-3 py-1.5 text-sm font-medium text-white hover:bg-pine-soft"
          >
            + New project
          </button>
        </div>

        {projects.length === 0 ? (
          <div className="rounded-lg border border-dashed border-ground-line px-4 py-10 text-center text-sm text-ink-faint">
            No projects yet. Create <span className="text-ink">Fence</span>,{" "}
            <span className="text-ink">Garden beds</span>, and{" "}
            <span className="text-ink">Tree planting</span> to start planning the summer.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {projects.map((p) => {
              const prog = projectProgress(p.id, tasks);
              const end = latestEnd[p.id];
              const daysLeft = p.due_date ? differenceInCalendarDays(new Date(p.due_date), today) : null;
              const atRisk =
                p.due_date != null && end != null && end > new Date(p.due_date).getTime();
              return (
                <div key={p.id} className="rounded-xl border border-ground-line bg-ground-raised p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full" style={{ background: p.color }} />
                    <span className="flex-1 font-medium">{p.name}</span>
                    <button
                      onClick={() => openEditor({ kind: "project", project: p })}
                      className="text-[12px] text-ink-faint hover:text-ink"
                    >
                      Edit
                    </button>
                  </div>

                  <div className="mb-1 flex items-center justify-between text-[12px] text-ink-soft">
                    <span>
                      {prog.doneCount}/{prog.totalCount} tasks · {prog.pct}%
                    </span>
                    {p.due_date && (
                      <span className={atRisk ? "text-ember" : "text-ink-faint"}>
                        {atRisk ? "⚠ " : ""}
                        due {format(new Date(p.due_date), "MMM d")}
                        {daysLeft != null && daysLeft >= 0 ? ` · ${daysLeft}d left` : daysLeft != null ? " · overdue" : ""}
                      </span>
                    )}
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-ground">
                    <div className="h-full rounded-full" style={{ width: `${prog.pct}%`, background: p.color }} />
                  </div>
                  {atRisk && (
                    <p className="mt-1.5 text-[11px] text-ember">
                      On the current plan this finishes {format(new Date(end), "MMM d")} — after the target.
                    </p>
                  )}

                  {(p.materials?.length ?? 0) > 0 && (
                    <p className="mt-2 text-[11px] text-ink-faint">
                      Materials: {p.materials!.filter((m) => m.bought).length}/{p.materials!.length} bought
                    </p>
                  )}

                  <button
                    onClick={() => openProject(p.id)}
                    className="mt-3 w-full rounded-lg border border-ground-line py-1.5 text-[12px] text-ink-soft hover:text-ink"
                  >
                    View this project's schedule →
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Combined shopping list */}
        {shopping.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-semibold">Shopping list — still to buy</h3>
            <div className="space-y-3">
              {shopping.map(({ project, items }) => (
                <div key={project.id}>
                  <div className="mb-1 flex items-center gap-2 text-[12px] text-ink-soft">
                    <span className="h-2 w-2 rounded-full" style={{ background: project.color }} />
                    {project.name}
                  </div>
                  <div className="space-y-1">
                    {items.map((m) => (
                      <label
                        key={m.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md border border-ground-line bg-ground-raised px-3 py-1.5 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={false}
                          onChange={() => toggleMaterial(project.id, project.materials ?? [], m)}
                          className="h-4 w-4 accent-pine"
                        />
                        <span className="flex-1">{m.name}</span>
                        {m.qty && <span className="text-[12px] text-ink-faint">{m.qty}</span>}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
