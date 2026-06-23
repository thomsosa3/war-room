import { useMemo } from "react";
import { scheduleAll } from "../scheduler/schedule";
import type { Project, ScheduleResult, Task } from "../lib/types";
import { useStore } from "./useStore";

export interface Schedules {
  /** memberId -> schedule result */
  byMember: Record<string, ScheduleResult>;
  /** taskId -> task */
  taskMap: Record<string, Task>;
  /** projectId -> project */
  projectMap: Record<string, Project>;
  /** total at-risk items across both members */
  atRiskCount: number;
}

/**
 * Computes each member's schedule from the shared data. Pure + memoized: it
 * only recomputes when the tasks/events/settings change or a re-plan is
 * triggered (planNow bump). This is the single place auto-re-planning happens.
 */
export function useSchedules(): Schedules {
  const members = useStore((s) => s.members);
  const tasks = useStore((s) => s.tasks);
  const fixedEvents = useStore((s) => s.fixedEvents);
  const settings = useStore((s) => s.settings);
  const projects = useStore((s) => s.projects);
  const planNow = useStore((s) => s.planNow);

  return useMemo(() => {
    const now = new Date(planNow);
    // One coordinated pass across all members so cross-member dependencies and
    // two-person tasks resolve correctly.
    const byMember: Record<string, ScheduleResult> = scheduleAll(
      tasks,
      fixedEvents,
      members,
      settings,
      now
    );
    let atRiskCount = 0;
    for (const m of members) atRiskCount += byMember[m.id]?.atRisk.length ?? 0;

    const taskMap: Record<string, Task> = {};
    for (const t of tasks) taskMap[t.id] = t;
    const projectMap: Record<string, Project> = {};
    for (const p of projects) projectMap[p.id] = p;

    return { byMember, taskMap, projectMap, atRiskCount };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, tasks, fixedEvents, settings, projects, planNow]);
}
