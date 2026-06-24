import { addDays, addMonths, addWeeks, format } from "date-fns";
import { useStore, type ViewKind } from "../store/useStore";

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-ground-line bg-ground p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`rounded-md px-3 py-1 text-sm transition ${active ? "bg-ground-panel text-ink" : "text-ink-soft hover:text-ink"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export default function Header() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const anchor = useStore((s) => s.anchor);
  const setAnchor = useStore((s) => s.setAnchor);
  const openEditor = useStore((s) => s.openEditor);
  const syncMode = useStore((s) => s.syncMode);
  const projects = useStore((s) => s.projects);
  const projectFilter = useStore((s) => s.projectFilter);
  const setProjectFilter = useStore((s) => s.setProjectFilter);

  const anchorDate = new Date(anchor);
  const step = (dir: number) => {
    if (view === "month") setAnchor(addMonths(anchorDate, dir).toISOString());
    else if (view === "week") setAnchor(addWeeks(anchorDate, dir).toISOString());
    else setAnchor(addDays(anchorDate, dir).toISOString());
  };

  const title =
    view === "projects"
      ? "Projects"
      : view === "month"
      ? format(anchorDate, "MMMM yyyy")
      : view === "week"
      ? `Week of ${format(anchorDate, "MMM d, yyyy")}`
      : format(anchorDate, "EEEE, MMM d, yyyy");

  return (
    <header className="flex flex-col gap-3 border-b border-ground-line bg-ground-raised px-5 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-base font-semibold tracking-tight">War Room</span>
          <span
            className="rounded-full border border-ground-line px-2 py-0.5 text-[11px] text-ink-faint"
            title={syncMode === "supabase" ? "Live-syncing" : "Local only"}
          >
            {syncMode === "supabase" ? "● live sync" : "○ local only"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => openEditor({ kind: "task", task: null })}
            className="rounded-lg bg-pine px-3 py-1.5 text-sm font-medium text-white transition hover:bg-pine-soft"
          >
            + Task
          </button>
          <button
            onClick={() => openEditor({ kind: "project", project: null })}
            className="rounded-lg border border-ground-line px-3 py-1.5 text-sm text-ink-soft transition hover:text-ink"
          >
            + Project
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Segmented<ViewKind>
            options={[
              { value: "day", label: "Day" },
              { value: "week", label: "Week" },
              { value: "month", label: "Month" },
              { value: "projects", label: "Projects" },
            ]}
            value={view}
            onChange={setView}
          />
          {projects.length > 0 && view !== "projects" && (
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="rounded-lg border border-ground-line bg-ground px-2 py-1.5 text-sm text-ink-soft outline-none focus:border-pine"
              title="Filter to a project"
            >
              <option value="all">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center gap-2">
          {view !== "projects" && (
            <>
              <button onClick={() => step(-1)} className="rounded-md border border-ground-line px-2 py-1 text-sm text-ink-soft hover:text-ink" aria-label="Previous">
                ‹
              </button>
              <button onClick={() => setAnchor(new Date().toISOString())} className="rounded-md border border-ground-line px-3 py-1 text-sm text-ink-soft hover:text-ink">
                Today
              </button>
              <button onClick={() => step(1)} className="rounded-md border border-ground-line px-2 py-1 text-sm text-ink-soft hover:text-ink" aria-label="Next">
                ›
              </button>
            </>
          )}
        </div>
      </div>

      <div className="text-sm text-ink-soft">{title}</div>
    </header>
  );
}
