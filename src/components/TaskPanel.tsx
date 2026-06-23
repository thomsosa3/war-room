import { useState } from "react";
import { format } from "date-fns";
import { useStore } from "../store/useStore";
import Modal, { Field, inputCls } from "./Modal";
import { WEEKDAY_LABELS } from "../lib/defaults";
import type { DeadlineType, Priority, SubTask, Task, Weekday } from "../lib/types";

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `s-${Date.now()}-${Math.random()}`;

const toLocalInput = (iso?: string | null) =>
  iso ? format(new Date(iso), "yyyy-MM-dd'T'HH:mm") : "";
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

export default function TaskPanel() {
  const editing = useStore((s) => s.editing);
  const existing = editing?.kind === "task" ? editing.task : null;
  const members = useStore((s) => s.members);
  const createTask = useStore((s) => s.createTask);
  const updateTask = useStore((s) => s.updateTask);
  const deleteTask = useStore((s) => s.deleteTask);
  const toggleDone = useStore((s) => s.toggleDone);
  const close = useStore((s) => s.openEditor);
  const defaultChunk = useStore((s) => s.settings.default_chunk_minutes);

  const isEdit = Boolean(existing?.id);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [estimate, setEstimate] = useState(existing?.estimated_minutes ?? 60);
  const [priority, setPriority] = useState<Priority>(existing?.priority ?? "medium");
  const [deadlineType, setDeadlineType] = useState<DeadlineType>(existing?.deadline_type ?? "none");
  const [dueDate, setDueDate] = useState(toLocalInput(existing?.due_date));
  const [earliest, setEarliest] = useState(toLocalInput(existing?.earliest_start));
  const [assignee, setAssignee] = useState<string | "">(existing?.assignee_id ?? "");
  const [splittable, setSplittable] = useState(existing?.splittable ?? true);
  const [minChunk, setMinChunk] = useState(existing?.min_chunk_minutes ?? defaultChunk);
  const [recurDays, setRecurDays] = useState<Weekday[]>(existing?.recurrence?.days ?? []);
  const [pinnedStart, setPinnedStart] = useState<string | null>(existing?.pinned_start ?? null);
  const [subtasks, setSubtasks] = useState<SubTask[]>(existing?.subtasks ?? []);

  const dueDisabled = priority === "asap" || deadlineType === "none";

  const save = async () => {
    if (!title.trim()) return;
    const payload: Omit<Task, "id" | "created_at"> = {
      title: title.trim(),
      notes: notes.trim() || null,
      estimated_minutes: Math.max(1, Math.round(estimate)),
      priority,
      deadline_type: priority === "asap" ? "none" : deadlineType,
      due_date: dueDisabled ? null : fromLocalInput(dueDate),
      earliest_start: fromLocalInput(earliest),
      splittable,
      min_chunk_minutes: Math.max(5, Math.round(minChunk)),
      recurrence: recurDays.length ? { freq: "weekly", days: recurDays } : null,
      assignee_id: assignee || null,
      status: existing?.status ?? "todo",
      completed_at: existing?.completed_at ?? null,
      pinned_start: pinnedStart, // preserve manual pin; cleared via Unpin
      subtasks: subtasks.length ? subtasks.map((s) => ({ ...s, title: s.title.trim() })).filter((s) => s.title) : null,
    };
    if (isEdit && existing?.id) await updateTask(existing.id, payload);
    else await createTask(payload);
    close(null);
  };

  const toggleDay = (d: Weekday) =>
    setRecurDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()));

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
                {existing.status === "done" ? "Mark todo" : "Mark done"}
              </button>
            </>
          )}
          <button
            onClick={() => close(null)}
            className="rounded-lg border border-ground-line px-3 py-1.5 text-sm text-ink-soft"
          >
            Cancel
          </button>
          <button
            onClick={save}
            className="rounded-lg bg-pine px-4 py-1.5 text-sm font-medium text-white hover:bg-pine-soft"
          >
            Save
          </button>
        </>
      }
    >
      <Field label="Title">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputCls}
          placeholder="What needs doing?"
        />
      </Field>

      {pinnedStart && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-pine/40 bg-pine/10 px-3 py-2 text-sm">
          <span>📌</span>
          <span className="flex-1 text-ink-soft">
            Pinned to{" "}
            <span className="text-ink">{format(new Date(pinnedStart), "EEE MMM d, h:mm a")}</span>
          </span>
          <button
            onClick={async () => {
              setPinnedStart(null);
              // Apply immediately (like Delete / Mark done) so it doesn't depend on Save.
              if (existing?.id) await updateTask(existing.id, { pinned_start: null });
            }}
            className="rounded-md border border-ground-line px-2 py-1 text-[12px] text-ink-soft hover:text-ink"
          >
            Unpin (auto-schedule)
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Estimate (minutes)">
          <input
            type="number"
            min={5}
            step={5}
            value={estimate}
            onChange={(e) => setEstimate(Number(e.target.value))}
            className={inputCls}
          />
        </Field>
        <Field label="Assignee">
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={inputCls}>
            <option value="">Shared backlog (unscheduled)</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Priority">
        <div className="flex gap-1.5">
          {(["asap", "high", "medium", "low"] as Priority[]).map((p) => (
            <button
              key={p}
              onClick={() => setPriority(p)}
              className={`flex-1 rounded-lg border px-2 py-1.5 text-sm capitalize ${
                priority === p
                  ? "border-pine bg-pine/20 text-ink"
                  : "border-ground-line text-ink-soft hover:text-ink"
              }`}
            >
              {p === "asap" ? "ASAP" : p}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Deadline type">
          <select
            value={deadlineType}
            onChange={(e) => setDeadlineType(e.target.value as DeadlineType)}
            disabled={priority === "asap"}
            className={`${inputCls} disabled:opacity-40`}
          >
            <option value="none">None</option>
            <option value="soft">Soft (can slip)</option>
            <option value="hard">Hard (protected)</option>
          </select>
        </Field>
        <Field label="Due date">
          <input
            type="datetime-local"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            disabled={dueDisabled}
            className={`${inputCls} disabled:opacity-40`}
          />
        </Field>
      </div>

      <Field label="Earliest start (optional)">
        <input
          type="datetime-local"
          value={earliest}
          onChange={(e) => setEarliest(e.target.value)}
          className={inputCls}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Chunkable">
          <button
            onClick={() => setSplittable((v) => !v)}
            className={`w-full rounded-lg border px-3 py-2 text-sm ${
              splittable ? "border-pine bg-pine/20" : "border-ground-line text-ink-soft"
            }`}
          >
            {splittable ? "Can split across slots" : "Single block only"}
          </button>
        </Field>
        <Field label="Min chunk (minutes)">
          <input
            type="number"
            min={5}
            step={5}
            value={minChunk}
            onChange={(e) => setMinChunk(Number(e.target.value))}
            disabled={!splittable}
            className={`${inputCls} disabled:opacity-40`}
          />
        </Field>
      </div>

      <Field label="Repeat weekly (optional)">
        <div className="flex gap-1">
          {WEEKDAY_LABELS.map((lbl, i) => (
            <button
              key={lbl}
              onClick={() => toggleDay(i as Weekday)}
              className={`flex-1 rounded-md border py-1.5 text-[12px] ${
                recurDays.includes(i as Weekday)
                  ? "border-pine bg-pine/20 text-ink"
                  : "border-ground-line text-ink-soft"
              }`}
            >
              {lbl[0]}
            </button>
          ))}
        </div>
      </Field>

      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[12px] font-medium text-ink-soft">Steps (sub-tasks)</span>
          {subtasks.length > 0 && (
            <span className="text-[11px] text-ink-faint">
              {subtasks.filter((s) => s.done).length}/{subtasks.length} done
            </span>
          )}
        </div>
        <div className="space-y-1.5">
          {subtasks.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={s.done}
                onChange={(e) =>
                  setSubtasks((cur) => cur.map((x) => (x.id === s.id ? { ...x, done: e.target.checked } : x)))
                }
                className="h-4 w-4 shrink-0 accent-pine"
                aria-label={`Step ${i + 1} done`}
              />
              <input
                value={s.title}
                onChange={(e) =>
                  setSubtasks((cur) => cur.map((x) => (x.id === s.id ? { ...x, title: e.target.value } : x)))
                }
                placeholder={`Step ${i + 1}`}
                className={`${inputCls} ${s.done ? "text-ink-faint line-through" : ""}`}
              />
              <button
                onClick={() => setSubtasks((cur) => cur.filter((x) => x.id !== s.id))}
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
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className={inputCls}
        />
      </Field>
    </Modal>
  );
}
