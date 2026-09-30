import type { Task } from "../types";

export function calculateTaskProgress(task: Pick<Task, "current" | "target">): number {
  if (task.target <= 0) return 0;
  return Math.round(Math.min(100, Math.max(0, (task.current / task.target) * 100)) * 10) / 10;
}

export function calculateParentProgress(children: Task[]): number {
  const target = children.reduce((sum, child) => sum + Math.max(0, child.target), 0);
  if (target <= 0) return 0;

  const current = children.reduce(
    (sum, child) => sum + Math.min(Math.max(0, child.current), Math.max(0, child.target)),
    0
  );
  return Math.round(Math.min(100, Math.max(0, (current / target) * 100)) * 10) / 10;
}
