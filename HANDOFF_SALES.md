# صفحة «مبيعات إلكترونية» (كانت «مبيعات عامة») + سعر البيع + حذف المدير للمخزون

## ما أُضيف
- **حذف منتج المخزون**: صار للمدير والمدير العام (`DELETE /api/inventory/:id` يستخدم `requireStaff`، و`canDeleteInventory = isStaff`).
  إن كان الصنف داخل منتج/أوردر مبيعات يرجع 409 برسالة واضحة (الأرشفة بدل الحذف).
- **سعر البيع** لكل صنف مخزون (`InventoryItem.sellPrice`, migration `0015`): عمود في الجدول وحقل في النموذج والتفاصيل والتصدير. لا يدخل في «إجمالي القيمة» ولا يراه سحب-فقط.
- **المبيعات الإلكترونية** (`/sales`، للإدارة فقط، migration `0016`):
  - منتجات ثابتة (بوكسات) بمحتويات من المخزون: `SalesProduct` + `SalesProductComponent`.
  - أوردرات يومية: `SalesOrder` (التاريخ، رقم البوليصة، اسم المقفل، الحالة) + بنود `SalesOrderLine` + محتويات منسوخة `SalesOrderComponent`.
  - الحالات: مسجل ← تم التنفيذ ← شحن ← تم التسليم / مرتجع.
  - **تم التنفيذ / شحن / تم التسليم** تخصم المكونات من المخزون مرة واحدة (`stockDeducted`) بحركات OUT مرتبطة بالأوردر (`referenceId = sales:<id>`).
  - **مرتجع** أو الرجوع إلى «مسجل» أو **حذف أوردر منفّذ** يعيد الكميات بحركات RETURN.
  - التكلفة (من سعر الوحدة) وسعر البيع (من سعر البيع) تُحسب حيّة قبل التنفيذ وتُثبَّت لحظة التنفيذ.
  - الخصم كله أو لا شيء داخل معاملة، مع قفل الأوردر وصفوف الأصناف (لا خصم مزدوج ولا رصيد سالب).
  - تعديل بنود الأوردر (إضافة/عدد/إزالة) قبل التنفيذ فقط.
  - تنبيه نقص المخزون يعمل بعد الخصم (نُقلت `handleLowStockTransition` إلى `utils/inventoryLowStock.ts`).

## للتشغيل
`prisma migrate deploy` ثم `prisma generate` ثم `npm run build`.

## الاختبارات
`backend/tests/sales.test.ts` (20 اختباراً) + تحديث اختبار حذف المخزون + إضافة مسارات المبيعات لاختبار القائمة البيضاء. كامل مجموعة الباكند: 347 ناجحاً.

## مرتجع بتحديد التالف (migration `0017`)
- زر «مرتجع» لأوردر خُصمت مكوناته يفتح نافذة محتويات الأوردر؛ الضغط على مكوّن يحدده «تالف».
- `PATCH /api/sales/orders/:id` يقبل `status: RETURNED` مع `damagedComponentIds`؛ التالف **لا يعود للمخزون** والباقي يعود بحركات RETURN.
- `SalesOrderComponent.damaged` (يُمسح عند الخروج من «مرتجع»)، و`damagedTotal` لكل أوردر = تكلفة التالف بسعر التنفيذ المثبّت.
- صفحة المبيعات: بطاقة «تالف اليوم» = مجموع `damagedTotal` لأوردرات اليوم المرتجعة. الاختبارات الجديدة في `backend/tests/sales.test.ts`.

## تعديل كل أوردر على حدة (مكوّنات الأوردر)
- من «عرض الكل» في كارت الأوردر (قبل التنفيذ فقط): تعديل كمية أي مكوّن (للوحدة الواحدة)، حذفه، أو إضافة صنف من المخزون — لهذا الأوردر وحده. المنتج الثابت والأوردرات الأخرى لا تتغير.
- مسارات جديدة (نفس قيود `withEditableOrder`: مسجل وغير مخصوم وإلا 409):
  - `POST /api/sales/orders/:id/lines/:lineId/components` `{ itemId, quantity }` (نفس الصنف يجمع الكمية)
  - `PATCH .../components/:componentId` `{ quantity }`
  - `DELETE .../components/:componentId` (لا يُحذف آخر مكوّن في البند)
