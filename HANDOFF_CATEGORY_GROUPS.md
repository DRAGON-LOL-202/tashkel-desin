# HANDOFF_CATEGORY_GROUPS.md — مجموعتان رئيسيتان للتصنيفات (خامات / اكسسوارات وهدايا) لتحديد وصول تعبئة ومشغل

تاريخ: 2026-11-01 · المشروع: TASHKEEL (tashkel-desin) · نقطة البداية: `tashkel-desin5.zip` (307 اختبارات خضراء، migrations حتى `0012_inventory_access`)

## 0. الهدف (كما طلبه المستخدم)

1. إضافة **تصنيفين رئيسيين** يندرج تحتهما كل تصنيفات المخزون الحالية والمستقبلية:
   - **خامات**
   - **اكسسوارات وهدايا**
2. عند إنشاء مستخدم «تعبئة» أو «مشغل» (أو تعديله) من «إدارة المستخدمين»، يحدد المدير **المجموعة الرئيسية** (واحدة أو الاثنتين) بدل اختيار التصنيفات واحداً واحداً. كل تصنيف فرعي داخل المجموعة يدخل تلقائياً في صلاحية المستخدم.
3. عند إضافة صنف مخزون (الصورة المرفقة: نافذة «إضافة منتج إلى المخزون»، الحقل 4 «التصنيف»)، يكون التصنيف الفرعي المختار تابعاً لإحدى المجموعتين.

**هذا يستبدل** اختيار التصنيفات واحداً واحداً الذي بُني في `HANDOFF_ROLES.md` (جدول `UserInventoryCategory` وحقل `allowedCategoryIds`). لا يُبقى الأسلوبان معاً.

التفسير المعتمد لما كُتب في الطلب «اكسسوارات وهدايا»: **مجموعة واحدة** اسمها «اكسسوارات وهدايا» (لا مجموعتان). إن كان المقصود «اكسسوارات» و«هدايا» منفصلتين فعدّل القسم 3 (سيصبحون ثلاث مجموعات) قبل البناء.

## 1. حالة المشروع عند التسليم (ما بُني قبل هذا الطلب)

- الأدوار: `ADMIN MANAGER DESIGNER PACKER OPERATOR`. صلاحية المخزون للمصمم: `User.inventoryAccess` = `NONE | WITHDRAW | FULL` (الجدد `NONE`، والموجودون رُحِّلوا إلى `FULL` في `0012`).
- تعبئة/مشغل: بوابة قائمة بيضاء `restrictedRoleGate` في `middleware/auth.ts` (أي مسار خارج السحب والملف الشخصي والمزامنة ← 403).
- ترشيح تعبئة/مشغل اليوم **حسب التصنيف**: `allowedCategoryIds(userId)` في `utils/inventoryAccess.ts` تقرأ `UserInventoryCategory`، وتُستخدم في `routes/inventory.ts` في `GET /`، `GET /categories`، و`POST /withdrawals` (التحقق داخل المعاملة بعد قفل الصفوف).
- `InventoryCategory` اليوم **مسطّح**: `id, name, description, createdAt, updatedAt` + علاقة `items`. لا أب ولا مجموعة.
- المصمم «السحب فقط» يسحب من كل التصنيفات (قرار سابق): **لا يتأثر بهذا العمل**.

## 2. القرار المعماري

مستويان فقط: **مجموعة رئيسية ← تصنيف فرعي ← صنف**. لا تداخل أعمق.

اخترت **جدول مجموعات مستقلاً** (`InventoryGroup`) وليس `parentId` ذاتي المرجع على `InventoryCategory`، لأن:
- المجموعتان ثابتتان (يحددهما المدير العام، لا تُنشأ من الواجهة)، فنموذج صريح أبسط وأضمن من شجرة عامة.
- يمنع تداخلاً أعمق من مستويين بحكم البنية لا بالتحقق.
- صلاحية المستخدم تُربط بالمجموعة مباشرة، فالاستعلام «كل تصنيفات المجموعات المسموحة» join واحد.

## 3. التصميم

### 3.1 قاعدة البيانات — migration جديدة `0013_inventory_groups`

> لا تعدّل `0010`–`0012` في مكانها (سابقة سيئة في `0008`). اكتب `0013` يدوياً بنفس أسلوب الملفات السابقة (`IF NOT EXISTS` و`DO $$ ... EXCEPTION WHEN duplicate_object`). الاختبارات تطبّق كل migrations بالترتيب على PGlite فأي خطأ SQL يظهر فوراً.

