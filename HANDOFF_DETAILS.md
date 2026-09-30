> **ملاحظة:** هذا الملف هو HANDOFF التفصيلي السابق (سجل Checkpoints والقرارات التي لا تُغيَّر ونتائج التحقق التاريخية). المرجع الحالي للحالة والمتبقي هو `HANDOFF.md`. عند التعارض، الأحدث هو `HANDOFF.md`.

# ▶ RESUME POINT

**آخر تحديث:** Checkpoint 14 (صفحة إدارة المستخدمين + تعديل الملف الشخصي في الواجهة + تصحيح ركاكة عدّاد المهام الفرعية)

- **🆕 Checkpoint 14 (هذه الجلسة) — كود واجهة جديد لم يُبنَ ولم يُجرَّب في متصفح:** كانت الواجهة تفتقر لواجهتين أشار إليهما HANDOFF سابقاً بشكل خاطئ (`Profile.tsx` كان للعرض فقط ولا توجد واجهة لإدارة المستخدمين رغم جاهزية الـ backend والخدمات). أُضيف: (1) `frontend/src/pages/ManageUsers.tsx` + `components/users/UserModal.tsx`، مسار `/manage-users` (صلاحية `manageUsers` لـ ADMIN/MANAGER فقط) وعنصر «إدارة المستخدمين» في الـ Sidebar: قائمة بحث، إضافة، تعديل (الحقول المتغيّرة فقط)، تفعيل/تعطيل، حذف بتأكيد. القيود في الواجهة تعكس قواعد الـ backend لكنها للتجربة فقط (المدير لا يمسّ حساب ADMIN ولا يمنح دور ADMIN؛ لا تعطيل/حذف/تغيير دور للذات؛ مستخدم النظام لا يُحذف ولا يُعطَّل ولا يتغير دوره؛ الحذف مع بيانات مرتبطة يُظهر رسالة الـ 409). (2) `Profile.tsx`: نموذج تعديل الاسم والبريد والمسمى وتغيير كلمة المرور (بالحالية + تأكيد) عبر `usersService.updateMe`، ويحدّث `AuthProvider.setUser` بعد الحفظ. (3) `TaskCard.tsx`: صياغة عربية صحيحة لعدد المهام الفرعية (كانت «1 مهام فرعية»). **ما تحقّق فعلاً:** فحص syntax لكل الملفات المعدّلة ✅، وtypecheck للملفات المعدّلة مقابل تعريفات مبسّطة (stubs) لـ React/lucide/router بلا أخطاء حقيقية (تحقّقت أن الفاحص يلتقط خطأً مُتعمَّداً). **ما لم يتحقق:** `npm run build` و`npm run lint` الحقيقيان (لا `node_modules` ولا شبكة في تلك الجلسة)، ولا اختبار في المتصفح، ولا وجود لـ Postgres في تلك الجلسة. **أول ما تفعله:** `cd frontend && npm install && npm run build && npm run lint`، وأصلح أي خطأ نوع محتمل، ثم جرّب `/manage-users` و«صفحتي» في المتصفح بمدير ثم بمصمم (المصمم يجب أن يُعاد توجيهه بعيداً عن `/manage-users`).
- **ℹ️ تصحيح لملاحظات جلسة سابقة:** زر طيّ/توسيع المهمة الأم **عليه** `aria-label` في هذا الكود (السطران المعنيان في `TaskCard.tsx`)، فلا حاجة لإصلاحه. سيناريوهات المتصفح التي أُبلغ عنها سابقاً (25/25 و13/13 على Chromium + PostgreSQL 16) نُفِّذت في جلسة سابقة وسكربتاتها **غير مرفقة** في هذا الـ ZIP، فلا تُعامَل كاختبار قابل للإعادة من الملف.

- **✅ Checkpoint 13 (هذه الجلسة):** بدأتُ من ZIP فيه Checkpoint 12، وأعدتُ التحقق من الصفر: backend `npm install` + `prisma generate` + typecheck نظيف ✅ · frontend `npm install` + `npm run build` ✅ (417 kB JS / 24 kB CSS) · `npm run lint` = 0 أخطاء، **13 تحذيراً** (كان المدوَّن 11؛ كلها `react-hooks/set-state-in-effect` و`only-export-components` و`purity`، لم أعدّلها لأن إصلاحها يغيّر سلوك المكونات ولا يوجد متصفح للتحقق). **أُضيف `backend/tests/dbConfig.test.ts` (8 اختبارات)** يغطي `buildPoolConfig` و`DATABASE_CA_CERT` في `loadEnv` (بلا CA ← الرابط كما هو؛ CA فارغ ← يُتجاهل؛ مع CA ← يُزال `sslmode` و`rejectUnauthorized:true`؛ صيغة `\n` النصّية؛ بقاء بقية معاملات الرابط). النتيجة: **vitest = 97/97** ✅ (كان 89). **أعدتُ تشغيل سكربتي التكامل على PostgreSQL 16 حقيقي (ثُبِّت بـ apt بعد تعطيل مستودع nodesource المحجوب؛ التشغيل يدوي عبر `pg_ctlcluster 16 main start`):** قاعدة نظيفة ← `0001_init/migration.sql` بـ psql (7 جداول) ← `npm run seed` مرتين (3 مستخدمين) ← خادم ← `http-smoke` = **35/35** ✅ ← `services-smoke` = **32/32** ✅. تنبيه: تشغيل `http-smoke` مرتين على نفس القاعدة يفشل في المرة الثانية (`des1` موجود) — أعد القاعدة نظيفة بين التشغيلات. جرّبتُ `prisma migrate deploy` مجدداً فبقي محجوباً بـ 403 (تنزيل schema-engine) ← **لا يزال غير مُتحقَّق منه ولا drift-check**. أُصلحت صفوف قديمة في جدول الأقسام (9، 10، 20، 33) وفق الواقع.

