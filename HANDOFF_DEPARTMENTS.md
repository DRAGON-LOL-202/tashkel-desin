# تسليم بوابة الإدارات وإصلاحات المراجعة — TASHKEEL.CNC (v11)

## 1. ما الذي تم إنجازه فعلياً

### أ) بوابة الإدارات الرئيسية (Departments Portal) للمدير ومدير النظام فقط
- **صفحة بوابة جديدة (`/workspace`)**:
  - مكوّن [WorkspacePage](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/pages/Workspace.tsx) بتصميم عربي RTL مستوحى من المرجع البصري (خلفية بتدرج أخضر داكن/فيروزي مع دعم الوضعين الداكن والفاتح، شعار النظام الأصلي `/tashkeel-cnc-logo.svg`، شبكية بطاقات 2×2 على سطح المكتب وعمود واحد على الهاتف).
  - تحتوي على البطاقات الأربع المطلوبة حرفياً دون أي أرقام أو رسوم أو صفحات إحصائيات وهمية:
    1. **إدارة التصميم** (`design`) — تفتح `/daily-tasks`، وتضم 6 روابط بالضبط.
    2. **إدارة الإنتاج والمخزون** (`production_inventory`) — تفتح `/production-tasks`، وتضم 8 روابط بالضبط.
    3. **إدارة الحسابات** (`accounting`) — تفتح `/sales-follow-up`، وتضم 3 روابط بالضبط.
    4. **الحسابات العامة والإحصائيات** (`general_stats`) — تفتح `/general-accounts`، وتضم رابطاً واحداً فقط («الحسابات العامة») مع ملاحظة نصية خفيفة: «ستُضاف بقية الإحصائيات والتقارير لاحقاً.».
  - روابط سريعة هادئة خارج بطاقات الإدارات الأربع للوصول إلى الأدوات الإدارية العامة (`/manage-users`، `/profile`)، بعد إزالة واجهة ومسار «أسعار منتجات» (`/products`) من الواجهة بناءً على طلب المالك مع الحفاظ على جداول/راوتر `/api/products` في الـ Backend دون فقدان بيانات.
- **التعريف المركزي وإدارة سياق التنقل**:
  - تعريف مركزي موحّد ومصنّف (`DepartmentKey`, `DepartmentConfig`, `DEPARTMENTS`, `departmentsForPath`) في [departments.ts](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/lib/departments.ts).
  - سياق تنقل بحت [DepartmentProvider.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/components/departments/DepartmentProvider.tsx) يشتق الإدارة النشطة أثناء التقديم (`useMemo`) من المسار الحالي و`localStorage` (`tashkeel_active_department`) دون `setState` داخل `useEffect` ودون حلقات تحويل عند التحديث أو فتح الروابط المباشرة (Deep Links)، ويُصفَّر تلقائياً عند تسجيل الخروج أو حدث انتهاء الجلسة (`auth:unauthorized`).
- **القائمة الجانبية (Sidebar)**:
  - تحديث [Sidebar.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/components/sidebar/Sidebar.tsx) للمدير ومدير النظام لتعرض روابط الإدارة النشطة فقط (`6` / `8` / `3` / `1`)، مع محوّل فوري بين الإدارات (`<select aria-label="تغيير الإدارة">`) دون تسجيل خروج، وزر واضح «العودة إلى الإدارات» يتجه إلى `/workspace`، بالإضافة إلى عنصر **«إدارة المستخدمين» (`/manage-users`) ظاهر دائماً** أسفل فاصل خفيف في كل الإدارات والحالات (الموسّعة والمطوية ودرج الهاتف) للمدير ومدير النظام فقط، مع الحفاظ الكامل على عداد الإشعارات (`data-testid="unread-badge"`), تسجيل الخروج، واتجاه RTL.
  - القائمة المختصرة لبقية الأدوار (`memberItems` المرشحة بـ `pagesFor(user)`) بقيت كما هي دون أي تغيير أو توسيع.
- **حراسة الصلاحيات وتدفق الدخول**:
  - تحديث [permissions.ts](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/lib/permissions.ts) و[App.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/App.tsx) بحيث:
    - `canAccessWorkspace(user)` يعتمد حصراً على `user.accessRole === "admin" || user.accessRole === "manager"` (لا يُعتمد على `isSystemUser` أبداً).
    - `defaultPathForRole(user)` يوجّه `admin` و`manager` فقط إلى `/workspace` بعد الدخول أو عند `/`.
    - بقية الأدوار (`designer`, `packer`, `operator`, `sales_accountant`, `sales_editor`, `sales_supervisor`, `sales_agent`) ممنوعة من `/workspace` عبر `ProtectedRoute page="workspace"`، وتُحوَّل إلى `defaultPathForRole(user)` دون تغيير وجهاتها أو صلاحياتها في الواجهة أو الـ Backend.

