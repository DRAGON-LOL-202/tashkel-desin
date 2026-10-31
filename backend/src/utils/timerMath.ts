// حساب المؤقت التنازلي (دوال نقية بلا قاعدة بيانات، لسهولة الاختبار).
// الحالة المخزّنة: remainingMs عند آخر نقطة حفظ + runningSince إن كان يعدّ.
export const MAX_TIMER_MINUTES = 24 * 60;
export const MS_PER_MINUTE = 60_000;

export type TimerStatusName = "PENDING" | "RUNNING" | "PAUSED" | "EXPIRED";

export interface TimerRow {
  status: TimerStatusName;
  plannedMs: number;
  remainingMs: number;
  runningSince: Date | null;
}

/** المتبقي الفعلي الآن (لا يقل عن صفر). */
export function remainingAt(t: Pick<TimerRow, "status" | "remainingMs" | "runningSince">, now: number): number {
  if (t.status === "RUNNING" && t.runningSince) {
    return Math.max(t.remainingMs - Math.max(now - t.runningSince.getTime(), 0), 0);
  }
  return Math.max(t.remainingMs, 0);
}

/** الحالة المعروضة: مؤقت يعدّ وانتهى وقته يُعرض منتهياً حتى قبل أن يلحقه المراقب. */
export function effectiveStatus(t: TimerRow, now: number): TimerStatusName {
  if (t.status === "RUNNING" && remainingAt(t, now) <= 0) return "EXPIRED";
  return t.status;
}

export function serializeTimer(t: TimerRow, now = Date.now()) {
  const remainingMs = remainingAt(t, now);
  const status = effectiveStatus(t, now);
  return {
    status: status.toLowerCase(),
    plannedMs: t.plannedMs,
    remainingMs, // محسوب عند serverNow؛ الواجهة تنقص منه ما مرّ منذ استلامه (لا تعتمد على ساعة جهازها)
    serverNow: now,
    expiresAt: status === "RUNNING" && t.runningSince ? now + remainingMs : undefined,
  };
}
