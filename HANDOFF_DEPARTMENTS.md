# تسليم بوابة الإدارات وإصلاحات المراجعة — TASHKEEL.CNC (v11)

## 1. ما الذي تم إنجازه فعلياً

### أ) بوابة الإدارات الرئيسية (Departments Portal) للمدير ومدير النظام فقط
- **صفحة بوابة جديدة (`/workspace`)**:
  - مكوّن [WorkspacePage](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/pages/Workspace.tsx) بتصميم عربي RTL مستوحى من المرجع البصري (خلفية بتدرج أخضر داكن/فيروزي مع دعم الوضعين الداكن والفاتح، شعار النظام الأصلي `/tashkeel-cnc-logo.svg`، شبكية بطاقات 2×2 على سطح المكتب وعمود واحد على الهاتف).
  - تحتوي على البطاقات الأربع المطلوبة حرفياً دون أي أرقام أو رسوم أو صفحات إحصائيات وهمية:
    1. **إدارة التصميم** (`design`) — تفتح `/daily-tasks`، وتضم 6 روابط بالضبط.
    2. **إدارة الإنتاج والمخزون** (`production_inventory`) — تفتح `/production-tasks`، وتضم 8 روابط بالضبط.
    3. **إدارة الحسابات** (`accounting`) — تفتح `/sales-follow-up`، وتضم 4 روابط بالضبط (منها «تصدير أوردرات الفتيات» `/agent-supervisor`).
    4. **الحسابات العامة والإحصائيات** (`general_stats`) — تفتح `/general-accounts`، وتضم رابطاً واحداً فقط («الحسابات العامة») مع ملاحظة نصية خفيفة: «ستُضاف بقية الإحصائيات والتقارير لاحقاً.».
  - روابط سريعة هادئة خارج بطاقات الإدارات الأربع للوصول إلى الأدوات الإدارية العامة (`/manage-users`، `/profile`)، بعد إزالة واجهة ومسار «أسعار منتجات» (`/products`) من الواجهة بناءً على طلب المالك مع الحفاظ على جداول/راوتر `/api/products` في الـ Backend دون فقدان بيانات.
- **التعريف المركزي وإدارة سياق التنقل**:
  - تعريف مركزي موحّد ومصنّف (`DepartmentKey`, `DepartmentConfig`, `DEPARTMENTS`, `departmentsForPath`) في [departments.ts](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/lib/departments.ts).
  - سياق تنقل بحت [DepartmentProvider.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/components/departments/DepartmentProvider.tsx) يشتق الإدارة النشطة أثناء التقديم (`useMemo`) من المسار الحالي و`localStorage` (`tashkeel_active_department`) دون `setState` داخل `useEffect` ودون حلقات تحويل عند التحديث أو فتح الروابط المباشرة (Deep Links)، ويُصفَّر تلقائياً عند تسجيل الخروج أو حدث انتهاء الجلسة (`auth:unauthorized`).
- **القائمة الجانبية (Sidebar)**:
  - تحديث [Sidebar.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/components/sidebar/Sidebar.tsx) للمدير ومدير النظام لتعرض روابط الإدارة النشطة فقط (`6` / `8` / `4` / `1`)، مع محوّل فوري بين الإدارات (`<select aria-label="تغيير الإدارة">`) دون تسجيل خروج، وزر واضح «العودة إلى الإدارات» يتجه إلى `/workspace`، بالإضافة إلى عنصر **«إدارة المستخدمين» (`/manage-users`) ظاهر دائماً** أسفل فاصل خفيف في كل الإدارات والحالات (الموسّعة والمطوية ودرج الهاتف) للمدير ومدير النظام فقط، مع الحفاظ الكامل على عداد الإشعارات (`data-testid="unread-badge"`), تسجيل الخروج، واتجاه RTL.
  - القائمة المختصرة لبقية الأدوار (`memberItems` المرشحة بـ `pagesFor(user)`) بقيت كما هي دون أي تغيير أو توسيع.
