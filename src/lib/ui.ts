import { format } from "date-fns";
import type { FixedEventType, Priority } from "./types";

// Priority colors for scheduled task blocks.
export const PRIORITY_COLOR: Record<Priority, string> = {
  asap: "#e0913f", // ember
  high: "#d8645a", // warm red
  medium: "#4f8a6b", // pine
  low: "#5b7089", // muted slate-blue
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  asap: "ASAP",
  high: "High",
  medium: "Medium",
  low: "Low",
};

// Fixed-event colors by type (muted, distinct from task priority colors).
export const EVENT_COLOR: Record<FixedEventType, string> = {
  class: "#6d6196",
  work: "#4a6d80",
  gym: "#7d7044",
  other: "#566270",
};

export function fmtTime(iso: string): string {
  return format(new Date(iso), "h:mm a");
}

export function fmtRange(startIso: string, endIso: string): string {
  return `${fmtTime(startIso)} – ${fmtTime(endIso)}`;
}

export function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

/** Slightly translucent tint of a hex color, for member-tinted backgrounds. */
export function tint(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
