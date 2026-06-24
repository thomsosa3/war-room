import { useMemo } from "react";
import { resolveManualBlocks } from "../lib/manual";
import type { Project, ScheduledBlock, Task } from "../lib/types";
import { useStore } from "./useStore";

export interface Planner {
  /** Every placed block across all to-do tasks (manual placements only). */
  blocks: ScheduledBlock[];
  /** To-do tasks with no blocks yet — drag these onto the calendar. */
  unassigned: Task[];
  /** To-do tasks that have at least one block. */
  planned: Task[];
  /** Completed tasks. */
  completed: Task[];
  taskMap: Record<string, Task>;
  projectMap: Record<string, Project>;
}

/**
 * The planner has no auto-scheduler: a task appears on the calendar only where
 * you've manually dropped blocks. This hook just reads those blocks and splits
 * tasks into Unassigned / Planned / Completed.
 */
export function usePlanner(): Planner {
  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);

  return useMemo(() => {
    const blocks: ScheduledBlock[] = [];
    const unassigned: Task[] = [];
    const planned: Task[] = [];
    const completed: Task[] = [];

    for (const t of tasks) {
      if (t.status === "done") {
        completed.push(t);
        continue;
      }
      const manual = resolveManualBlocks(t)
        .filter((b) => b.minutes > 0)
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
      if (manual.length === 0) {
        unassigned.push(t);
        continue;
      }
      planned.push(t);
      manual.forEach((mb, idx) => {
        const start = new Date(mb.start).getTime();
        blocks.push({
          taskId: t.id,
          start: new Date(start).toISOString(),
          end: new Date(start + mb.minutes * 60_000).toISOString(),
          pinned: true,
          manualBlockId: mb.id,
          isPartialOf:
            manual.length > 1 ? { taskId: t.id, chunkIndex: idx, chunkCount: manual.length } : undefined,
        });
      });
    }

    // Starred first, then by title, in each list.
    const order = (a: Task, b: Task) =>
      Number(!!b.starred) - Number(!!a.starred) || a.title.localeCompare(b.title);
    unassigned.sort(order);
    planned.sort(order);
    completed.sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));

    blocks.sort((a, b) => a.start.localeCompare(b.start));

    const taskMap: Record<string, Task> = {};
    for (const t of tasks) taskMap[t.id] = t;
    const projectMap: Record<string, Project> = {};
    for (const p of projects) projectMap[p.id] = p;

    return { blocks, unassigned, planned, completed, taskMap, projectMap };
  }, [tasks, projects]);
}
