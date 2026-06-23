import type { ManualBlock, ScheduledBlock, Task } from "./types";

export const blockUid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `mb-${Date.now()}-${Math.round(Math.random() * 1e6)}`;

/**
 * The task's manual blocks, with back-compat: a legacy single `pinned_start`
 * reads as one manual block of the full estimate.
 */
export function resolveManualBlocks(task: Task): ManualBlock[] {
  if (task.manual_blocks && task.manual_blocks.length) return task.manual_blocks;
  if (task.pinned_start) {
    return [{ id: "legacy", start: task.pinned_start, minutes: task.estimated_minutes }];
  }
  return [];
}

export function isManual(task: Task): boolean {
  return resolveManualBlocks(task).length > 0;
}

/**
 * Compute the new manual_blocks array after dragging `block` to `newStartISO`.
 * - Moving an existing manual block repositions just that segment.
 * - Dragging an auto-scheduled block pins the whole task as one new block.
 */
export function applyDragMove(task: Task, block: ScheduledBlock, newStartISO: string): ManualBlock[] {
  const cur = resolveManualBlocks(task);
  if (block.manualBlockId && cur.some((b) => b.id === block.manualBlockId)) {
    return cur.map((b) => (b.id === block.manualBlockId ? { ...b, start: newStartISO } : b));
  }
  return [{ id: blockUid(), start: newStartISO, minutes: task.estimated_minutes }];
}