### ب) إصلاحات المراجعة الشاملة (الأمان، سلامة المخزون والحسابات، الأداء، تجربة الاستخدام، نظافة المستودع)
- **إبطال التوكن الفعلي والحد من الهجمات (`0025_user_token_version`)**:
  - إضافة عمود `tokenVersion Int @default(0)` لنموذج `User` مع migration رقم `0025_user_token_version`.
  - تضمين `tv: user.tokenVersion` في JWT والتحقق منها في `authenticateToken`؛ يتم زيادة `tokenVersion` عند تسجيل الخروج (`POST /api/auth/logout`) وتغيير كلمة المرور (`PATCH /api/users/me` مع إعادة توكن جديد) وإعادة التعيين من الإدارة (`PATCH /api/users/:id`).
  - تقسيم محدد محاولات الدخول (`rateLimit`) في `auth.ts` إلى `ipLimiter` + `accountLimiter` (`ipKeyGenerator(req.ip):username`) وإضافة محدد عام على `/api` وحدود JSON لكل مسار (1MB افتراضي، 15MB لمسارات الصور).
- **سلامة الحذف والمرجعيات**:
  - منع 500 `P2003` في `DELETE /api/users/:id` عبر التحقق من `agentOrder`, `salesOrder.agentId`, `salesOrderStatusLog` قبل الحذف، وحظر حذف/تفريغ `SALES_AGENT` لها أوردرات (`409`)، ونقل `exportedById`/`cancelledById`/`byId` عند `purge=true`.
  - منع حذف `SalesProduct` المرتبط بمسودة `DRAFT` (`409`).
- **سلامة المخزون والمبيعات وأوردرات الفتيات والحسابات**:
  - تسلسل التحقق من بوليصة الشحن الفريدة (`pg_advisory_xact_lock` + `assertWaybillFree`) في `POST /orders` و`PATCH /orders/:id`، مما عالج تعثر اتصال الاختبار المتزامن في `tests/agentIntegrity.test.ts`.
  - تسلسل idempotency لسحوبات المخزون (`POST /api/inventory/withdrawals`) عبر `pg_advisory_xact_lock` بعد قفل `FOR UPDATE`.
  - قفل `lockOwnOrder` وإلغاء أوردرات الفتيات (`POST /orders/:id/cancel`) محصور قبل التنفيذ (`!so.stockDeducted && so.status === "REGISTERED"`).
  - ضبط `shippedAt`/`deliveredAt` وتصفيرهما عند الرجوع من الشحن/التسليم وتسجيل `RETURN_FLAG` في `SalesOrderStatusLog`، وعدم دمج بند قياسي مع بند مُعدّل المكوّنات (`compSignature`).
  - شمول الفتيات التاريخيات اللاتي تغير دورهن لاحقاً في `GET /api/accounting/agents` و`GET /api/accounting/agents/:id` مع مسح أحادي.
  - السماح لـ `SALES_SUPERVISOR` بإعدادات ورفع ملفات `scope: "inventory"` مع التحقق من `content-length` في `presignPut`، ومنع `data:image/svg+xml` في `dataUrl`.
- **التوقيت والأداء والتجربة**:
  - حساب حدود اليوم بتوقيت `ATTENDANCE_TZ` عبر `tzDayBoundsUtc`/`startOfTodayUtc`.
  - تصفية أصناف المخزون قبل توقيع روابط R2، ودفع فلتر `bucket` في `agent.ts` لـ Prisma، وتنظيف مؤقت المهمة عند الإكمال وقفل `FOR UPDATE` عند بدء المؤقت.
  - قنوات `liveSync` مقسّمة (`tasks`, `inventory`, `sales`, `accounting`, `users`, `notifications`, `general`) مع debounce 350ms، وتقسيم حزم Vite عبر `React.lazy` و`Suspense` و`ErrorBoundary`، وإصلاح عرض محتويات البوكسات والبحث في الأصناف وإلغاء الأوردر فقط قبل التنفيذ في `AgentOrders.tsx`/`AgentOrderModal.tsx`.
