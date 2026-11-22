// الحضور والانصراف: نظام جلسات. اليوم الذي تُنسب إليه الجلسة هو يوم بدايتها (workDate)،
// فمن حضر 10 مساءً وانصرف 2 صباحاً تُحسب جلسته كلها على يوم الحضور.
// يوم البداية يُحسب بتوقيت ATTENDANCE_TZ (الافتراضي Africa/Cairo) لا بتوقيت الخادم (UTC على Render).

export const attendanceTz = () => process.env.ATTENDANCE_TZ?.trim() || "Africa/Cairo";

/** yyyy-MM-dd للحظة معيّنة بتوقيت المنطقة المضبوطة */
export function workDateOf(at: Date, tz: string = attendanceTz()): string {
  // en-CA يعطي الصيغة yyyy-MM-dd مباشرة
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** يحوّل بداية يوم YYYY-MM-DD بتوقيت tz إلى لحظة UTC الفعلية */
function tzMidnightUtc(isoDay: string, tz: string): Date {
  const [y, m, d] = isoDay.split("-").map(Number);
  const utcGuess = Date.UTC(y, m - 1, d, 0, 0, 0);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const offsetAt = (ms: number) => {
    const parts = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
    const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    return asUtc - ms;
  };
  const first = utcGuess - offsetAt(utcGuess);
  const second = utcGuess - offsetAt(first);
  return new Date(second);
}

/** حدود اليوم [start, end) بتوقيت المنطقة (مناسب لاستعلامات gte / lt على عمود DateTime) */
export function tzDayBoundsUtc(isoDay: string, tz: string = attendanceTz()): { start: Date; end: Date } {
  try {
    const start = tzMidnightUtc(isoDay, tz);
    const next = new Date(Date.parse(`${isoDay}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    const end = tzMidnightUtc(next, tz);
    return { start, end };
  } catch {
    const start = new Date(`${isoDay}T00:00:00.000Z`);
    return { start, end: new Date(start.getTime() + 86_400_000) };
  }
}

/** بداية اليوم الحالي بتوقيت المنطقة (UTC timestamp لبداية اليوم المحلي) */
export function startOfTodayUtc(now: Date = new Date(), tz: string = attendanceTz()): Date {
  try {
    return tzDayBoundsUtc(workDateOf(now, tz), tz).start;
  } catch {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }
}

export interface AttendanceRow {
  id: string;
  userId: string;
  workDate: string;
  startTime: Date;
  endTime: Date | null;
}

/** الشكل الذي تتوقعه الواجهة: الأوقات بالميلي ثانية، و endTime = null لجلسة مفتوحة */
export function serializeSession(row: AttendanceRow) {
  return {
    id: row.id,
    userId: row.userId,
    workDate: row.workDate,
    startTime: row.startTime.getTime(),
    endTime: row.endTime ? row.endTime.getTime() : null,
  };
}
