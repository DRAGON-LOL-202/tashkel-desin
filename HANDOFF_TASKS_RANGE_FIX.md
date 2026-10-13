# HANDOFF — إصلاح جلب المهام بدون فترة (حد 5000 الصامت + بطء اللوحة)

> التاريخ: 13 أكتوبر 2026 · المشروع: `tashkel-desin` (frontend: React/Vite · backend: Express/Prisma)
> الحالة: **نُفِّذت المراحل A وB وD (Checkpoint 21، انظر `CHANGES.md`). المرحلة C مكتوبة لكنها مغلقة افتراضياً خلف `TASKS_REQUIRE_RANGE=true`. لم تُشغَّل الاختبارات ولا البناء بعد.**
>
> **فروق التنفيذ عن الخطة أدناه:** (1) `Dashboard` يستعمل `dayLoading` بدل `setTasksLoading(true)` عند تغيير اليوم، لأن `tasksLoading` يستبدل الصفحة كلها بشاشة تحميل فيُعاد بناء `DateNavigator`. (2) المرحلة C خلف متغير بيئة بدل أن تكون دائمة. (3) مرحلة D جديدة: `GET /tasks/stats/time` ولوحة الإحصائيات طويلة الأمد في `TeamDashboard`.
> المراجع بصيغة `ملف:سطر` وهي من النسخة المرفوعة في `tashkel-desin.rar`.

---

## 1) الملخص التنفيذي

لوحة المهام تجلب **كل مهام النظام من أول يوم** في كل مرة، ثم تعرض يوماً واحداً فقط. الخادم يقصّ الرد عند **5000 مهمة (تشمل الفرعية)** مرتّبةً من الأقدم، فعند تجاوز الحد تختفي **مهام اليوم الجديدة** من اللوحة **بدون أي رسالة خطأ**. وقبل الوصول للحد، تتباطأ اللوحة تدريجياً لأن الجلب الكامل يتكرر بعد كل عملية وعند كل تحديث تلقائي لكل مستخدم.

**الحل (3 أجزاء):**
1. جلب مهام اليوم المعروض فقط (الخادم يدعم `date` أصلاً).
2. مسار خفيف جديد `GET /api/tasks/day-states` لألوان التقويم (أحمر/أخضر).
3. منع القص الصامت: رفض الطلب بدون فترة أو بفترة طويلة بخطأ واضح — **على مرحلة لاحقة** (انظر §8).

مع تعديل لازم لصفحة `TeamDashboard` التي تعتمد على القائمة الكاملة (§6).

---

## 2) المشكلة بالتفصيل

### 2.1 سلسلة البيانات الحالية

| # | الموضع | ما يحدث |
|---|--------|---------|
| 1 | `frontend/src/services/tasksService.ts:79-82` | `list()` يستدعي `api("/tasks")` بدون أي معاملات |
| 2 | `backend/src/routes/tasks.ts:75-91` | `findMany` بترتيب `date asc, sortOrder asc, createdAt asc` و`take: 5000`، مع `include` للتعليقات وسجلات الوقت والمستخدمين |
| 3 | `frontend/src/pages/Dashboard.tsx:102-110` | يفلتر القائمة الكاملة في المتصفح بـ `task.date === selectedDate` |
| 4 | `frontend/src/pages/Dashboard.tsx:134-150` | يحسب `dateStates` (لون كل يوم في التقويم) من **القائمة الكاملة** — وهذا هو سبب تصميم الجلب الكامل |

### 2.2 لماذا تختفي مهام اليوم؟
الترتيب تصاعدي بالتاريخ، و`take: 5000` يحتفظ بالأقدم. عند تجاوز العدد، المحذوف من الرد هو **الأحدث** = مهام اليوم. الرد `{ tasks }` فقط، بلا علامة اقتطاع ولا خطأ، فتظهر اللوحة فارغة.

### 2.3 من يتأثر أولاً؟
- الإدارة (STAFF) ترى كل المهام فتصل للحد أولاً.
- المصمم يجلب مهامه فقط (`assignedToId: me.id`) فيتأخر وصوله للحد.
- الفرعية صفوف في نفس الجدول (`parentId`) وتدخل في الـ5000.