- **تحديث صفحة «متابعة أوردرات المبيعات» (`/sales-follow-up`) ومعاينة/طباعة البوليصة A6**:
  - إعادة بناء العرض كجدول متابعة منظم عبر [FollowOrdersTable.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/components/agent/FollowOrdersTable.tsx) يضم: تحديداً متعدداً للبوالص، رقم البوليصة، اسم العميل وهاتفه، الأوردر والقيمة، التاريخ، الحالة كقائمة منسدلة (`تم التنفيذ` ← `شحن` / `تم التسليم`)، الفتاة، سعر الشحن، وزرّي معاينة البوليصة والطباعة مع علامة المرتجع وسجل التغييرات.
  - إضافة [WaybillSheet.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/components/agent/WaybillSheet.tsx) و[WaybillPreviewModal.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/components/agent/WaybillPreviewModal.tsx) و[waybillPdf.ts](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/lib/waybillPdf.ts) لمعاينة البوليصة بمقاس A6 لدى الفتاة (معاينة فقط بدون طباعة/PDF ومع إخفاء بطاقات العمولات من `AgentOrders.tsx`)، ولدى محاسب المبيعات والإدارة مع أزرار **«طباعة»** و**«تحميل المحدد PDF»** لعدة بوالص في ملف واحد.
  - إثراء `GET /api/accounting/orders` في `backend/src/routes/accounting.ts` بتفاصيل العميل والبنود والبحث بالاسم/الهاتف وعدّادات الحالات مع بقاء صلاحيات `SALES_ACCOUNTANT` محصورة كما هي دون أي تسرب لتكاليف المخزون.
- **فاتورة الفتاة وسعر البوكس والحسابات العامة (`0026_agent_line_price_shipping`)**:
  - تحديث [AgentOrderModal.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/components/agent/AgentOrderModal.tsx) وكروت [AgentOrders.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/pages/AgentOrders.tsx) لتطابق حقول الفاتورة (التاريخ، اسم العميل، العنوان، التليفون حتى 60 حرفاً، اسم الصنف، الكمية، **سعر كل بوكس**، **م شحن** اختياري، والإجمالي بالشحن، والملاحظات).
  - إضافة migration `0026_agent_line_price_shipping` لحقول `boxPrice` و`shippingPrice` ونقلها عند التصدير في `agent.ts` و`validators/agent.ts`.
  - تحديث `agentMath.ts` و`accounting.ts` و[GeneralAccounts.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/pages/GeneralAccounts.tsx) لتعرض: **«سعر الخروج من المخزون»**، و**«سعر الخروج»** (من الفتاة)، و**«إجمالي الشحن»**، و**«الإجمالي الكلي»** (`سعر الخروج + الشحن`)، و**«فرق صرف»** كنسبة مئوية بينهما.
- **ملفات المستودع والاختبارات**:
  - إضافة `.env.example` في `backend/` و`frontend/` وملف `.github/workflows/ci.yml`.
  - إصلاح وإضافة اختبارات التغطية في `backend/tests/` (شاملةً اختبارات تفاصيل المتابعة وعدم تسرب التكاليف).

---

## 2. الملفات المضافة والمعدّلة

### ملفات جديدة
- `.github/workflows/ci.yml`
- `backend/.env.example`
- `backend/prisma/migrations/0025_user_token_version/migration.sql`
- `backend/prisma/migrations/0026_agent_line_price_shipping/migration.sql`
- `frontend/.env.example`
- `frontend/src/lib/departments.ts`
- `frontend/src/lib/waybillPdf.ts`
- `frontend/src/components/departments/DepartmentProvider.tsx`
- `frontend/src/components/agent/FollowOrdersTable.tsx`
- `frontend/src/components/agent/WaybillPreviewModal.tsx`
- `frontend/src/components/agent/WaybillSheet.tsx`
- `frontend/src/components/ui/ErrorBoundary.tsx`
- `frontend/src/pages/Workspace.tsx`
- `HANDOFF_DEPARTMENTS.md`
- `CHANGES_DEPARTMENTS.md`

