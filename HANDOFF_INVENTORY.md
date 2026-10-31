# HANDOFF_INVENTORY.md — نظام إدارة المخزون المتكامل (مكتمل ومُختبَر)

تاريخ: 2026-10-31 · المشروع: TASHKEL (Laser System) · الحالة: ✅ مكتمل بجميع المراحل العشر ومُختبَر بالكامل

---

## 1. ملخص الإنجاز واستقلال النظام

تم استكمال نظام إدارة المخزون داخل مشروع **TASHKEL** عبر المراحل العشر المطلوبة بالكامل، مع الحفاظ التام على تصميم الموقع الداكن واللون الأخضر الفيروزي وتنسيق RTL، ودون المساس بأي وظيفة قائمة في الموقع.

### استقلال المخزون التام عن صفحة أسعار المنتجات (`/products`)
- لا يستخدم المخزون تصنيفات `ProductCategory` أو أسعار `ProductVariant`.
- يمتلك المخزون جداوله المستقلة بالكامل: `InventoryCategory`، `InventoryItem`، `InventoryMovement`.
- يمتلك المخزون صوره الخاصة (نطاق `inventory` في نظام المرفقات)، وأسعاره الخاصة (`unitPrice` بالجنيه المصري)، ووحدات قياسه الخاصة.
- الارتباط الوحيد هو مع صفحة السحب (`/withdrawals`) التي تسحب الأصناف وتخصم الكميات ذرياً من المخزون.

---

## 2. تفاصيل المراحل المنفذة (1 → 10)

### المرحلة 1: فحص المشروع وإصلاح الأخطاء الحالية
- مزامنة `backend/package-lock.json` مع `backend/package.json` (تثبيت `web-push` و`@types/web-push`).
- ضبط `maxConnections: 8` في `PGLiteSocketServer` داخل `backend/tests/globalSetup.ts` و`isolate: false` في `backend/vitest.config.ts` لمنع إغلاق اتصالات قاعدة بيانات الاختبار بين ملفات الاختبار العشرين.
- تنظيف `taskTimer` في `beforeEach` داخل `backend/tests/timerWatcher.test.ts` وتصحيح تمرير `categoryId` في اختبار تكرار الكود داخل `backend/tests/inventory.test.ts`.

### المرحلة 2: استكمال تصنيفات المخزون
- تحديث نموذج `InventoryCategory` ليضم: `id`, `name`, `description`, `createdAt`, `updatedAt` مع حساب عدد المنتجات `_count.items` (`itemsCount`).
- مسارات API:
  - `GET /api/inventory/categories?q=` (عرض وبحث التصنيفات مع عدد المنتجات).
  - `POST /api/inventory/categories` (إضافة تصنيف مع منع تكرار الاسم).
  - `PATCH /api/inventory/categories/:id` (تعديل الاسم والوصف مع منع التكرار).
  - `DELETE /api/inventory/categories/:id` (منع حذف تصنيف مرتبط بمنتجات `409` إلا مع تمرير `reassignToCategoryId` لنقل المنتجات بأمان داخل معاملة قبل الحذف).
- واجهة إدارة التصنيفات المستقلة (`frontend/src/components/inventory/CategoriesModal.tsx`) + زر `(+)` داخل نموذج المنتج لإضافة تصنيف جديد بالاسم والوصف واختياره مباشرة دون مغادرة النموذج.

### المرحلة 3: إضافة صور المنتجات وتطوير نموذج المنتج
- تطوير `frontend/src/components/inventory/ItemModal.tsx` ليضم الحقول التسعة:
  1. صورة المنتج (رفع، معاينة، استبدال، حذف، صورة مصغرة في الجدول، صورة كبيرة في التفاصيل، وصورة افتراضية عند عدم وجود صورة).
  2. اسم المنتج.
  3. كود المنتج (`sku`): إدخال يدوي، زر توليد تلقائي (`GET /api/inventory/next-sku` بصيغة `INV-0001`)، منع التكرار (`409`)، وقفل الكود افتراضياً عند التعديل حتى لا يتغير إلا بطلب المستخدم.
  4. التصنيف + زر `(+)`.
  5. وحدة القياس: الوحدات العشر الافتراضية (`قطعة`, `لوح`, `متر`, `متر مربع`, `كيلو`, `جرام`, `لتر`, `عبوة`, `ربطة`, `صندوق`) + إمكانية إضافة وحدة مخصصة (`GET /api/inventory/units`).
  6. الكمية الافتتاحية (تُحفظ عند الإنشاء وتُنشئ حركة افتتاحية `IN` مرة واحدة فقط، ولا تتكرر عند تعديل المنتج).
  7. سعر الوحدة بالجنيه المصري (`unitPrice`).
  8. الحد الأدنى للمخزون (`minQuantity`).
  9. ملاحظات (`notes`).