### 2.4 التقدير الزمني (بافتراض صريح)
إذا كانت **15 مهمة لكل شخص يومياً تشمل الفرعية** وفريق من 5: ‏75/يوم → 5000 ÷ 75 ≈ **67 يوماً** (نحو 2–3 أشهر). إذا كانت الـ15 للفريق كله فالحد يتأخر إلى نحو 11 شهراً. **يجب التحقق من الرقم الحقيقي** عبر `SELECT count(*) FROM "Task"` على قاعدة الإنتاج.

### 2.5 البطء قبل الحد
- يُحمَّل التاريخ كله (مع التعليقات وسجلات الوقت وروابط الصور) ثم يُعرض يوم واحد.
- `refreshTasks` بعد كل عملية (`Dashboard.tsx:152-157`) و`useLiveSync` (`Dashboard.tsx` ~ سطر 78-86، و`hooks/useResource.ts:26-34`) يعيدان الجلب الكامل في متصفح **كل** عضو متصل عند أي تعديل.

### 2.6 أثر مخفي على `TeamDashboard`
`TeamDashboard.tsx:17` يجلب القائمة الكاملة ويبني منها قائمة الشهور وخيارات التواريخ والإحصائيات (`:25-52`). بعد بلوغ الحد ستعرض هذه الصفحة أرقاماً ناقصة في آخر الأشهر **دون أي تنبيه**.

---

## 3) ما تم التحقق منه وما لم يتم

**تم (بقراءة الكود):**
- `api()` يدعم خيار `query` (`frontend/src/lib/api.ts:54-85`).
- الخادم يقبل `date` و`from` و`to` و`assigneeId` (`validators/tasks.ts` — `listQuerySchema`).
- الترقيم `buildNumberMap` يجمّع بمفتاح `date|assignee|parent` (`lib/taskOrder.ts:22-35`) فلا يتأثر بجلب يوم واحد.
- تصدير Excel يعمل على مهام اليوم المختار (`Dashboard.tsx:278-284`).
- `NewTaskModal` يستعمل `allTasks` فقط داخل `getSiblings` مع `date` محدد (`NewTaskModal.tsx:69`).
- نقل غير المنتهي ونقل الأوردر ليوم آخر وتنفيذ النسخ تتم على الخادم.
- فهارس موجودة: `@@index([date])` و`@@index([assignedToId, date])` (`schema.prisma:102-104`) — تخدم الاستعلامات الجديدة.

**لم يتم:**
- لم يُشغَّل التطبيق ولا الاختبارات.
- لم أقرأ `public/sw.js` (PWA) — يؤثر على خطة النشر (§8).
- لم أقرأ `backend/scripts/http-smoke.mjs` بالكامل.
- لا أعرف عدد المهام الفعلي في الإنتاج.

---

## 4) خطة التنفيذ (بالترتيب الآمن)

| المرحلة | المحتوى | يمكن نشرها وحدها؟ |
|---------|---------|-------------------|
| **A** | الخادم: `day-states` + `months` + توحيد `scope` (بدون رفض أي طلب بعد) | نعم، لا تكسر شيئاً |
| **B** | الواجهة: `Dashboard` + `DateNavigator` + `TeamDashboard` + `tasksService` | بعد A |
| **C** | الخادم: رفض الطلب بدون فترة/بفترة طويلة (+ اكتشاف الاقتطاع) | **بعد** انتشار B على كل العملاء |

---

## 5) المرحلة A — الخادم (`backend/src/routes/tasks.ts`)

> ⚠️ **ترتيب المسارات حرج:** `GET /:id` معرَّف عند السطر ~337. مساري `/day-states` و`/months` **يجب** تسجيلهما **قبله** (مباشرةً بعد مسار القائمة عند السطر ~92)، وإلا يبتلعهما `/:id` ويرجع 404 ("المهمة غير موجودة").

### 5.1 دوال مساعدة (أعلى الملف بعد `addDaysISO`)