- **✅ Checkpoint 12 — دعم شهادة CA لقاعدة البيانات (مهم لـ Aiven):** pg 8.23 يعامل `sslmode=require` كتحقق كامل من الشهادة، فاتصال Aiven (CA خاص) يفشل بدون CA. أُضيف `DATABASE_CA_CERT` (اختياري، PEM؛ يقبل `\n` نصّية للصقه في متغيرات Render) في `src/utils/env.ts` و`src/db.ts` (`buildPoolConfig`: يُزيل `sslmode` من الرابط ويمرّر `ssl:{ca, rejectUnauthorized:true}`؛ لا يعطّل التحقق أبداً). **جُرّب فعلياً** على PG 16 محلي بـ SSL وشهادة من CA خاص: بدون CA ← يفشل (`unable to verify the first certificate`) ✅ · CA صحيح ← ينجح ✅ · CA خاطئ ← يُرفض ✅ · صيغة `\n` النصّية ← ينجح ✅ · بدون SSL ← ينجح (لا تراجع) ✅. **لم يُجرَّب على Aiven نفسها**، اختبار `buildPoolConfig` الآلي أُضيف في Checkpoint 13 (منطق الإعداد فقط، أما اتصال SSL الفعلي فيدوي).
- **✅ `frontend/public/_redirects`** (`/* /index.html 200`) أُضيف ويُنسخ إلى `dist/` عند البناء ✅. و`trust proxy` مضبوط سلفاً (لازم خلف Render حتى يعمل الـ rate limit بعنوان العميل).
- **✅ إعادة تحقّق من سكربتات التكامل (شغّلتُها بنفسي على قاعدة نظيفة):** `backend/scripts/http-smoke.mjs` = **35/35** ✅ (شُدِّد تأكيد التعليق: كان `...===201||true` يمرّ دائماً فصار `===200`) · `frontend/scripts/services-smoke.mjs` = **32/32** ✅ (كان يسقط عند تشغيله بعد http-smoke لأن الأخير يعطّل `des1`؛ صار يعيد تفعيله عبر `usersService.setActive` وهذا فحص إضافي). الترتيب: قاعدة نظيفة ← migration ← seed ← خادم ← http-smoke ← services-smoke.
- **بعد التعديلات:** typecheck نظيف ✅ · vitest 89/89 ✅ · frontend build ✅.

- **✅ الواجهة رُبطت بالـ API (Checkpoint 9) وتحقّقنا من حالتها الآن:** `frontend/src/lib/api.ts` (عميل fetch بـ Bearer + `ApiError` + حدث `auth:unauthorized` عند 401)، `authService` حقيقي (login/me/logout بـ JWT)، وخدمات `tasks/users/goals/feedback/schedule` تستدعي الـ API؛ `useResource` لحالات loading/error؛ `AuthProvider` يتحقق من التوكن مع `/auth/me` عند الإقلاع؛ `ProtectedRoute` + `permissions.ts` لحراسة المسارات (تجربة مستخدم فقط). لا بيانات في localStorage سوى التوكن (`tashkeel_token`) وتفضيل السمة (`tashkeel_theme`).
- **نتائج التحقق الفعلية (هذه الجلسة):** backend `npm install` ✅ · `prisma generate` ✅ (بحيلة `PRISMA_SCHEMA_ENGINE_BINARY=/bin/true`) · `npm run typecheck` نظيف ✅ · `vitest run` = **89/89 ناجحاً** ✅ · `tsc` emit ✅ · frontend `npm install` + `npm run build` (tsc -b + vite) ✅ (417 kB JS / 24 kB CSS) · `npm run lint` = 0 أخطاء، 11 تحذيراً (react-hooks/fast-refresh، غير حرجة).
- **✅ اختبار تكامل فعلي (Checkpoint 11) على PostgreSQL 16 حقيقي** (ثُبِّت بـ apt داخل الـ sandbox): طُبِّق `0001_init/migration.sql` بـ psql (7 جداول، بلا أخطاء) · `npm run seed` مرتين بلا تكرار (3 مستخدمين) · الخادم يعمل (`tsx src/server.ts`) · `backend/scripts/http-smoke.mjs` = **35/35** (دخول مدير/مصمم، 403 للمصمم على users/goals/calendar، إنشاء/تعيين/Start/Stop/End، مهام فرعية، move-unfinished، feedback، goals، calendar، bulk-delete، الملف الشخصي، تعطيل مستخدم ← 401 فوراً، مستخدم النظام لا يُحذف) · `frontend/scripts/services-smoke.mjs` = **32/32** (أُعيد التحقق في Checkpoint 12؛ الرقم الأصلي 31) (نفس كود `src/services/*` الحقيقي عبر Vite SSR ضد الخادم الحقيقي، بما فيه فحص 403 للمصمم وتحويل الأدوار لحروف صغيرة) · **rate limit ✅** (429 بعد 20 محاولة) · **CORS ✅** (يسمح لـ `FRONTEND_URL` فقط) · helmet ✅ (HSTS + nosniff).
- **ما زال غير مُتحقَّق منه:** (1) `prisma migrate deploy` نفسه (محرك Prisma يُحجب بـ 403 في الـ sandbox) ومطابقة `migration.sql` لما يولّده Prisma من schema (drift)؛ (2) الواجهة في **متصفح حقيقي** (تفاعل، سحب وإفلات، RTL بصرياً، Stopwatch)، (3) المرفقات base64 الكبيرة قرب حد 15MB، (4) Aiven/Render/Cloudflare (آلية SSL/CA مُختبرة محلياً فقط).
- **الخطوة التالية بالضبط:**
  1. **على جهازك (خارج الـ sandbox):** `prisma migrate deploy` الفعلي على PostgreSQL محلي ثم `npx prisma migrate diff` للتأكد من عدم وجود drift، ثم تشغيل backend + frontend وتجربة الواجهة في متصفح: دخول مدير/مصمم، Start/Stop/End، مهمة فرعية، سحب/ترتيب، نقل غير المنتهي، ملاحظة، هدف، حدث تقويم، إدارة مستخدمين، الملف الشخصي، وأن المصمم يُمنع من صفحات الإدارة.
  2. مراجعة تحذيرات lint الـ 13 (اختياري؛ تحتاج تجربة في متصفح بعد أي تعديل).
  3. ✅ (أُنجز في Checkpoint 13) ملء القسم 33؛ الأقسام الأخرى المتبقية 🟨 تنتظر اختبار المتصفح.
  4. خطة النشر (Aiven → GitHub → Render → Cloudflare) **بموافقتك فقط**.