```
model InventoryGroup {
  id        String   @id @default(cuid())
  key       String   @unique          // معرّف ثابت للكود: MATERIALS | ACCESSORIES_GIFTS
  name      String                    // «خامات» | «اكسسوارات وهدايا»
  sortOrder Int      @default(0)
  createdAt DateTime @default(now())

  categories InventoryCategory[]
  allowedUsers UserInventoryGroup[]
}

// InventoryCategory: أضف
  groupId String?
  group   InventoryGroup? @relation(fields:[groupId], references:[id], onDelete: Restrict)
  @@index([groupId])

model UserInventoryGroup {
  userId    String
  groupId   String
  createdAt DateTime @default(now())
  user  User           @relation(fields:[userId],  references:[id], onDelete: Cascade)
  group InventoryGroup @relation(fields:[groupId], references:[id], onDelete: Cascade)
  @@id([userId, groupId])
  @@index([groupId])
}
```
وأضف العلاقة العكسية `inventoryGroups UserInventoryGroup[]` في `User`.

محتوى الـ migration:
1. إنشاء الجدولين والعمود والفهارس والمفاتيح الأجنبية.
2. **بذر المجموعتين داخل الـ migration نفسها** (`INSERT ... ON CONFLICT ("key") DO NOTHING`) بمعرّفات ثابتة، لتوجد في الإنتاج دون الاعتماد على `seed.ts`. حدّث `prisma/seed.ts` أيضاً ليتحقق من وجودهما (idempotent).
3. `DROP TABLE IF EXISTS "UserInventoryCategory"` — راجع القرار 3.6 (1) قبل الحذف.

**التصنيفات الحالية:** `groupId` يبقى `NULL` لأن الـ migration لا تعرف أيها «خامات» وأيها «اكسسوارات وهدايا». المدير يوزّعها بنفسه من الواجهة (3.4). إلى أن يفعل: تصنيف بلا مجموعة **لا يصل إليه تعبئة ولا مشغل** (deny by default). الإدارة والمصمم لا يتأثرون.
عند **إنشاء** تصنيف جديد تكون المجموعة **إلزامية** في الـ validator (الـ `NULL` للتصنيفات القديمة فقط).

### 3.2 الباكند

- `utils/inventoryAccess.ts`: غيّر `allowedCategoryIds(userId)` لتقرأ التصنيفات التابعة لمجموعات المستخدم:
  `inventoryCategory.findMany({ where: { group: { allowedUsers: { some: { userId } } } }, select: { id: true } })`.
  تُحسب في **كل طلب** فتسري تغييرات المجموعات ونقل التصنيفات فوراً دون إعادة دخول (كما هو الحال اليوم).
- `routes/inventory.ts`:
  - `GET /` و`GET /categories` لتعبئة/مشغل: ترشيح بنفس الدالة (لا تغيير في الشكل).
  - `POST /withdrawals`: الاستعلام داخل المعاملة (`tx.userInventoryCategory.findMany`) يصير استعلام التصنيفات بالمجموعات داخل `tx` أيضاً. المنطق كما هو: صنف خارج المسموح ← 403 للطلب كله بلا خصم جزئي.
  - `serializeInventoryCategory` (في `utils/inventorySerialize.ts`): أضف `groupId` و`groupName` (يتطلب `include: { group: true }` في `CATEGORY_INCLUDE`).
  - `POST /categories`: يقبل `groupId` **إلزامياً** ويتحقق من وجوده (400 وإلا). `PATCH /categories/:id`: يقبل `groupId` لنقل التصنيف بين المجموعتين.
  - مسار جديد للقراءة فقط `GET /api/inventory/groups` (الإدارة)، يعيد المجموعتين مع عدد التصنيفات والأصناف. **لا إنشاء ولا حذف ولا تعديل للمجموعات من الـ API** (ثابتتان).
  - حذف التصنيف مع `reassignToCategoryId`: لو كان التصنيف البديل في مجموعة مختلفة فالأصناف المنقولة تغيّر مجموعتها (فتتغير صلاحية من يسحب منها). أظهر هذا تحذيراً في الحوار (3.4).
  - حدّث تعليق الصلاحيات في أعلى الملف.
