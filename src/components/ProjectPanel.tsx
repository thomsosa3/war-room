import { useState } from "react";
import { format } from "date-fns";
import { useStore } from "../store/useStore";
import Modal, { Field, inputCls } from "./Modal";
import type { Material, Project } from "../lib/types";

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `m-${Date.now()}-${Math.random()}`;
const toDateInput = (iso?: string | null) => (iso ? format(new Date(iso), "yyyy-MM-dd") : "");

const PALETTE = ["#e0913f", "#5b9bd5", "#4f8a6b", "#7c6cd6", "#c97a2c", "#9d5c63", "#6d8a44"];

export default function ProjectPanel() {
  const editing = useStore((s) => s.editing);
  const existing = editing?.kind === "project" ? editing.project : null;
  const createProject = useStore((s) => s.createProject);
  const updateProject = useStore((s) => s.updateProject);
  const deleteProject = useStore((s) => s.deleteProject);
  const close = useStore((s) => s.openEditor);

  const isEdit = Boolean(existing?.id);
  const [name, setName] = useState(existing?.name ?? "");
  const [color, setColor] = useState(existing?.color ?? PALETTE[0]);
  const [due, setDue] = useState(toDateInput(existing?.due_date));
  const [materials, setMaterials] = useState<Material[]>(existing?.materials ?? []);

  const save = async () => {
    if (!name.trim()) return;
    const payload: Omit<Project, "id" | "created_at"> = {
      name: name.trim(),
      color,
      due_date: due ? new Date(due + "T18:00:00").toISOString() : null,
      materials: materials.length ? materials.map((m) => ({ ...m, name: m.name.trim() })).filter((m) => m.name) : null,
      archived: existing?.archived ?? false,
    };
    if (isEdit && existing?.id) await updateProject(existing.id, payload);
    else await createProject(payload);
    close(null);
  };

  return (
    <Modal
      title={isEdit ? "Edit project" : "New project"}
      footer={
        <>
          {isEdit && existing?.id && (
            <button
              onClick={async () => {
                await deleteProject(existing.id!);
                close(null);
              }}
              className="mr-auto rounded-lg border border-ground-line px-3 py-1.5 text-sm text-ink-soft hover:text-ember"
            >
              Delete
            </button>
          )}
          <button onClick={() => close(null)} className="rounded-lg border border-ground-line px-3 py-1.5 text-sm text-ink-soft">
            Cancel
          </button>
          <button onClick={save} className="rounded-lg bg-pine px-4 py-1.5 text-sm font-medium text-white hover:bg-pine-soft">
            Save
          </button>
        </>
      }
    >
      <Field label="Project name">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Fence, Garden beds, Tree planting…" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Color">
          <div className="flex flex-wrap gap-1.5">
            {PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`h-7 w-7 rounded-full border-2 ${color === c ? "border-ink" : "border-transparent"}`}
                style={{ background: c }}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
        </Field>
        <Field label="Target finish (optional)">
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={inputCls} />
        </Field>
      </div>

      <div className="mb-1 mt-1 flex items-center justify-between">
        <span className="text-[12px] font-medium text-ink-soft">Materials / shopping list</span>
      </div>
      <div className="space-y-1.5">
        {materials.map((m) => (
          <div key={m.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={m.bought}
              onChange={(e) => setMaterials((cur) => cur.map((x) => (x.id === m.id ? { ...x, bought: e.target.checked } : x)))}
              className="h-4 w-4 shrink-0 accent-pine"
              title="Bought"
            />
            <input
              value={m.name}
              onChange={(e) => setMaterials((cur) => cur.map((x) => (x.id === m.id ? { ...x, name: e.target.value } : x)))}
              placeholder="Material"
              className={`${inputCls} flex-1 ${m.bought ? "text-ink-faint line-through" : ""}`}
            />
            <input
              value={m.qty ?? ""}
              onChange={(e) => setMaterials((cur) => cur.map((x) => (x.id === m.id ? { ...x, qty: e.target.value } : x)))}
              placeholder="qty"
              className={`${inputCls} w-16`}
            />
            <button
              onClick={() => setMaterials((cur) => cur.filter((x) => x.id !== m.id))}
              className="shrink-0 rounded-md border border-ground-line px-2 py-1.5 text-[12px] text-ink-faint hover:text-ember"
              aria-label="Remove material"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={() => setMaterials((cur) => [...cur, { id: uid(), name: "", qty: "", bought: false }])}
        className="mt-1.5 rounded-lg border border-ground-line px-3 py-1.5 text-[12px] text-ink-soft hover:text-ink"
      >
        + Add material
      </button>
    </Modal>
  );
}