```ts
const MAX_RANGE_DAYS = 45;     // الحد الأقصى لفترة الطلب (قابل للضبط)
const LIST_HARD_CAP = 5000;    // سقف أمان فقط؛ عند بلوغه نرفض بدل القص الصامت

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

// نطاق صالح أو خطأ واضح (تُستعمل في المرحلة C لمسار القائمة؛ وفي day-states من المرحلة A)
function requireRange(q: { date?: string; from?: string; to?: string }) {
  if (q.date) return { gte: q.date, lte: q.date };
  if (!q.from || !q.to) throw badRequest("حدّد يوماً (date) أو فترة كاملة (from و to)");
  if (q.to < q.from) throw badRequest("تاريخ النهاية قبل تاريخ البداية");
  if (daysBetween(q.from, q.to) > MAX_RANGE_DAYS) throw badRequest(`الفترة لا يمكن أن تتجاوز ${MAX_RANGE_DAYS} يوماً`);
  return { gte: q.from, lte: q.to };
}

// المصمم: مهامه فقط؛ الإدارة: الكل أو مسؤول محدد
function scopeOf(me: User, assigneeId?: string) {
  return isStaff(me) ? (assigneeId ? { assignedToId: assigneeId } : {}) : { assignedToId: me.id };
}
```

### 5.2 `GET /api/tasks/day-states` (جديد — ضعه بعد مسار القائمة وقبل `/:id`)

يرجع لون كل يوم في النطاق. القاعدة مطابقة لـ`isTaskTreeCompleted` في الواجهة: الأوردر (الجذر) مكتمل إذا كان له فرعيات → كلها مكتملة (بشكل متداخل)، وإلا `status === COMPLETED`. اليوم **pending** إن وُجد فيه جذر غير مكتمل، وإلا **completed**.

```ts
tasksRouter.get(
  "/day-states",
  asyncHandler(async (req, res) => {
    const q = listQuerySchema.parse(req.query);
    const range = requireRange({ from: q.from, to: q.to });
    const me = req.user!;
    const db = prisma();
    const select = { id: true, parentId: true, status: true, date: true } as const;

    const rows = await db.task.findMany({ where: { date: range, ...scopeOf(me, q.assigneeId) }, select });
    const byId = new Map(rows.map((r) => [r.id, r]));

    // الفرعيات قد تقع نظرياً في تاريخ مختلف عن أمّها (إنشاء المهمة لا يفرض تطابق التاريخ) — نجلبها بالتتبّع
    let frontier = rows.map((r) => r.id);
    while (frontier.length > 0) {
      const kids = (await db.task.findMany({ where: { parentId: { in: frontier } }, select })).filter((k) => !byId.has(k.id));
      kids.forEach((k) => byId.set(k.id, k));
      frontier = kids.map((k) => k.id);
    }

    const children = new Map<string, typeof rows>();
    for (const t of byId.values()) {
      if (!t.parentId) continue;
      const list = children.get(t.parentId);
      if (list) list.push(t);
      else children.set(t.parentId, [t]);
    }
    const done = (t: (typeof rows)[number]): boolean => {
      const kids = children.get(t.id);
      return kids && kids.length > 0 ? kids.every(done) : t.status === "COMPLETED";
    };

    const states: Record<string, "pending" | "completed"> = {};
    for (const t of rows) {
      if (t.parentId) continue;
      if (!done(t)) states[t.date] = "pending";
      else if (!states[t.date]) states[t.date] = "completed";
    }
    res.json({ states });
  })
);
```

### 5.3 `GET /api/tasks/months` (جديد — لـ`TeamDashboard`، قبل `/:id` أيضاً)

```ts
tasksRouter.get(
  "/months",
  asyncHandler(async (req, res) => {
    const groups = await prisma().task.groupBy({ by: ["date"], where: scopeOf(req.user!), orderBy: { date: "asc" } });
    res.json({ months: [...new Set(groups.map((g) => g.date.slice(0, 7)))] });
  })
);
```

### 5.4 مسار القائمة (للمرحلة C فقط — لا تفعّله في A)

