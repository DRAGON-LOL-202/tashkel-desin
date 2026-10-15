// الحضور والانصراف: نظام جلسات. اليوم الذي تُنسب إليه الجلسة هو يوم بدايتها (workDate)،
// فمن حضر 10 مساءً وانصرف 2 صباحاً تُحسب جلسته كلها على يوم الحضور.
// يوم البداية يُحسب بتوقيت ATTENDANCE_TZ (الافتراضي Africa/Cairo) لا بتوقيت الخادم (UTC على Render).

export const attendanceTz = () => process.env.ATTENDANCE_TZ?.trim() || "Africa/Cairo";

/** yyyy-MM-dd للحظة معيّنة بتوقيت المنطقة المضبوطة */
export function workDateOf(at: Date, tz: string = attendanceTz()): string {
  // en-CA يعطي الصيغة yyyy-MM-dd مباشرة
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
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
