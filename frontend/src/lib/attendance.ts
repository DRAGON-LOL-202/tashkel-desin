// حسابات الحضور والانصراف: دوال صرفة بلا DOM ولا شبكة. المدد بالميلي ثانية.
// الجلسة تُنسب ليوم بدايتها (workDate) حتى لو انتهت بعد منتصف الليل.
import type { AttendanceSession, TeamMember } from "../types/index.ts";
import type { XlsxRow, XlsxSheet } from "./xlsx.ts";

type MemberLike = Pick<TeamMember, "id" | "name">;

const DAY_MS = 86_400_000;

export const cellKey = (date: string, memberId: string) => `${date}|${memberId}`;

/**
 * مدة الجلسة. المفتوحة تُحسب حتى الآن فقط إن كانت "حيّة"؛ أما المفتوحة من يوم سابق ولم يُسجَّل لها انصراف
 * فمدتها 0 لأن وقت الانصراف مجهول (لا نخمّنه).
 */
export function sessionMs(session: AttendanceSession, now: number, live = true): number {
  if (session.endTime !== null) return Math.max(0, session.endTime - session.startTime);
  return live ? Math.max(0, now - session.startTime) : 0;
}

export interface DaySummary {
  sessions: AttendanceSession[];
  /** أول حضور في اليوم */
  firstIn: number;
  /** آخر انصراف (null إن كانت آخر جلسة مفتوحة) */
  lastOut: number | null;
  totalMs: number;
  hasOpen: boolean;
}

export function summarizeDay(sessions: AttendanceSession[], now: number, live = true): DaySummary | null {
  if (sessions.length === 0) return null;
  const sorted = [...sessions].sort((a, b) => a.startTime - b.startTime);
  const last = sorted[sorted.length - 1];
  return {
    sessions: sorted,
    firstIn: sorted[0].startTime,
    lastOut: last.endTime,
    totalMs: sorted.reduce((sum, s) => sum + sessionMs(s, now, live), 0),
    hasOpen: sorted.some((s) => s.endTime === null),
  };
}

/** كل أيام الشهر (yyyy-MM) تصاعدياً */
export function monthDays(month: string): string[] {
  const [year, m] = month.split("-").map(Number);
  if (!year || !m) return [];
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

export interface AttendanceMatrix {
  month: string;
  days: string[];
  members: MemberLike[];
  /** مفتاح الخلية: `${date}|${memberId}` — فقط الأيام التي فيها جلسات */
  cells: Record<string, DaySummary>;
  /** عدد أيام حضور كل عضو */
  memberDays: Record<string, number>;
  /** إجمالي مدة كل عضو */
  memberTotals: Record<string, number>;
  /** أيام فيها جلسة بلا انصراف من يوم سابق (تحتاج مراجعة) */
  memberUnclosed: Record<string, number>;
  grandTotal: number;
}

export function buildAttendanceMatrix(
  sessions: AttendanceSession[],
  members: MemberLike[],
  month: string,
  now: number,
  today: string
): AttendanceMatrix {
  const days = monthDays(month);
  const inMonth = new Set(days);
  const ids = new Set(members.map((m) => m.id));
  const grouped = new Map<string, AttendanceSession[]>();
  for (const s of sessions) {
    if (!ids.has(s.userId) || !inMonth.has(s.workDate)) continue;
    const key = cellKey(s.workDate, s.userId);
    const list = grouped.get(key);
    if (list) list.push(s);
    else grouped.set(key, [s]);
  }

  const cells: Record<string, DaySummary> = {};
  const memberDays: Record<string, number> = {};
  const memberTotals: Record<string, number> = {};
  const memberUnclosed: Record<string, number> = {};
  for (const m of members) {
    memberDays[m.id] = 0;
    memberTotals[m.id] = 0;
    memberUnclosed[m.id] = 0;
  }
  for (const [key, list] of grouped) {
    const [date, memberId] = key.split("|");
    const summary = summarizeDay(list, now, date === today);
    if (!summary) continue;
    cells[key] = summary;
    memberDays[memberId] += 1;
    memberTotals[memberId] += summary.totalMs;
    if (summary.hasOpen && date !== today) memberUnclosed[memberId] += 1;
  }
  const grandTotal = Object.values(memberTotals).reduce((sum, ms) => sum + ms, 0);
  return { month, days, members, cells, memberDays, memberTotals, memberUnclosed, grandTotal };
}

const pad = (n: number) => String(n).padStart(2, "0");
/** HH:mm بتوقيت الجهاز (24 ساعة) — للتصدير */
export const clock24 = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const asExcelDuration = (ms: number) => ms / DAY_MS;

/** ورقتان: ملخص لكل موظف، وتفاصيل كل جلسة (يوم/موظف/حضور/انصراف/مدة) */
export function buildAttendanceSheets(matrix: AttendanceMatrix, today: string): XlsxSheet[] {
  const { members, days, month } = matrix;

  const summaryRows: XlsxRow[] = [
    [{ v: `ملخص الحضور — ${month}`, s: "title" }],
    [],
    [
      { v: "الموظف", s: "header" },
      { v: "أيام الحضور", s: "header" },
      { v: "إجمالي الساعات", s: "header" },
      { v: "متوسط الساعات في اليوم", s: "header" },
      { v: "أيام بلا انصراف", s: "header" },
    ],
    ...members.map<XlsxRow>((m) => {
      const worked = matrix.memberDays[m.id];
      const total = matrix.memberTotals[m.id];
      return [
        { v: m.name, s: "boldText" },
        { v: worked, s: "number" },
        { v: asExcelDuration(total), s: "duration" },
        { v: worked > 0 ? asExcelDuration(total / worked) : null, s: "duration" },
        { v: matrix.memberUnclosed[m.id], s: "number" },
      ];
    }),
    [
      { v: "الإجمالي", s: "total" },
      { v: null, s: "total" },
      { v: asExcelDuration(matrix.grandTotal), s: "totalDuration" },
      { v: null, s: "total" },
      { v: null, s: "total" },
    ],
  ];

  const detailRows: XlsxRow[] = [
    [{ v: `تفاصيل الحضور والانصراف — ${month}`, s: "title" }],
    [],
    [
      { v: "التاريخ", s: "header" },
      { v: "الموظف", s: "header" },
      { v: "الجلسة", s: "header" },
      { v: "الحضور", s: "header" },
      { v: "الانصراف", s: "header" },
      { v: "المدة", s: "header" },
    ],
  ];
  for (const day of days) {
    for (const m of members) {
      const summary = matrix.cells[cellKey(day, m.id)];
      if (!summary) continue;
      summary.sessions.forEach((s, index) => {
        const open = s.endTime === null;
        detailRows.push([
          { v: day, s: "center" },
          { v: m.name, s: "text" },
          { v: index === 0 ? "حضور" : "عودة", s: "center" },
          { v: clock24(s.startTime), s: "center" },
          { v: open ? (day === today ? "لم ينصرف بعد" : "لم يُسجَّل انصراف") : clock24(s.endTime as number), s: "center" },
          { v: open && day !== today ? null : asExcelDuration(sessionMs(s, Date.now(), day === today)), s: "duration" },
        ]);
      });
    }
  }

  return [
    { name: "ملخص", rows: summaryRows, rtl: true, widths: [26, 14, 18, 24, 16], merges: ["A1:E1"] },
    { name: "تفاصيل", rows: detailRows, rtl: true, widths: [14, 24, 10, 12, 18, 12], merges: ["A1:F1"], freezeRows: 3, autoFilter: `A3:F${detailRows.length}` },
  ];
}
