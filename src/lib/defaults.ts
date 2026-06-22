import type { Settings, WorkingHours } from "./types";

/** A sensible default work week: weekdays 9–17, weekends off. */
export function defaultWorkingHours(): WorkingHours {
  const weekday = { start: "09:00", end: "17:00", enabled: true };
  const weekend = { start: "10:00", end: "16:00", enabled: false };
  return {
    0: { ...weekend },
    1: { ...weekday },
    2: { ...weekday },
    3: { ...weekday },
    4: { ...weekday },
    5: { ...weekday },
    6: { ...weekend },
  };
}

export const DEFAULT_SETTINGS: Settings = {
  id: "00000000-0000-0000-0000-000000000001",
  planning_horizon_days: 90,
  default_chunk_minutes: 30,
};

/** The two members the app seeds when none exist yet. */
export const SEED_MEMBERS = [
  { name: "Thomas", color: "#4f8a6b" }, // pine
  { name: "Mom", color: "#7c6cd6" }, // a distinct violet
];

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
