# CHANGES.md

## Checkpoint 17 — تصدير التقرير اليومي إلى Excel (واجهة فقط)

### أُنشئت
- `frontend/src/lib/xlsx.ts` — كاتب .xlsx بدون مكتبات (ZIP بلا ضغط + XML): عدة أوراق، RTL، تجميد، فلتر تلقائي، دمج، أنماط جاهزة؛ النصوص inlineStr فلا تُفسَّر كصيغ.
- `frontend/src/lib/dailyReport.ts` — دالة صرفة تبني ورقتي «الملخص» (لكل مصمم) و«المهام» (التفاصيل بالشجرة رئيسية ← فرعية).
- `frontend/src/lib/exportDailyReport.ts` — تنزيل الملف من المتصفح (`تقرير-المهام-<التاريخ>.xlsx`) بدون أي طلب للخادم.

### عُدّلت
- `frontend/src/components/tasks/TaskFilters.tsx` — خاصية `onExportExcel` وزر «تصدير Excel».
- `frontend/src/pages/Dashboard.tsx` — `handleExportExcel` (يصدّر كل مهام اليوم المختار متجاهلاً الفلتر والبحث).
- لا تغيير في الـ backend ولا في قاعدة البيانات.

### تحقّق
- ✅ نُفِّذ: `tsc -b` و`oxlint` و`vite build` على المشروع كاملاً؛ توليد ملف تجريبي وقراءته بـ openpyxl وLibreOffice (RTL، دمج، فلتر، تنسيق المدد والنسب، نص يبدأ بـ `=` يبقى نصاً).
- ❌ لم يُنفَّذ: تجربة في متصفح حقيقي بمهام الإنتاج، ولا فتح الملف في Microsoft Excel نفسه.

## Checkpoint 16 — تكامل Cloudflare R2 للمرفقات (مكتوب، غير مُشغَّل على R2 حقيقي)

### أُنشئت
- `backend/src/utils/s3sign.ts` — موقِّع SigV4 (presigned) بدون اعتماديات؛ يطابق متجه AWS الرسمي.
- `backend/src/utils/r2Client.ts` — عميل R2 (presignPut/presignGet/head/remove) صرف قابل للاختبار.
- `backend/src/utils/attachmentKeys.ts` — مفاتيح المرفقات وشكلها المخزَّن (صرف).
- `backend/src/utils/r2.ts`، `backend/src/utils/attachments.ts` — ربط البيئة، التسلسل بروابط عرض موقَّعة، التحقق من الملكية والوجود والحجم، الحذف من R2.
- `backend/src/validators/attachments.ts`، `backend/src/routes/files.ts` — `/api/files` (config، presign-upload، delete).
- `backend/tests/{s3sign,r2Client,envR2,files}.test.ts`.
- `frontend/src/services/filesService.ts`، `frontend/src/lib/attachments.ts`.

### عُدّلت
- `backend/src/utils/env.ts` — متغيرات R2 اختيارية (الأربعة معاً أو لا شيء) + `R2_MAX_FILE_MB`.
- `backend/src/routes/{tasks,feedback}.ts` — تحقق قبل الحفظ، وحذف كائنات R2 بعد تعديل/حذف/حذف جماعي.
- `backend/src/utils/{taskSerialize,feedbackSerialize}.ts`، `backend/src/validators/{tasks,feedback}.ts`، `backend/src/app.ts`، `backend/.env.example`، `backend/tests/globalSetup.ts`.
- `frontend/src/components/ui/ImageAttachments.tsx` — رفع مباشر إلى R2 مع رجوع إلى base64 إن لم يُفعَّل، حالة رفع، أخطاء لكل ملف، بديل للصورة المكسورة.
- `frontend/src/types/attachment.ts`، `frontend/src/services/{tasksService,feedbackService}.ts`، `NewTaskModal.tsx`، `FeedbackModal.tsx` (خاصية `scope`).
- `HANDOFF.md` (القسم 17 + تحديث الأقسام 6 و16.4 وجدول الحالة)، `README.md`.
- لا migration: عمودا `attachments` ما زالا `Json`.

