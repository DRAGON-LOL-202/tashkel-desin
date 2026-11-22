# سجل التغييرات — بوابة الإدارات وإصلاحات v11 (`CHANGES_DEPARTMENTS.md`)

## 1. بوابة الإدارات الرئيسية (Departments Portal)
- إضافة تعريف الإدارات المركزي `frontend/src/lib/departments.ts` للأقسام الأربعة:
  - `design` («إدارة التصميم» — 6 روابط: `/daily-tasks`, `/notifications`, `/feedback`, `/goals`, `/schedule`, `/users`).
  - `production_inventory` («إدارة الإنتاج والمخزون» — 8 روابط: `/production-tasks`, `/notifications`, `/feedback`, `/inventory`, `/inventory/shortages`, `/withdrawals`, `/sales`, `/sales-orders`).
  - `accounting` («إدارة الحسابات» — 3 روابط: `/sales-follow-up`, `/agent-accounts`, `/general-accounts`).
  - `general_stats` («الحسابات العامة والإحصائيات» — رابط واحد: `/general-accounts` دون أي إحصائيات أو صفحات وهمية).
- إضافة صفحة `/workspace` عبر `frontend/src/pages/Workspace.tsx` (واجهة RTL داكنة وفاتحة، شبكة 2×2 على سطح المكتب وعمود واحد على الهاتف، شعار `/tashkeel-cnc-logo.svg`، وتذييل للروابط الإدارية العامة `/manage-users` و`/profile`).
- إضافة سياق التنقل `frontend/src/components/departments/DepartmentProvider.tsx` لحفظ الإدارة النشطة ومزامنتها مع المسار الحالي ومسحها عند الخروج أو `401`.
- تحديث `frontend/src/lib/permissions.ts` و`frontend/src/App.tsx`: حصر `/workspace` و`defaultPathForRole` -> `/workspace` في `admin` و`manager` فقط، دون تغيير أي صلاحيات أو وجهات للأدوار الأخرى.
- تحديث `frontend/src/components/sidebar/Sidebar.tsx`: عرض روابط الإدارة المختارة فقط للمدير/مدير النظام + محوّل الإدارة السريع + زر «العودة إلى الإدارات» + رابط دائم لعنصر «إدارة المستخدمين» (`/manage-users`) يظهر في كل الإدارات والحالات للمدير ومدير النظام فقط، مع بقاء قائمة بقية الأدوار وعدّاد الإشعارات كما هي.
- إزالة واجهة ومسار «أسعار منتجات» بالكامل من الـ Frontend (`Workspace.tsx`، `App.tsx`، `permissions.ts`، `types/index.ts`، وحذف `Products.tsx` و`productsService.ts` و`types/product.ts` و`components/products/*`) مع الإبقاء على جداول وراوتر `/api/products` في الـ Backend دون مساس بالبيانات.

## 2. إصلاحات الأمان والموثوقية والـ Backend
- **إبطال التوكن الفعلي**: إضافة `tokenVersion` (`prisma/migrations/0025_user_token_version/migration.sql`) للتحقق في `authenticateToken`، وإبطال التوكن عند `POST /api/auth/logout` وتغيير/إعادة تعيين كلمة المرور مع إرجاع توكن جديد في `PATCH /users/me`.
- **تقييد المعدّل والأحجام**: فصل محدّد محاولات الدخول (`ipLimiter` + `accountLimiter`) وإضافة محدد عام على `/api` وحدود JSON لكل مسار، وحظر `data:image/svg+xml`.
- **حذف المستخدمين والمنتجات**: معالجة `agentOrder`/`salesOrderStatusLog` عند `DELETE /api/users/:id` و`purge=true`، وحظر حذف منتج مرتبط بمسودة فتاة (`409`).
- **السباقات الزمنية (Concurrency)**: استخدام `pg_advisory_xact_lock` لفحص البوليصة (`sales.ts`) وسحب المخزون idempotency (`inventory.ts`)، وقفل المهام `FOR UPDATE` في `tasks.ts` مع تنظيف المؤقت عند الإنهاء.
- **دقة المبيعات وحسابات الفتيات**: منع إلغاء الفتاة لأوردر بعد تنفيذه، فلترة `bucket` في قاعدة البيانات واستعلام لوحة خفيف في `agent.ts`، عدم دمج بند قياسي مع بند مُعدّل المكوّنات، تسجيل `shippedAt`/`deliveredAt` و`RETURN_FLAG` في `sales.ts`، وإدراج الفتيات اللاتي تغير دورهن لاحقاً في `accounting.ts`.
- **الملفات والوقت والمزامنة**: السماح لـ `SALES_SUPERVISOR` بـ `presign-upload` لنطاق `inventory` فقط وتوقيع `content-length` في `r2Client.ts`؛ حساب حدود اليوم بتوقيت `ATTENDANCE_TZ`؛ وتصفية المخزون قبل توقيع R2.

