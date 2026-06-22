import { useState } from "react";
import { useStore } from "../store/useStore";
import Modal, { Field, inputCls } from "./Modal";
import { WEEKDAY_LABELS } from "../lib/defaults";
import type { Member, Weekday, WorkingHours } from "../lib/types";

export default function SettingsPanel() {
  const members = useStore((s) => s.members);
  const settings = useStore((s) => s.settings);
  const localMemberId = useStore((s) => s.localMemberId);
  const setLocalMember = useStore((s) => s.setLocalMember);
  const saveMember = useStore((s) => s.saveMember);
  const saveSettings = useStore((s) => s.saveSettings);
  const close = useStore((s) => s.openEditor);

  const [tab, setTab] = useState(members[0]?.id ?? "");
  const [draft, setDraft] = useState<Record<string, Member>>(() =>
    Object.fromEntries(members.map((m) => [m.id, structuredClone(m)]))
  );
  const [horizon, setHorizon] = useState(settings.planning_horizon_days);
  const [chunk, setChunk] = useState(settings.default_chunk_minutes);

  const current = draft[tab];

  const updateCurrent = (patch: Partial<Member>) =>
    setDraft((d) => ({ ...d, [tab]: { ...d[tab], ...patch } }));

  const updateHours = (day: Weekday, patch: Partial<WorkingHours[Weekday]>) =>
    setDraft((d) => ({
      ...d,
      [tab]: {
        ...d[tab],
        working_hours: {
          ...d[tab].working_hours,
          [day]: { ...d[tab].working_hours[day], ...patch },
        },
      },
    }));

  const saveAll = async () => {
    for (const m of Object.values(draft)) await saveMember(m);
    await saveSettings({ planning_horizon_days: Math.max(1, horizon), default_chunk_minutes: Math.max(5, chunk) });
    close(null);
  };

  if (!current) return null;

  return (
    <Modal
      title="Settings"
      width="max-w-lg"
      footer={
        <>
          <button
            onClick={() => close(null)}
            className="rounded-lg border border-ground-line px-3 py-1.5 text-sm text-ink-soft"
          >
            Cancel
          </button>
          <button
            onClick={saveAll}
            className="rounded-lg bg-pine px-4 py-1.5 text-sm font-medium text-white hover:bg-pine-soft"
          >
            Save
          </button>
        </>
      }
    >
      <Field label="This computer belongs to">
        <select
          value={localMemberId ?? ""}
          onChange={(e) => setLocalMember(e.target.value)}
          className={inputCls}
        >
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[11px] text-ink-faint">
          Controls which schedule "My" shows. Each copy of the app sets its own.
        </p>
      </Field>

      <div className="mb-3 mt-4 flex gap-1 border-b border-ground-line">
        {members.map((m) => (
          <button
            key={m.id}
            onClick={() => setTab(m.id)}
            className={`-mb-px border-b-2 px-3 py-1.5 text-sm ${
              tab === m.id ? "border-pine text-ink" : "border-transparent text-ink-soft"
            }`}
          >
            {draft[m.id].name || "Member"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Name">
          <input
            value={current.name}
            onChange={(e) => updateCurrent({ name: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="Color">
          <input
            type="color"
            value={current.color}
            onChange={(e) => updateCurrent({ color: e.target.value })}
            className="h-9 w-full cursor-pointer rounded-lg border border-ground-line bg-ground"
          />
        </Field>
      </div>

      <div className="mb-1 text-[12px] font-medium text-ink-soft">Working hours</div>
      <div className="space-y-1.5">
        {WEEKDAY_LABELS.map((lbl, i) => {
          const wd = i as Weekday;
          const h = current.working_hours[wd];
          return (
            <div key={lbl} className="flex items-center gap-2">
              <label className="flex w-20 items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={h.enabled}
                  onChange={(e) => updateHours(wd, { enabled: e.target.checked })}
                  className="h-4 w-4 accent-pine"
                />
                {lbl}
              </label>
              <input
                type="time"
                value={h.start}
                onChange={(e) => updateHours(wd, { start: e.target.value })}
                disabled={!h.enabled}
                className={`${inputCls} w-28 disabled:opacity-40`}
              />
              <span className="text-ink-faint">to</span>
              <input
                type="time"
                value={h.end}
                onChange={(e) => updateHours(wd, { end: e.target.value })}
                disabled={!h.enabled}
                className={`${inputCls} w-28 disabled:opacity-40`}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field label="Planning horizon (days)">
          <input
            type="number"
            min={1}
            value={horizon}
            onChange={(e) => setHorizon(Number(e.target.value))}
            className={inputCls}
          />
        </Field>
        <Field label="Default chunk (minutes)">
          <input
            type="number"
            min={5}
            step={5}
            value={chunk}
            onChange={(e) => setChunk(Number(e.target.value))}
            className={inputCls}
          />
        </Field>
      </div>
    </Modal>
  );
}