### تحقّق
- ✅ نُفِّذ: توقيع SigV4 = متجه AWS الرسمي؛ 9 تأكيدات على العميل والمفاتيح؛ tsc صارم للوحدات الصرفة؛ syntax لكل الملفات؛ فحص أنواع مبسّط للواجهة.
- ❌ لم يُنفَّذ: vitest (لا npm)، `npm run build`/`lint`، أي اختبار على R2 حقيقي أو متصفح. التفاصيل في HANDOFF 17.4.

## Checkpoint 15 — تنظيف الكود القديم + دمج HANDOFF الجديد

### عُدّلت
- `frontend/src/lib/storage.ts` ← حُذف؛ `generateId` انتقلت إلى `lib/id.ts` (الدالتان `readStorage/writeStorage` كانتا غير مستخدمتين).
- `frontend/src/pages/Users.tsx` ← `pages/TeamDashboard.tsx` (المكوّن `TeamDashboardPage`)؛ الرابط `/users` كما هو.
- `frontend/src/App.tsx` — `/dashboard` يعيد التوجيه إلى `/users`.
- `frontend/src/lib/permissions.ts` — حُذفت صفحة `dashboard` غير المستخدمة.
- `frontend/src/components/ui/ImageAttachments.tsx` — تحديث import فقط.
- `HANDOFF.md` ← النسخة المرفوعة (خطة التدقيق) + القسم 16 (حقائق مُتحقَّق منها، تصحيحات النشر، تقدير R2)؛ النسخة التفصيلية السابقة صارت `HANDOFF_DETAILS.md`.

### تحقّق
- syntax ✅ · typecheck للملفات المعدّلة بتعريفات مبسّطة (لا أخطاء حقيقية) · **لم يُنفَّذ `npm run build`.**

## Checkpoint 14 — إدارة المستخدمين + تعديل الملف الشخصي (واجهة)

### أُنشئت
- `frontend/src/pages/ManageUsers.tsx` — قائمة المستخدمين، بحث، إضافة/تعديل/تفعيل/تعطيل/حذف.
- `frontend/src/components/users/UserModal.tsx` — نموذج الإضافة والتعديل (يرسل الحقول المتغيّرة فقط عند التعديل).

### عُدّلت
- `frontend/src/lib/permissions.ts` — صفحة `manageUsers` لـ admin/manager فقط.
- `frontend/src/App.tsx` — مسار `/manage-users`.
- `frontend/src/components/sidebar/Sidebar.tsx` — عنصر «إدارة المستخدمين» (لغير المصمم).
- `frontend/src/pages/Profile.tsx` — نموذج تعديل الاسم/البريد/المسمى وتغيير كلمة المرور (`usersService.updateMe`).
- `frontend/src/components/tasks/TaskCard.tsx` — `subtasksLabel` لصياغة عدد المهام الفرعية عربياً.
- `HANDOFF.md` (يشمل تصحيح خطة النشر 3.1 و3.3: `--include=dev` في Build Command، والـ seed من الجهاز، وتنبيه كلمة المرور المشتركة)، `CHANGES.md`.
- لا تعديل على الـ backend ولا على الخدمات.

### تحقّق
- syntax ✅ لكل الملفات المعدّلة · typecheck للملفات المعدّلة بتعريفات مبسّطة لـ React/lucide/router ✅.
- **لم يُنفَّذ:** `npm run build`، `npm run lint`، اختبار المتصفح، اختبارات الـ backend (لا `node_modules` ولا شبكة ولا PostgreSQL في تلك الجلسة؛ الـ backend لم يتغير).

## Checkpoint 13 — اختبارات buildPoolConfig + إعادة تحقق شاملة

### أُنشئت
- `backend/tests/dbConfig.test.ts` — 8 اختبارات لـ `buildPoolConfig` (بلا CA / CA فارغ / مع CA / `\\n` نصّية / عدم تعطيل التحقق / بقاء معاملات الرابط) و`DATABASE_CA_CERT` في `loadEnv`.

### عُدّلت
- `HANDOFF.md` — RESUME POINT (Checkpoint 13)، القسم 33، تصحيح صفوف 9 و10، عدد الاختبارات 97، عدد تحذيرات lint 13.
- `CHANGES.md` — هذا الإدخال.
- لا تعديل على كود التشغيل (`src/`) ولا على الواجهة.