- **أوامر التحقق عند الاستئناف:**
  ```bash
  cd backend && npm install
  npx prisma generate            # في الـ sandbox فقط: PRISMA_SCHEMA_ENGINE_BINARY=/bin/true npx prisma generate
  npm run typecheck && npx vitest run     # المتوقع: 97 اختباراً ناجحاً
  npx tsc -p tsconfig.json       # في الـ sandbox بدل npm run build (لأن prisma generate فيه يفشل بـ 403)
  cd ../frontend && npm install && npm run build
  ```
- **⚠️ ملاحظة فقدان عمل (من جلسة سابقة):** `routes/tasks.ts` أُعيد بناؤه من سجل محادثة مصدَّر بعد أن لم يصل ضمن ZIP قديم. الآن مُختبر (17 اختباراً) لكن إن كانت لديك نسخة أقدم فيها فروقات فقارنها.
- **الجزء 8 (CalendarEvent):** صار مُشغَّلاً ومُتحقَّقاً منه (9 اختبارات ناجحة ضمن الـ 89) بلا أي تعديل على الكود.
- **قرارات لا تُغيَّر:**
  - **Tasks API (الجزء 5، مُختبر):** المصمم يصل لمهامه فقط (403 لغيرها) ولا يعدّل/يحذف؛ يسمح له Start/Stop/End + `PATCH /:id/progress` + التعليق. `createdById` من المستخدم الحالي دائماً؛ المصمم لا يعيّن لغيره (403)؛ المهمة الفرعية تتبع مسؤول الأم. الإكمال (بالتقدّم أو End) يغلق سجل الوقت المفتوح وينقل المهمة لأسفل قائمتها. `move` و`move-unfinished` للإدارة فقط. المدد بالميلي ثانية والحالة/الأولوية بحروف صغيرة في الـ response. المسارات الثابتة (`/reorder`, `/move-unfinished`) معرَّفة قبل `/:id`.
  - **CalendarEvent API (الجزء 8، مُختبر):** `/api/calendar-events` للإدارة فقط (ADMIN/MANAGER)؛ المصمم ← 403 على كل المسارات. `createdById` من المستخدم الحالي دائماً. الـ response يتوافق مع نوع `Season` في الواجهة (`id,title,startDate,endDate,color,description?`) مع `createdById/createdByName/createdAt/updatedAt`؛ القائمة في `{ events: [...] }` مرتبة بـ `startDate` تصاعدياً وتقبل `from/to` (فلتر تداخل). اللون `#RRGGBB` واختياري (الافتراضي `#6b8e7f` من schema). `endDate >= startDate` مطلوب (400). حذف فعلي (hard delete). ملاحظة: افتراضي اللون في الواجهة `#27C6A3` فأرسله من الواجهة صراحةً.
  - **Goals API (الجزء 7، مُختبر):** للإدارة فقط (ADMIN/MANAGER)؛ المصمم ← 403 على كل المسارات. `createdById` من المستخدم الحالي دائماً. النوع/الحالة بحروف صغيرة في الـ response (`weekly|monthly|quarterly`، `not_started|in_progress|completed|paused`) ويُقبلان بأي حالة أحرف. `progress` (0–100) يُحسب في الـ response بنفس معادلة الواجهة. الحالة: `current >= target` ← `completed` دائماً؛ `completed` يدوياً وهو أقل من الهدف ← `in_progress`؛ بدون حالة صريحة تبقى `paused` كما هي وإلا تُشتق من التقدّم؛ خفض التقدّم عن الهدف يُخرج الهدف من `completed`. `endDate` اختياري عند الإنشاء (أسبوعي +6، شهري +29، ربع سنوي +89 يوماً) ويُرفض إن سبق `startDate`. حذف الهدف فعلي (hard delete).
  - **Feedback API (الجزء 6، مُختبر):** المصمم ينشئ ويرى ملاحظاته هو فقط (403 لملاحظة غيره) ولا يعدّل ولا يحذف (حتى ملاحظته)؛ ADMIN/MANAGER إدارة كاملة. `createdById` من المستخدم الحالي دائماً. النوع/الحالة بحروف صغيرة في الـ response (`problem|operational|idea`، `open|resolved`). تبديل الحالة عبر `PATCH /:id` بحقل `status` (للإدارة فقط). الحذف الجماعي `POST /api/feedback/bulk-delete` للإدارة فقط بنفس خيارات الواجهة (`type`, `fromDate`, `toDate`؛ بدونها = حذف الكل) وهو معرَّف قبل `/:id`. القائمة تقبل فلاتر `type/status/from/to`.
  - **Users API (قرارات الجزء 4، مُختبرة):** MANAGER لا يعدّل/يعطّل/يحذف حساب ADMIN (وإلا يستطيع إعادة تعيين كلمة مروره)؛ مستخدم النظام لا يُحذف ولا يُعطَّل ولا يتغير دوره؛ لا أحد يعطّل/يحذف/يغيّر دور نفسه؛ حذف مستخدم له بيانات مرتبطة ← 409 (يُعطَّل بدلاً من ذلك)؛ `PATCH /users/me` يقبل `name/email/jobTitle` وتغيير كلمة المرور (بالحالية) فقط، ويرفض أي حقل آخر (400).
  - Prisma **7** + `@prisma/adapter-pg`؛ العميل المولَّد في `backend/src/generated/prisma` (مُتجاهَل في git).
  - المهام الفرعية = `Task.parentId`. التعليقات في `TaskComment`. `totalDuration` يُحسب من `TaskTimeLog` ولا يُخزَّن.
  - التواريخ `YYYY-MM-DD` نصوص. المرفقات JSON (base64) مع حد للطلب (15MB).
  - المستخدمون: عبدالله MANAGER، عمرو MANAGER، عبدالرحمن ADMIN (`lol`)، وكلهم `isSystemUser`.
  - **المصادقة:** JWT في ترويسة `Authorization: Bearer` (وليس cookie، لأن الواجهة والـ API على نطاقين مختلفين). الـ backend يعيد تحميل المستخدم من DB في كل طلب (الدور/التفعيل). logout بلا حالة (العميل يتلف التوكن).
  - `username` يُخزَّن lowercase ويُقارَن lowercase.
  - **الصلاحيات (قرارات موثّقة):** ADMIN وMANAGER لهما إدارة كاملة، لكن إسناد دور ADMIN لمستخدم يقتصر على ADMIN. DESIGNER يرى مهامه وملاحظاته هو فقط، ولا يستدعي `/users` (403).
  - المصمم لا يعدّل/يحذف مهمة؛ يُسمح له بـ Start/Stop/End + تحديث تقدّم مهمته + التعليق عليها.
  - الواجهة تبقى على `HashRouter`. لا أسرار في أي ملف. الاختبارات على PGlite عبر `pglite-socket` (المنفذ 54329) بـ `DB_POOL_MAX=1`.
  - ⚠️ في الـ sandbox لا يوجد brace expansion في `sh`: أنشئ المجلدات بحلقة `for` وليس `{a,b}`.

