# HANDOFF_INVENTORY.md — نظام المخزون (تسليم للجلسة التالية)

تاريخ: 2026-10-31 · المشروع: tashkel-desin (Laser System) · الفرع: `main`

## 0. الوضع الحالي بإيجاز

- **نظام المخزون لم يُبنَ بعد.** لا يوجد في الـ zip أي ملف مخزون: لا نموذج في `schema.prisma`، ولا migration `0008`، ولا مسارات، ولا واجهة.
- الجلسة السابقة نفّذت نحو 35 أمراً لبدء الباكند، لكن ناتجها لم يُحفظ في الـ zip. **اعتبره غير موجود.**
- **متطلبات المخزون الفعلية موجودة في `untitled.txt` (15.6 KB) ولم تصل إلى هذه الجلسة.** كل ما يخص نموذج البيانات والصلاحيات والارتباطات في القسم 3 أدناه **اقتراح مبدئي يجب مطابقته مع `untitled.txt` قبل التنفيذ**، وليس مواصفات معتمدة.
- شجرة git فيها 11 ملفاً معدّلاً غير مُرسَلة. الفروق تبدو تغيير نهايات أسطر فقط (3152 سطراً مضافاً و3152 محذوفاً). لا تُرسِلها دون قرار من المستخدم.

## 1. أول خطوة للجلسة التالية

1. اطلب من المستخدم `untitled.txt` الأصلي، أو نصه ملصوقاً في الرسالة. لا تبدأ البناء دونه.
2. اقرأه كاملاً وطابق به القسم 3، ثم عدّل هذا الملف.
3. شغّل `npm test` و`npm run typecheck` و`npm run build` في الباكند والفرونت قبل أي تعديل. هذه لم تُشغَّل في البيئة السابقة (انظر `HANDOFF.md` ← RESUME POINT).

## 2. بنية المشروع المعتمدة (للتوافق عند البناء)

- **الباكند:** Node + Express + Prisma 7 (`@prisma/adapter-pg`) + Zod 4 + JWT. ESM (`"type": "module"`).
- **المسارات الموجودة** في `backend/src/routes/`: attendance، auth، calendarEvents، feedback، files، goals، internal، notifications، products، push، sync، tasks، users. أضف `inventory.ts` بنفس النمط وسجّله في `backend/src/app.ts`.
- **النماذج الموجودة:** User، Task، TaskTimeLog، TaskComment، Feedback، Goal، CalendarEvent، ProductCategory، Product، ProductVariant، AttendanceSession، Notification، TaskTimer، PushSubscription.
- **آخر migration:** `0007_push_subscriptions` ← الجديدة تكون `0008_inventory`.
- **الأدوار:** ADMIN / MANAGER / DESIGNER. الصلاحيات تُفحص في الباكند وتُعرض في الفرونت عبر `hooks/usePermissions.ts`.
- **الفرونت:** React + Vite + Tailwind بواجهة RTL. مكونات UI في `components/ui/`، وكل مورد له `services/*Service.ts` ونوع في `types/`. صفحة أسعار المنتجات في `components/products/` ونوعها `types/product.ts`.
- **تنبيه:** حافظ على نهايات الأسطر في الملفات الموجودة (CRLF/LF). لا تُحوّلها، وإلا يتضخم الـ diff.

## 3. التعديلات المطلوبة (مبدئية — تُطابَق مع untitled.txt)

### 3.1 الباكند
1. إضافة نماذج Prisma للمخزون: عنصر مخزون (`InventoryItem`) وحركة مخزون (`InventoryMovement`)، مع حد أدنى للتنبيه ووحدة قياس، وربط اختياري بـ `Product`/`ProductVariant`.
2. migration باسم `0008_inventory` تُنشأ بـ `prisma migrate dev` وتُراجع يدوياً.
3. منطق الحركات (إدخال / إخراج / جرد) **داخل معاملة (transaction)** مع خصم ذري ومنع الرصيد السالب.
4. مسار `inventory.ts` بعمليات CRUD وسجل الحركات، مع تحقق Zod في `validators/`.
5. صلاحيات المخزون: من يرى ومن يعدّل. **تُحدَّد من `untitled.txt`** وتُضاف إلى نظام الصلاحيات الحالي.
6. اختياري: إشعار عند الوصول إلى الحد الأدنى، عبر نظام `Notification` الموجود.