- واجهة: `OrderComponentsEditor.tsx` + خصائص `items/onAddComponent/onSetComponentQty/onRemoveComponent` في `SalesOrderCard`.
- لا migration جديدة (المحتويات منسوخة أصلاً في `SalesOrderComponent`). اختبارات جديدة في `backend/tests/sales.test.ts`.
- زر «تعديل» (قلم) في شريط منتجات الكارت بجوار «عرض الكل» (للأوردر المسجل فقط) يفتح `OrderEditModal.tsx`: عدد كل منتج وإزالته، مكوناته (كمية/حذف/إضافة)، إضافة منتج، وملخص التكلفة والربح الحي.
- زر «نقل ليوم» في الصف العلوي لكل أوردر (أي حالة) يفتح `MoveOrderModal.tsx` لاختيار اليوم؛ يغيّر `date` فقط عبر `PATCH /api/sales/orders/:id` الموجود (لا تغيير في الحالة ولا المخزون). لا تغيير في الباكند.

## صفحة «أوردرات مبيعات إلكترونية» (`/sales-orders`)
- صفحة ثانية في القائمة (للمدير والمدير العام فقط حالياً: `AppPage = "salesOrders"` في `lib/permissions.ts`)، وهي نفس أوردرات «مبيعات إلكترونية» ونفس العمليات (إضافة، حالة، بوليصة، مقفل، تعديل، نقل ليوم، مرتجع، حذف)؛ أي أوردر يُدخل في إحداهما يظهر في الأخرى.
- بدون أي حسابات: لا تكلفة ولا سعر بيع ولا ربح ولا تالف بالمبالغ ولا Excel (ولا أسعار في نوافذ إضافة/تعديل/مرتجع الأوردر).
- إدارة المنتجات الثابتة (زر «المنتجات الثابتة» + إنشاء/تعديل/إيقاف/حذف) متاحة في الصفحة الجديدة، لكن نوافذها بلا أي أسعار (`hideMoney` في `SalesProductsModal` و`ProductEditorModal`).
- التنفيذ: `SalesView({ ordersOnly })` في `pages/Sales.tsx` + `pages/SalesOrders.tsx`، والخاصية `hideMoney` في `SalesOrderCard` و`NewOrderModal` و`OrderEditModal` و`ReturnOrderModal`.
- ملاحظة: الإخفاء في الواجهة فقط (البيانات نفسها تصل من `/api/sales` للإدارة). لو أُتيحت الصفحة لدور غير الإدارة يلزم راوتر باكند يحذف الحقول المالية من الاستجابة.

## علامة «مرتجع» للمراجعة (migration `0018`)
- زر «مرتجع» (علم) في الصف العلوي من كارت الأوردر (أي حالة عدا مرتجع): الشركة تعلّم الأوردر فيظهر للموظف شريط «بانتظار المراجعة»، **بلا أي أثر على الحالة أو المخزون**. الموظف يراجع ثم يضغط حالة «مرتجع» الفعلية (مع تحديد التالف) فتعود المكونات وتُمسح العلامة تلقائياً. زر «إلغاء المرتجع» يزيل العلامة.
- `SalesOrder.returnFlagged` + `returnFlaggedAt`؛ `PATCH /api/sales/orders/:id` يقبل `returnFlagged`. فلتر جديد في الصفحة: «بانتظار مراجعة المرتجع (n)» في الصفحتين.
- للتشغيل: `prisma migrate deploy` ثم `prisma generate`.

## الأدوار الثلاثة المحصورة في المبيعات الإلكترونية (migration `0019_sales_roles`)
أُضيفت 3 قيم جديدة إلى `enum Role` مع بوابة قائمة بيضاء fail-closed على مستوى `/api` (`restrictedRoleGate` + `isSalesRoleAllowed`) وحذف كامل لحقول الأسعار والإجماليات من استجابات الـ API لهذه الأدوار:

1. **`SALES_FLAGGER` («مراجع مرتجعات»)**:
   - الصفحات المتاحة: `/sales-orders` و`/profile` فقط (المسار الافتراضي `/sales-orders`).
   - الصلاحية الوحيدة: قراءة الأوردرات وتعليم/إلغاء علامة المراجعة `PATCH /api/sales/orders/:id` بحقل `{ returnFlagged: boolean }` وحده (أي حقل آخر في الجسم يُرفض بـ `403`).
