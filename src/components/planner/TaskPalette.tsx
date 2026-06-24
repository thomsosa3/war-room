import { useState } from "react";
import { format } from "date-fns";
import { useStore } from "../../store/useStore";
import { usePlanner } from "../../store/usePlanner";
import { taskColor } from "../../lib/ui";
import type { Task } from "../../lib/types";
import { setDrag } from "./dragState";
import { DEFAULT_BLOCK_MIN } from "../../lib/manual";

export default function TaskPalette() {
  const { unassigned, planned, completed, projectMap } = usePlanner();
  const projects = useStore((s) => s.projects);
  const projectFilter = useStore((s) => s.projectFilter);
  const quickAdd = useStore((s) => s.quickAdd);
  const toggleStar = useStore((s) => s.toggleStar);
  const toggleDone = useStore((s) => s.toggleDone);
  const deleteTask = useStore((s) => s.deleteTask);
  const openEditor = useStore((s) => s.openEditor);

  const [title, setTitle] = useState("");
  const [qProject, setQProject] = useState<string | "">(projectFilter === "all" ? "" : projectFilter);

  const inFilter = (t: Task) => projectFilter === "all" || t.project_id === projectFilter;
  const un = unassigned.filter(inFilter);
  const pl = planned.filter(inFilter);
  const done = completed.filter(inFilter);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await quickAdd(title, qProject || null);
    setTitle("");
  };

  const Item = ({ t, draggable = true }: { t: Task; draggable?: boolean }) => (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        if (!draggable) return;
        setDrag({ taskId: t.id, minutes: DEFAULT_BLOCK_MIN, grabOffsetPx: 0 });
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", t.title);
      }}
      onDragEnd={() => setDrag(null)}
      className={`group flex items-center gap-2 rounded-lg border border-ground-line bg-ground-raised px-2.5 py-2 text-sm ${
        draggable ? "cursor-grab active:cursor-grabbing hover:border-pine/60" : ""
      }`}
      style={{ boxShadow: t.starred ? "0 0 0 1px rgba(224,145,63,0.6)" : undefined }}
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: taskColor(t, projectMap) }} />
      <button onClick={() => openEditor({ kind: "task", task: t })} className="flex-1 truncate text-left">
        <span className={t.status === "done" ? "text-ink-faint line-through" : "text-ink"}>{t.title}</span>
      </button>
      {t.status !== "done" ? (
        <>
          <button
            onClick={() => toggleStar(t.id)}
            className={`shrink-0 text-sm ${t.starred ? "text-ember" : "text-ink-faint opacity-0 group-hover:opacity-100"}`}
            title={t.starred ? "Unstar" : "Star"}
          >
            ★
          </button>
          <button
            onClick={() => toggleDone(t)}
            className="shrink-0 text-ink-faint opacity-0 hover:text-pine group-hover:opacity-100"
            title="Mark done"
          >
            ✓
          </button>
        </>
      ) : (
        <>
          <span className="shrink-0 text-[11px] text-ink-faint">
            {t.completed_at ? format(new Date(t.completed_at), "MMM d") : ""}
          </span>
          <button onClick={() => toggleDone(t)} className="shrink-0 text-[11px] text-ink-faint hover:text-ink" title="Reopen">
            ↺
          </button>
          <button onClick={() => deleteTask(t.id)} className="shrink-0 text-[11px] text-ink-faint hover:text-ember" title="Delete">
            ✕
          </button>
        </>
      )}
    </div>
  );

  const Section = ({ label, items, draggable = true }: { label: string; items: Task[]; draggable?: boolean }) => (
    <div className="mb-4">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
        {label} · {items.length}
      </div>
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-ground-line px-3 py-3 text-center text-[12px] text-ink-faint">
          {label === "Unassigned" ? "Add a task below." : label === "Planned" ? "Drag a task onto the calendar." : "Nothing yet."}
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.map((t) => (
            <Item key={t.id} t={t} draggable={draggable} />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <form onSubmit={submit} className="border-b border-ground-line p-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a task…"
          className="w-full rounded-lg border border-ground-line bg-ground px-3 py-2 text-sm outline-none focus:border-pine"
        />
        {projects.length > 0 && (
          <select
            value={qProject}
            onChange={(e) => setQProject(e.target.value)}
            className="mt-2 w-full rounded-lg border border-ground-line bg-ground px-2 py-1.5 text-[13px] text-ink-soft outline-none focus:border-pine"
          >
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <button
          type="submit"
          disabled={!title.trim()}
          className="mt-2 w-full rounded-lg bg-pine py-2 text-sm font-medium text-white transition hover:bg-pine-soft disabled:opacity-40"
        >
          Add task
        </button>
      </form>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <Section label="Unassigned" items={un} />
        <Section label="Planned" items={pl} />
        <Section label="Completed" items={done} draggable={false} />
      </div>
    </div>
  );
}
