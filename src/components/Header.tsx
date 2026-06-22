import { addDays, addWeeks, format } from "date-fns";
import { useStore, type Focus, type ViewKind } from "../store/useStore";
import type { Member } from "../lib/types";

function Segmented<T extends string>({
  options,
  value,
  onChange,
  colorFor,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  colorFor?: (v: T) => string | undefined;
}) {
  return (
    <div className="inline-flex rounded-lg border border-ground-line bg-ground p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        const dot = colorFor?.(o.value);
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-sm transition ${
              active ? "bg-ground-panel text-ink" : "text-ink-soft hover:text-ink"
            }`}
          >
            {dot && <span className="h-2 w-2 rounded-full" style={{ background: dot }} />}
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
  const focus = useStore((s) => s.focus);
  const setFocus = useStore((s) => s.setFocus);
  const anchor = useStore((s) => s.anchor);
  const setAnchor = useStore((s) => s.setAnchor);
  const replan = useStore((s) => s.replan);
  const openEditor = useStore((s) => s.openEditor);
  const members = useStore((s) => s.members);
  const localMemberId = useStore((s) => s.localMemberId);
  const syncMode = useStore((s) => s.syncMode);

  const me: Member | undefined = members.find((m) => m.id === localMemberId) ?? members[0];
  const other: Member | undefined = members.find((m) => m.id !== me?.id);

  const anchorDate = new Date(anchor);

  const step = (dir: number) => {
    if (view === "week") setAnchor(addWeeks(anchorDate, dir).toISOString());
    else setAnchor(addDays(anchorDate, dir).toISOString());
  };

  const focusOptions: { value: Focus; label: string }[] = [
    { value: "me", label: me ? `${me.name} (me)` : "Me" },
    { value: "other", label: other?.name ?? "Other" },
    { value: "both", label: "Both" },
  ];
  const focusColor = (f: Focus) =>
    f === "me" ? me?.color : f === "other" ? other?.color : undefined;

  const title =
    view === "agenda"
      ? "Agenda"
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
            title={
              syncMode === "supabase"
                ? "Live-syncing via Supabase"
                : "Local only (configure Supabase to sync across computers)"
            }
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
            onClick={() => openEditor({ kind: "event", event: null })}
            className="rounded-lg border border-ground-line px-3 py-1.5 text-sm text-ink-soft transition hover:text-ink"
          >
            + Fixed event
          </button>
          <button
            onClick={() => openEditor({ kind: "settings" })}
            className="rounded-lg border border-ground-line px-3 py-1.5 text-sm text-ink-soft transition hover:text-ink"
            aria-label="Settings"
          >
            ⚙
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Segmented<ViewKind>
            options={[
              { value: "day", label: "Day" },
              { value: "week", label: "Week" },
              { value: "agenda", label: "Agenda" },
            ]}
            value={view}
            onChange={setView}
          />
          <Segmented<Focus> options={focusOptions} value={focus} onChange={setFocus} colorFor={focusColor} />
        </div>

        <div className="flex items-center gap-2">
          {view !== "agenda" && (
            <>
              <button
                onClick={() => step(-1)}
                className="rounded-md border border-ground-line px-2 py-1 text-sm text-ink-soft hover:text-ink"
                aria-label="Previous"
              >
                ‹
              </button>
              <button
                onClick={() => setAnchor(new Date().toISOString())}
                className="rounded-md border border-ground-line px-3 py-1 text-sm text-ink-soft hover:text-ink"
              >
                Today
              </button>
              <button
                onClick={() => step(1)}
                className="rounded-md border border-ground-line px-2 py-1 text-sm text-ink-soft hover:text-ink"
                aria-label="Next"
              >
                ›
              </button>
            </>
          )}
          <button
            onClick={replan}
            className="rounded-md border border-pine-dim bg-pine-dim/30 px-3 py-1 text-sm text-ink hover:bg-pine-dim/50"
            title="Re-run the auto-scheduler"
          >
            ↻ Re-plan
          </button>
        </div>
      </div>

      <div className="text-sm text-ink-soft">{title}</div>
    </header>
  );
}