```ts
tasksRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = listQuerySchema.parse(req.query);
    const range = requireRange(q);                       // ← يرفض الطلب بلا فترة
    const rows = await prisma().task.findMany({
      where: { date: range, ...scopeOf(req.user!, q.assigneeId) },
      include: taskInclude,
      orderBy: [{ date: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      take: LIST_HARD_CAP + 1,
    });
    if (rows.length > LIST_HARD_CAP) throw badRequest("عدد المهام في هذه الفترة كبير جداً؛ ضيّق الفترة");
    res.json({ tasks: rows.map(serializeTask) });
  })
);
```
> `MAX_RANGE_DAYS = 45`: أسوأ حالة ≈ 45 × 75 = 3375 مهمة < 5000. عدّله حسب الحجم الفعلي. شبكة التقويم (6 أسابيع = 42 يوماً) وشهر `TeamDashboard` (≤ 31) داخل الحد.

---

## 6) المرحلة B — الواجهة

### 6.1 `frontend/src/services/tasksService.ts`

```ts
import type { CalendarDateState } from "../components/tasks/DateNavigator";

export interface TaskRange { date?: string; from?: string; to?: string }

// داخل tasksService:
async list(range: TaskRange): Promise<Task[]> {
  const { tasks } = await api<{ tasks: Task[] }>("/tasks", { query: { ...range } });
  return tasks;
},

async dayStates(from: string, to: string): Promise<Record<string, CalendarDateState>> {
  const { states } = await api<{ states: Record<string, CalendarDateState> }>("/tasks/day-states", { query: { from, to } });
  return states;
},

async months(): Promise<string[]> {
  const { months } = await api<{ months: string[] }>("/tasks/months");
  return months;
},
```
> لتفادي استيراد دائري، انقل النوع `CalendarDateState` إلى `types/` وأعِد تصديره من `DateNavigator`.

### 6.2 `frontend/src/lib/date.ts` — دالة مساعدة

```ts
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}
```

### 6.3 `components/tasks/DateNavigator.tsx`

المكوّن يحتفظ بالشهر المعروض في حالة داخلية `viewDate` (سطر ~70) ويبني الشبكة بـ`getMonthDays(viewDate)` (تشمل أياماً من الشهرين المجاورين). أضف خاصية تُبلّغ اللوحة بنطاق الشبكة المرئية:

```tsx
interface DateNavigatorProps {
  value: string;
  dateStates?: Record<string, CalendarDateState>;
  onChange: (value: string) => void;
  onViewRangeChange?: (range: { from: string; to: string }) => void;   // جديد
}

// داخل المكوّن، بعد حساب days:
const firstIso = days[0]?.iso;
const lastIso = days[days.length - 1]?.iso;
const onRangeRef = useRef(onViewRangeChange);
useEffect(() => { onRangeRef.current = onViewRangeChange; });
useEffect(() => {
  if (firstIso && lastIso) onRangeRef.current?.({ from: firstIso, to: lastIso });
}, [firstIso, lastIso]);
```
(أضف `useEffect, useRef` إلى استيراد React.) **النطاق يغطي الشبكة كاملة وليس الشهر وحده**.

### 6.4 `pages/Dashboard.tsx`

**(أ) حالة جديدة وإزالة الحساب المحلي:**
```ts
const [dateStates, setDateStates] = useState<Record<string, CalendarDateState>>({});
const [calendarRange, setCalendarRange] = useState<{ from: string; to: string } | null>(null);
// احذف useMemo الخاص بـ dateStates (الأسطر 134-150)
```

**(ب) جلب اليوم مع حماية من تداخل الطلبات (race):**
```ts
const seq = useRef(0);
const fetchDay = useCallback(async (date: string) => {
  const id = ++seq.current;
  const result = await tasksService.list({ date });
  if (id === seq.current) setTasks(result);      // تجاهل الردود المتأخرة لأيام قديمة
}, []);

const refreshDateStates = useCallback(async () => {
  if (!calendarRange) return;
  try { setDateStates(await tasksService.dayStates(calendarRange.from, calendarRange.to)); }
  catch { /* نُبقي الألوان الحالية */ }
}, [calendarRange]);
```

