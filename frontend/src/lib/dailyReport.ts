// بناء أوراق التقرير اليومي (دالة صرفة بلا DOM ولا شبكة — سهلة الاختبار).
import type { Task, TeamMember } from "../types/index.ts";
import type { CellStyle, XlsxCell, XlsxRow, XlsxSheet } from "./xlsx.ts";
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

/** رئيسية أولاً ثم فرعياتها مباشرة بعدها (مع عمق التداخل). المهمة الفرعية التي أبوها ليس في هذا اليوم تُعامل كرئيسية. */
function orderTree(memberTasks: Task[]): { task: Task; depth: number }[] {
  const ids = new Set(memberTasks.map((t) => t.id));
  const childrenOf = (id: string) => memberTasks.filter((t) => t.parentId === id).sort(byOrder);
  const roots = memberTasks.filter((t) => !t.parentId || !ids.has(t.parentId)).sort(byOrder);
  const out: { task: Task; depth: number }[] = [];
  const walk = (task: Task, depth: number) => {
    out.push({ task, depth });
    for (const child of childrenOf(task.id)) walk(child, depth + 1);
  };
  for (const root of roots) walk(root, 0);
  return out;
}

function descendants(tasks: Task[], id: string): Task[] {
  return tasks.filter((t) => t.parentId === id).flatMap((kid) => [kid, ...descendants(tasks, kid.id)]);
}

/** إجمالي مدة التوقف للمهمة. توقف لم يُستكمل: يُحتسب حتى الآن إن كانت متوقفة، وإلا حتى انتهائها. */
function pauseMs(task: Task, now: number): number {
  return (task.stopNotes ?? []).reduce((sum, s) => {
    const end = s.resumedAt ?? (task.status === "paused" ? now : (task.endTime ?? now));
    return sum + Math.max(0, end - s.time);
  }, 0);
}

function stopLines(task: Task, reportDate: string): string {
  return (task.stopNotes ?? [])
    .map((s) => {
      const resumed = s.resumedAt ? `استكمال ${formatClock(s.resumedAt, reportDate)}` : task.status === "paused" ? "متوقفة حالياً" : "لم تُستكمل";
      return `توقف ${formatClock(s.time, reportDate)} · ${resumed}${s.note ? `: ${s.note}` : ""}`;
    })
    .join("\n");
}

const blanks = (n: number, s: CellStyle): XlsxCell[] => Array.from({ length: n }, () => ({ v: "", s }));

/** خلايا المهمة من «النوع» إلى «أضافها» (16 خلية) — مشتركة بين الورقة المجمَّعة وورقة الجدول */
function taskCells(groupTasks: Task[], task: Task, depth: number, date: string, now: number): XlsxCell[] {
  const kids = groupTasks.filter((t) => t.parentId === task.id);
  const progress = kids.length > 0 ? calculateParentProgress(kids) : calculateTaskProgress(task);
  const withKids =
    kids.length > 0 ? elapsedMs(task, now) + descendants(groupTasks, task.id).reduce((sum, t) => sum + elapsedMs(t, now), 0) : null;
  const isSub = depth > 0;
  return [
    { v: isSub ? "فرعية" : "رئيسية", s: "center" },
    { v: isSub ? `${"    ".repeat(depth - 1)}↳ ${task.title}` : task.title, s: isSub ? "text" : "boldText" },
    { v: task.description ?? "", s: "text" },
    { v: PRIORITY_LABEL[task.priority] ?? task.priority, s: "center" },
    { v: STATUS_LABEL[task.status] ?? task.status, s: "center" },
    { v: task.current, s: "number" },
    { v: task.target, s: "number" },
    { v: progress / 100, s: "percent" },
    { v: formatClock(task.startedAt ?? task.startTime, date), s: "center" },
    { v: formatClock(task.endTime, date), s: "center" },
    { v: asExcelDuration(elapsedMs(task, now)), s: "duration" },
    { v: withKids === null ? null : asExcelDuration(withKids), s: "duration" },
    { v: asExcelDuration(pauseMs(task, now)), s: "duration" },
    { v: stopLines(task, date), s: "text" },
    { v: (task.comments ?? []).map((c) => (c.userName ? `${c.userName}: ${c.text}` : c.text)).join("\n"), s: "text" },
    { v: task.createdByName ?? "", s: "text" },
  ];
}