- **حراسة الصلاحيات وتدفق الدخول**:
  - تحديث [permissions.ts](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/lib/permissions.ts) و[App.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/App.tsx) بحيث:
    - `canAccessWorkspace(user)` يعتمد حصراً على `user.accessRole === "admin" || user.accessRole === "manager"` (لا يُعتمد على `isSystemUser` أبداً).
    - `defaultPathForRole(user)` يوجّه `admin` و`manager` فقط إلى `/workspace` بعد الدخول أو عند `/`.
    - بقية الأدوار (`designer`, `packer`, `operator`, `sales_accountant`, `sales_editor`, `sales_supervisor`, `sales_agent`, `sales_agent_supervisor`) ممنوعة من `/workspace` عبر `ProtectedRoute page="workspace"`، وتُحوَّل إلى `defaultPathForRole(user)` دون تغيير وجهاتها أو صلاحياتها في الواجهة أو الـ Backend.

### ب) إصلاحات المراجعة الشاملة (الأمان، سلامة المخزون والحسابات، الأداء، تجربة الاستخدام، نظافة المستودع)
- **إبطال التوكن الفعلي والحد من الهجمات (`0025_user_token_version`)**:
  - إضافة عمود `tokenVersion Int @default(0)` لنموذج `User` مع migration رقم `0025_user_token_version`.
  - تضمين `tv: user.tokenVersion` في JWT والتحقق منها في `authenticateToken`؛ يتم زيادة `tokenVersion` عند تسجيل الخروج (`POST /api/auth/logout`) وتغيير كلمة المرور (`PATCH /api/users/me` مع إعادة توكن جديد) وإعادة التعيين من الإدارة (`PATCH /api/users/:id`).
  - تقسيم محدد محاولات الدخول (`rateLimit`) في `auth.ts` إلى `ipLimiter` + `accountLimiter` (`ipKeyGenerator(req.ip):username`) وإضافة محدد عام على `/api` وحدود JSON لكل مسار (1MB افتراضي، 15MB لمسارات الصور).
- **سلامة الحذف والمرجعيات وصلاحية الحذف الحصرية لمدير النظام (`ADMIN`)**:
  - منع 500 `P2003` في `DELETE /api/users/:id` عبر التحقق من `agentOrder`, `salesOrder.agentId`, `salesOrderStatusLog` قبل الحذف، وحظر حذف/تفريغ `SALES_AGENT` لها أوردرات على `MANAGER` (`409`)، مع السماح لمدير النظام (`ADMIN` فقط) بـ **«حذف الحساب وكل بياناته» (`?purge=true`)** لفتاة المبيعات حتى لو كانت لها أوردرات منفّذة/مسلّمة، مع إعادة أي مخزون مخصوم تلقائياً عبر [salesStock.ts](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/backend/src/utils/salesStock.ts) وحذف أوردراتها وسجلها داخل معاملة واحدة، ونقل `exportedById`/`cancelledById`/`byId` عند `purge=true`.
  - حصر حذف أوردرات المبيعات (`DELETE /api/sales/orders/:id`) بمدير النظام (`ADMIN` فقط — `403` لـ `MANAGER` و`SALES_EDITOR` و`SALES_SUPERVISOR` و`SALES_ACCOUNTANT` و`SALES_AGENT`)، مع تمكين `ADMIN` من حذف أي أوردر (يدوي أو مصدّر من فتاة أو ملغي أو منفّذ/مشحون/مسلّم) وإعادة المخزون المخصوم وتنظيف سجل الفتاة، وإظهار زر الحذف لـ `ADMIN` فقط في [SalesOrderCard.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/components/sales/SalesOrderCard.tsx) و[FollowOrdersTable.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/components/agent/FollowOrdersTable.tsx) و[SalesFollowUp.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/pages/SalesFollowUp.tsx).
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
  - إضافة معاينة بوليصة تجهيز مستقلة لصفحة «أوردرات مبيعات إلكترونية» (`/sales-orders`, `ordersOnly`) عبر [SalesOrderWaybillSheet.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/components/sales/SalesOrderWaybillSheet.tsx) و[SalesOrderWaybillModal.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/components/sales/SalesOrderWaybillModal.tsx) مع تمرير بيانات العميل غير المالية في [salesSerialize.ts](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/backend/src/utils/salesSerialize.ts) لعرض اسم البوكس والمحتويات المحددة أسفل كل بوكس دون أي مبالغ ودون أي ارتباط ببوالص الفتيات أو محاسب المبيعات.