---

# HANDOFF.md — تحويل تطبيق قسم التصميم إلى Full Stack

> **الحالة الحالية: قيد التنفيذ — الـ backend (الأجزاء 1–8) مكتمل ومُتحقَّق منه (97 اختباراً ناجحاً)، والواجهة رُبطت بالـ API وتُبنى بنجاح. الناقص: اختبار تكامل فعلي في متصفح على PostgreSQL حقيقي، ثم النشر (انظر RESUME POINT).**
> هذا الملف خطة تسليم (Handoff) ويُحدَّث بعد كل Checkpoint بما تحقق فعلاً فقط.
> عند نهاية التنفيذ يجب على المنفّذ (Claude Code / أي مطوّر) **تحديث هذا الملف** ليصف ما تم تنفيذه فعلاً، وليس ما كان مخططاً.

---

## 0. الهدف

تحويل تطبيق قسم التصميم الحالي (واجهة عربية RTL: المهام اليومية، الملاحظات، الأهداف، التقويم السنوي، المستخدمون) إلى تطبيق Full Stack حقيقي مع **الحفاظ الكامل على الواجهة الحالية**.

### قواعد لا تُكسر
- العمل داخل مجلد المشروع فقط.
- فحص المشروع أولاً وعدم افتراض بنيته.
- عدم إعادة بناء المشروع من الصفر، وعدم حذف ميزات تعمل.
- عدم طباعة أو رفع أي أسرار (API keys / passwords / tokens).
- عدم عمل deploy أو push إلى GitHub أثناء مرحلة التنفيذ المحلي.
- عدم تنفيذ أي أمر مدمّر على قاعدة البيانات (`migrate reset` وغيره).
- كلمات المرور تُخزَّن مُجزّأة (bcrypt) ولا تُكتب في README أو HANDOFF أو الكود.

---

## 1. مسار الاستضافة المخطط

| الطبقة | الخدمة | ملاحظات |
|---|---|---|
| قاعدة البيانات | **Aiven** (PostgreSQL) | الاتصال عبر `DATABASE_URL` مع `sslmode=require` |
| الكود | **GitHub** | مستودع Private، وملف `.env` ممنوع رفعه |
| الـ Backend | **Render** (Web Service) | Node + Express + Prisma |
| الـ Frontend | **Cloudflare** (Pages) | ملفات ثابتة + متغير عنوان الـ API |

**ترتيب الإعداد المقترح:** Aiven → GitHub → Render → Cloudflare → تحديث `FRONTEND_URL` في Render.

---

## 2. مراحل التنفيذ (Checklist)

ضع علامة ✅ فقط بعد التنفيذ **والتحقق** الفعلي.

### المرحلة 1 — فحص المشروع
- [x] ✅ تحديد Frontend framework وأداة البناء
- [x] ✅ تحديد الـ routes والـ components والـ services وإدارة الحالة
- [x] ✅ فحص الـ authentication الحالي
- [x] ✅ فحص تنفيذ: Tasks / Feedback / Goals / Calendar / Users
- [x] ✅ فحص mock data واستخدام localStorage
- [x] ✅ فحص وجود backend أو database حالياً
- [x] ✅ كتابة خطة تنفيذ مبنية على ما هو موجود فعلاً

### المرحلة 2 — هيكلة Full Stack
- [x] ✅ `frontend/` و `backend/` (إن كان متوافقاً مع المشروع)
- [x] ✅ backend: `tsconfig.json` + `src/{app,server,db}.ts` + middleware/utils/validators/routes للـ auth (typecheck وbuild ناجحان؛ التشغيل الفعلي للخادم على DB خارجية غير مُتحقَّق منه)
- [x] ✅ `prisma/schema.prisma` صالح، و`prisma/seed.ts` مكتوب ومُختبر على PGlite

### المرحلة 3 — قاعدة البيانات (Prisma + PostgreSQL)
- [x] ✅ النماذج: `User, Task, TaskTimeLog, Feedback, Goal, CalendarEvent` + `TaskComment` (تم التحقق بـ prisma validate/generate). **انحراف موثّق:** لا جدول `Subtask` — المهام الفرعية = `Task.parentId`
- [x] ✅ حقول User (+ `jobTitle`): `id, name, username, email, passwordHash, role, isActive, isSystemUser, createdAt, updatedAt`
- [x] ✅ الأدوار: `ADMIN, MANAGER, DESIGNER`
- [x] ✅ علاقات حقيقية (لا تخزين أسماء المستخدمين نصاً داخل المهام)
- [ ] 🟨 Migration: `0001_init/migration.sql` مكتوب يدوياً وطُبّق بنجاح على PGlite (7 جداول). **غير مُتحقَّق منه:** `prisma migrate deploy` نفسه (محرك Prisma محجوب في هذه البيئة) ومطابقته لما يولّده Prisma

### المرحلة 4 — Seed (idempotent)
- [x] ✅ (اختبارات seed: 3 نجحت) بشمهندس عبدالله — `MANAGER` — `isSystemUser: true`
- [x] ✅ عمرو — `MANAGER` — `isSystemUser: true`
- [x] ✅ عبدالرحمن — `ADMIN` — username: `lol` — `isSystemUser: true`
- [x] ✅ كلمة مرور المدير تُقرأ من متغير البيئة `ADMIN_PASSWORD` ثم تُجزَّأ بـ bcrypt (لا تُكتب في الكود أو التوثيق)
- [x] ✅ تشغيل الـ seed أكثر من مرة لا ينتج تكرار (upsert)