### ملفات معدّلة في Backend
- `backend/prisma/schema.prisma`
- `backend/src/app.ts`
- `backend/src/middleware/auth.ts`
- `backend/src/routes/accounting.ts`
- `backend/src/routes/agent.ts`
- `backend/src/routes/auth.ts`
- `backend/src/routes/files.ts`
- `backend/src/routes/inventory.ts`
- `backend/src/routes/notifications.ts`
- `backend/src/routes/sales.ts`
- `backend/src/routes/sync.ts`
- `backend/src/routes/tasks.ts`
- `backend/src/routes/users.ts`
- `backend/src/utils/agentMath.ts`
- `backend/src/utils/attendance.ts`
- `backend/src/utils/env.ts`
- `backend/src/utils/inventoryAccess.ts`
- `backend/src/utils/inventorySerialize.ts`
- `backend/src/utils/notify.ts`
- `backend/src/utils/r2Client.ts`
- `backend/src/utils/syncVersion.ts`
- `backend/src/validators/agent.ts`
- `backend/src/validators/attachments.ts`
- `backend/tests/access.test.ts`
- `backend/tests/agentIntegrity.test.ts`
- `backend/tests/agentMath.test.ts`
- `backend/tests/agentOrders.test.ts`
- `backend/tests/auth.test.ts`
- `backend/tests/files.test.ts`
- `backend/tests/inventory.test.ts`
- `backend/tests/r2Client.test.ts`
- `backend/tests/sales.test.ts`
- `backend/tests/tasks.test.ts`
- `backend/tests/users.test.ts`

### ملفات معدّلة في Frontend
- `frontend/package.json` & `frontend/package-lock.json` (إضافة `jspdf` و`html2canvas`)
- `frontend/src/App.tsx` (تضمين `/workspace` وتقسيم الحزم وإزالة مسار `/products`)
- `frontend/src/components/agent/AgentOrderModal.tsx`
- `frontend/src/components/agent/FollowOrderRow.tsx`
- `frontend/src/components/auth/AuthProvider.tsx`
- `frontend/src/components/sidebar/Sidebar.tsx`
- `frontend/src/hooks/useLiveSync.ts`
- `frontend/src/hooks/useResource.ts`
- `frontend/src/hooks/useTeamMembers.ts`
- `frontend/src/lib/liveSync.ts`
- `frontend/src/lib/permissions.ts`
- `frontend/src/types/agent.ts`
- `frontend/src/types/index.ts`
- `frontend/src/pages/AgentAccounts.tsx`
- `frontend/src/pages/AgentOrders.tsx`
- `frontend/src/pages/Dashboard.tsx`
- `frontend/src/pages/Feedback.tsx`
- `frontend/src/pages/GeneralAccounts.tsx`
- `frontend/src/pages/Goals.tsx`
- `frontend/src/pages/Inventory.tsx`
- `frontend/src/pages/LowStock.tsx`
- `frontend/src/pages/ManageUsers.tsx`
- `frontend/src/pages/Notifications.tsx`
- `frontend/src/pages/Sales.tsx`
- `frontend/src/pages/SalesFollowUp.tsx`
- `frontend/src/pages/Schedule.tsx`
- `frontend/src/pages/TeamDashboard.tsx`
- `frontend/src/pages/Withdrawals.tsx`
- `frontend/src/services/usersService.ts`

### ملفات محذوفة من Frontend (إزالة واجهة «أسعار منتجات»)
- `frontend/src/pages/Products.tsx`
- `frontend/src/components/products/ProductCard.tsx`
- `frontend/src/components/products/ProductModal.tsx`
- `frontend/src/components/products/ProductImageField.tsx`
- `frontend/src/services/productsService.ts`
- `frontend/src/types/product.ts`

---

## 3. ما لم يُختبر أو لم يكتمل في هذه البيئة
- **المعاينة التفاعلية بالمتصفح الحي (Live Browser E2E)**: لم يتم تشغيل خادم التطوير وفتح المتصفح للنقر البصري المباشر على البطاقات، أو معاينة درجات الألوان على شاشة حقيقية، أو اختبار التجاوب باللمس على هاتف حقيقي. تم التحقق من البنية والشيفرة وتمرير الصلاحيات عبر `tsx` + `tsc -b` + `vite build` + `oxlint`.
- **النشر على Render / قاعدة PostgreSQL خارجية**: لم يتم النشر على بيئة الإنتاج الفعلية (اختبارات الـ Backend جرت على PGlite المدمج عبر `vitest`).

---

## 4. نتائج الفحوصات الفعلية (بعد آخر تعديل للكود)

