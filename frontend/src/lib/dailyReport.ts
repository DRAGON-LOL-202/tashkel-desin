// بناء أوراق التقرير اليومي (دالة صرفة بلا DOM ولا شبكة — سهلة الاختبار).
import type { Task, TeamMember } from "../types/index.ts";
import type { XlsxCell, XlsxRow, XlsxSheet } from "./xlsx.ts";
import { calculateParentProgress, calculateTaskProgress } from "./taskProgress.ts";

type MemberLike = Pick<TeamMember, "id" | "name" | "role">;

const DAY_MS = 86_400_000;

const STATUS_LABEL: Record<Task["status"], string> = {
  not_started: "لم تبدأ",
  running: "قيد التنفيذ",
  paused: "متوقفة",
  completed: "مكتملة",
};
const PRIORITY_LABEL: Record<Task["priority"], string> = {
  low: "منخفضة",
  medium: "متوسطة",
  high: "عالية",
};

const pad = (n: number) => String(n).padStart(2, "0");

function isoOfMs(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** وقت محلي HH:mm، ومعه اليوم/الشهر إن كان في يوم غير يوم التقرير */
function formatClock(ms: number | undefined, reportDate: string): string {
  if (!ms) return "";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return isoOfMs(ms) === reportDate ? time : `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${time}`;
}

function elapsedMs(task: Task, now: number): number {
  const base = Math.max(task.totalDuration || 0, 0);
  return task.status === "running" && task.startTime ? base + Math.max(now - task.startTime, 0) : base;
}

/** المدة كجزء من يوم، لتُعرض في Excel بتنسيق [h]:mm:ss وتُجمع صحيحاً */
const asExcelDuration = (ms: number) => ms / DAY_MS;

function isTreeDone(tasks: Task[], task: Task): boolean {
  const children = tasks.filter((t) => t.parentId === task.id);
  return children.length > 0 ? children.every((c) => isTreeDone(tasks, c)) : task.status === "completed";
}

function arabicLongDate(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return new Intl.DateTimeFormat("ar-u-nu-latn", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);
}

const byOrder = (a: Task, b: Task) => a.sortOrder - b.sortOrder || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();

interface Group {
  key: string;
  name: string;
  role: string;
  tasks: Task[];
}

function groupByMember(tasks: Task[], members: MemberLike[]): Group[] {
  const groups: Group[] = members.map((m) => ({ key: m.id, name: m.name, role: m.role, tasks: [] }));
  const index = new Map(groups.map((g) => [g.key, g]));
  for (const task of tasks) {
    let group = index.get(task.assigneeId);
    if (!group) {
      // مسؤول غير ظاهر في قائمة الفريق (مثلاً حساب معطَّل): لا نُسقط مهامه من التقرير
      group = { key: task.assigneeId, name: task.assigneeName ?? "غير معروف", role: "", tasks: [] };
      groups.push(group);
      index.set(group.key, group);
    }
    group.tasks.push(task);
  }
  return groups.filter((g) => g.tasks.length > 0);
}

/** رئيسية أولاً ثم فرعياتها مباشرة بعدها. المهمة الفرعية التي أبوها ليس في هذا اليوم تُعامل كرئيسية. */
function orderTree(memberTasks: Task[]): { task: Task; isSub: boolean }[] {
  const ids = new Set(memberTasks.map((t) => t.id));
  const childrenOf = (id: string) => memberTasks.filter((t) => t.parentId === id).sort(byOrder);
  const roots = memberTasks.filter((t) => !t.parentId || !ids.has(t.parentId)).sort(byOrder);
  const out: { task: Task; isSub: boolean }[] = [];
  const walk = (task: Task, isSub: boolean) => {
    out.push({ task, isSub });
    for (const child of childrenOf(task.id)) walk(child, true);
  };
  for (const root of roots) walk(root, !!root.parentId && ids.has(root.parentId));
  return out;
}

export function buildDailyReportSheets(tasks: Task[], members: MemberLike[], date: string, now: number = Date.now()): XlsxSheet[] {
  const dayTasks = tasks.filter((t) => t.date === date);
  const groups = groupByMember(dayTasks, members);

  // ---------- ورقة الملخص ----------
  const summaryHeader: XlsxRow = ["المصمم", "المسمى الوظيفي", "المهام الرئيسية", "المكتملة", "غير المكتملة", "وقت العمل", "نسبة المكتملة"].map(
    (v): XlsxCell => ({ v, s: "header" })
  );
  const summaryRows: XlsxRow[] = [];
  let totalMain = 0;
  let totalDone = 0;
  let totalMs = 0;

  for (const g of groups) {
    const ids = new Set(g.tasks.map((t) => t.id));
    const mains = g.tasks.filter((t) => !t.parentId || !ids.has(t.parentId));
    const done = mains.filter((t) => isTreeDone(g.tasks, t)).length;
    const ms = g.tasks.reduce((sum, t) => sum + elapsedMs(t, now), 0);
    totalMain += mains.length;
    totalDone += done;
    totalMs += ms;
    summaryRows.push([
      { v: g.name, s: "text" },
      { v: g.role, s: "text" },
      { v: mains.length, s: "number" },
      { v: done, s: "number" },
      { v: mains.length - done, s: "number" },
      { v: asExcelDuration(ms), s: "duration" },
      { v: mains.length ? done / mains.length : 0, s: "percent" },
    ]);
  }

  const summary: XlsxSheet = {
    name: "الملخص",
    rtl: true,
    widths: [24, 20, 16, 12, 14, 14, 16],
    merges: ["A1:G1"],
    freezeRows: 3,
    rows: [
      [{ v: `تقرير المهام اليومي — ${arabicLongDate(date)}`, s: "title" }],
      [],
      summaryHeader,
      ...(summaryRows.length > 0
        ? summaryRows
        : [[{ v: "لا توجد مهام في هذا اليوم", s: "text" } as XlsxCell]]),
      ...(summaryRows.length > 0
        ? [
            [
              { v: "الإجمالي", s: "total" },
              { v: "", s: "total" },
              { v: totalMain, s: "totalNumber" },
              { v: totalDone, s: "totalNumber" },
              { v: totalMain - totalDone, s: "totalNumber" },
              { v: asExcelDuration(totalMs), s: "totalDuration" },
              { v: totalMain ? totalDone / totalMain : 0, s: "totalPercent" },
            ] as XlsxRow,
          ]
        : []),
    ],
  };

  // ---------- ورقة التفاصيل ----------
  const detailHeader: XlsxRow = [
    "#",
    "المسؤول",
    "النوع",
    "المهمة",
    "الوصف",
    "الأولوية",
    "الحالة",
    "المنجز",
    "المطلوب",
    "النسبة",
    "بدأت",
    "انتهت",
    "مدة العمل",
    "عدد المرفقات",
    "ملاحظات الإيقاف",
    "التعليقات",
    "أضافها",
  ].map((v): XlsxCell => ({ v, s: "header" }));

  const detailRows: XlsxRow[] = [];
  let n = 0;
  for (const g of groups) {
    for (const { task, isSub } of orderTree(g.tasks)) {
      const kids = g.tasks.filter((t) => t.parentId === task.id);
      const progress = kids.length > 0 ? calculateParentProgress(kids) : calculateTaskProgress(task);
      n += 1;
      detailRows.push([
        { v: n, s: "number" },
        { v: g.name, s: "text" },
        { v: isSub ? "فرعية" : "رئيسية", s: "center" },
        { v: isSub ? `↳ ${task.title}` : task.title, s: "text" },
        { v: task.description ?? "", s: "text" },
        { v: PRIORITY_LABEL[task.priority] ?? task.priority, s: "center" },
        { v: STATUS_LABEL[task.status] ?? task.status, s: "center" },
        { v: task.current, s: "number" },
        { v: task.target, s: "number" },
        { v: progress / 100, s: "percent" },
        { v: formatClock(task.startedAt ?? task.startTime, date), s: "center" },
        { v: formatClock(task.endTime, date), s: "center" },
        { v: asExcelDuration(elapsedMs(task, now)), s: "duration" },
        { v: task.attachments?.length ?? 0, s: "number" },
        { v: (task.stopNotes ?? []).map((s) => s.note).join("\n"), s: "text" },
        { v: (task.comments ?? []).map((c) => (c.userName ? `${c.userName}: ${c.text}` : c.text)).join("\n"), s: "text" },
        { v: task.createdByName ?? "", s: "text" },
      ]);
    }
  }

  const lastCol = "Q";
  const detail: XlsxSheet = {
    name: "المهام",
    rtl: true,
    widths: [5, 20, 10, 34, 40, 11, 13, 9, 9, 10, 12, 12, 12, 11, 34, 40, 18],
    freezeRows: 1,
    autoFilter: detailRows.length > 0 ? `A1:${lastCol}${detailRows.length + 1}` : undefined,
    rows: [detailHeader, ...detailRows],
  };

  return [summary, detail];
}