### المرحلة 5 — المصادقة
- [x] ✅ `POST /api/auth/login` — تحقق من username / password / الحساب مفعّل
- [x] ✅ `GET /api/auth/me`
- [x] ✅ `POST /api/auth/logout`
- [x] ✅ JWT + middleware للمسارات الخاصة
- [x] ✅ Rate limiting على /auth/login (20 محاولة/15 دقيقة؛ مُختبَر على خادم حقيقي: 429 بعد 20؛ معطَّل فقط في NODE_ENV=test)
- [x] ✅ الـ backend هو من يحدد المستخدم الحالي (لا يُوثق بالـ frontend)

### المرحلة 6 — إدارة المستخدمين
> ✅ backend مُختبر في Checkpoint 6 (`tests/users.test.ts` = 20 اختباراً ناجحاً). 🟨 الواجهة: `pages/ManageUsers.tsx` كُتبت في Checkpoint 14 (لم تُبنَ ولم تُجرَّب في متصفح بعد).
- [x] ✅ `POST /api/users` · `GET /api/users` · `GET /api/users/:id`
- [x] ✅ `PATCH /api/users/:id` · `PATCH /api/users/:id/status` · `DELETE /api/users/:id` · `PATCH /api/users/me`
- [x] ✅ إضافة / عرض / تعديل / تفعيل / تعطيل / حذف (للمستخدمين العاديين فقط)
- [x] ✅ مستخدمو النظام لا يُحذفون أبداً
- [x] ✅ الاعتماد على التعطيل (deactivate) عندما تكون هناك بيانات تاريخية مرتبطة (409 عند الحذف)

### المرحلة 7 — الصلاحيات (Backend + Frontend)
- [ ] **ADMIN / MANAGER:** المستخدمون، المهام، تعيين المهام، الملاحظات، الأهداف، التقويم السنوي
- [ ] **DESIGNER:** المهام اليومية + الملاحظات + ملفه الشخصي فقط
- [ ] المصمم لا يصل إلى: إدارة المستخدمين، بيانات مستخدمين آخرين، الإعدادات الإدارية، الأدوار، مستخدمي النظام، مهام مصممين آخرين

### المرحلة 8 + 9 — قواعد المهام والنسبة (createdBy / assignedTo)
> ✅ backend مُختبر في Checkpoint 6 (`tests/tasks.test.ts` = 17 اختباراً ناجحاً). الواجهة لم تُربط (بند العرض أدناه متبقٍّ).
- [x] ✅ كل مهمة تحتوي `createdById` و `assignedToId`
- [x] ✅ المصمم: `createdById = assignedToId = المستخدم الحالي` (يُرفض أي محاولة لتعيين شخص آخر)
- [x] ✅ المصمم: يُنشئ مهمته، يراها، Start / Stop / Stop Reason / End
- [x] ✅ المصمم لا يعدّل ولا يحذف ولا يعيّن لغيره
- [ ] 🟨 الواجهة تعرض: `أضيفت بواسطة: ...` و `المسؤول: ...` (موجود في `TaskCard.tsx`؛ غير مُجرَّب في متصفح)

### المرحلة 10–13 — المهام اليومية والوقت والمهام الفرعية
- [ ] الحفاظ على: بطاقات المهام، الـ checkbox، الشطب، النقل لأسفل عند الإكمال، Start/Stop/End، Stopwatch، التعليقات، Subtasks، Progress bars، إعادة الترتيب، Move Tasks
- [ ] استبدال البيانات الثابتة ببيانات الـ API
- [ ] المستخدمون في Daily Tasks يأتون من جدول Users
- [ ] المستخدم الجديد يظهر تلقائياً كعضو فريق **بدون مهام وهمية**
- [ ] `TaskTimeLog`: `taskId, userId, startTime, stopTime, stopReason, createdAt`
- [ ] `Subtask`: `id, taskId, title, progress, status, createdAt, updatedAt`
- [ ] progress لكل مهمة فرعية + progress إجمالي للمهمة الرئيسية

### المرحلة 14 — الملاحظات (Feedback)
> ✅ backend مُختبر في Checkpoint 6 (`tests/feedback.test.ts` = 15 اختباراً ناجحاً). الواجهة لم تُربط (التمييز البصري للتصنيفات متبقٍّ في الواجهة).
- [ ] التصنيفات: `مشكلة تشغيل` / `مشكلة` / `فكرة` (مع الحفاظ على تمييزها البصري) — الـ backend يخزّنها كـ `PROBLEM|OPERATIONAL|IDEA` ✅؛ الواجهة متبقية
- [x] ✅ `POST/GET /api/feedback` · `GET/PATCH/DELETE /api/feedback/:id` · `POST /api/feedback/bulk-delete`
- [x] ✅ DESIGNER: إنشاء وعرض فقط — ADMIN/MANAGER: إدارة كاملة

### المرحلة 15 — الأهداف
> ✅ backend مُختبر في Checkpoint 6 (`tests/goals.test.ts` = 15 اختباراً ناجحاً). الواجهة لم تُربط (التقدّم العام في `GoalStats` يُحسب في الواجهة من القائمة).
- [x] ✅ `GET/POST /api/goals` · `GET/PATCH/DELETE /api/goals/:id` (للإدارة فقط)
- [x] ✅ أنواع: أسبوعي / شهري / ربع سنوي، مع `progress` لكل هدف
- [ ] قاعدة البيانات هي المصدر الوحيد للحقيقة (يتحقق بعد ربط الواجهة)

### المرحلة 16 — التقويم السنوي
> ✅ backend مُختبر (9 اختبارات). الواجهة رُبطت (`scheduleService`) وbuild ✅؛ لم تُجرَّب في متصفح.
- [x] ✅ `GET/POST /api/calendar-events` · `GET/PATCH/DELETE /api/calendar-events/:id` (للإدارة فقط)
- [x] ✅ `CalendarEvent`: `title, description, startDate, endDate, color, createdById, ...`
- [ ] 🟨 الحفاظ على الواجهة الحالية (لم تُعدَّل بصرياً؛ غير مُجرَّبة في متصفح)

### المرحلة 17 — الملف الشخصي
- [ ] المصمم يرى ويدير بياناته المسموح بها فقط
- [ ] لا يستطيع تغيير: الدور / الصلاحيات / حالة مستخدم النظام