### نتائج التحقق
- backend: typecheck ✅ · vitest **97/97** ✅ · frontend: build ✅ · lint 0 أخطاء / 13 تحذيراً.
- تكامل على PostgreSQL 16 حقيقي (قاعدة نظيفة ← migration ← seed ← خادم): `http-smoke` **35/35** ✅ · `services-smoke` **32/32** ✅.
- `prisma migrate deploy` ما زال محجوباً (403 على schema-engine) — غير مُتحقَّق منه.

## Checkpoint 12 — تجهيز النشر محلياً + إعادة التحقق من سكربتات التكامل

### أُنشئت
- `frontend/public/_redirects` — `/* /index.html 200`.

### عُدّلت
- `backend/src/db.ts` — `buildPoolConfig`: دعم `DATABASE_CA_CERT` (تحقق كامل بالـ CA).
- `backend/src/utils/env.ts` — متغير `DATABASE_CA_CERT` الاختياري. `backend/.env.example` — سطر `DATABASE_CA_CERT=`.
- `backend/scripts/http-smoke.mjs` — تأكيد التعليق صار صارماً (`===200` بدل `===201||true`).
- `frontend/scripts/services-smoke.mjs` — يعيد تفعيل `des1` قبل استخدامه (`usersService.setActive`) لأن http-smoke يعطّله.
- `README.md`, `HANDOFF.md`, `CHANGES.md`.

### تحقّق فعلي
- SSL بـ CA خاص على PG 16 محلي: 5 سيناريوهات ✅ (انظر HANDOFF).
- قاعدة نظيفة ← migration ← seed ← خادم: http-smoke **35/35**، services-smoke **32/32** ✅؛ typecheck ✅، vitest 89/89 ✅، frontend build ✅ (مع `dist/_redirects`).

### حُذفت
- لا شيء.

---

## Checkpoint 11 — اختبار تكامل فعلي على PostgreSQL 16 حقيقي

### أُنشئت
- `backend/scripts/http-smoke.mjs` — سيناريو HTTP (35 فحصاً) بمدير ومصمم؛ يقرأ `ADMIN_PASSWORD` من البيئة.
- `frontend/scripts/services-smoke.mjs` — يشغّل `src/services/*` الحقيقية عبر Vite SSR ضد الخادم (31 فحصاً).

### عُدّلت
- `HANDOFF.md` — RESUME POINT (Checkpoint 11) + حالة rate limit والمراحل والجدول.

### تحقّق (نتائج فعلية)
- PostgreSQL 16 عبر apt، `migration.sql` طُبّق بـ psql، seed مرتان بلا تكرار، 35/35 و31/31، rate limit وCORS وhelmet ✅.
- **لم يُتحقَّق:** `prisma migrate deploy` نفسه (المحرك محجوب 403)، متصفح حقيقي.
- ملاحظة: لم يُعدَّل أي كود مصدر (backend/frontend src).

### حُذفت
- لا شيء (سكربت مؤقت `frontend/_svc_test.mjs` نُقل إلى `frontend/scripts/`).

---

## Checkpoint 10 — التحقق الشامل بعد ربط الواجهة + README

> فُتح ZIP باسم `checkpoint-9-frontend-wired`؛ وجدتُ أن الواجهة مربوطة فعلاً لكن HANDOFF/CHANGES لم يُحدَّثا لذلك. لم يُعدَّل أي كود مصدر في هذه الجلسة؛ التعديلات توثيقية فقط.

### تحقّق فعلي
- backend: `npm install`، `prisma generate`، `typecheck` نظيف، `vitest` = 89/89، `tsc` emit ✅.
- frontend: `npm install`، `npm run build` ✅ (417 kB JS / 24 kB CSS)، `npm run lint` = 0 أخطاء / 11 تحذيراً.
- grep: لا `localStorage` كمصدر بيانات (فقط `tashkeel_token` في `lib/api.ts` و`tashkeel_theme` في `Header.tsx`).
- مراجعة عقد الـ API بقراءة الكود (خدمات الواجهة ⇄ validators/routes): لا اختلافات.

### أُنشئت
- `README.md` — الإعداد والأوامر والصلاحيات ونظرة على الـ API (بدون أسرار).

### عُدّلت
- `HANDOFF.md` — RESUME POINT جديد + المراحل 16/18/19/26 + صفوف الجدول (3،4،7،12،17–21،26–28،30،31،34).
- `CHANGES.md` — هذا القسم.

### حُذفت
- لا شيء.

---

