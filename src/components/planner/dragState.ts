// Shared drag payload for palette -> calendar and block moves. We keep it in a
// module variable (not dataTransfer) so dragover can read it and so we can carry
// the grab offset for precise drops.
export interface DragInfo {
  taskId: string;
  blockId?: string; // present when moving an existing block
  minutes: number;
  grabOffsetPx: number; // pointer offset from the block's top (0 for palette items)
}

let current: DragInfo | null = null;
export const setDrag = (d: DragInfo | null) => {
  current = d;
};
export const getDrag = () => current;
export const SNAP_MIN = 15;