- `validators/users.ts`: استبدل `allowedCategoryIds` بـ `allowedGroupIds: z.array(z.string().trim().min(1).max(64)).max(10)` (في الإنشاء والتعديل).
- `routes/users.ts`:
  - `validCategoryIds` ← `validGroupIds` (يتحقق أن كل معرّف مجموعة موجود، ويزيل التكرار).
  - `categoriesByUser` ← `groupsByUser` (يقرأ `UserInventoryGroup`).
  - الإنشاء: `inventoryGroups: { create: ids.map(groupId => ({ groupId })) }` بدل `inventoryCategories`.
  - التعديل: نفس منطق الاستبدال داخل المعاملة (`deleteMany` ثم `createMany`)، ومسح الصفوف عند التحويل لدور غير مقيَّد، وعدم المساس بالمجموعات عند تعديل حقول أخرى (مغطى باختبار موجود يُحدَّث).
- `utils/serialize.ts`: `publicUser(u, allowedGroupIds?)` يعيد `allowedGroupIds` لتعبئة/مشغل بدل `allowedCategoryIds`.

### 3.3 الأنواع والواجهة — الأنواع

- `types/inventory.ts`: `InventoryCategory` يضيف `groupId: string | null` و`groupName: string | null`؛ نوع جديد `InventoryGroup { id, key, name, categoriesCount, itemsCount }`.
- `types/task.ts` و`types/user.ts`: `allowedCategoryIds` ← `allowedGroupIds` (في `TeamMember` و`ApiUser` و`CreateUserInput`).
- `services/inventoryService.ts`: `listGroups()` و`groupId` في `createCategory`/`updateCategory`.
- `services/usersService.ts`: تمرير `allowedGroupIds` في `toMember`.

### 3.4 الواجهة — الشاشات

1. **`components/users/UserModal.tsx`** (تعبئة/مشغل): استبدل قائمة التصنيفات بمربعي اختيار كبيرين:
   - ☐ **خامات** (يعرض تحتها عدد التصنيفات الفرعية وأسماءها مختصرة)
   - ☐ **اكسسوارات وهدايا**
   مع النص: «يصل المستخدم إلى كل التصنيفات الداخلة تحت المجموعة المختارة، ومنها ما يُضاف لاحقاً». وتبقى رسالة التحذير: «بدون مجموعات لن يستطيع السحب من أي صنف». المجموعات تُجلب بـ `inventoryService.listGroups()`.
2. **`pages/ManageUsers.tsx`**: الشارة بجانب الدور تعرض أسماء المجموعات («خامات»، «اكسسوارات وهدايا»، أو «الاثنتان») بدل «N تصنيف للسحب»؛ وتبقى «بلا مجموعات» بلون التحذير.
3. **نافذة إضافة/تعديل المنتج (الصورة المرفقة، حقل 4 «التصنيف»)**: القائمة المنسدلة تعرض التصنيفات **مجمّعة** تحت عنوان كل مجموعة (`<optgroup label="خامات">`…). زر «+» بجانبها (إضافة تصنيف سريعة) يفتح حواراً فيه: الاسم + **المجموعة الرئيسية (إلزامي)**. التصنيفات القديمة بلا مجموعة تظهر تحت «غير مصنّفة» مع تلميح.
4. **`components/inventory/CategoriesModal.tsx`**: اعرض التصنيفات مقسّمة حسب المجموعة، مع قسم «غير مصنّفة — لن تظهر لتعبئة/مشغل» بارز في الأعلى، وقائمة لنقل التصنيف بين المجموعتين، وتحذير في حوار الحذف/النقل عند اختلاف مجموعة التصنيف البديل.
5. **`pages/Withdrawals.tsx`** و**`pages/Inventory.tsx`**: فلتر التصنيف مجمّع بالمجموعات (`optgroup`)، واختيارياً فلتر سريع بالمجموعة. بقية الصفحة بلا تغيير. الحالة الفارغة لتعبئة/مشغل تبقى «لم تُمنح أي مجموعات/تصنيفات للسحب، تواصل مع الإدارة».

## 4. قرارات تحتاج جواب المستخدم (مع توصيتي)