## Checkpoint 9 — ربط الواجهة بالـ API (من الـ ZIP؛ لم يُوثَّق وقتها)
- `frontend/src/lib/api.ts`، `frontend/src/hooks/useResource.ts`، `frontend/.env.example`، وإعادة كتابة `frontend/src/services/*` (auth/users/tasks/goals/feedback/schedule) لتستدعي الـ API، مع `AuthProvider`/`ProtectedRoute` المعتمدين على `/auth/me`، وحالات loading/error في الصفحات. (الوصف مستنتج من فحص الملفات وليس من سجل تغييرات وقتها.)

## Checkpoint 8 — تشغيل الجزء 8 فعلياً
- `typecheck` نظيف و`vitest` = 89/89 (منها 9 اختبارات CalendarEvent) بلا تعديل على الكود.

## Checkpoint 7 — الجزء 8: CalendarEvent API (غير مُشغَّل)

> جلسة بلا شبكة ولا `node_modules`: لم يُشغَّل typecheck ولا vitest. فُحصت صياغة TypeScript فقط.

### أُنشئت
- `backend/src/validators/calendarEvents.ts` — zod: create/update/list (تاريخ ISO، لون `#RRGGBB`، `endDate >= startDate`).
- `backend/src/utils/calendarEventSerialize.ts` — الـ include والـ serializer (شكل متوافق مع `Season`).
- `backend/src/routes/calendarEvents.ts` — list/create/get/patch/delete، للإدارة فقط.
- `backend/tests/calendarEvents.test.ts` — الوصول (401/403)، الإنشاء، التحقق، الترتيب وفلتر from/to، التعديل، الحذف.

### عُدّلت
- `backend/src/app.ts` — تسجيل `/api/calendar-events`.
- `HANDOFF.md` — RESUME POINT (Checkpoint 7) + المرحلة 16 + الجدول.


## Checkpoint 6 — تشغيل التحقق الفعلي + الجزء 7: Goals API (مكتوب ومُختبر)

> الشبكة عملت هذه المرة (`npm install` نجح). أول تشغيل فعلي لأجزاء 4 و5 و6: **typecheck نظيف و65 اختباراً ناجحاً بلا أي تعديل على الكود**. ثم أُضيف الجزء 7: النتيجة النهائية **80/80 اختباراً ناجحاً**، وbuild للـ backend (tsc emit) وللـ frontend ناجحان.

### أُنشئت
- `backend/src/validators/goals.ts` — zod: إنشاء/تعديل/قائمة (النوع والحالة بأي حالة أحرف، `target` ≥ 1، `current` ≥ 0، `endDate` اختياري ولا يسبق `startDate`).
- `backend/src/utils/goalSerialize.ts` — `goalInclude` + `serializeGoal` (حروف صغيرة، `progress` 0–100) + `resolveGoalStatus` + `defaultEndDate`.
- `backend/src/routes/goals.ts` — `GET/POST /goals`، `GET/PATCH/DELETE /goals/:id` (للإدارة فقط).
- `backend/tests/goals.test.ts` — 15 اختباراً: 401/403 للمصمم، createdBy، حالات الأحرف، الإكمال التلقائي، `endDate` الافتراضي، التحقق، الفلاتر، منطق الحالة عند التعديل، الحذف.

### عُدّلت
- `backend/src/app.ts` — ربط `goalsRouter` على `/api/goals` (سطران).
- `HANDOFF.md` — RESUME POINT + المراحل 6 و8/9 و14 و15 + صفوف الجدول 10–18/21/30/31 + قرارات Goals.

### إصلاح أثناء الجلسة
- `resolveGoalStatus` كانت تُبقي `not_started`/`in_progress` القديمة عند تغيير `current` دون حالة صريحة؛ اكتشفتها الاختبارات وصُحّحت (تُشتق الحالة من التقدّم، و`paused` تبقى).

### حُذفت
- لا شيء.

---
## Checkpoint 5 — الجزء 6: Feedback API (كُتب هنا، وتحقق منه Checkpoint 6)

> ⚠️ الشبكة ما زالت محجوبة (ثالث جلسة؛ كل إصدارات zod ← 403 — جُرّبت 3.25.76 و4.0.0 و4.1.0 و4.6.5) فلم يُنفَّذ `npm install` ولا typecheck ولا vitest. فُحصت الصياغة فقط (لا أخطاء TS1xxx). لذلك لم يُتحقَّق من الجزأين 4 و5 أيضاً.