**(ج) الدوال الثلاث (`loadTasks` و`refreshTasks` و`syncTasks`) تمرّر `selectedDate` وتحدّث الألوان:**
```ts
const loadTasks = useCallback(async () => {
  setTasksLoading(true);                          // لا نُظهر "فارغ" مؤقتاً عند تغيير اليوم
  try { await fetchDay(selectedDate); setTasksError(null); }
  catch (error) { setTasksError(errorMessage(error)); }
  finally { setTasksLoading(false); }
}, [selectedDate, fetchDay]);

const refreshTasks = useCallback(async () => {
  try { await Promise.all([fetchDay(selectedDate), refreshDateStates()]); }
  catch (error) { show(errorMessage(error), "error"); }
}, [selectedDate, fetchDay, refreshDateStates, show]);

const syncTasks = useCallback(async () => {
  try { await Promise.all([fetchDay(selectedDate), refreshDateStates()]); } catch { /* صامت */ }
}, [selectedDate, fetchDay, refreshDateStates]);
useLiveSync(syncTasks);

useEffect(() => { void loadTasks(); }, [loadTasks]);            // يعيد التحميل عند تغيير اليوم
useEffect(() => { void refreshDateStates(); }, [refreshDateStates]);   // عند تغيير الشهر المعروض
```

**(د) ربط `DateNavigator`:**
```tsx
<DateNavigator
  value={selectedDate}
  dateStates={dateStates}
  onChange={setSelectedDate}
  onViewRangeChange={(r) => setCalendarRange((prev) => (prev && prev.from === r.from && prev.to === r.to ? prev : r))}
/>
```

**(هـ) لا يحتاج تعديلاً** (يعمل على مهام اليوم): `dayTasks`، `taskNumbers`، `unfinishedCount`، `handleExportExcel`، `getSiblings` في الإنشاء والتعديل، `applyReorder`، `applyMoveToMember`، `NewTaskModal allTasks={tasks}`.

**سلوك يجب أن تتوقعه:** بعد `moveToDate` ينتقل الأوردر ليوم آخر فيختفي من اللوحة (طبيعي)، ويتحدث لون اليوم الجديد عبر `refreshDateStates` إن كان ضمن الشبكة المعروضة.

### 6.5 `pages/TeamDashboard.tsx` (إجباري قبل المرحلة C)

الصفحة تعتمد على القائمة الكاملة. **التغيير المقترح (يتطلب موافقة صاحب المنتج):** الإحصائيات تُحسب **لشهر واحد في كل مرة** (الافتراضي: الشهر الحالي)، وقائمة الشهور من `/tasks/months`، وخيار "كل الأشهر" يُزال أو يُؤجَّل.

```ts
const [month, setMonth] = useState(() => todayISO().slice(0, 7));
const { from, to } = useMemo(() => monthRange(month), [month]);
const loadMonth = useCallback(() => tasksService.list({ from, to }), [from, to]);
const { data: tasks, loading: tasksLoading, error: tasksError, retry: retryTasks } = useResource<Task[]>(loadMonth, []);
const { data: availableMonths } = useResource<string[]>(tasksService.months, []);
// availableDates تبقى مشتقة من tasks (ضمن الشهر المختار)
// أزل الفلتر .filter(task => !month || ...) لأن tasks أصبحت للشهر المختار أصلاً
```
`useResource` يُعيد الجلب تلقائياً عند تغيّر `loader` (لأن `reload` يعتمد عليه).

> **بديل (لاحقاً إن لزم "كل الأشهر"):** مسار تجميع `GET /tasks/stats` على الخادم. لم أخترته الآن لأن "المدة" تعتمد على سجلات الوقت والساعة الجارية (`getTaskElapsed` في `hooks/useTaskTimer.ts`) فالتجميع أعقد.

---

## 7) الاختبارات والسكربتات