- **فاتورة الفتاة وسعر البوكس والحسابات العامة (`0026_agent_line_price_shipping`)**:
  - تحديث [AgentOrderModal.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/components/agent/AgentOrderModal.tsx) وكروت [AgentOrders.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/pages/AgentOrders.tsx) لتطابق حقول الفاتورة (التاريخ، اسم العميل، العنوان، التليفون حتى 60 حرفاً، اسم الصنف، الكمية، **سعر كل بوكس**، **م شحن** اختياري، والإجمالي بالشحن، والملاحظات).
  - إضافة migration `0026_agent_line_price_shipping` لحقول `boxPrice` و`shippingPrice` ونقلها عند التصدير في `agent.ts` و`validators/agent.ts`.
  - تحديث `agentMath.ts` و`accounting.ts` و[GeneralAccounts.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/pages/GeneralAccounts.tsx) لتعرض: **«سعر الخروج من المخزون»**، و**«سعر الخروج»** (من الفتاة)، و**«إجمالي الشحن»**، و**«الإجمالي الكلي»** (`سعر الخروج + الشحن`)، و**«فرق صرف»** كنسبة مئوية بينهما.
- **قنوات المزامنة اللحظية ومنع الكاش (`liveSync` / `SSE` / Express `res.on("finish")`)**:
  - إصلاح عطل جوهري في [app.ts](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/backend/src/app.ts) حيث كانت `channelsForWritePath(req.path)` تُستدعى داخل `res.on("finish")` بعد قصّ الراوترات الفرعية للبادئة من `req.url`، مما كان يسقط جميع الكتابات في قناة `general` فقط ولا يُشغّل أي تحديثات على الصفحات المشتركة في القنوات المتخصصة (`tasks`, `inventory`, `sales`, `accounting`, `users`, `notifications`)؛ تم التقاط `writePath = req.path` وحساب `affectedChannels` قبل `next()` وتصدير `channelsForWritePath` وتحديث قناة `/api/users` و`/api/sales-agents` مع إسكات `/api/files`.
  - إضافة ترويسة `Cache-Control: no-store` لاستجابات `/api` وتمرير `cache: "no-store"` في [api.ts](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/lib/api.ts) و`runStream` في [liveSync.ts](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/lib/liveSync.ts).
  - تقوية [liveSync.ts](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/lib/liveSync.ts) (انتظار أول حزمة بيانات فعلية قبل اعتبار `streamConnected = true` حتى لا يتوقف الفحص الاحتياطي عند تخزين الوسيط للـ SSE، تقليص مهلة الصمت إلى `40_000ms` وdebounce إلى `200ms`، توحيد نهايات الأسطر `\r\n`، بث قناة `general` كشبكة أمان، وإضافة `resetLiveSync()` المستدعى في [AuthProvider.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/components/auth/AuthProvider.tsx) عند الخروج أو `401`)، مع عدّاد تسلسل `requestSeq` في [useResource.ts](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/hooks/useResource.ts)، وإضافة قناة `"users"` لملف الفتاة في [AgentOrders.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/pages/AgentOrders.tsx)، ورفع رقم كاش الـ Service Worker في [sw.js](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/public/sw.js) إلى `tashkeel-shell-v2`.