### أُنشئت
- `backend/src/validators/feedback.ts` — zod: إنشاء/تعديل/قائمة/حذف جماعي (النوع والحالة تُقبل بأي حالة أحرف وتُحوَّل).
- `backend/src/utils/feedbackSerialize.ts` — `feedbackInclude` + `serializeFeedback` (حروف صغيرة، `createdByName`).
- `backend/src/routes/feedback.ts` — `GET/POST /feedback`، `GET/PATCH/DELETE /feedback/:id`، `POST /feedback/bulk-delete`.
- `backend/tests/feedback.test.ts` — ~15 اختباراً: 401، إنشاء المصمم، تجاهل `createdById` المُمرَّر، التحقق، المرفقات، عزل المصمم (403)، الفلاتر، منع المصمم من التعديل/الحذف، تعديل الإدارة، الحذف الجماعي.

### عُدّلت
- `backend/src/app.ts` — استيراد وربط `feedbackRouter` على `/api/feedback` (سطران).
- `HANDOFF.md` — RESUME POINT + المرحلة 14 + صفوف الجدول 17/21/30 + قرارات Feedback.

### حُذفت
- لا شيء.

---
## Checkpoint 4 — الجزء 5: Tasks API (مكتوب، غير مُختبر)

> ⚠️ الشبكة كانت محجوبة (كل إصدارات zod ← 403) فلم يُنفَّذ `npm install` ولا أي اختبار. تم فقط فحص صياغة TypeScript (`tsc` بلا أخطاء TS1xxx). ملاحظة: `routes/tasks.ts` أُعيد بناؤه من سجل جلسة سابقة (لم يصل ضمن الـ ZIP).

### أُنشئت
- `backend/src/routes/tasks.ts` — list/create/get/patch/delete، `progress`، `start/stop/end`، التعليقات، `reorder`، `move`، `move-unfinished`.
- `backend/src/validators/tasks.ts` — zod (تواريخ YYYY-MM-DD، أولوية، مرفقات صور data URL، حدود الأحجام).
- `backend/src/utils/taskSerialize.ts` — `taskInclude` + `serializeTask` (المدد بالميلي ثانية، `stopNotes` من `TaskTimeLog`).
- `backend/tests/tasks.test.ts` — ~20 اختباراً: عزل المصمم، createdBy/assignedTo، لا تعديل/حذف للمصمم، Start/Stop/End، التقدّم، الفرعية والـ cascade، move، move-unfinished.

### عُدّلت
- `backend/src/app.ts` — ربط `tasksRouter` على `/api/tasks`.
- `backend/src/routes/users.ts` — استبدال `Record<string, unknown>` بنوع `UserPatch` (استباقاً لخطأ typecheck مع Prisma).
- `HANDOFF.md` — RESUME POINT + المرحلتان 6 و8/9 + صفوف الجدول.

### حُذفت
- لا شيء.

---
## Checkpoint 3 — الجزء 4: Users API (مكتوب، غير مُختبر)

> ⚠️ لم يُنفَّذ `npm install` ولا الاختبارات في هذه الجلسة (الشبكة محجوبة). تم فقط فحص صياغة TypeScript. شغّل typecheck وvitest أولاً.

### أُنشئت
- `backend/src/validators/users.ts` — zod: إنشاء/تعديل/حالة/ملف شخصي (الملف الشخصي `.strict()`).
- `backend/src/routes/users.ts` — `GET/POST /users`، `GET/PATCH/DELETE /users/:id`، `PATCH /users/:id/status`، `PATCH /users/me`.
- `backend/tests/users.test.ts` — اختبارات الوصول (401/403)، الإنشاء، التكرار (409)، التعديل، التفعيل/التعطيل، الحذف، والملف الشخصي.

### عُدّلت
- `backend/src/app.ts` — استيراد وربط `usersRouter` على `/api/users` (سطران فقط).
- `HANDOFF.md` — RESUME POINT + المرحلة 6 + صفوف الجدول 10/11/20/21/30.

### حُذفت
- لا شيء.

---

## Checkpoint 2 — الجزء 3: أساس الـ backend + Seed + Auth