2. **`SALES_EDITOR` («منفّذ أوردرات»)**:
   - الصفحات المتاحة: `/sales-orders` و`/profile` فقط (المسار الافتراضي `/sales-orders`).
   - مسموح: إضافة أوردر، حذف أوردر، تعديل بيانات الأوردر (`waybill`, `closerName`, `notes`, `date`, `returnFlagged`)، تعديل محتويات الأوردر قبل التنفيذ (`withEditableOrder`: بنود ومكوّنات)، إنشاء منتج ثابت جديد (`POST /api/sales/products`)، وقراءة المنتجات الثابتة والمقفلين والأصناف/التصنيفات لاختيار المكونات.
   - ممنوع: تغيير حالة الأوردر (`status` أو `damagedComponentIds` ← `403`، وهذا خاص بمنفّذ الأوردرات؛ مشرف المبيعات مسموح له).
3. **`SALES_SUPERVISOR` («مشرف مبيعات»)**:
   - كل صلاحيات `SALES_EDITOR`، **بالإضافة إلى تغيير حالة كرت الأوردر** (مسجل ← تم التنفيذ ← شحن ← تم التسليم / مرتجع مع تحديد التالف) عبر `PATCH /api/sales/orders/:id` بحقلي `status` و`damagedComponentIds`؛ يخصم ويعيد المخزون كما للإدارة وبلا أي مبالغ في الرد (`canChangeSalesOrderStatus` في الواجهة).
   - بالإضافة إلى صفحة المخزون `/inventory` لإضافة مخزون فقط:
     - إنشاء صنف جديد (`POST /api/inventory`) مع قبول `unitPrice` و`sellPrice` كحقول كتابة فقط (تُحفظ في قاعدة البيانات ولا تُعاد في الاستجابة).
     - إضافة كمية (`POST /api/inventory/:id/movements` بحركة `type: "IN"` فقط؛ أي نوع آخر مثل `OUT` أو `ADJUST` أو `RETURN` ← `403`).
     - قراءة الأصناف والتصنيفات والوحدات وتوليد الكود (`GET /api/inventory/next-sku`) وسجل حركات الصنف بدون أي أسعار أو قيم مالية.
     - ممنوع: تعديل أو أرشفة أو حذف الأصناف، السحب، إدارة التصنيفات/المجموعات، والتقارير أو التصدير المالي (`GET /api/inventory/movements` ← `403`).

### مصفوفة الصلاحيات (`isSalesRoleAllowed` + فحوص الراوتر)
| المسار / العملية | `SALES_FLAGGER` | `SALES_EDITOR` | `SALES_SUPERVISOR` | `ADMIN` / `MANAGER` |
| --- | :---: | :---: | :---: | :---: |
| مشترك: `GET /auth/me`, `/sync`, `/sync/stream`, `POST /auth/logout`, `PATCH /users/me` | 200 | 200 | 200 | 200 |
| `GET /api/sales/orders` | 200 (بلا مبالغ) | 200 (بلا مبالغ) | 200 (بلا مبالغ) | 200 (كامل) |
| `GET /api/sales/products`, `GET /api/sales/closers` | 403 | 200 (بلا مبالغ) | 200 (بلا مبالغ) | 200 (كامل) |
| `POST /api/sales/orders`, `DELETE /api/sales/orders/:id` | 403 | 201 / 200 | 201 / 200 | 201 / 200 |
| `PATCH /api/sales/orders/:id` (`{ returnFlagged }` فقط) | 200 | 200 | 200 | 200 |
| `PATCH /api/sales/orders/:id` (`waybill`, `closerName`, `notes`, `date`) | 403 | 200 | 200 | 200 |
| `PATCH /api/sales/orders/:id` (`status`, `damagedComponentIds`) | 403 | 403 | 200 (بلا مبالغ) | 200 |
| `POST/PATCH/DELETE /api/sales/orders/:id/lines...` | 403 | 200 / 201 | 200 / 201 | 200 / 201 |
| `POST /api/sales/products` | 403 | 201 (بلا مبالغ) | 201 (بلا مبالغ) | 201 (كامل) |
| `PATCH /api/sales/products/:id`, `DELETE /api/sales/products/:id` | 403 | 403 | 403 | 200 |
| `GET /api/inventory`, `GET /api/inventory/categories` | 403 | 200 (بلا أسعار/إحصاءات) | 200 (بلا أسعار) | 200 (كامل) |
| `GET /api/inventory/:id`, `GET /api/inventory/:id/movements`, `/units`, `/next-sku` | 403 | 403 | 200 (بلا أسعار) | 200 (كامل) |
| `POST /api/inventory` (قبول `unitPrice` و`sellPrice` كتابةً فقط) | 403 | 403 | 201 (بلا أسعار في الرد) | 201 (كامل) |
| `POST /api/inventory/:id/movements` (`type: "IN"`) | 403 | 403 | 201 (بلا أسعار في الرد) | 201 (كامل) |
| `POST /api/inventory/:id/movements` (`OUT` / `ADJUST` / `RETURN`) | 403 | 403 | 403 | 201 |
| `PATCH/DELETE /api/inventory/:id`, `/withdrawals`, `/movements`, `/groups`, إدارة التصنيفات | 403 | 403 | 403 | 200 / 201 |
| أي مسار آخر في `/api/*` (بما فيه المسارات المستقبلية غير المدرجة) | 403 | 403 | 403 | حسب الدور |

