import { useEffect, useState } from "react";
import type { Task } from "../types";

export function getTaskElapsed(task: Task, now = Date.now()): number {
  if (task.status === "running" && task.startTime) {
    return task.totalDuration + Math.max(now - task.startTime, 0);
  }
  return task.totalDuration;
}

export function useElapsed(task: Task): number {
  const [, tick] = useState(0);

  useEffect(() => {
    if (task.status !== "running") return;
    const id = setInterval(() => tick((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, [task.status]);

  return getTaskElapsed(task);
}