### أُنشئت
- `backend/tsconfig.json` — NodeNext + rewriteRelativeImportExtensions (لأن العميل المولَّد يستورد بامتداد `.ts`).
- `backend/.env.example` — أسماء المتغيرات السبعة بدون قيم.
- `backend/vitest.config.ts` — إعداد الاختبارات (تسلسلي، `DB_POOL_MAX=1`).
- `backend/tests/globalSetup.ts` — يشغّل PGlite + socket ويطبّق `0001_init` ويضبط env للاختبار فقط (قيم وهمية).
- `backend/tests/helpers.ts` — `resetDb/makeUser/login/api`.
- `backend/tests/auth.test.ts` — 13 اختباراً (seed + auth).
- `backend/prisma/seed.ts` — upsert للمستخدمين الثلاثة، كلمة المرور من `ADMIN_PASSWORD` (bcrypt cost 12).
- `backend/src/app.ts` — Express + helmet + CORS + JSON 15MB + `/api/health` + `/api/auth`.
- `backend/src/server.ts` — نقطة التشغيل.
- `backend/src/db.ts` — PrismaClient مع `PrismaPg`.
- `backend/src/utils/{env,httpError,asyncHandler,serialize}.ts` — تحقق env بـ zod، أخطاء HTTP، غلاف async، `publicUser` (بدون passwordHash).
- `backend/src/middleware/{auth,error}.ts` — JWT (`requireAuth`, `requireRole`, `requireStaff`) ومعالج أخطاء آمن.
- `backend/src/validators/auth.ts`, `backend/src/routes/auth.ts` — login / me / logout مع rate limit.

### عُدّلت
- `backend/package.json` — `start` → `node dist/src/server.js` (مسار الإخراج الفعلي)؛ حذف `cookie-parser` (غير مستخدم).
- `HANDOFF.md` — RESUME POINT + حالة المراحل والجدول.

### حُذفت
- `cookie-parser` و`@types/cookie-parser` من الاعتماديات — قرار: توكن Bearer بدل cookie.

---

## Checkpoint 1 — الفحص + الهيكلة + Schema

### أُنشئت
- `HANDOFF.md` — خطة التسليم محدَّثة: RESUME POINT + حالة الأقسام الـ35.
- `CHANGES.md` — هذا الملف.
- `.gitignore` (جذر المشروع) — يستبعد node_modules/dist/build/.env*/ZIP/العميل المولَّد، ويسمح بـ `.env.example`.
- `backend/package.json` — سكربتات dev/build/start/seed/test/typecheck والاعتماديات (express 4, prisma 7, adapter-pg, zod, bcryptjs, jsonwebtoken, helmet, cors, rate-limit, vitest, supertest, pglite).
- `backend/prisma/schema.prisma` — 7 نماذج (User, Task, TaskTimeLog, TaskComment, Feedback, Goal, CalendarEvent) + enums.
- `backend/prisma/migrations/0001_init/migration.sql` — SQL الأولي (مكتوب يدوياً، طُبّق على PGlite).
- `backend/prisma/migrations/migration_lock.toml`
- `backend/prisma.config.ts` — إعداد Prisma 7 (مسار schema/migrations/seed، الاتصال من `DATABASE_URL`).
- مجلدات فارغة: `backend/src/{controllers,routes,services,middleware,validators,utils}`, `backend/tests`.
- `OLD_HANDOFF_frontend_only.md` — نسخة من HANDOFF القديم داخل الـ ZIP الأصلي (يصف مشروعاً بلا backend) للرجوع فقط.

### عُدّلت
- لا ملفات مصدر عُدّلت. كل ملفات الواجهة **نُقلت** كما هي إلى `frontend/`
  (`src/`, `public/`, `index.html`, `package*.json`, ملفات tailwind/postcss/vite/tsconfig/oxlint).
- `.gitignore` القديم (3 أسطر) استُبدل بنسخة أوسع في الجذر.
- `README.md` القديم (قالب Vite) أُعيدت تسميته إلى `frontend/README.old.md`؛ سيُكتب README جديد لاحقاً.

### حُذفت
- `src/{components/` و`src/{components/{layout,...}}` — مجلدان فارغان بأسماء خاطئة ناتجان عن brace expansion فاشل.
- `dist/` و`node_modules/` القديمة (ناتج بناء، تُعاد بـ `npm install`/`npm run build`).
