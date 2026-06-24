import { createPortal } from "react-dom";
import type { Material } from "../../lib/types";

/** Read-only materials peek shown on hover; positioned next to the anchor. */
export default function MaterialsPopover({ rect, materials }: { rect: DOMRect; materials: Material[] }) {
  const width = 220;
  const left = Math.min(rect.right + 8, window.innerWidth - width - 8);
  const top = Math.min(Math.max(rect.top, 8), window.innerHeight - 220);
  const boughtCount = materials.filter((m) => m.bought).length;

  return createPortal(
    <div
      className="pointer-events-none fixed z-[60] rounded-lg border border-ground-line bg-ground-raised p-2.5 shadow-2xl"
      style={{ left, top, width }}
    >
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
        Materials · {boughtCount}/{materials.length}
      </div>
      <div className="space-y-0.5">
        {materials.map((m) => (
          <div key={m.id} className="flex items-center gap-1.5 text-[12px]">
            <span className={m.bought ? "text-pine" : "text-ink-faint"}>{m.bought ? "✓" : "○"}</span>
            <span className={`flex-1 truncate ${m.bought ? "text-ink-faint line-through" : "text-ink"}`}>{m.name}</span>
            {m.qty && <span className="shrink-0 text-ink-faint">{m.qty}</span>}
          </div>
        ))}
      </div>
    </div>,
    document.body
  );
}