/** صف إجمالي: تسمية + ملاحظة نصية + مجموع وقت العمل + مجموع التوقف، والباقي خلايا فارغة بنفس النمط */
function totalRow(len: number, at: { label: number; note: number; work: number; pause: number }, label: string, note: string, workMs: number, pauseTotalMs: number): XlsxRow {
  const row = blanks(len, "total");
  row[at.label] = { v: label, s: "total" };
  row[at.note] = { v: note, s: "total" };
  row[at.work] = { v: asExcelDuration(workMs), s: "totalDuration" };
  row[at.pause] = { v: asExcelDuration(pauseTotalMs), s: "totalDuration" };
  return row;
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

  // ---------- الورقة المجمَّعة: كل مصمم ومهامه وإجماليه، ثم الإجمالي العام ----------
  const TASK_HEADERS = ["النوع", "المهمة", "الوصف", "الأولوية", "الحالة", "المنجز", "المطلوب", "النسبة", "بدأت", "انتهت", "مدة العمل", "الإجمالي مع الفرعيات", "مدة التوقف", "سجل التوقفات", "التعليقات", "أضافها"];
  const head = (labels: string[]): XlsxRow => labels.map((v): XlsxCell => ({ v, s: "header" }));

  const fullRows: XlsxRow[] = [
    [{ v: `التقرير اليومي التفصيلي — ${arabicLongDate(date)}`, s: "title" }],
    [],
    head(["#", ...TASK_HEADERS]),
  ];
  const fullMerges: string[] = ["A1:F1"];
  const FULL_AT = { label: 2, note: 3, work: 11, pause: 13 };
  let grandWork = 0;
  let grandPause = 0;
  let grandSubs = 0;

  if (groups.length === 0) fullRows.push([{ v: "لا توجد مهام في هذا اليوم", s: "text" }]);

  for (const g of groups) {
    const ids = new Set(g.tasks.map((t) => t.id));
    const mains = g.tasks.filter((t) => !t.parentId || !ids.has(t.parentId));
    const doneMains = mains.filter((t) => isTreeDone(g.tasks, t)).length;
    const workMs = g.tasks.reduce((sum, t) => sum + elapsedMs(t, now), 0);
    const pauseTotal = g.tasks.reduce((sum, t) => sum + pauseMs(t, now), 0);
    grandWork += workMs;
    grandPause += pauseTotal;
    grandSubs += g.tasks.length - mains.length;

    fullRows.push([{ v: g.role ? `${g.name} — ${g.role}` : g.name, s: "header" }, ...blanks(16, "header")]);
    fullMerges.push(`A${fullRows.length}:F${fullRows.length}`);

    let n = 0;
    for (const { task, depth } of orderTree(g.tasks)) {
      n += 1;
      fullRows.push([{ v: n, s: "number" }, ...taskCells(g.tasks, task, depth, date, now)]);
    }
    fullRows.push(
      totalRow(17, FULL_AT, `إجمالي ${g.name}`, `رئيسية: ${mains.length} · فرعية: ${g.tasks.length - mains.length} · مكتملة: ${doneMains}`, workMs, pauseTotal)
    );
    fullRows.push([]);
  }

  if (groups.length > 0) {
    fullRows.push(
      totalRow(17, FULL_AT, "الإجمالي العام", `رئيسية: ${totalMain} · فرعية: ${grandSubs} · مكتملة: ${totalDone}`, grandWork, grandPause)
    );
  }

  const full: XlsxSheet = {
    name: "التقرير التفصيلي",
    rtl: true,
    widths: [5, 10, 36, 36, 11, 13, 9, 9, 10, 12, 12, 13, 16, 13, 40, 38, 18],
    merges: fullMerges,
    freezeRows: 3,
    rows: fullRows,
  };

  // ---------- جدول مسطَّح قابل للفلترة (صف لكل مهمة) مع إجمالي أسفله ----------
  const tableRows: XlsxRow[] = [];
  let tn = 0;
  for (const g of groups) {
    for (const { task, depth } of orderTree(g.tasks)) {
      tn += 1;
      tableRows.push([{ v: tn, s: "number" }, { v: g.name, s: "text" }, ...taskCells(g.tasks, task, depth, date, now)]);
    }
  }
  const table: XlsxSheet = {
    name: "جدول المهام",
    rtl: true,
    widths: [5, 20, 10, 36, 36, 11, 13, 9, 9, 10, 12, 12, 13, 16, 13, 40, 38, 18],
    freezeRows: 1,
    autoFilter: tableRows.length > 0 ? `A1:R${tableRows.length + 1}` : undefined,
    rows: [
      head(["#", "المسؤول", ...TASK_HEADERS]),
      ...tableRows,
      ...(tableRows.length > 0 ? [[] as XlsxRow, totalRow(18, { label: 3, note: 4, work: 12, pause: 14 }, "الإجمالي", `${tableRows.length} مهمة`, grandWork, grandPause)] : []),
    ],
  };

  return [full, summary, table];
}