1. **حذف `UserInventoryCategory`:** هل وُزِّعت التصنيفات على مستخدمين فعليين في الإنتاج؟ توصيتي: **احذف الجدول** (الميزة سُلِّمت للتو، والبديل ازدواجية صلاحيات). إن وُجدت صفوف مهمة فانقلها قبل الحذف: امنح المستخدم مجموعة كل تصنيف كان له إن كان مصنّفاً بالفعل، وإلا يعيد المدير اختيار المجموعات.
2. **توزيع التصنيفات الحالية:** من يحدد أي تصنيف قديم تحت «خامات» وأيه تحت «اكسسوارات وهدايا»؟ توصيتي: المدير من «إدارة التصنيفات» بعد النشر، والنظام يحجب غير المصنَّف عن تعبئة/مشغل إلى حينها. بديل: أرسل لي قائمة أسماء تصنيفاتك الحالية وأضمّن توزيعها في migration.
3. **عدد المجموعات:** «اكسسوارات وهدايا» مجموعة واحدة أم اثنتان؟ المعتمد هنا: واحدة. وهل يُسمح بإضافة مجموعة رئيسية ثالثة مستقبلاً من الواجهة؟ توصيتي: لا الآن (ثابتتان)، والنموذج يسمح بالإضافة لاحقاً بلا هجرة بنيوية.
4. **المصمم «السحب فقط»:** يبقى بلا قيد (كل التصنيفات) كما قررت سابقاً. أكّد أنه لا يُقيَّد بالمجموعات أيضاً.

## 5. ترتيب التنفيذ المقترح

1. تحقق من خط الأساس (القسم 8): `typecheck` و`npx vitest run` ← 307 ناجحة.
2. `schema.prisma` + migration `0013` + تحديث `seed.ts`.
3. الباكند: `inventoryAccess.ts` ← `inventorySerialize.ts` ← `validators/inventory.ts` (groupId للتصنيف) ← `routes/inventory.ts` ← `validators/users.ts` ← `routes/users.ts` ← `serialize.ts`.
4. اختبارات الباكند (القسم 6)؛ يجب أن تمر قبل الواجهة. حدّث `tests/access.test.ts` الذي يربط بـ `UserInventoryCategory` مباشرة، وأضف جدول `UserInventoryGroup` إلى أي `TRUNCATE` يدوي في `tests/helpers.ts` (الـ `CASCADE` من `User` يكفي عادةً، وتحقق).
5. الواجهة: الأنواع والخدمات ← `UserModal` و`ManageUsers` ← نافذة المنتج و`CategoriesModal` ← `Withdrawals` و`Inventory`.
6. `npm run build` + `npm run lint` + تجربة يدوية بحساب تعبئة (مجموعة واحدة) وحساب مشغل (الاثنتان).
7. حدّث `CHANGES.md` و`HANDOFF.md` و`README.md` (قسم الأدوار: التصنيفات صارت بالمجموعات) وعدد الاختبارات.
8. سلّم zip بعد كل مرحلة.

## 6. الاختبارات المطلوبة (vitest على PGlite)

- **الـ migration:** المجموعتان موجودتان بعد تطبيق كل المهاجرات (`key` فريد ولا تتكرران عند إعادة التطبيق).
- **تعبئة بمجموعة «خامات»:** ترى أصناف كل التصنيفات التابعة لـ«خامات» فقط ولا ترى «اكسسوارات وهدايا» ولا غير المصنَّف؛ تسحب من تصنيف داخل «خامات» ← 201 وخصم؛ صنف من المجموعة الأخرى ← 403 بلا خصم؛ طلب مختلط ← 403 وكل الأرصدة كما هي.
- **تصنيف جديد داخل مجموعة مسموحة:** يظهر ويُسحب منه فوراً دون تعديل المستخدم.
- **نقل تصنيف بين المجموعتين:** يختفي من المستخدم الأول ويظهر للثاني فوراً.
- **تصنيف بلا مجموعة (`groupId` null):** لا يصل إليه تعبئة ولا مشغل، ويصل إليه المصمم «السحب فقط/كامل» والإدارة.
- **مشغل بالمجموعتين:** يرى كل شيء مصنَّف. **صفر مجموعات:** قائمة فارغة وسحب مرفوض.
- **التغيير الفوري:** منح مجموعة أو سحبها ينعكس في الطلب التالي دون إعادة دخول.
- **المستخدمون:** إنشاء مشغل بمجموعة؛ تعديل المجموعات يستبدلها؛ معرّف مجموعة غير موجود ← 400 ولا يُنشأ المستخدم؛ تعديل حقل آخر لا يمس المجموعات؛ تحويل مشغل إلى مصمم يمسح المجموعات؛ حذف المستخدم يمسح صفوفه (cascade).
- **التصنيفات:** إنشاء تصنيف بلا `groupId` ← 400؛ بمجموعة غير موجودة ← 400؛ `PATCH` يغيّر المجموعة؛ `GET /groups` للإدارة فقط (تعبئة/مشغل ← 403 بحكم البوابة)؛ `DELETE` على مجموعة غير موجود كمسار.
- **لا انحدار:** كل الاختبارات الحالية (الإدارة والمصمم بمستوياته الثلاثة) تبقى خضراء.