- **تحسينات الأداء الملائمة لحجم المشروع (`Tier S` — بدون Redis أو كاش للأرصدة/المخزون)**:
  - **فهارس قاعدة البيانات (`0027_performance_indexes`)**: إضافة 15 فهرساً لمفاتيح أجنبية واستعلامات التصفية والفرز المركّبة على `Task`, `TaskTimeLog`, `TaskComment`, `Feedback`, `Goal`, `CalendarEvent`, `InventoryMovement`, `SalesOrder`, `SalesOrderLine`, `AgentOrder`, `AgentOrderLine`, `SalesOrderStatusLog` في [schema.prisma](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/backend/prisma/schema.prisma) وملف الترحيل [0027_performance_indexes](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/backend/prisma/migrations/0027_performance_indexes/migration.sql).
  - **ترقيم الصفحات (`Pagination`)**: إضافة `limit`/`offset` في الـ Backend مع توافق عكسي كامل في [accounting.ts](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/backend/src/routes/accounting.ts) (`GET /accounting/orders`) و[agent.ts](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/backend/src/routes/agent.ts) (`GET /agent/orders`) و[feedback.ts](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/backend/src/routes/feedback.ts) (`GET /feedback`)، وإضافة مكوّن [PaginationBar.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/components/ui/PaginationBar.tsx) وتفعيله في [SalesFollowUp.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/pages/SalesFollowUp.tsx) و[AgentOrders.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/pages/AgentOrders.tsx) و[Feedback.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/pages/Feedback.tsx) و[Inventory.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/pages/Inventory.tsx).
  - **تحسين الصور قبل الرفع (`WebP` + `Lazy Loading`)**: إضافة [imageOptimize.ts](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/lib/imageOptimize.ts) لتصغير الصور الكبيرة (`1600px`) وضغطها إلى `WebP` (`0.8`) قبل الرفع في [ImageAttachments.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/components/ui/ImageAttachments.tsx) مع الحفاظ على GIF المتحرك، وتفعيل `loading="lazy"` و`decoding="async"` للصور المصغرة وتحديد أبعاد شعار النظام في `Sidebar.tsx` و`Workspace.tsx`.
  - **واجهات التحميل الهيكلية (`Skeleton Loading`)**: توسيع [StatusViews.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/components/ui/StatusViews.tsx) بالأنماط (`table`, `cards`, `stats`, `list`) وتمريرها لصفحات المهام والمخزون والمبيعات والمتابعة والحسابات والإشعارات والمستخدمين والأهداف والجدولة لمنع الوميض وقفز العناصر.
- **السعر الثابت اليدوي للبوكس + سعر الإضافة والحذف في المخزون + التسعير التلقائي للفتاة (`0028_box_fixed_price_and_item_adjust_prices`)**:
  - إضافة عمود `fixedPrice Decimal? @db.Decimal(12, 2)` على `SalesProduct` وعمودَي `addPrice` و`removePrice` (`Decimal @default(0) @db.Decimal(14, 2)`) على `InventoryItem` في [schema.prisma](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/backend/prisma/schema.prisma) وملف الترحيل [0028_box_fixed_price_and_item_adjust_prices](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/backend/prisma/migrations/0028_box_fixed_price_and_item_adjust_prices/migration.sql).
  - حصر إدخال/تعديل وعرض `fixedPrice` في [ProductEditorModal.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/components/sales/ProductEditorModal.tsx) و[SalesProductsModal.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/components/sales/SalesProductsModal.tsx) و`addPrice`/`removePrice` في [ItemModal.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/components/inventory/ItemModal.tsx) و[ItemDetailsModal.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/components/inventory/ItemDetailsModal.tsx) و[Inventory.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/pages/Inventory.tsx) على الإدارة (`ADMIN`/`MANAGER`) فقط دون تسريب أي مبالغ إلى `SALES_EDITOR`/`SALES_SUPERVISOR`/`SALES_ACCOUNTANT`/`PACKER`/`OPERATOR`.
  - حساب سعر البوكس تلقائياً بالقروش في [agentMath.ts](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/backend/src/utils/agentMath.ts) و[agent.ts](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/backend/src/routes/agent.ts) و[boxPricing.ts](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/lib/boxPricing.ts)، وإلغاء الإدخال اليدوي لسعر البوكس في [AgentOrderModal.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/components/agent/AgentOrderModal.tsx) بحيث يتعبّأ السعر الثابت تلقائياً للفتاة ويتعدّل بـ `addPrice`/`removePrice` فقط مع فرض الحساب على الخادم وتجاهل أي سعر مرسل من العميل وبقاء الحسابات العامة («سعر الخروج من المخزون» و«سعر الخروج» و«فرق صرف») متطابقة.
