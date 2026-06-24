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

export const DEFAULT_BLOCK_MIN = 60;

/** Append a new manual block at the given start (default 1 hour). */
export function addBlock(task: Task, startISO: string, minutes = DEFAULT_BLOCK_MIN): ManualBlock[] {
  return [...resolveManualBlocks(task), { id: blockUid(), start: startISO, minutes }];
}

/** Move one block to a new start. */
export function moveBlock(task: Task, blockId: string, startISO: string): ManualBlock[] {
  return resolveManualBlocks(task).map((b) => (b.id === blockId ? { ...b, start: startISO } : b));
}

/** Set one block's length (minutes). */
export function resizeBlock(task: Task, blockId: string, minutes: number): ManualBlock[] {
  return resolveManualBlocks(task).map((b) =>
    b.id === blockId ? { ...b, minutes: Math.max(15, minutes) } : b
  );
}

/** Remove one block. */
export function removeBlock(task: Task, blockId: string): ManualBlock[] {
  return resolveManualBlocks(task).filter((b) => b.id !== blockId);
}

/** Duplicate a block, offset by one day so it's easy to grab and drag. */
export function duplicateBlock(task: Task, blockId: string): ManualBlock[] {
  const cur = resolveManualBlocks(task);
  const src = cur.find((b) => b.id === blockId);
  if (!src) return cur;
  const start = new Date(src.start);
  start.setDate(start.getDate() + 1);
  return [...cur, { id: blockUid(), start: start.toISOString(), minutes: src.minutes }];
}
