import { useStore } from "../store/useStore";
import type { Material } from "../lib/types";

interface ShopItem {
  material: Material;
  source: { kind: "project" | "task"; id: string };
}

export default function ProjectsView() {
  const projects = useStore((s) => s.projects);
  const tasks = useStore((s) => s.tasks);
  const openEditor = useStore((s) => s.openEditor);
  const setView = useStore((s) => s.setView);
  const setProjectFilter = useStore((s) => s.setProjectFilter);
  const updateProject = useStore((s) => s.updateProject);
  const updateTask = useStore((s) => s.updateTask);

  const openProject = (id: string) => {
    setProjectFilter(id);
    setView("week");
  };

  // All materials for a project: its own + every task's, each tagged by source.
  const materialsFor = (projectId: string): ShopItem[] => {
    const items: ShopItem[] = [];
    const project = projects.find((p) => p.id === projectId);
    for (const m of project?.materials ?? []) items.push({ material: m, source: { kind: "project", id: projectId } });
    for (const t of tasks) {
      if (t.project_id !== projectId) continue;
      for (const m of t.materials ?? []) items.push({ material: m, source: { kind: "task", id: t.id } });
    }
    return items;
  };

  const toggle = (item: ShopItem) => {
    const flip = (list: Material[]) => list.map((x) => (x.id === item.material.id ? { ...x, bought: !x.bought } : x));
    if (item.source.kind === "project") {
      const p = projects.find((x) => x.id === item.source.id);
      if (p) updateProject(p.id, { materials: flip(p.materials ?? []) });
    } else {
      const t = tasks.find((x) => x.id === item.source.id);
      if (t) updateTask(t.id, { materials: flip(t.materials ?? []) });
    }
  };

  return (
    <div className="h-full overflow-y-auto px-5 py-4">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Projects</h2>
          <button
            onClick={() => openEditor({ kind: "project", project: null })}
            className="rounded-lg bg-pine px-3 py-1.5 text-sm font-medium text-white hover:bg-pine-soft"
          >
            + New project
          </button>
        </div>

        {projects.length === 0 ? (
          <div className="rounded-lg border border-dashed border-ground-line px-4 py-10 text-center text-sm text-ink-faint">
            No projects yet. Make one (e.g. <span className="text-ink">Victoria</span>) and tag tasks to it.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {projects.map((p) => {
              const list = tasks.filter((t) => t.project_id === p.id);
              const done = list.filter((t) => t.status === "done").length;
              const pct = list.length ? Math.round((done / list.length) * 100) : 0;
              const mats = materialsFor(p.id);
              const bought = mats.filter((m) => m.material.bought).length;
              return (
                <div key={p.id} className="rounded-xl border border-ground-line bg-ground-raised p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="grid h-5 w-5 place-items-center rounded-md text-[12px] font-semibold" style={{ background: `${p.color}33`, color: p.color }}>
                      {p.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="flex-1 font-medium">{p.name}</span>
                    <button onClick={() => openEditor({ kind: "project", project: p })} className="text-[12px] text-ink-faint hover:text-ink">
                      Edit
                    </button>
                  </div>
                  <div className="mb-1 text-[12px] text-ink-soft">
                    {done}/{list.length} tasks done · {pct}%
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-ground">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: p.color }} />
                  </div>
                  {mats.length > 0 && (
                    <p className="mt-2 text-[11px] text-ink-faint">
                      Materials: {bought}/{mats.length} bought
                    </p>
                  )}
                  <button onClick={() => openProject(p.id)} className="mt-3 w-full rounded-lg border border-ground-line py-1.5 text-[12px] text-ink-soft hover:text-ink">
                    Plan this project →
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Shopping list — project materials + every task's materials, still to buy */}
        {projects.some((p) => materialsFor(p.id).some((m) => !m.material.bought)) && (
          <section>
            <h3 className="mb-2 text-sm font-semibold">Shopping list — still to buy</h3>
            <div className="space-y-3">
              {projects.map((project) => {
                const items = materialsFor(project.id).filter((m) => !m.material.bought);
                if (!items.length) return null;
                return (
                  <div key={project.id}>
                    <div className="mb-1 flex items-center gap-2 text-[12px] text-ink-soft">
                      <span className="h-2 w-2 rounded-full" style={{ background: project.color }} />
                      {project.name}
                    </div>
                    <div className="space-y-1">
                      {items.map((item) => (
                        <label
                          key={`${item.source.kind}-${item.material.id}`}
                          className="flex cursor-pointer items-center gap-2 rounded-md border border-ground-line bg-ground-raised px-3 py-1.5 text-sm"
                        >
                          <input type="checkbox" checked={false} onChange={() => toggle(item)} className="h-4 w-4 accent-pine" />
                          <span className="flex-1">{item.material.name}</span>
                          {item.material.qty && <span className="text-[12px] text-ink-faint">{item.material.qty}</span>}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