### المرحلة 18 + 19 — ربط الواجهة وحماية المسارات
- [x] ✅ طبقة API service في الـ frontend (`lib/api.ts` + `services/*`)
- [x] ✅ إزالة mock/localStorage كمصدر للبيانات (لم يبقَ إلا التوكن والسمة؛ فُحص بـ grep)
- [ ] 🟨 حالات: loading / error مُنفَّذة (`useResource`, `StatusViews`)؛ unauthorized (401 ← خروج) ومنع الصفحات بالدور مُنفَّذان؛ forbidden/empty غير مُجرَّبة في متصفح
- [ ] 🟨 Route guards مُنفَّذة (`ProtectedRoute`)؛ غير مُجرَّبة في متصفح

### المرحلة 20–22 — الأمان
- [ ] تجزئة كلمات المرور (bcrypt/bcryptjs)
- [ ] Zod (أو ما يعادله) للتحقق من الطلبات
- [ ] Helmet + CORS مضبوط على `FRONTEND_URL`
- [ ] أكواد HTTP صحيحة ومعالجة أخطاء آمنة
- [ ] `passwordHash` لا يُرجَع أبداً في أي response
- [ ] `.env` في `.gitignore`
- [ ] `.env.example` يحتوي:

```
DATABASE_URL=
JWT_SECRET=
PORT=
FRONTEND_URL=
ADMIN_USERNAME=
ADMIN_PASSWORD=
ADMIN_EMAIL=
```

### المرحلة 25 — الاختبارات
- [ ] تسجيل دخول ناجح / فاشل
- [ ] طلب بدون مصادقة (401) وطلب ممنوع (403)
- [ ] صلاحيات ADMIN و MANAGER و DESIGNER
- [ ] المصمم ينشئ مهمته فقط ولا يعيّن لغيره
- [ ] المصمم لا يعدّل ولا يحذف مهمة، ولا يحذف Feedback
- [ ] مستخدم النظام لا يُحذف
- [ ] إنشاء مستخدم وتفعيل/تعطيله

### المرحلة 26 — البناء والتحقق
- [x] ✅ تثبيت الاعتماديات
- [x] ✅ build للـ frontend
- [x] ✅ build للـ backend (`tsc` emit؛ `npm run build` الكامل يحتاج تنزيل محرك Prisma غير متاح في الـ sandbox)
- [x] ✅ lint (0 أخطاء، 13 تحذيراً) + tests (97/97)
- [ ] إصلاح أخطاء TypeScript والـ imports وتكامل الـ API

### المرحلة 27 + 28 — التوثيق
- [ ] تحديث `README.md` (الإعداد، البيئة، أوامر Prisma، الـ seed، الصلاحيات، نظرة على الـ API — بدون أسرار)
- [ ] تحديث هذا الملف `HANDOFF.md` ليصف **التنفيذ الفعلي** (انظر القسم 4)

---

## 3. خطة النشر (تُنفَّذ بعد نجاح كل شيء محلياً)

### 3.1 Aiven — قاعدة البيانات
1. إنشاء خدمة PostgreSQL جديدة في Aiven.
2. نسخ **Service URI** (يحتوي host / port / user / password / `sslmode=require`).
3. حفظه كـ `DATABASE_URL` في متغيرات Render ومحلياً في `.env` فقط.
4. نزّل شهادة CA من لوحة Aiven وضع محتواها (PEM) في متغير `DATABASE_CA_CERT` في Render (يقبل سطراً واحداً بـ `\n`). **لا تعطّل التحقق من الشهادة.** (مدعوم في الكود منذ Checkpoint 12).
5. تشغيل الـ migrations على قاعدة Aiven بالأمر الآمن `npx prisma migrate deploy` (وليس `migrate dev` أو `migrate reset`).
6. تشغيل الـ seed **مرة واحدة من جهازك** (يحتاج `tsx` وهو devDependency، فلا يصلح على Render): `cd backend && DATABASE_URL=... DATABASE_CA_CERT=... ADMIN_PASSWORD=... JWT_SECRET=... npm run seed`. ⚠️ الـ seed يعطي **المستخدمين الثلاثة** (`lol` و`abdullah` و`amr`) نفس كلمة `ADMIN_PASSWORD`، فيجب أن يغيّر كل منهم كلمته بعد أول دخول (صفحة «صفحتي» تدعم ذلك منذ Checkpoint 14). `migrate deploy` يستخدم `DATABASE_URL` بـ `sslmode=require` عبر محرك Prisma لا عبر `pg`؛ **قبوله لهذا الرابط مع Aiven لم يُجرَّب**.

### 3.2 GitHub — المستودع
1. إنشاء مستودع **Private**.
2. التأكد أن `.gitignore` يشمل: `.env`, `node_modules`, `dist`, `build`.
3. التأكد أنه لا يوجد أي سر داخل الكود أو تاريخ الـ commits قبل أول push.
4. رفع الكود (push) — بعد موافقتك فقط.

### 3.3 Render — الـ Backend (Web Service)
- ربط مستودع GitHub، و **Root Directory:** `backend`
- **Build Command:** `npm install --include=dev && npm run build` (⚠️ Render يضبط `NODE_ENV=production` فيتخطّى `npm install` العادي الـ devDependencies، و`prisma` و`typescript` و`tsx` كلها devDependencies؛ بدون `--include=dev` يفشل البناء. سكربت `build` يشغّل `prisma generate` بنفسه)
- **Start Command:** `npx prisma migrate deploy && npm start` (يعمل لأن الـ CLI يبقى في `node_modules` بعد البناء بهذا الأمر)
- **Environment Variables:** `DATABASE_URL`, `DATABASE_CA_CERT`, `JWT_SECRET` (قيمة عشوائية طويلة)، `FRONTEND_URL`, `NODE_ENV=production`, و `ADMIN_*` للـ seed
- إضافة مسار فحص صحة `GET /api/health` واستخدامه كـ Health Check
- تنبيه: الخطة المجانية في Render قد تُوقف الخدمة عند الخمول، فأول طلب بعدها يكون بطيئاً.
- تحقق من الأوامر وأسماء السكربتات الفعلية في `package.json` قبل الاعتماد عليها.