**تحديث إجباري (المرحلة C):**
- `frontend/scripts/services-smoke.mjs:30` و`:44` يستدعيان `tasksService.list()` بلا معاملات → مرّر `{ date }` أو `{ from, to }`.
- راجع `backend/scripts/http-smoke.mjs` لأي `GET /tasks` بلا فترة.
- اختبارات `backend/tests/tasks.test.ts:54` و`:66` تمرّ `date=` فلا تتأثر.

**اختبارات جديدة (`backend/tests/tasks.test.ts`):**
1. `GET /api/tasks` بدون فترة → 400 (C).
2. `from` فقط، أو `to < from`، أو فترة > 45 يوماً → 400 (C).
3. `GET /api/tasks/day-states?from&to` → **200 وليس 404** (يثبت أن `/:id` لا يبتلعه).
4. أوردر مع فرعية غير مكتملة → `pending`؛ كل الفرعيات مكتملة → `completed`؛ أوردر بلا فرعيات حسب حالته.
5. المصمم يرى ألوان مهامه فقط؛ الإدارة ترى الكل، ويعمل `assigneeId`.
6. فرعية بتاريخ مختلف عن أمّها لا تُغيّر الحساب (تغطية حلقة التتبّع).
7. `GET /api/tasks/months` يرجع أشهراً مرتبة بلا تكرار.

---

## 8) النشر والمخاطر

| الخطر | التخفيف |
|-------|----------|
| عملاء قدامى (PWA، يوجد `public/sw.js`) قد يشغّلون واجهة مخزّنة تستدعي `/tasks` بلا فترة → تنكسر بعد المرحلة C | انشر A ثم B أولاً، **وانتظر أسبوعاً على الأقل** قبل C. تحقق من استراتيجية تخزين `sw.js` للملفات (network-first أم cache-first) وهل يوجد تحديث فوري للإصدار |
| ظهور "فارغ" لحظياً عند تغيير اليوم | `setTasksLoading(true)` في `loadTasks` (مضمّن في 6.4) |
| ردود متأخرة تكتب فوق يوم أحدث | عدّاد `seq` (مضمّن في 6.4) |
| ألوان التقويم تتأخر بعد العمليات | `refreshTasks` و`syncTasks` يستدعيان `refreshDateStates` (مضمّن) |
| `TeamDashboard` يفقد "كل الأشهر" | قرار منتج؛ البديل `/tasks/stats` (§6.5) |
| الفرعية في تاريخ مختلف عن أمّها | يعالجها تتبّع `frontier` في `day-states`. ويُنصح لاحقاً بفرض `date = parent.date` عند الإنشاء (`POST /tasks`) |

**خطوات ما بعد التنفيذ:** حدّث `CHANGES.md` و`HANDOFF.md` بوصف التغيير، وراجع أن لا استدعاء `tasksService.list()` بلا معاملات متبقٍ: `grep -rn "tasksService.list" frontend/src frontend/scripts`.

---

## 9) معايير القبول

- [ ] تغيير اليوم في لوحة المهام يطلب `GET /api/tasks?date=...` فقط (تحقق من تبويب Network).
- [ ] فتح التقويم وتقليب الشهور يحدّث الألوان عبر `day-states` وبدون جلب مهام كاملة.
- [ ] ألوان الأيام مطابقة لما كان يظهر قبل التعديل لنفس البيانات (قارن يومين أحمر وأخضر).
- [ ] بعد إنهاء/إعادة فتح/نقل مهمة يتغير لون اليوم دون إعادة تحميل الصفحة.
- [ ] التحديث التلقائي من متصفح آخر يظهر دون وميض ولا "فارغ".
- [ ] `TeamDashboard` يعرض إحصائيات الشهر المختار بنفس أرقام الحساب القديم لذلك الشهر.
- [ ] (بعد C) `GET /api/tasks` بلا فترة → 400 برسالة عربية واضحة.
- [ ] اختبارات الخادم والـsmoke تمرّ.
- [ ] اختبار حمل بسيط: أنشئ 6000 مهمة وهمية موزّعة على أشهر، وتأكد أن مهام اليوم تظهر وأن زمن الاستجابة ثابت.