| الفحص | الأمر | النتيجة | التفاصيل المرصودة |
| --- | --- | --- | --- |
| فحص أنواع Backend | `cd backend && npm run typecheck` | **PASS** | `tsc -p tsconfig.json --noEmit` — خروج برمز 0 (0 أخطاء) |
| اختبارات Backend الكاملة | `cd backend && npm test` | **PASS** | **26 ملفاً نجح / 26**، **440 اختباراً نجح / 440** (0 فشل، 0 تخطي) في `46.02s` |
| بناء Backend | `cd backend && npm run build` | **PASS** | `prisma generate` (212ms) + `tsc -p tsconfig.json` — خروج برمز 0 |
| اختبار قبول الإدارات والصلاحيات | `tsx verify_departments.ts` | **PASS** | طباعة `ALL_DEPARTMENTS_ACCEPTANCE_CHECKS_PASSED` (تحقق من `/workspace` و`manageUsers` لـ `admin`/`manager` فقط، إزالة `/products` من `Workspace`/`App`/`Sidebar`، عدّ الروابط `6/8/3/1`، وثبات `departmentsForPath`) |
| فحص Frontend Lint | `cd frontend && npm run lint` | **PASS** | `oxlint` — `0 errors`, `20 warnings` (على 173 ملفاً في `58ms`) |
| بناء Frontend | `cd frontend && npm run build` | **PASS** | `tsc -b && vite build` — 3064 وحدة في `1.49s`؛ الحزمة الرئيسية `230.60 kB` (مع تحميل `jspdf` و`html2canvas` كحزم منفصلة كسولة) |
| اختبار المتصفح الحي (E2E) | — | **NOT RUN** | لم يُشغَّل متصفح فعلي للنقر البصري |

---

## 5. خطوات التشغيل والنشر التالية
1. **ضبط متغيرات البيئة**:
   - انسخ `backend/.env.example` إلى `backend/.env` واضبط القيم الحقيقية (`DATABASE_URL`, `JWT_SECRET`, `ADMIN_PASSWORD`, إلخ)، وكذلك `ATTENDANCE_TZ=Africa/Cairo`.
   - انسخ `frontend/.env.example` إلى `frontend/.env` واضبط `VITE_API_URL`.
2. **تطبيق Migration الجديدة على قاعدة الإنتاج**:
   ```bash
   cd backend
   npm ci
   npx prisma generate
   npx prisma migrate deploy
   npm run build
   ```
   (تتضمن migrations الجديدة `0025_user_token_version` لعمود `tokenVersion` و`0026_agent_line_price_shipping` لحقول `boxPrice` و`shippingPrice`).
3. **بناء ونشر الواجهة**:
   ```bash
   cd frontend
   npm ci
   npm run build
   ```
4. **مراجعة بصرية سريعة بعد التشغيل**:
   - سجّل الدخول بحساب مدير للتأكد من التوجيه إلى `/workspace` وتجربة الإدارات الأربع، الوضعين الداكن والفاتح، والقائمة المطوية ودرج الهاتف.
   - سجّل الدخول بحساب مصمم / تعبئة / مبيعات للتأكد من التوجيه المباشر لصفحاته وعدم ظهور `/workspace`.
5. **(مستقبلاً)**: عند الجاهزية، يمكن إضافة تقارير قسم «الحسابات العامة والإحصائيات» داخل المسار المرتبط ببطاقة `general_stats`.

---

## 6. مخاطر وملاحظات مهمة للمراجعة
- **تسجيل خروج لمرة واحدة بعد الترحيل `0025`**: لأن `authenticateToken` يفرض وجود رقم `tv` مطابق لـ `user.tokenVersion` داخل JWT، فإن أي توكن صدر *قبل* نشر التحديث `0025_user_token_version` لن يحتوي على `tv` وسيعيد `401` حتى يعيد المستخدم تسجيل الدخول مرة واحدة.
- **مستخدم `ADMIN` أو `MANAGER` لديه `showTaskCard` أو `showProductionCard`**: نقطة الدخول بعد التسجيل لهما هي `/workspace` دائماً، ويمكنهما فتح `/daily-tasks` أو `/production-tasks` من بطاقتَي «إدارة التصميم» و«إدارة الإنتاج والمخزون».
- **تحذيرات `oxlint` المتبقية (`20 warnings`)**: كلها تحذيرات React Compiler / `exhaustive-deps` موجودة أساساً في الملفات القائمة مسبقاً، بالإضافة إلى تحذيرَي `only-export-components` في `DepartmentProvider.tsx` (بسبب تصدير `clearStoredDepartment` و`useDepartment` مع المكوّن) دون أي أخطاء (`0 errors`).