### 3.4 Cloudflare — الـ Frontend (Pages)
- ربط نفس المستودع، و **Root Directory:** `frontend`
- **Build Command / Output Directory:** حسب أداة البناء المكتشفة في المرحلة 1 (مثلاً `npm run build` و `dist` لو كان Vite)
- متغير البيئة لعنوان الـ API (مثلاً `VITE_API_URL=https://<render-service>.onrender.com/api`) — متغيرات الـ frontend **عامة**، لذلك لا تضع فيها أي سر
- قاعدة SPA fallback: `frontend/public/_redirects` **موجود ومُضاف** ✅
- بعد الحصول على رابط Pages: تحديث `FRONTEND_URL` في Render ليطابقه تماماً (لضبط CORS)، ثم إعادة النشر.

### 3.5 قائمة تحقق ما بعد النشر
- [ ] تسجيل الدخول بحساب المدير يعمل
- [ ] لا تظهر أخطاء CORS في المتصفح
- [ ] `GET /api/auth/me` يعيد المستخدم الحالي
- [ ] مصمم تجريبي لا يستطيع فتح صفحة المستخدمين ولا استدعاء APIs الإدارة (403)
- [ ] إنشاء مهمة وتشغيل Start/Stop/End يعمل ويُحفظ في Aiven
- [ ] تغيير كلمة مرور المدير الأولية

---

## 4. أقسام التسليم النهائي (تُملأ عند اكتمال التنفيذ)

يجب أن يصف كل قسم **الواقع الفعلي** لا المخطط:

1. Project overview
2. Current architecture
3. Frontend architecture
4. Backend architecture
5. Database architecture
6. Database tables
7. Authentication
8. JWT implementation
9. User roles
10. Permissions
11. System users
12. Daily Tasks
13. Task creator
14. Task assignee
15. Subtasks
16. Time tracking
17. Feedback
18. Goals
19. Annual Calendar
20. Profile
21. API endpoints
22. Security
23. Environment variables
24. Prisma migrations
25. Seed process
26. Frontend/API integration
27. Route protection
28. Files created
29. Files modified
30. Tests performed
31. Build results
32. Known limitations
33. Future improvements
34. Local development instructions
35. Deployment preparation instructions

> لا تُعلن اكتمال أي بند قبل تنفيذه والتحقق منه فعلياً.


---

## 5. حالة أقسام التسليم (35 قسماً) — بما تحقق فعلاً فقط

الرموز: ⬜ لم يبدأ · 🟨 جزئي · ✅ مكتمل ومُتحقَّق · ❌ فشل

