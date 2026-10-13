// الإحصائيات طويلة الأمد: مصفوفة (يوم × موظف) لوقت العمل وورقة Excel لها.
// دوال صرفة بلا DOM ولا شبكة — سهلة الاختبار. المدد بالميلي ثانية.
import type { DailyTimeStat, TeamMember } from "../types/index.ts";
import type { XlsxRow, XlsxSheet } from "./xlsx.ts";

type MemberLike = Pick<TeamMember, "id" | "name">;

const DAY_MS = 86_400_000;
/** نفس حد الخادم لفترة الإحصائيات المجمّعة */
export const MAX_STATS_DAYS = 400;

export interface TimeMatrix {
  from: string;
  to: string;
  /** الأيام التي فيها وقت عمل (تصاعدياً)، أو كل أيام الفترة إن طُلب ذلك */
  days: string[];
  members: MemberLike[];
  /** مفتاح الخلية: `${date}|${memberId}` */
  cells: Record<string, number>;
  dayTotals: Record<string, number>;
  memberTotals: Record<string, number>;
  /** عدد الأيام التي عمل فيها كل موظف (مدة > 0) */
  memberDays: Record<string, number>;
  grandTotal: number;
}

export const cellKey = (date: string, memberId: string) => `${date}|${memberId}`;

const isoOfUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** عدد أيام الفترة شاملةً الطرفين (0 إن كانت غير صالحة) */
export function countDays(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  return Math.round((end - start) / DAY_MS) + 1;
}

/** اسم عمود Excel من رقمه (0 → A، 26 → AA) */
function columnLetter(index: number): string {
  let n = index;
  let name = "";
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return name;
}

/** كل أيام الفترة شاملةً الطرفين (فارغة إن كانت الفترة معكوسة أو أطول من الحد) */
export function enumerateDays(from: string, to: string): string[] {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return [];
  const days: string[] = [];
  for (let t = start; t <= end && days.length < MAX_STATS_DAYS; t += DAY_MS) days.push(isoOfUtc(t));
  return days;
}

/** آخر N شهراً حتى اليوم (شاملةً اليوم): من نفس اليوم قبل N شهراً + يوم واحد */
export function rangeLastMonths(months: number, today: string): { from: string; to: string } {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  d.setUTCDate(d.getUTCDate() + 1);
  return { from: isoOfUtc(d.getTime()), to: today };
}

export function buildTimeMatrix(
  rows: DailyTimeStat[],
  members: MemberLike[],
  from: string,
  to: string,
  options: { includeEmptyDays?: boolean } = {}
): TimeMatrix {
  const memberIds = new Set(members.map((m) => m.id));
  const cells: Record<string, number> = {};
  const dayTotals: Record<string, number> = {};
  const memberTotals: Record<string, number> = {};
  const memberDays: Record<string, number> = {};
  for (const m of members) {
    memberTotals[m.id] = 0;
    memberDays[m.id] = 0;
  }

  for (const row of rows) {
    // أعضاء غير ظاهرين (مثلاً معطَّلون) وصفوف خارج الفترة لا تدخل المصفوفة
    if (!memberIds.has(row.assigneeId) || row.date < from || row.date > to || !(row.durationMs > 0)) continue;
    const key = cellKey(row.date, row.assigneeId);
    if (cells[key] === undefined) memberDays[row.assigneeId] += 1;
    cells[key] = (cells[key] ?? 0) + row.durationMs;
    dayTotals[row.date] = (dayTotals[row.date] ?? 0) + row.durationMs;
    memberTotals[row.assigneeId] += row.durationMs;
  }

  const days = options.includeEmptyDays ? enumerateDays(from, to) : Object.keys(dayTotals).sort();
  const grandTotal = Object.values(memberTotals).reduce((sum, ms) => sum + ms, 0);
  return { from, to, days, members, cells, dayTotals, memberTotals, memberDays, grandTotal };
}

/** h:mm (الدقائق مقرّبة لأسفل) — مدمجة للجداول */
export function formatHoursMinutes(ms: number): string {
  const totalMinutes = Math.floor(Math.max(ms || 0, 0) / 60_000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

const asExcelDuration = (ms: number) => ms / DAY_MS;

/** ورقتان: ملخص لكل موظف، ويومي (يوم × موظف). التواريخ نصوص بصيغة yyyy-MM-dd. */
export function buildTimeStatsSheets(matrix: TimeMatrix): XlsxSheet[] {
  const { members, days, from, to } = matrix;
  const memberCount = members.length;

  const summaryRows: XlsxRow[] = [
    [{ v: `ملخص وقت العمل — من ${from} إلى ${to}`, s: "title" }],
    [],
    [
      { v: "الموظف", s: "header" },
      { v: "أيام العمل", s: "header" },
      { v: "إجمالي الوقت", s: "header" },
      { v: "متوسط الوقت في اليوم", s: "header" },
    ],
    ...members.map<XlsxRow>((m) => {
      const worked = matrix.memberDays[m.id];
      const total = matrix.memberTotals[m.id];
      return [
        { v: m.name, s: "boldText" },
        { v: worked, s: "number" },
        { v: asExcelDuration(total), s: "duration" },
        { v: worked > 0 ? asExcelDuration(total / worked) : null, s: "duration" },
      ];
    }),
    [
      { v: "الإجمالي", s: "total" },
      { v: null, s: "total" },
      { v: asExcelDuration(matrix.grandTotal), s: "totalDuration" },
      { v: null, s: "total" },
    ],
  ];

  const lastCol = columnLetter(memberCount + 1); // أعمدة: التاريخ + الموظفون + الإجمالي
  const dailyRows: XlsxRow[] = [
    [{ v: `وقت العمل اليومي لكل موظف — من ${from} إلى ${to}`, s: "title" }],
    [],
    [{ v: "التاريخ", s: "header" }, ...members.map((m) => ({ v: m.name, s: "header" as const })), { v: "الإجمالي", s: "header" }],
    ...days.map<XlsxRow>((day) => [
      { v: day, s: "center" },
      ...members.map((m) => {
        const ms = matrix.cells[cellKey(day, m.id)];
        return { v: ms ? asExcelDuration(ms) : null, s: "duration" as const };
      }),
      { v: asExcelDuration(matrix.dayTotals[day] ?? 0), s: "totalDuration" },
    ]),
    [
      { v: "الإجمالي", s: "total" },
      ...members.map((m) => ({ v: asExcelDuration(matrix.memberTotals[m.id]), s: "totalDuration" as const })),
      { v: asExcelDuration(matrix.grandTotal), s: "totalDuration" },
    ],
  ];

  return [
    { name: "ملخص", rows: summaryRows, rtl: true, widths: [26, 12, 16, 22], merges: ["A1:D1"] },
    {
      name: "يومي",
      rows: dailyRows,
      rtl: true,
      widths: [14, ...members.map(() => 16), 16],
      merges: [`A1:${lastCol}1`],
      freezeRows: 3,
    },
  ];
}