## 7. ملاحظات وأخطار

- **حذف تصنيف مع نقل الأصناف** إلى تصنيف في مجموعة أخرى يغيّر من يستطيع السحب منها. حذّر في الواجهة، ولا تمنع.
- **سباق نقل التصنيف أثناء سحب جارٍ:** التحقق يتم داخل المعاملة بعد قفل صفوف الأصناف، لكن نقل التصنيف لا يقفل تلك الصفوف. أسوأ حالة: سحب واحد ينفَّذ بصلاحية اللحظة السابقة للنقل. مقبول وغير ضار؛ وثّقه ولا تعقّد الحل.
- **المسائل المفتوحة السابقة** (HANDOFF_ROLES القسم 7: تسرّب `GET /:id/movements` للمصمم «كامل»، انحراف `startOfTodayUtc`، فحص `requestId` قبل القفل، وثائق قديمة) **لم تُعالج ولا علاقة لها بهذا العمل**.
- لم يُتحقق قط من: `prisma migrate diff`، وPostgreSQL حقيقي، والتجربة في المتصفح بحسابات تعبئة/مشغل.

## 8. بيئة العمل والتحقق

- **نهايات الأسطر مختلطة ولا تُحوَّل.** CRLF: `schema.prisma`، `middleware/auth.ts`، `app.ts`، `routes/users.ts`، `validators/users.ts`، `utils/serialize.ts`، `tests/helpers.ts`، `lib/permissions.ts`، `Sidebar.tsx`، `UserModal.tsx`، `ManageUsers.tsx`، `usersService.ts`، `types/task.ts`، `types/user.ts`، وملفات `.md`. LF: `routes/inventory.ts`، `utils/inventorySerialize.ts`، `utils/inventoryAccess.ts`، `validators/inventory.ts`، `tests/inventory.test.ts`، `tests/access.test.ts`، `Withdrawals.tsx`، `Inventory.tsx`، `inventoryService.ts`، `App.tsx`، `PushBridge.tsx`. افحص كل ملف قبل تعديله (`'\r\n' in text`) وأعد الكتابة بنفس النهاية.
- **الأوامر:**
  - باكند: `npm ci` ← `npx prisma generate` ← `npm run typecheck` ← `npx vitest run` ← `npm run build`.
  - واجهة: `npm ci` ← `npm run build` ← `npm run lint` (المتوقع 0 أخطاء و15 تحذيراً قديماً).
- **بيئة معزولة فقط:** إن فشل `prisma generate` بسبب حجب `binaries.prisma.sh` استعمل `PRISMA_SCHEMA_ENGINE_BINARY=/bin/true npx prisma generate` (لا علاقة له بالمشروع أو بـ Render). المجلد `backend/src/generated` يُولَّد ولا يدخل الـ zip.
- **النشر (Render):** Build: `npm install --include=dev && npm run build`. Start: `npx prisma migrate deploy && npm start`. المهاجرة `0013` ستُطبَّق تلقائياً عند البدء. بعد أول نشر: وزّع التصنيفات القديمة على المجموعتين قبل أن يدخل أي مستخدم تعبئة/مشغل.

## 9. تعريف الإنجاز

- في «إدارة المستخدمين» أختار لتعبئة/مشغل «خامات» و/أو «اكسسوارات وهدايا» فقط، وتظهر الاختيارات عند إعادة فتح النافذة.
- المستخدم يرى ويسحب من **كل** التصنيفات تحت مجموعته، بما فيها التي تُضاف لاحقاً، ولا يرى شيئاً من المجموعة الأخرى ولا من التصنيفات غير المصنَّفة.
- أي سحب خارج مجموعته ← 403 من الـ API بلا تغيير في الرصيد (مثبت باختبار).
- نافذة إضافة المنتج تعرض التصنيفات مجمّعة تحت المجموعتين، وإنشاء تصنيف جديد يلزم باختيار المجموعة.
- لا أثر على الإدارة ولا على المصمم بمستوياته الثلاثة.
- كل الاختبارات القديمة والجديدة خضراء، وبناء الواجهة ينجح، والوثائق محدّثة.