### المرحلة 4: إضافة الأسعار والحسابات المالية
- إضافة `unitPrice Decimal(14,2)` في `InventoryItem` و`unitPriceSnapshot Decimal(14,2)` في `InventoryMovement`.
- حساب تلقائي دقيق (`calcTotalValue` بحساب الأجزاء العشرية الصحيحة لتجنب أخطاء الفاصلة العائمة): `totalValue = quantity × unitPrice`.
- حساب إجمالي قيمة المخزون = مجموع قيم جميع المنتجات النشطة بالجنيه المصري.
- تحديث القيمة تلقائياً بعد الوارد والسحب والجرد والمرتجعات وعند تعديل سعر الوحدة، مع الحفاظ على `unitPriceSnapshot` للحركات التاريخية القديمة دون تغيير.
- نافذة تفاصيل المنتج (`frontend/src/components/inventory/ItemDetailsModal.tsx`).

### المرحلة 5: تطوير لوحة المخزون الرئيسية (`Inventory.tsx`)
- 7 بطاقات إحصائيات في أعلى الصفحة محسوبة من قاعدة البيانات:
  1. إجمالي عدد المنتجات النشطة.
  2. إجمالي الكميات.
  3. إجمالي قيمة المخزون بالجنيه.
  4. عدد المنتجات المتوفرة.
  5. عدد المنتجات منخفضة المخزون.
  6. عدد المنتجات النافدة.
  7. عدد حركات اليوم.
- جدول المنتجات مع البحث (بالاسم والكود)، التصفية (بالتصنيف وحالة المخزون)، والترتيب (حسب الاسم، الكمية، القيمة تصاعدياً وتنازلياً)، وإجراءات سريعة لكل منتج (تفاصيل، تعديل، إضافة وارد، سحب، جرد، مرتجع، سجل الحركات، أرشفة/استعادة).

### المرحلة 6: تطوير التنبيهات ونواقص المخزون
- حالات المنتج التلقائية:
  - `AVAILABLE` (متوفر): الكمية أعلى من الحد الأدنى (`> 0`).
  - `LOW_STOCK` (منخفض): الكمية `> 0` وتساوي الحد الأدنى أو أقل منه.
  - `OUT_OF_STOCK` (نافد): الكمية تساوي `0`.
- صفحة مستقلة باسم **نواقص المخزون** (`frontend/src/pages/LowStock.tsx` على المسار `/inventory/shortages` وفي القائمة الجانبية ولوحة المخزون) تعرض الصورة، الاسم، الكود، الكمية الحالية، الحد الأدنى، الحالة، الكمية المقترحة لإعادة الطلب، التكلفة التقديرية، وزر إضافة وارد سريع.
- إشعار داخل الموقع (`INVENTORY_LOW` عبر نظام `Notification` الحالي) يُرسل للإدارة عند وصول المنتج للحد الأدنى أو النفاد، مع علم `lowAlertSent` لمنع تكرار الإشعار عند تحديث الصفحة أو السحوبات المتتالية، وإعادة تفعيله تلقائياً عند تزويد الرصيد فوق الحد الأدنى.

### المرحلة 7: استكمال الجرد والمرتجعات
- **الجرد (`frontend/src/components/inventory/StocktakeModal.tsx`)**: اختيار المنتج، صورته، الكمية المسجلة، الكمية الفعلية، حساب الفرق تلقائياً، سبب الفرق، اسم المسؤول، وتأكيد الجرد داخل معاملة (`ADJUST`) تحفظ `previousBalance` و`delta` و`balanceAfter` و`reason`.
- **المرتجعات (`frontend/src/components/inventory/ReturnModal.tsx`)**: نوع حركة `RETURN` مستقل، اختيار المنتج، الكمية المرتجعة (`> 0`)، سبب الإرجاع، رقم العملية الأصلية (`referenceId`)، ملاحظات، المستخدم والتاريخ، مع تحديث الرصيد والقيمة وحالة المنتج والتنبيهات.