- **صفحات البيع (مصدر الأوردر) وحساباتها المنفردة في الحسابات العامة (`0029_sales_pages`) + تحسين سلاسة السكرول**:
  - إضافة نموذج `SalesPage` وربطه بأوردرات الفتيات والمبيعات في [schema.prisma](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/backend/prisma/schema.prisma) و[0029_sales_pages](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/backend/prisma/migrations/0029_sales_pages/migration.sql)، مع إدارة الصفحات للإدارة فقط في [SalesPagesManager.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/components/agent/SalesPagesManager.tsx) بصفحة [AgentAccounts.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/pages/AgentAccounts.tsx).
  - إضافة اختيار إجباري لاسم الصفحة للفتاة عبر `GET /api/agent/pages` و[AgentOrderModal.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/components/agent/AgentOrderModal.tsx)، وإظهار اسم الصفحة كملاحظة خارج الفاتورة أسفل المعاينة في [WaybillPreviewModal.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/components/agent/WaybillPreviewModal.tsx) دون إدراجها في الفاتورة المطبوعة أو PDF (`WaybillSheet.tsx` / `waybillPdf.ts`).
  - استخراج حسابات منفردة لكل صفحة وفلتر للصفحة في [accounting.ts](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/backend/src/routes/accounting.ts) و[GeneralAccounts.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/pages/GeneralAccounts.tsx).
  - إزالة `backdrop-blur-md` من [Header.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/components/header/Header.tsx) وضبط عدد الصفوف إلى `20` مع `contain: layout style` لجدول المخزون لتسريع السكرول.
- **دور «مشرف فتيات» (`SALES_AGENT_SUPERVISOR`) وشاشة تجميع وتصدير أوردرات الفتيات (`0030_sales_agent_supervisor_role`)**:
  - إضافة دور `SALES_AGENT_SUPERVISOR` («مشرف فتيات») في [schema.prisma](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/backend/prisma/schema.prisma) و[0030_sales_agent_supervisor_role](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/backend/prisma/migrations/0030_sales_agent_supervisor_role/migration.sql)، وعزله تماماً في [inventoryAccess.ts](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/backend/src/utils/inventoryAccess.ts) و[permissions.ts](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/lib/permissions.ts) بحيث لا يظهر له سوى شاشة تجميع وتصدير أوردرات الفتيات (`/agent-supervisor`) وصفحته الشخصية (`/profile`) دون أي تسريب لتكاليف المخزون أو العمولات أو الحسابات العامة.
  - حصر تصدير أوردرات الفتيات للإنتاج في «مشرف فتيات» والمدير ومدير النظام عبر `agentSupervisorRouter` في [agent.ts](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/backend/src/routes/agent.ts) (`/api/agent-supervisor/orders`, `/filters`, `/orders/export`, `/orders/:id/cancel`)، وإيقاف التصدير الذاتي لدى الفتاة (`403` في `POST /api/agent/orders/export` وإزالة أزرار/مربعات التصدير من [AgentOrders.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/pages/AgentOrders.tsx))، مع الحفاظ على نسبة الأوردر للفتاة (`agentId`, `closerName`) وتسجيل `exportedById` وسجل `EXPORT`/`CANCEL` بهوية المنفِّذ دون خصم مخزون.
  - بناء واجهة [AgentSupervisorOrders.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/pages/AgentSupervisorOrders.tsx) و[SupervisorOrdersTable.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/components/agent/SupervisorOrdersTable.tsx) (بتبويبات: «غير مصدَّر» افتراضياً + «الكل» و«مصدَّر» و«ملغي»، فلترة شاملة، معاينة البوليصة بدون طباعة/PDF أو تعديل/حذف، تصدير فردي وجماعي للإنتاج، وإلغاء الأوردرات المصدَّرة قبل التنفيذ بسبب إلزامي مع الإبقاء على زر الإلغاء متاحاً للفتاة) وإتاحتها للإدارة داخل قسم «إدارة الحسابات».
- **فصل المخزون بصرياً وإحصائياً إلى «خامات» و«إكسسوارات وهدايا» وقصر قائمة الإضافة للفتاة على الإكسسوارات**:
  - إرجاع `groupKey` للتصنيفات و`todayMovementsByGroup` في [inventorySerialize.ts](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/backend/src/utils/inventorySerialize.ts) و[inventory.ts](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/backend/src/routes/inventory.ts).
  - فصل العرض والإحصائيات والقيمة والنواقص والجرد وتصدير Excel عبر 3 تبويبات (**كل المخزون | مخزون الخامات | مخزون الإكسسوارات والهدايا**) في [Inventory.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/pages/Inventory.tsx) و[LowStock.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/pages/LowStock.tsx) و[groupCategories.ts](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/components/inventory/groupCategories.ts).
  - قصر `GET /api/agent/items` والإضافات الجديدة في `resolveLines` بـ [agent.ts](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/backend/src/routes/agent.ts) على أصناف «اكسسوارات وهدايا» (`ACCESSORIES_GIFTS`) فقط دون المساس بالمكونات الخام الافتراضية للبوكسات الثابتة.
  - إصلاح قراءة `notes` في [accounting.ts](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/backend/src/routes/accounting.ts) بحيث تُؤخذ ملاحظات الفتاة مباشرة (`o.agentOrder.notes`) ولا تعود لملخص العميل المخزّن في `SalesOrder.notes` عند فراغها.