### 3.2 الفرونت
1. `types/inventory.ts` و`services/inventoryService.ts`.
2. صفحة المخزون ومكوناتها: قائمة، فلاتر، نموذج إضافة/تعديل، نموذج حركة، سجل حركات.
3. إضافة الصفحة إلى `Sidebar.tsx` وتسجيلها في `App.tsx` خلف `ProtectedRoute` وصلاحية مناسبة.
4. ربط المخزون بصفحة أسعار المنتجات **بالطريقة التي يحددها `untitled.txt`**.

### 3.3 الاختبارات والتوثيق
1. اختبارات vitest للحركات: منع الرصيد السالب، الصلاحيات، تزامن حركتين على نفس العنصر.
2. تحديث `CHANGES.md` و`HANDOFF.md` بعد كل مرحلة.

## 4. أسئلة مفتوحة (تجيب عنها `untitled.txt`)

- هل يُخزَّن مواد خام أم منتجات جاهزة أم الاثنان؟
- ما أنواع الحركات والحقول المطلوبة لكل حركة؟
- من يرى المخزون ومن يعدّله من الأدوار الثلاثة؟
- ما علاقة المخزون بصفحة أسعار المنتجات؟ هل هي ربط بالمنتج/المتغير أم حساب تكلفة؟

## 5. ترتيب التنفيذ المقترح

1. تحقق الباكند الحالي (test/typecheck/build).
2. Prisma + migration `0008`.
3. الصلاحيات ومنطق الحركات والمسارات والاختبارات.
4. الفرونت (الخدمة، الصفحة، الشريط الجانبي).
5. ربط أسعار المنتجات.
6. التحقق النهائي وتحديث `HANDOFF.md`، وتسليم zip بعد **كل** مرحلة حتى لا يضيع العمل.

## 6. سجل التقدم
- **الخطوة 1 (تحقق الباكند):** لم تُنفَّذ. تعذّر `npm ci` لعدم وجود شبكة في بيئة الجلسة. شغّل `npm test` و`typecheck` و`build` محلياً.
- **الخطوة 2 (Prisma + migration):** تمت. أُضيف `InventoryItem` و`InventoryMovement` و`InventoryMovementType` إلى `schema.prisma` (بنهايات CRLF كما هي)، وأُنشئت `prisma/migrations/0008_inventory/migration.sql` يدوياً مع قيود CHECK لمنع الرصيد السالب. لم تُشغَّل `prisma validate` ولا `migrate` (لا شبكة). **الحقول مبدئية وتُطابَق مع untitled.txt.**
- **الخطوة 3 (الباكند):** تمت كتابتها ولم تُشغَّل (لا شبكة). الملفات: `backend/src/validators/inventory.ts`، `utils/inventorySerialize.ts`، `routes/inventory.ts` (مسجّل في `app.ts` على `/api/inventory`)، `backend/tests/inventory.test.ts`، وتعديل `tests/helpers.ts` (إضافة جداول المخزون إلى TRUNCATE).
  - الصلاحيات المبدئية: أي مستخدم مسجّل يقرأ، ADMIN/MANAGER يكتبون، ADMIN وحده يحذف نهائياً. **تُطابَق مع untitled.txt.**
  - الحركات داخل معاملة بقفل `FOR UPDATE` (نفس نمط attendance) + قيد CHECK في قاعدة البيانات.
  - **الأولوية عند أول تشغيل:** `npx prisma validate` ثم `npx prisma generate` ثم `npm run typecheck` ثم `npx vitest run tests/inventory.test.ts`. أي فشل في الاختبارات أو الأنواع يُصلح قبل الانتقال للفرونت.
- **التالي:** الخطوة 4 = الفرونت (types، service، صفحة، Sidebar، App.tsx).
- **الخطوة 4 (الفرونت):** تمت كتابتها ولم تُشغَّل (لا شبكة، فلا typecheck ولا build).
  - ملفات جديدة: `frontend/src/types/inventory.ts`، `services/inventoryService.ts`، `pages/Inventory.tsx`، `components/inventory/{ItemModal,MovementModal,MovementsModal,format}.ts(x)`.
  - تعديلات: `types/index.ts` (تصدير الأنواع)، `lib/permissions.ts` (صفحة `inventory` لكل الأدوار)، `hooks/usePermissions.ts` (`canManageInventory`، `canDeleteInventory`)، `components/sidebar/Sidebar.tsx` (بند «المخزون» للإدارة والمصمم)، `App.tsx` (المسار `/inventory`). حُفظت نهايات الأسطر الأصلية في كل ملف.
  - **ما لم يُنفَّذ بعد:** ربط المخزون بصفحة أسعار المنتجات (حقل `productId` موجود في الباكند، والواجهة تحتفظ بقيمته ولا تعرض اختياره) — ينتظر `untitled.txt`.
  - **تحقق أولاً:** `cd frontend && npm run build` (يشغّل tsc). مواضع الشك المحتملة: ما إذا كان `Warehouse` متاحاً في نسخة lucide-react المثبتة، وأن `Badge` يقبل غياب `color`.
