import { useState } from "react";
import { format } from "date-fns";
import { useStore } from "../store/useStore";
import Modal, { Field, inputCls } from "./Modal";
import { WEEKDAY_LABELS } from "../lib/defaults";
import type { FixedEvent, FixedEventType, Weekday } from "../lib/types";

const toLocalInput = (iso?: string | null) =>
  iso ? format(new Date(iso), "yyyy-MM-dd'T'HH:mm") : "";
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : new Date().toISOString());

export default function FixedEventForm() {
  const editing = useStore((s) => s.editing);
  const existing = editing?.kind === "event" ? editing.event : null;
  const members = useStore((s) => s.members);
  const localMemberId = useStore((s) => s.localMemberId);
  const createEvent = useStore((s) => s.createEvent);
  const updateEvent = useStore((s) => s.updateEvent);
  const deleteEvent = useStore((s) => s.deleteEvent);
  const close = useStore((s) => s.openEditor);

  const isEdit = Boolean(existing?.id);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [memberId, setMemberId] = useState(existing?.member_id ?? localMemberId ?? members[0]?.id ?? "");
  const [start, setStart] = useState(toLocalInput(existing?.start_ts) || defaultStart());
  const [end, setEnd] = useState(toLocalInput(existing?.end_ts) || defaultEnd());
  const [type, setType] = useState<FixedEventType>(existing?.type ?? "other");
  const [recurDays, setRecurDays] = useState<Weekday[]>(existing?.recurrence?.days ?? []);

  const save = async () => {
    if (!title.trim() || !memberId) return;
    const payload: Omit<FixedEvent, "id"> = {
      member_id: memberId,
      title: title.trim(),
      start_ts: fromLocalInput(start),
      end_ts: fromLocalInput(end),
      type,
      recurrence: recurDays.length ? { freq: "weekly", days: recurDays } : null,
    };
    if (isEdit && existing?.id) await updateEvent(existing.id, payload);
    else await createEvent(payload);
    close(null);
  };

  const toggleDay = (d: Weekday) =>
    setRecurDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()));

  return (
    <Modal
      title={isEdit ? "Edit fixed event" : "New fixed event"}
      footer={
        <>
          {isEdit && existing?.id && (
            <button
              onClick={async () => {
                await deleteEvent(existing.id!);
                close(null);
              }}
              className="mr-auto rounded-lg border border-ground-line px-3 py-1.5 text-sm text-ink-soft hover:text-ember"
            >
              Delete
            </button>
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
          placeholder="Class, work shift, gym…"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Member">
          <select value={memberId} onChange={(e) => setMemberId(e.target.value)} className={inputCls}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Type">
          <select value={type} onChange={(e) => setType(e.target.value as FixedEventType)} className={inputCls}>
            <option value="class">Class</option>
            <option value="work">Work</option>
            <option value="gym">Gym</option>
            <option value="other">Other</option>
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Start">
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className={inputCls} />
        </Field>
        <Field label="End">
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className={inputCls} />
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
        <p className="mt-1 text-[11px] text-ink-faint">
          When set, the time-of-day repeats on the chosen weekdays across the whole horizon.
        </p>
      </Field>
    </Modal>
  );
}

function defaultStart() {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return format(d, "yyyy-MM-dd'T'HH:mm");
}
function defaultEnd() {
  const d = new Date();
  d.setHours(d.getHours() + 2, 0, 0, 0);
  return format(d, "yyyy-MM-dd'T'HH:mm");
}