### عدم تسريب المبالغ (No Price Leakage)
- في المبيعات (`serializeSalesOrder` و`serializeSalesProduct` عند `hideMoney: true`): تُحذف الحقول `costTotal`, `sellTotal`, `profit`, `damagedTotal`, `unitCost`, `unitSell`, `costPerUnit`, `sellPerUnit`, `totalCost`, `totalSell` من كائن الاستجابة نفسه قبل الإرسال.
- في المخزون (`stripItemPrices`, `stripInventoryStatsPrices`, `stripMovementPrices`): تُحذف `unitPrice`, `sellPrice`, `totalValue` (من الصنف ومن `stats`), و`unitPriceSnapshot`, `movementValue` (من الحركات).

### ملاحظة Migration والتشغيل
- تحتوي `backend/prisma/migrations/0019_sales_roles/migration.sql` على أوامر `ALTER TYPE "Role" ADD VALUE IF NOT EXISTS` فقط دون استخدام القيم الجديدة داخل نفس المعاملة (لأن PostgreSQL لا يسمح باستخدام قيمة enum مضافة حديثاً داخل نفس الـ transaction قبل `COMMIT`).
- للتشغيل:
  ```bash
  npx prisma migrate deploy
  npx prisma generate
  ```


---

## نظام أوردرات الفتيات + محاسب المبيعات (تحديث 2026-11-12)
التفاصيل الكاملة في `HANDOFF_GIRLS_SALES_SYSTEM.md`. باختصار ما تغيّر في دورة المبيعات:
- **الدور `SALES_FLAGGER` أصبح `SALES_ACCOUNTANT` («محاسب مبيعات»)** (migration `0021` بـ RENAME VALUE فلا يضيع أي مستخدم)، وأُضيف `SALES_AGENT` («فتاة مبيعات»). الجدول أعلاه الخاص بـ `SALES_FLAGGER` يُقرأ الآن على أنه المحاسب.
- **الشحن والتسليم:** لم يعودا متاحين لمشرف المبيعات (403 في الباكند + إخفاء الزرين في الواجهة). يبقيان للإدارة من صفحة المبيعات، وللمحاسب من صفحة «متابعة أوردرات المبيعات».
- **أوردرات الفتيات** تنشأ في `AgentOrder` (مساحة الفتاة)، وعند «تصدير» بتأكيد يُنشأ `SalesOrder` مرتبط (`source = AGENT`) فيظهر في صفحات المبيعات الحالية. **التصدير لا يخصم مخزوناً**؛ الخصم عند «تم التنفيذ» فقط كما كان.
- **سلوك جديد خاص بأوردرات الفتيات فقط:** لا شحن/تسليم قبل التنفيذ، ولا تغيير حالة أوردر ملغي. الأوردرات القديمة بلا أي تغيير.


### تحديث (نقطة تفتيش 6): إلغاء أوردر الفتاة + قيد البوليصة
- `SalesOrder` فيه الآن `cancelledAt/cancelReason/cancelledById` (migration 0023). الأوردر الملغي يظهر بشارة «ملغي» ويُرفض أي تعديل/تنفيذ/حذف له من الباكند. لا حركة مخزون عند الإلغاء.
- رقم البوليصة فريد في قاعدة البيانات (`lower(waybill)` جزئي، الفارغ مستثنى). الأرقام المحجوزة لفتاة لا تُستخدم يدوياً.
- التفاصيل والاختبارات: `HANDOFF_GIRLS_SALES_SYSTEM.md` → «نقطة تفتيش 6».