| # | القسم | الحالة | الواقع الفعلي حتى Checkpoint 1 |
|---|---|---|---|
| 1 | Project overview | 🟨 | مشروع React/Vite/TS عربي RTL كان frontend-only على localStorage؛ أُعيدت هيكلته إلى `frontend/` + `backend/` |
| 2 | Current architecture | 🟨 | الواجهة كما هي (localStorage)؛ backend: package + schema فقط |
| 3 | Frontend architecture | 🟨 | React 19 + Vite 8 + Tailwind 3 + react-router (HashRouter)؛ طبقة `src/services/*` تستدعي الـ API عبر `lib/api.ts`؛ `hooks/useResource` للتحميل/الخطأ؛ build ✅. لم تُجرَّب في متصفح |
| 4 | Backend architecture | 🟨 | Express 4 + Prisma 7؛ routers: auth, users, tasks, feedback, goals, calendar-events؛ الخادم (dev وdist/production) جُرّب على PostgreSQL 16 حقيقي ✅ (http-smoke 35/35) |
| 5 | Database architecture | 🟨 | PostgreSQL عبر Prisma؛ schema صالح؛ SQL الأولي طُبّق على PG 16 حقيقي (7 جداول) ✅؛ اتصال SSL بـ CA خاص مُختبر محلياً |
| 6 | Database tables | ✅ | User, Task, TaskTimeLog, TaskComment, Feedback, Goal, CalendarEvent (schema صالح + SQL طُبّق على PGlite). لا جدول Subtask (انحراف موثّق) |
| 7 | Authentication | 🟨 | backend: login/me/logout ✅ مُختبر (13 اختباراً). الواجهة: `authService` حقيقي بـ JWT + `AuthProvider` يتحقق بـ `/auth/me`؛ build ✅، غير مُجرَّب في متصفح |
| 8 | JWT implementation | ✅ | HS256، صلاحية 12 ساعة، Bearer header، إعادة تحميل المستخدم من DB في كل طلب (مُختبر: تعطيل الحساب يُبطل التوكن) |
| 9 | User roles | ✅ | enum `Role` (`ADMIN, MANAGER, DESIGNER`) في schema ومُطبَّق في الـ backend (مُختبر)؛ الواجهة تستقبل الدور من الـ API بحروف صغيرة |
| 10 | Permissions | 🟨 | `/users` و`/goals` بـ `requireStaff`؛ `/tasks` و`/feedback` تعزل المصمم على بياناته (كله مُختبر: 403/401). الواجهة: `src/lib/permissions.ts` + `usePermissions` تعتمد على مستخدم `/auth/me` (تجربة مستخدم فقط) |
| 11 | System users | ✅ | seed مُختبر (3 مستخدمين، idempotent). منع حذف/تعطيل/تغيير دور مستخدمي النظام مُختبر في `tests/users.test.ts` |
| 12 | Daily Tasks | 🟨 | backend ✅ مُختبر (17 اختباراً + تكامل على PostgreSQL حقيقي)؛ الواجهة رُبطت بـ `/api/tasks` (list/create/patch/progress/start/stop/end/comments/move/reorder/move-unfinished) وbuild ✅؛ غير مُجرَّبة في متصفح |
| 13 | Task creator | ✅ | `createdById` يُعيَّن من المستخدم الحالي في `POST /tasks` (مُختبر؛ الـ backend فقط، عرض «أضيفت بواسطة» في الواجهة متبقٍّ) |
| 14 | Task assignee | ✅ | المصمم = نفسه فقط (403 لغيره)، الإدارة تعيّن لأي مستخدم مفعّل (مُختبر؛ الـ backend فقط) |
| 15 | Subtasks | 🟨 | `Task.parentId`؛ الإنشاء عبر `POST /tasks` مع `parentId` والـ cascade مُختبران؛ الواجهة لم تُربط |
| 16 | Time tracking | 🟨 | start/stop/end تكتب `TaskTimeLog` و`totalDuration` يُحسب في `taskSerialize.ts` (مُختبر)؛ الواجهة لم تُربط |
| 17 | Feedback | 🟨 | backend ✅ مُختبر (15 اختباراً)؛ الواجهة رُبطت بـ `/api/feedback` وbuild ✅؛ غير مُجرَّبة في متصفح |
| 18 | Goals | 🟨 | backend ✅ مُختبر (15 اختباراً)؛ الواجهة رُبطت بـ `/api/goals` وbuild ✅؛ غير مُجرَّبة في متصفح |
| 19 | Annual Calendar | 🟨 | backend ✅ مُختبر (9 اختبارات)؛ الواجهة (`scheduleService`, Season ⇄ CalendarEvent) رُبطت وbuild ✅؛ غير مُجرَّبة في متصفح |
| 20 | Profile | 🟨 | `PATCH /api/users/me` مُختبر (3 اختبارات). `Profile.tsx` صار (Checkpoint 14) يعرض ويعدّل الاسم/البريد/المسمى/كلمة المرور عبر `usersService.updateMe`؛ syntax + typecheck بـ stubs فقط، لم يُبنَ ولم يُجرَّب في متصفح |
| 21 | API endpoints | 🟨 | مُختبر (97 اختباراً): health، auth، users، tasks، feedback، goals، calendar-events. rate limit ✅ (429 بعد 20 محاولة) |
| 22 | Security | ✅ | helmet ✅، CORS على FRONTEND_URL ✅، bcrypt ✅، zod ✅، rate limit مُختبر (429 بعد 20) ✅، passwordHash لا يُرجَع ✅، SSL مع تحقق كامل بالـ CA. لم يُراجع أمنياً خارجياً |
| 23 | Environment variables | ✅ | `backend/.env.example` (7 متغيرات + `DATABASE_CA_CERT` اختياري) + اختيارية `NODE_ENV`, `DB_POOL_MAX`؛ الواجهة: `VITE_API_URL` |
| 24 | Prisma migrations | 🟨 | `0001_init` مكتوب يدوياً وطُبّق بـ psql على PG 16 حقيقي وعلى PGlite. `prisma migrate deploy` نفسه غير مُتحقَّق منه (المحرك محجوب 403) |
| 25 | Seed process | ✅ | `npm run seed` جُرّب عبر CLI على PG 16 حقيقي (تكرار آمن: 3 مستخدمين) ✅ |
| 26 | Frontend/API integration | 🟨 | الخدمات الخمس + auth رُبطت بالـ API؛ طابقتُ الحقول والمسارات مع الـ backend بقراءة الكود؛ `tsc -b` + `vite build` ✅. **لم يُجرَّ اختبار تكامل فعلي ولا متصفح** |
| 27 | Route protection | 🟨 | (يشمل `/manage-users` منذ Checkpoint 14) `ProtectedRoute` + `lib/permissions.ts` يعتمدان على مستخدم الـ backend (`/auth/me`)؛ 401 من أي طلب ← خروج تلقائي. تجربة مستخدم فقط (الحماية الحقيقية في الـ backend ✅ مُختبرة)؛ غير مُجرَّب في متصفح |
| 28 | Files created | 🟨 | انظر `CHANGES.md` (Checkpoint 9 و10) |
| 29 | Files modified | ✅ | لا ملفات مصدر عُدّلت؛ نُقلت فقط إلى `frontend/` |
| 30 | Tests performed | 🟨 | backend: vitest **97/97** ✅ على PGlite (auth+seed 13، users 20، tasks 17، feedback 15، goals 15، calendarEvents 9، dbConfig 8)؛ typecheck نظيف ✅؛ frontend build ✅؛ lint: 0 أخطاء/13 تحذيراً؛ لا اختبارات للواجهة ولم تُجرَّب في متصفح |
| 31 | Build results | 🟨 | frontend build ✅ (417 kB JS / 24 kB CSS)؛ backend `tsc` emit ✅ (`dist/src/server.js`)؛ `npm run build` للـ backend يفشل داخل الـ sandbox فقط لأن `prisma generate` يحتاج تنزيل محرك (403)؛ الخادم يعمل على PostgreSQL 16 محلي ✅ (Aiven غير مُجرَّب) |
| 32 | Known limitations | 🟨 | (1) `prisma migrate deploy` غير مُتحقَّق منه محلياً؛ (2) لا PostgreSQL في الـ sandbox؛ (3) المرفقات base64 داخل JSON؛ (4) لم يُختبر في متصفح حقيقي؛ (5) ملف البروبت الأصلي لم يصل — اعتُمد HANDOFF كمرجع |
| 33 | Future improvements | ✅ | (1) اختبارات واجهة (Vitest + Testing Library) واختبار E2E (Playwright) لمسارات الدخول/المهام/الصلاحيات؛ (2) نقل المرفقات من base64 داخل JSON إلى تخزين ملفات (S3/R2) مع روابط موقّعة؛ (3) تفعيل تجديد التوكن (refresh) أو قائمة إبطال عند logout بدل الاعتماد على العميل؛ (4) إصلاح تحذيرات lint الـ 13 (فصل hooks عن ملفات المكونات، وإزالة setState من effects)؛ (5) اختبار آلي لـ `prisma migrate diff` ضمن CI للكشف عن drift؛ (6) CI على GitHub Actions (typecheck + vitest + build)؛ (7) ترقيم صفحات (pagination) لقوائم المهام/الملاحظات عند كبر البيانات؛ (8) سجل تدقيق (audit log) للعمليات الإدارية؛ (9) مراجعة أمنية خارجية قبل الإنتاج |
| 34 | Local development instructions | 🟨 | مكتوبة في `README.md` (`seed` جُرِّب على PostgreSQL 16 حقيقي ✅؛ `migrate deploy` نفسه لم يُجرَّب) |
| 35 | Deployment preparation instructions | 🟨 | القسم 3 هو الخطة وقد جُهّز محلياً: `_redirects` ✅، دعم CA لـ Aiven ✅ (مُختبر محلياً)، `trust proxy` ✅. **لم يُنفَّذ أي نشر** (Aiven/GitHub/Render/Cloudflare) وينتظر موافقتك |