- **التالي:** (أ) تشغيل التحقق عندك وإصلاح الأخطاء، (ب) مطابقة الحقول والصلاحيات مع `untitled.txt`، (ج) ربط أسعار المنتجات، (د) اختياري: إشعار عند النقص عبر نظام Notification.

## 7. تحديث (بعد طلب المستخدم): لا ربط بأسعار المنتجات + صفحة السحب
- **قرار المستخدم:** لا يُربط المخزون بصفحة أسعار المنتجات إطلاقاً. أُزيل `productId` وعلاقته من الـ schema والـ migration `0008` (عُدّلت في مكانها لأنها لم تُشغَّل بعد؛ إن كنت شغّلتها محلياً فأعد إنشاءها) ومن الباكند والفرونت والاختبارات. الربط المطلوب الوحيد: **صفحة السحب مربوطة بالمخزون**.
- **الباكند:** أُضيف `InventoryMovement.batchId`. `POST /api/inventory/withdrawals` (لأي مستخدم مسجّل): طلب بعدة أصناف `{lines:[{itemId,quantity}], note}`، كله أو لا شيء، قفل صفوف الأصناف مرتبة بالمعرّف، تُجمع كميات التكرار، ويُرفض المعطّل والرصيد الناقص (409). `GET /api/inventory/withdrawals`: الإدارة ترى الكل والمصمم سحوباته فقط. الاختبارات في `tests/inventory.test.ts` (قسم «السحب»).
- **الفرونت:** `pages/Withdrawals.tsx` على `/withdrawals` (أصناف متاحة ← سلة بكميات ← تأكيد السحب + سجل السحوبات مجمّعاً بالطلب). بند «السحب» في الشريط الجانبي لكل الأدوار. الرصيد الظاهر في الصفحة يتحدّث تلقائياً مع المزامنة الحية.
- **افتراضات تحتاج تأكيداً من المستخدم:** هل يسحب المصمم مباشرة بلا موافقة؟ هل المطلوب ربط السحب بمهمة (Task) أو مشروع؟ هل يظهر للمصمم سجل الآخرين؟ (الحالي: لا).
- **لم يُشغَّل شيء** (لا شبكة): نفس خطوات التحقق في القسم 1 + `npx prisma generate` قبل `typecheck`.

## 8. تحديث: صور متعددة + تصنيفات للمخزون (طلب المستخدم)
- **الباكند:** نموذج `InventoryCategory`؛ `InventoryItem.categoryId` (إلزامي، Restrict) و`attachments` (Json، حتى 10 صور). عُدّلت `0008_inventory` في مكانها. نطاق رفع جديد `inventory` في `attachmentKeys.ts` (النوع + الـ regex) و`validators/attachments.ts`، و`isKeyReferenced` يفحص عناصر المخزون. مسارات: `GET/POST /api/inventory/categories` (الإنشاء للإدارة، ولا يوجد حذف تصنيف)، و`GET /api/inventory?categoryId=` للفلترة. حذف/استبدال الصور يحذف كائنات R2 (نفس نمط المنتجات).
- **الفرونت:** `ItemModal` فيه صور متعددة (`ImageAttachmentsField` scope `inventory`) + قائمة التصنيف وزر «+» لإضافة تصنيف جديد (نفس أسلوب نموذج المنتج). `ImageAttachmentsField` صار يقبل `sessionKeys` اختيارياً (متوافق مع الاستخدامات القديمة). `inventoryService.list()` يعيد الآن `{items, categories}`. صفحة المخزون: عمود تصنيف + معرض صور + فلتر تصنيف. صفحة السحب: صورة مصغّرة واسم التصنيف.
- **لم يُشغَّل شيء** (لا شبكة): `prisma generate` ← `typecheck` ← اختبارات الباكند ← `npm run build` للفرونت. وتحقق يدوياً أن رفع الصور يعمل مع R2 (تحتاج متغيرات R2 مفعّلة وإلا تُحفظ كـ base64).