## 3. تحسينات الأداء والتجربة والاختبارات وCI
- تقسيم القنوات في `syncVersion.ts` / `liveSync.ts` / `useLiveSync.ts` مع debounce وتنظيف SSE وإعادة تحقق الجلسة دورياً.
- تقسيم الحزم بـ `React.lazy` + `Suspense` وإضافة `ErrorBoundary`.
- استكمال تجربة صندوق الفتاة في `AgentOrders.tsx` (عرض مكونات البوكسات القابل للطي، زر الإلغاء قبل التنفيذ فقط، زر «معاينة البوليصة» A6 بدون أزرار طباعة/PDF للفتاة، وإخفاء بطاقات ملخص العمولات من صفحتها مع بقاء البحث داخل الأصناف في `AgentOrderModal.tsx`).
- إعادة تصميم صفحة «متابعة أوردرات المبيعات» (`/sales-follow-up`) لتعرض جدول متابعة منظم عبر `FollowOrdersTable.tsx` (تحديد متعدد للبوالص، رقم البوليصة، اسم العميل وهاتفه، الأوردر والقيمة، التاريخ، قائمة منسدلة لتغيير الحالة للشحن/التسليم، الفتاة، سعر الشحن، وأزرار معاينة البوليصة والطباعة وعلامة المرتجع والسجل)، مع نافذة `WaybillPreviewModal.tsx` ونموذج `WaybillSheet.tsx` للطباعة بمقاس A6 (`printWaybills`) وتحميل بوليصة أو عدة بوالص كـ PDF (`downloadWaybillsPdf` via `jspdf` + `html2canvas`)، وإثراء `/api/accounting/orders` بهذه الحقول وعدّادات الحالات والبحث بالعميل/الهاتف مع بقاء صلاحيات `SALES_ACCOUNTANT` محصورة كما هي.
- **فاتورة الفتاة (`0026_agent_line_price_shipping`) وتحديث الحسابات العامة**:
  - تحديث نموذج `AgentOrderModal.tsx` وكروت `AgentOrders.tsx` لتشمل: التاريخ، اسم العميل، تليفون مزدوج (`maxLength: 60`)، العنوان، اسم الصنف، الكمية، **سعر كل بوكس (`boxPrice`)**، **م شحن (`shippingPrice`)** اختياري، والإجمالي بالشحن، والملاحظات.
  - إضافة migration `0026_agent_line_price_shipping` (`AgentOrder.shippingPrice`، `AgentOrderLine.boxPrice`، `SalesOrderLine.boxPrice`) ونسخها عند التصدير مع حفظ سعر الخروج من الفتاة في `agentSellPrice`.
  - تحديث `agentMath.ts` و`accounting.ts` و`GeneralAccounts.tsx`: تغيير «إجمالي المبيعات المسلّمة» إلى **«سعر الخروج من المخزون»**، وإضافة **«سعر الخروج»** (السعر الذي أدخلته الفتاة)، وحساب **«الإجمالي الكلي» = سعر الخروج + الشحن**، وإضافة خانة **«فرق صرف»** كنسبة مئوية (وقيمة مساعدة) بين سعر الخروج من المخزون وسعر الخروج.
- **إصلاح المزامنة اللحظية ومنع الكاش (`liveSync` / `SSE`)**:
  - التقاط `writePath = req.path` وحساب `affectedChannels` في `backend/src/app.ts` *قبل* `next()` (لأن Express sub-routers تقصّ البادئة قبل حدث `finish` مما كان يحوّل جميع الكتابات إلى `["general"]` ويعطّل التحديث الفوري في كل الصفحات)، وتوسيع قنوات `/api/users` و`/api/sales-agents` مع استثناء `/api/files` من الإيقاظ، وإضافة `Cache-Control: no-store` لجميع مسارات `/api`.
  - تمرير `cache: "no-store"` في `frontend/src/lib/api.ts` و`liveSync.ts`، تقوية قراءة SSE (`runStream` ينتظر أول حزمة بيانات فعلية قبل تفعيل `streamConnected` مع توحيد `\r\n` وبث `general` للكل وإضافة `resetLiveSync()` المستدعى في `AuthProvider.tsx`)، منع تداخل الطلبات القديمة عبر `requestSeq` في `useResource.ts`، إضافة `"users"` لقنوات ملف الفتاة في `AgentOrders.tsx`، وتحديث كاش الـ Service Worker في `frontend/public/sw.js` إلى `tashkeel-shell-v2`.
- **تحسينات الأداء لحجم المشروع (`Tier S` — فهارس DB، Pagination، ضغط WebP، Skeletons)**:
  - إضافة migration `0027_performance_indexes` وتحديث `backend/prisma/schema.prisma` بـ 15 فهرساً للمفاتيح الأجنبية واستعلامات التصفية والفرز في الجداول المتنامية، والتحقق منها في `backend/tests/performance.test.ts`.
  - دعم `limit`/`offset` في `accounting.ts` (`GET /accounting/orders`) و`agent.ts` (`GET /agent/orders`) و`feedback.ts` (`GET /feedback`) دون تغيير التوافق العكسي أو تسريب أي حسابات/مخزون، وإضافة `frontend/src/components/ui/PaginationBar.tsx` وتفعيله في `SalesFollowUp.tsx` و`AgentOrders.tsx` و`Feedback.tsx` و`Inventory.tsx`.
  - إضافة `frontend/src/lib/imageOptimize.ts` لتصغير الصور وضغطها إلى `WebP` قبل الرفع في `ImageAttachments.tsx` وتفعيل `loading="lazy"` و`decoding="async"` وتحديد أبعاد الشعار في `Sidebar.tsx` و`Workspace.tsx`.
  - إضافة أنماط تحميل هيكلية (`table`/`cards`/`stats`/`list`) في `frontend/src/components/ui/StatusViews.tsx` وتفعيلها عبر صفحات النظام الرئيسية.
- إضافة `.env.example` و`.github/workflows/ci.yml` وإصلاح وإضافة اختبارات التغطية (شاملةً `backend/tests/sync.test.ts` و`backend/tests/performance.test.ts`).