### المرحلة 8: تطوير صفحة السحب والصلاحيات (`Withdrawals.tsx`)
- عرض صورة المنتج (أو الصورة الافتراضية)، الاسم، الكود، التصنيف، الكمية المتاحة، الوحدة، وحقل كمية السحب.
- بحث وفلتر بالتصنيف، سلة متعددة الأصناف، تعديل الكميات، إزالة منتج، عرض إجمالي الأصناف المختارة ومجموع الكميات، ملاحظات، تأكيد السحب، وزر إلغاء العملية.
- منع تكرار تنفيذ نفس العملية عبر `requestId` (`batchId` فريد لكل عملية) داخل معاملة قاعدة بيانات ذرية مع قفل `FOR UPDATE`.
- سجل السحوبات مجمّع حسب رقم العملية (`OP-XXXXXXXX`)؛ المصمم يرى سحوباته فقط والإدارة ترى جميع السحوبات.

### المرحلة 9: تصدير البيانات والتقارير (`exportInventory.ts` + `ReportsModal.tsx`)
- تصدير Excel (`.xlsx`) منظم بعناوين عربية واتجاه RTL ودقة مالية للتقارير السبعة:
  1. تقرير جميع المنتجات.
  2. تقرير قيمة المخزون.
  3. تقرير نواقص المخزون.
  4. تقرير الوارد خلال فترة.
  5. تقرير السحب خلال فترة.
  6. تقرير حركات منتج محدد.
  7. تقرير الجرد والتسويات.
- دعم الفلترة بتاريخ البداية والنهاية، التصنيف، المنتج، ونوع الحركة عبر `GET /api/inventory/movements`.

---

## 3. قائمة الملفات الجديدة والمعدلة

### ملفات جديدة
- `backend/prisma/migrations/0010_inventory_complete/migration.sql`
- `frontend/src/components/inventory/CategoriesModal.tsx`
- `frontend/src/components/inventory/ItemDetailsModal.tsx`
- `frontend/src/components/inventory/StocktakeModal.tsx`
- `frontend/src/components/inventory/ReturnModal.tsx`
- `frontend/src/components/inventory/ReportsModal.tsx`
- `frontend/src/lib/exportInventory.ts`
- `frontend/src/pages/LowStock.tsx`

### ملفات معدلة
- `backend/package-lock.json`
- `backend/prisma/schema.prisma`
- `backend/src/validators/inventory.ts`
- `backend/src/utils/inventorySerialize.ts`
- `backend/src/utils/notify.ts`
- `backend/src/routes/inventory.ts`
- `backend/vitest.config.ts`
- `backend/tests/globalSetup.ts`
- `backend/tests/timerWatcher.test.ts`
- `backend/tests/inventory.test.ts`
- `frontend/src/types/inventory.ts`
- `frontend/src/services/inventoryService.ts`
- `frontend/src/components/inventory/format.ts`
- `frontend/src/components/inventory/ItemModal.tsx`
- `frontend/src/components/inventory/MovementModal.tsx`
- `frontend/src/components/inventory/MovementsModal.tsx`
- `frontend/src/pages/Inventory.tsx`
- `frontend/src/pages/Withdrawals.tsx`
- `frontend/src/pages/Notifications.tsx`
- `frontend/src/components/notifications/NotificationItem.tsx`
- `frontend/src/components/sidebar/Sidebar.tsx`
- `frontend/src/App.tsx`

---

## 4. نتائج الاختبارات الفعلية

- `npx prisma validate` (الباك إند): ✅ `The schema at prisma\schema.prisma is valid 🚀`
- `npx prisma generate` (الباك إند): ✅ `Generated Prisma Client (7.10.0)`
- `npm run typecheck` (الباك إند): ✅ `0 errors`
- `npm test` (الباك إند): ✅ `Test Files: 20 passed (20)` — `Tests: 281 passed (281)` (بما فيها 32 اختباراً شاملاً للمخزون والحسابات والصلاحيات والتزامن).
- `npm run build` (الفرونت إند `tsc -b && vite build`): ✅ `built in 1.13s` (`0 errors`)
- `npm run lint` (الفرونت إند `oxlint`): ✅ `0 errors`

## 5. الوظائف غير المكتملة
- لا يوجد — جميع متطلبات المراحل العشر مكتملة ومُختبَرة.
