import { useMemo } from "react";
import { schedule } from "../scheduler/schedule";
import type { ScheduleResult, Task } from "../lib/types";
import { useStore } from "./useStore";

export interface Schedules {
  /** memberId -> schedule result */
  byMember: Record<string, ScheduleResult>;
  /** taskId -> task */
  taskMap: Record<string, Task>;
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
  const planNow = useStore((s) => s.planNow);

  return useMemo(() => {
    const now = new Date(planNow);
    const byMember: Record<string, ScheduleResult> = {};
    let atRiskCount = 0;

    for (const m of members) {
      const memberTasks = tasks.filter((t) => t.assignee_id === m.id);
      const memberEvents = fixedEvents.filter((e) => e.member_id === m.id);
      const result = schedule(memberTasks, memberEvents, m.working_hours, settings, now);
      byMember[m.id] = result;
      atRiskCount += result.atRisk.length;
    }

    const taskMap: Record<string, Task> = {};
    for (const t of tasks) taskMap[t.id] = t;

    return { byMember, taskMap, atRiskCount };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, tasks, fixedEvents, settings, planNow]);
}
