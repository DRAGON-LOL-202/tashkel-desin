// تجميع وقت العمل اليومي لكل موظف (للإحصائيات طويلة الأمد).
// القاعدة مطابقة لما تحسبه الواجهة (getTaskElapsed) ولـ serializeTask:
//   - مجموع (stopTime - startTime) لكل سجل مُغلق، ولا يقل عن صفر.
//   - إن كانت المهمة RUNNING يُضاف (الآن - startTime) لأول سجل مفتوح.
//   - تُنسب المدة ليوم المهمة (Task.date) وللمسؤول (assignedToId)، وتدخل الفرعيات كالأوردرات.

export interface TimeStatsTask {
  date: string;
  assignedToId: string;
  status: string;
  timeLogs: { startTime: Date; stopTime: Date | null }[];
}

export interface DailyTimeRow {
  date: string;
  assigneeId: string;
  durationMs: number;
}

export function taskElapsedMs(task: Pick<TimeStatsTask, "status" | "timeLogs">, now: number): number {
  let total = 0;
  for (const log of task.timeLogs) {
    if (log.stopTime) total += Math.max(log.stopTime.getTime() - log.startTime.getTime(), 0);
  }
  if (task.status === "RUNNING") {
    const open = task.timeLogs.find((log) => !log.stopTime);
    if (open) total += Math.max(now - open.startTime.getTime(), 0);
  }
  return total;
}

export function computeDailyTime(tasks: TimeStatsTask[], now: number = Date.now()): DailyTimeRow[] {
  const sums = new Map<string, DailyTimeRow>();
  for (const task of tasks) {
    const durationMs = taskElapsedMs(task, now);
    if (durationMs <= 0) continue;
    const key = `${task.date}|${task.assignedToId}`;
    const row = sums.get(key);
    if (row) row.durationMs += durationMs;
    else sums.set(key, { date: task.date, assigneeId: task.assignedToId, durationMs });
  }
  return [...sums.values()].sort((a, b) => a.date.localeCompare(b.date) || a.assigneeId.localeCompare(b.assigneeId));
}
