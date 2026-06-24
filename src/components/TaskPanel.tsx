import { useState } from "react";
import { addDays } from "date-fns";
import { useStore } from "../store/useStore";
import Modal, { Field, inputCls } from "./Modal";
import { blockUid, resolveManualBlocks } from "../lib/manual";
import type { ManualBlock, SubTask, Task } from "../lib/types";

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `s-${Date.now()}-${Math.random()}`;

export default function TaskPanel() {
  const editing = useStore((s) => s.editing);
  const existing = editing?.kind === "task" ? editing.task : null;
  const projects = useStore((s) => s.projects);
  const createTask = useStore((s) => s.createTask);
  const updateTask = useStore((s) => s.updateTask);
  const deleteTask = useStore((s) => s.deleteTask);
  const toggleDone = useStore((s) => s.toggleDone);
  const close = useStore((s) => s.openEditor);

  const isEdit = Boolean(existing?.id);
  const existingBlocks = existing ? resolveManualBlocks(existing as Task) : [];
  const [title, setTitle] = useState(existing?.title ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [projectId, setProjectId] = useState<string | "">(existing?.project_id ?? "");
  const [starred, setStarred] = useState<boolean>(existing?.starred ?? false);
  const [blockCount, setBlockCount] = useState<number>(existingBlocks.length);
  const [subtasks, setSubtasks] = useState<SubTask[]>(existing?.subtasks ?? []);

  // Build the manual_blocks array to match the requested count: keep existing,
  // add new ones on consecutive days (you reposition them by dragging).
  const blocksForCount = (n: number): ManualBlock[] => {
    const blocks = [...existingBlocks];
    while (blocks.length < n) {
      const last = blocks.length ? new Date(blocks[blocks.length - 1].start) : new Date();
      const base = addDays(last, blocks.length ? 1 : 1);
      base.setHours(9, 0, 0, 0);
      blocks.push({ id: blockUid(), start: base.toISOString(), minutes: 60 });
    }
    return blocks.slice(0, n);
  };

  const save = async () => {
    if (!title.trim()) return;
    const blocks = blocksForCount(blockCount);
    const payload: Omit<Task, "id" | "created_at"> = {
      title: title.trim(),
      notes: notes.trim() || null,
      estimated_minutes: 60,
      priority: "medium",
      deadline_type: "none",
      due_date: null,
      earliest_start: null,
      splittable: true,
      min_chunk_minutes: 30,
      recurrence: null,
      pinned_start: null,
      manual_blocks: blocks.length ? blocks : null,
      subtasks: subtasks.length ? subtasks.map((s) => ({ ...s, title: s.title.trim() })).filter((s) => s.title) : null,
      project_id: projectId || null,
      depends_on: null,
      needs_both: false,
      starred,
      assignee_id: null,
      status: existing?.status ?? "todo",
      completed_at: existing?.completed_at ?? null,
    };
    if (isEdit && existing?.id) await updateTask(existing.id, payload);
    else await createTask(payload);
    close(null);
  };

  return (
    <Modal
      title={isEdit ? "Edit task" : "New task"}
      footer={
        <>
          {isEdit && existing?.id && (
            <>
              <button
                onClick={async () => {
                  await deleteTask(existing.id!);
                  close(null);
                }}
                className="mr-auto rounded-lg border border-ground-line px-3 py-1.5 text-sm text-ink-soft hover:text-ember"
              >
                Delete
              </button>
              <button
                onClick={async () => {
                  await toggleDone(existing as Task);
                  close(null);
                }}
                className="rounded-lg border border-ground-line px-3 py-1.5 text-sm text-ink-soft hover:text-ink"
              >
                {existing.status === "done" ? "Reopen" : "Mark done"}
              </button>
            </>
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
      <Field label="Task">
        <div className="flex items-center gap-2">
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="What needs doing?" />
          <button
            onClick={() => setStarred((v) => !v)}
            className={`shrink-0 rounded-lg border px-3 py-2 text-lg ${starred ? "border-ember text-ember" : "border-ground-line text-ink-faint"}`}
            title={starred ? "Unstar" : "Star"}
          >
            ★
          </button>
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Project">
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={inputCls}>
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Number of time blocks">
          <input
            type="number"
            min={0}
            max={30}
            value={blockCount}
            onChange={(e) => setBlockCount(Math.max(0, Math.min(30, Number(e.target.value))))}
            className={inputCls}
          />
        </Field>
      </div>
      <p className="-mt-1 mb-3 text-[11px] text-ink-faint">
        Blocks start on the calendar at 9am on coming days — drag them where you want, or just drag the task from the list.
      </p>

      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[12px] font-medium text-ink-soft">Steps (sub-tasks)</span>
        </div>
        <div className="space-y-1.5">
          {subtasks.map((st) => (
            <div key={st.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={st.done}
                onChange={(e) => setSubtasks((cur) => cur.map((x) => (x.id === st.id ? { ...x, done: e.target.checked } : x)))}
                className="h-4 w-4 accent-pine"
              />
              <input
                value={st.title}
                onChange={(e) => setSubtasks((cur) => cur.map((x) => (x.id === st.id ? { ...x, title: e.target.value } : x)))}
                placeholder="Step"
                className={`${inputCls} flex-1 ${st.done ? "text-ink-faint line-through" : ""}`}
              />
              <button
                onClick={() => setSubtasks((cur) => cur.filter((x) => x.id !== st.id))}
                className="shrink-0 rounded-md border border-ground-line px-2 py-1.5 text-[12px] text-ink-faint hover:text-ember"
                aria-label="Remove step"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={() => setSubtasks((cur) => [...cur, { id: uid(), title: "", done: false }])}
          className="mt-1.5 rounded-lg border border-ground-line px-3 py-1.5 text-[12px] text-ink-soft hover:text-ink"
        >
          + Add step
        </button>
      </div>

      <Field label="Notes (optional)">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} />
      </Field>
    </Modal>
  );
}
