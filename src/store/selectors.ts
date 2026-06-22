import type { Member } from "../lib/types";
import { useStore } from "./useStore";

/** Resolve which members are visible given the current My/Other/Both focus. */
export function useVisibleMembers(): Member[] {
  const members = useStore((s) => s.members);
  const focus = useStore((s) => s.focus);
  const localMemberId = useStore((s) => s.localMemberId);

  const me = members.find((m) => m.id === localMemberId) ?? members[0];
  const other = members.find((m) => m.id !== me?.id);

  if (focus === "both") return members;
  if (focus === "other") return other ? [other] : [];
  return me ? [me] : [];
}
