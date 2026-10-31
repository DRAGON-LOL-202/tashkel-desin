import { useEffect, useMemo, useState } from "react";
import type { Task, TaskTimerState } from "../types";

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

/**
 * العدّ التنازلي لمؤقت مهمة. المتبقي يأتي من الخادم عند serverNow، ونطرح منه ما مرّ منذ استلام الرد
 * على هذا الجهاز، فلا نعتمد على ساعة الجهاز (قد تختلف عن الخادم). كل إعادة جلب تعيد المعايرة.
 * يعيد null عند عدم وجود مؤقت.
 */
export function useCountdown(timer: TaskTimerState | undefined): { remainingMs: number; status: TaskTimerState["status"] } | null {
  const [now, setNow] = useState(() => Date.now());
  // eslint-disable-next-line react-hooks/exhaustive-deps -- نريد لحظة الاستلام عند تغيّر كائن المؤقت فقط
  const receivedAt = useMemo(() => Date.now(), [timer]);
  const running = timer?.status === "running";

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  if (!timer) return null;
  if (!running) return { remainingMs: timer.remainingMs, status: timer.status };
  const remainingMs = Math.max(timer.remainingMs - Math.max(now - receivedAt, 0), 0);
  return { remainingMs, status: remainingMs <= 0 ? "expired" : "running" };
}