- **العربون (فتاة + عربون إضافي للمحاسب) وتعديل المشرفة قبل التصدير وتصدير Excel لمتابعة المبيعات (`0031_order_deposits`)**:
  - إضافة migration `0031_order_deposits` ([0031_order_deposits](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/backend/prisma/migrations/0031_order_deposits/migration.sql)) لحقول `AgentOrder.deposit` و`SalesOrder.deposit` و`SalesOrder.extraDeposit` (`DECIMAL(12, 2) NOT NULL DEFAULT 0`).
  - **عربون الفتاة**: حقل «مبلغ العربون» الاختياري في [AgentOrderModal.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/components/agent/AgentOrderModal.tsx) (يُحسب `0` عند تركه فارغاً) مع حفظه وعرضه في [AgentOrders.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/pages/AgentOrders.tsx) ونسخه إلى `SalesOrder.deposit` عند التصدير.
  - **تعديل المشرفة قبل التصدير**: إتاحة `GET /api/agent-supervisor/products` و`GET /api/agent-supervisor/items` و`PATCH /api/agent-supervisor/orders/:id` في [agent.ts](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/backend/src/routes/agent.ts) وزر «تعديل» بجدول [SupervisorOrdersTable.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/components/agent/SupervisorOrdersTable.tsx) و[AgentSupervisorOrders.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/pages/AgentSupervisorOrders.tsx) لمسودات `DRAFT` فقط (`409` بعد التصدير/الإلغاء) دون أي تسريب لأسعار التكلفة أو أرصدة المخزون.
  - **عربون المحاسب الإضافي وخصمه من الفاتورة فقط**: إضافة عمود «العربون» ([DepositCell.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/components/agent/DepositCell.tsx)) بجانب «سعر الشحن» في [FollowOrdersTable.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/components/agent/FollowOrdersTable.tsx) عبر `PUT /api/accounting/orders/:id/deposit` (مع سجل `EXTRA_DEPOSIT`)، وخصم `totalDeposit = deposit + extraDeposit` من `sellPrice + shippingPrice` لإظهار صف «العربون | المتبقى» بالفاتورة المطبوعة والـ PDF ([WaybillSheet.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/components/agent/WaybillSheet.tsx) و[waybillPdf.ts](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/lib/waybillPdf.ts) و[WaybillPreviewModal.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/components/agent/WaybillPreviewModal.tsx))، مع بقاء عمولات الفتيات والحسابات العامة دون أي تغيير.
  - **تصدير Excel لمتابعة أوردرات المبيعات**: إضافة زر ونافذة [ExportSalesExcelModal.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/components/agent/ExportSalesExcelModal.tsx) في [SalesFollowUp.tsx](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/pages/SalesFollowUp.tsx) ومولّد [exportSalesOrders.ts](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/frontend/src/lib/exportSalesOrders.ts) عبر `GET /api/accounting/orders/export` باختيار «يوم» (`YYYY-MM-DD`) أو «شهر» (`YYYY-MM`) لكل الأوردرات المسجلة بجميع حالاتها وبنفس الترتيب والتنسيق الـ RTL الـ 11 عموداً (`م | بوليصه | الاسم | العنوان | رقم التليفون | السعر | م شحن | الاجمالي | الملاحظات | العدد | المنتج`).
- **ملفات المستودع والاختبارات**:
  - إضافة `.env.example` في `backend/` و`frontend/` وملف `.github/workflows/ci.yml`.
  - إضافة [sync.test.ts](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/backend/tests/sync.test.ts) و[performance.test.ts](file:///C:/Users/CityLap/.gemini/antigravity/scratch/tashkel-desin-v11/tashkel-desin-main/backend/tests/performance.test.ts) وإصلاح وإضافة اختبارات التغطية في `backend/tests/` (شاملةً اختبارات القنوات والبث اللحظي SSE والفهارس والـ Pagination وتفاصيل المتابعة وعدم تسرب التكاليف).

---

## 2. الملفات المضافة والمعدّلة

### ملفات جديدة
- `.github/workflows/ci.yml`
- `backend/.env.example`
- `backend/prisma/migrations/0025_user_token_version/migration.sql`
- `backend/prisma/migrations/0026_agent_line_price_shipping/migration.sql`
- `backend/prisma/migrations/0027_performance_indexes/migration.sql`
- `backend/prisma/migrations/0028_box_fixed_price_and_item_adjust_prices/migration.sql`
- `backend/prisma/migrations/0029_sales_pages/migration.sql`
- `backend/prisma/migrations/0030_sales_agent_supervisor_role/migration.sql`
- `backend/prisma/migrations/0031_order_deposits/migration.sql`
- `backend/src/utils/salesStock.ts`
- `backend/tests/sync.test.ts`
- `backend/tests/performance.test.ts`
- `frontend/.env.example`
- `frontend/src/lib/boxPricing.ts`
- `frontend/src/lib/departments.ts`
- `frontend/src/lib/exportSalesOrders.ts`
- `frontend/src/lib/imageOptimize.ts`
- `frontend/src/lib/waybillPdf.ts`
- `frontend/src/lib/xlsx.ts`
- `frontend/src/components/departments/DepartmentProvider.tsx`
- `frontend/src/components/agent/DepositCell.tsx`
- `frontend/src/components/agent/ExportSalesExcelModal.tsx`
- `frontend/src/components/agent/FollowOrdersTable.tsx`
- `frontend/src/components/agent/SalesPagesManager.tsx`
- `frontend/src/components/agent/SupervisorOrdersTable.tsx`
- `frontend/src/components/agent/WaybillPreviewModal.tsx`
- `frontend/src/components/agent/WaybillSheet.tsx`
- `frontend/src/components/sales/SalesOrderWaybillModal.tsx`
- `frontend/src/components/sales/SalesOrderWaybillSheet.tsx`
- `frontend/src/components/ui/ErrorBoundary.tsx`
- `frontend/src/components/ui/PaginationBar.tsx`
- `frontend/src/pages/AgentSupervisorOrders.tsx`
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
- `backend/src/utils/salesSerialize.ts`
- `backend/src/utils/serialize.ts`
- `backend/src/utils/syncVersion.ts`
- `backend/src/validators/agent.ts`
- `backend/src/validators/attachments.ts`
- `backend/src/validators/feedback.ts`
- `backend/src/validators/inventory.ts`
- `backend/src/validators/sales.ts`
- `backend/src/validators/users.ts`
- `backend/tests/access.test.ts`
- `backend/tests/agentIntegrity.test.ts`
- `backend/tests/agentMath.test.ts`
- `backend/tests/agentOrders.test.ts`
- `backend/tests/auth.test.ts`
- `backend/tests/files.test.ts`
- `backend/tests/helpers.ts`
- `backend/tests/inventory.test.ts`
- `backend/tests/r2Client.test.ts`
- `backend/tests/sales.test.ts`
- `backend/tests/tasks.test.ts`
- `backend/tests/users.test.ts`

### ملفات معدّلة في Frontend
- `frontend/public/sw.js` (تحديث `CACHE` إلى `tashkeel-shell-v2`)
- `frontend/package.json` & `frontend/package-lock.json` (إضافة `jspdf` و`html2canvas`)
- `frontend/src/App.tsx` (تضمين `/workspace` وتقسيم الحزم وإزالة مسار `/products`)
- `frontend/src/components/agent/AgentOrderModal.tsx`
- `frontend/src/components/agent/FollowOrderRow.tsx`
- `frontend/src/components/auth/AuthProvider.tsx`
- `frontend/src/components/header/Header.tsx`
- `frontend/src/components/inventory/ItemDetailsModal.tsx`
- `frontend/src/components/inventory/ItemModal.tsx`
- `frontend/src/components/sales/ProductEditorModal.tsx`
- `frontend/src/components/sales/SalesOrderCard.tsx`
- `frontend/src/components/sales/SalesProductsModal.tsx`
- `frontend/src/components/sidebar/Sidebar.tsx`
- `frontend/src/components/ui/ImageAttachments.tsx`
- `frontend/src/components/ui/StatusViews.tsx`
- `frontend/src/components/users/DeleteUserDialog.tsx`
- `frontend/src/hooks/useLiveSync.ts`
- `frontend/src/hooks/usePermissions.ts`
- `frontend/src/hooks/useResource.ts`
- `frontend/src/hooks/useTeamMembers.ts`
- `frontend/src/lib/api.ts`
- `frontend/src/lib/liveSync.ts`
- `frontend/src/lib/permissions.ts`
- `frontend/src/types/agent.ts`
- `frontend/src/types/index.ts`
- `frontend/src/types/inventory.ts`
- `frontend/src/types/sales.ts`
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
- `frontend/src/services/agentService.ts`
- `frontend/src/services/inventoryService.ts`
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
| اختبارات Backend الكاملة | `cd backend && npm test` | **PASS** | **28 ملفاً نجح / 28**، **461 اختباراً نجح / 461** (0 فشل، 0 تخطي) في `51.52s` |
| بناء Backend | `cd backend && npm run build` | **PASS** | `prisma generate` (215ms) + `tsc -p tsconfig.json` — خروج برمز 0 |
| اختبار قبول الإدارات والصلاحيات | `tsx verify_departments.ts` | **PASS** | طباعة `ALL_DEPARTMENTS_ACCEPTANCE_CHECKS_PASSED` (تحقق من `/workspace` و`manageUsers` لـ `admin`/`manager` فقط، إزالة `/products` من `Workspace`/`App`/`Sidebar`، عدّ الروابط `6/8/4/1`، وتغطية `sales_agent_supervisor` و`/agent-supervisor`) |
| فحص Frontend Lint | `cd frontend && npm run lint` | **PASS** | `oxlint` — `0 errors`, `19 warnings` (على 184 ملفاً في `74ms`) |
| بناء Frontend | `cd frontend && npm run build` | **PASS** | `tsc -b && vite build` — اكتمل في `1.60s`؛ الحزمة الرئيسية `231.14 kB` (مع تحميل `jspdf` و`html2canvas` و`AgentSupervisorOrders` كحزم منفصلة كسولة) |
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
   (تتضمن migrations الجديدة `0025_user_token_version` لعمود `tokenVersion`، و`0026_agent_line_price_shipping` لحقول `boxPrice` و`shippingPrice`، و`0027_performance_indexes` لفهارس الأداء، و`0028_box_fixed_price_and_item_adjust_prices` لحقول `SalesProduct.fixedPrice` و`InventoryItem.addPrice`/`removePrice`، و`0029_sales_pages` لجدول `SalesPage` وعمود `salesPageId`، و`0030_sales_agent_supervisor_role` لإضافة دور `SALES_AGENT_SUPERVISOR` وفهرس `AgentOrder_status_date_idx`، و`0031_order_deposits` لحقول `AgentOrder.deposit` و`SalesOrder.deposit`/`extraDeposit`).
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
- **بيئة البث اللحظي SSE على الإنتاج**: رقم نسخة التزامن وقنواتها (`syncVersion.ts`) يعملان في ذاكرة عملية Node، مما يتطلب تشغيل نسخة خادم واحدة على Render (Single Instance) لتصل إشعارات `SSE /api/sync/stream` الفورية لجميع المستخدمين.
- **مستخدم `ADMIN` أو `MANAGER` لديه `showTaskCard` أو `showProductionCard`**: نقطة الدخول بعد التسجيل لهما هي `/workspace` دائماً، ويمكنهما فتح `/daily-tasks` أو `/production-tasks` من بطاقتَي «إدارة التصميم» و«إدارة الإنتاج والمخزون».
- **تحذيرات `oxlint` المتبقية (`19 warnings`)**: كلها تحذيرات React Compiler / `exhaustive-deps` موجودة أساساً في الملفات القائمة مسبقاً، بالإضافة إلى تحذيرَي `only-export-components` في `DepartmentProvider.tsx` (بسبب تصدير `clearStoredDepartment` و`useDepartment` مع المكوّن) دون أي أخطاء (`0 errors`).
