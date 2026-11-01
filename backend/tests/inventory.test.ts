import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db.ts";
import { api, login, makeUser, resetDb } from "./helpers.ts";

let admin: string, manager: string, designer: string;
let catId: string;

beforeAll(async () => {
  await resetDb();
  // المصممون الحاليون رُحِّلوا إلى «مخزون كامل» (migration 0012)، والجدد يبدأون بلا وصول
  await makeUser("invdes", "DESIGNER", { inventoryAccess: "FULL" });
  admin = await login("lol");
  manager = await login("amr");
  designer = await login("invdes");
  const cat = await api(manager).post("/api/inventory/categories").send({ name: "خشب", description: "ألواح وخامات خشبية" });
  expect(cat.status).toBe(201);
  catId = cat.body.category.id;
});

const mkItem = async (token: string, o: Record<string, unknown> = {}) => {
  const res = await api(token).post("/api/inventory").send({ name: "خشب MDF 3مم", unit: "لوح", categoryId: catId, ...o });
  expect(res.status).toBe(201);
  return res.body.item as { id: string; [k: string]: any };
};
const move = (token: string, id: string, type: string, quantity: number, note = "", extra: Record<string, unknown> = {}) =>
  api(token).post(`/api/inventory/${id}/movements`).send({ type, quantity, note, ...extra });

describe("inventory: الوصول", () => {
  it("بدون توكن ← 401", async () => {
    expect((await api().get("/api/inventory")).status).toBe(401);
  });
  it("المصمم يقرأ فقط ولا يكتب ← 403", async () => {
    const item = await mkItem(manager, { name: "وصول" });
    expect((await api(designer).get("/api/inventory")).status).toBe(200);
    expect((await api(designer).post("/api/inventory").send({ name: "x", categoryId: catId })).status).toBe(403);
    expect((await api(designer).patch(`/api/inventory/${item.id}`).send({ name: "y" })).status).toBe(403);
    expect((await move(designer, item.id, "IN", 1)).status).toBe(403);
    expect((await move(designer, item.id, "ADJUST", 5)).status).toBe(403);
    expect((await move(designer, item.id, "RETURN", 2)).status).toBe(403);
    expect((await api(designer).delete(`/api/inventory/${item.id}`)).status).toBe(403);
    expect((await api(designer).patch(`/api/inventory/categories/${catId}`).send({ name: "ممنوع" })).status).toBe(403);
    expect((await api(designer).delete(`/api/inventory/categories/${catId}`)).status).toBe(403);
  });
  it("الحذف النهائي للمدير العام فقط", async () => {
    const item = await mkItem(manager, { name: "للحذف" });
    expect((await api(manager).delete(`/api/inventory/${item.id}`)).status).toBe(403);
    expect((await api(admin).delete(`/api/inventory/${item.id}`)).status).toBe(200);
    expect((await api(admin).get(`/api/inventory/${item.id}/movements`)).status).toBe(404);
  });
});

describe("inventory: العناصر", () => {
  it("رصيد افتتاحي يُسجَّل كحركة إدخال ولا يتكرر عند تعديل المنتج", async () => {
    const item = await mkItem(manager, { name: "افتتاحي", initialQuantity: 10, minQuantity: 3, unitPrice: 50 });
    expect(item.quantity).toBe(10);
    expect(item.isLow).toBe(false);
    expect(item.status).toBe("AVAILABLE");
    await api(manager).patch(`/api/inventory/${item.id}`).send({ name: "افتتاحي معدل", notes: "ملاحظة" });
    const res = await api(manager).get(`/api/inventory/${item.id}/movements`);
    expect(res.body.movements).toHaveLength(1);
    expect(res.body.movements[0]).toMatchObject({ type: "IN", previousBalance: 0, delta: 10, balanceAfter: 10, unitPriceSnapshot: 50 });
  });
  it("الكود فريد ← 409، وتوليد الكود التلقائي يعمل، ولا يتغير الكود عند التعديل إلا بطلب المستخدم", async () => {
    await mkItem(manager, { name: "أ", sku: "SKU-1" });
    const dup = await api(manager).post("/api/inventory").send({ name: "ب", sku: "SKU-1", categoryId: catId });
    expect(dup.status).toBe(409);

    const nextSkuRes = await api(manager).get("/api/inventory/next-sku");
    expect(nextSkuRes.status).toBe(200);
    expect(nextSkuRes.body.sku).toMatch(/^INV-\d{4,}$/);

    const autoItem = await mkItem(manager, { name: "كود تلقائي", autoGenerateSku: true });
    expect(autoItem.sku).toMatch(/^INV-\d{4,}$/);

    const upd = await api(manager).patch(`/api/inventory/${autoItem.id}`).send({ name: "كود محفوظ" });
    expect(upd.body.item.sku).toBe(autoItem.sku);
  });
  it("الوحدات الافتراضية العشر متوفرة مع إمكانية إضافة وحدة مخصصة", async () => {
    await mkItem(manager, { name: "بوحدة خاصة", unit: "بكرة" });
    const res = await api(manager).get("/api/inventory/units");
    expect(res.status).toBe(200);
    for (const u of ["قطعة", "لوح", "متر", "متر مربع", "كيلو", "جرام", "لتر", "عبوة", "ربطة", "صندوق", "بكرة"]) {
      expect(res.body.units).toContain(u);
    }
  });
  it("PATCH لا يغيّر الرصيد ويقبل التعطيل؛ المعطّل مخفي من القائمة", async () => {
    const item = await mkItem(manager, { name: "تعطيل", initialQuantity: 5 });
    const res = await api(manager).patch(`/api/inventory/${item.id}`).send({ quantity: 999, isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.item.quantity).toBe(5);
    const list = await api(manager).get("/api/inventory");
    expect(list.body.items.find((i: any) => i.id === item.id)).toBeUndefined();
    const all = await api(manager).get("/api/inventory?includeInactive=true");
    expect(all.body.items.find((i: any) => i.id === item.id)).toBeTruthy();
    expect((await move(manager, item.id, "IN", 1)).status).toBe(400);
  });
  it("lowOnly وحالات المخزون (متوفر / منخفض عند التساوي مع الحد الأدنى / نافد عند الصفر)", async () => {
    const equalLow = await mkItem(manager, { name: "مساو للحد", initialQuantity: 10, minQuantity: 10 });
    const zeroOut = await mkItem(manager, { name: "نافد تماما", initialQuantity: 0, minQuantity: 5 });
    const ok = await mkItem(manager, { name: "كافٍ", initialQuantity: 50, minQuantity: 5 });

    expect(equalLow.status).toBe("LOW_STOCK");
    expect(equalLow.isLow).toBe(true);
    expect(equalLow.suggestedReorderQty).toBeGreaterThan(0);

    expect(zeroOut.status).toBe("OUT_OF_STOCK");
    expect(zeroOut.isOutOfStock).toBe(true);
    expect(zeroOut.isShortage).toBe(true);

    expect(ok.status).toBe("AVAILABLE");
    expect(ok.isLow).toBe(false);

    const res = await api(manager).get("/api/inventory?lowOnly=true");
    const ids = res.body.items.map((i: any) => i.id);
    expect(ids).toContain(equalLow.id);
    expect(ids).not.toContain(ok.id);
  });
});

describe("inventory: الأسعار والحسابات المالية واستقلال المخزون", () => {
  it("اختبار الحسابات القياسي (35×250=8750 ← سحب 5=7500 ← وارد 10=10000 ← جرد 37=9250)", async () => {
    const mdf = await mkItem(manager, { name: "خشب MDF حساب", initialQuantity: 35, unitPrice: 250, minQuantity: 5 });
    expect(mdf.quantity).toBe(35);
    expect(mdf.unitPrice).toBe(250);
    expect(mdf.totalValue).toBe(8750);

    const afterOut = await move(manager, mdf.id, "OUT", 5, "سحب 5");
    expect(afterOut.status).toBe(201);
    expect(afterOut.body.item.quantity).toBe(30);
    expect(afterOut.body.item.totalValue).toBe(7500);

    const afterIn = await move(manager, mdf.id, "IN", 10, "وارد 10");
    expect(afterIn.status).toBe(201);
    expect(afterIn.body.item.quantity).toBe(40);
    expect(afterIn.body.item.totalValue).toBe(10000);

    const afterAdjust = await move(manager, mdf.id, "ADJUST", 37, "تسوية جرد", { reason: "فرق فعلي" });
    expect(afterAdjust.status).toBe(201);
    expect(afterAdjust.body.item.quantity).toBe(37);
    expect(afterAdjust.body.item.totalValue).toBe(9250);
    expect(afterAdjust.body.movement).toMatchObject({
      type: "ADJUST",
      previousBalance: 40,
      delta: -3,
      balanceAfter: 37,
      unitPriceSnapshot: 250,
      reason: "فرق فعلي",
    });

    // تعديل سعر الوحدة يحدّث القيمة الحالية ولا يغيّر أسعار الحركات القديمة
    const priceChanged = await api(manager).patch(`/api/inventory/${mdf.id}`).send({ unitPrice: 300 });
    expect(priceChanged.body.item.totalValue).toBe(37 * 300);
    const movs = await api(manager).get(`/api/inventory/${mdf.id}/movements`);
    expect(movs.body.movements.every((m: any) => m.unitPriceSnapshot === 250)).toBe(true);
  });

  it("إجمالي قيمة المخزون = مجموع قيم المنتجات النشطة فقط (8750 + 500 + 1600 = 10850)", async () => {
    // نؤرشف العناصر السابقة لحساب المثال بدقة
    const prev = await api(manager).get("/api/inventory");
    for (const it of prev.body.items) {
      await api(manager).patch(`/api/inventory/${it.id}`).send({ isActive: false });
    }

    const p1 = await mkItem(manager, { name: "MDF", initialQuantity: 35, unitPrice: 250 });
    const p2 = await mkItem(manager, { name: "مفصلات", initialQuantity: 100, unitPrice: 5 });
    const p3 = await mkItem(manager, { name: "علب", initialQuantity: 20, unitPrice: 80 });
    expect(p1.totalValue).toBe(8750);
    expect(p2.totalValue).toBe(500);
    expect(p3.totalValue).toBe(1600);

    const list = await api(manager).get("/api/inventory");
    expect(list.body.stats).toMatchObject({
      totalItems: 3,
      totalQuantity: 155,
      totalValue: 10850,
    });
  });

  it("استقلال تام عن صفحة أسعار المنتجات (/api/products)", async () => {
    const prodBefore = await api(manager).get("/api/products");
    const prodCats = await api(manager).get("/api/products/categories");
    expect(prodBefore.status).toBe(200);
    expect(prodBefore.body.products).toHaveLength(0);
    expect(prodCats.body.categories).toHaveLength(0);
  });
});

describe("inventory: الحركات والجرد والمرتجعات والتنبيهات", () => {
  it("إدخال ثم إخراج يحدّثان الرصيد والسجل", async () => {
    const item = await mkItem(manager, { name: "حركات" });
    const a = await move(manager, item.id, "IN", 10, "شراء");
    expect(a.status).toBe(201);
    expect(a.body.item.quantity).toBe(10);
    const b = await move(manager, item.id, "OUT", 4.5, "استهلاك");
    expect(b.body.item.quantity).toBe(5.5);
    expect(b.body.movement).toMatchObject({ type: "OUT", previousBalance: 10, delta: -4.5, balanceAfter: 5.5, note: "استهلاك" });
  });
  it("منع الرصيد السالب ← 409 دون تغيير الرصيد", async () => {
    const item = await mkItem(manager, { name: "سالب", initialQuantity: 3 });
    const res = await move(manager, item.id, "OUT", 3.001);
    expect(res.status).toBe(409);
    const list = await api(manager).get("/api/inventory");
    expect(list.body.items.find((i: any) => i.id === item.id).quantity).toBe(3);
  });
  it("الجرد يضبط الرصيد (مثال 50 → 45 فرق -5) ويسجّل الرصيد السابق والفرق والسبب", async () => {
    const item = await mkItem(manager, { name: "جرد 50", initialQuantity: 50 });
    const res = await move(manager, item.id, "ADJUST", 45, "جرد دوري", { reason: "كسر بالمخزن" });
    expect(res.body.item.quantity).toBe(45);
    expect(res.body.movement).toMatchObject({
      type: "ADJUST",
      previousBalance: 50,
      delta: -5,
      balanceAfter: 45,
      reason: "كسر بالمخزن",
      note: "جرد دوري",
    });
    expect((await move(manager, item.id, "ADJUST", 0)).body.item.quantity).toBe(0);
  });
  it("المرتجعات: تضيف الكمية للمخزون وتنشئ حركة RETURN وترفض الصفر أو السالب", async () => {
    const item = await mkItem(manager, { name: "مرتجع خشب", initialQuantity: 10, unitPrice: 100 });
    expect((await move(manager, item.id, "RETURN", 0)).status).toBe(400);
    expect((await move(manager, item.id, "RETURN", -3)).status).toBe(400);

    const ret = await move(manager, item.id, "RETURN", 4, "فائض من الورشة", {
      reason: "عدم استخدام",
      referenceId: "BATCH-123",
    });
    expect(ret.status).toBe(201);
    expect(ret.body.item.quantity).toBe(14);
    expect(ret.body.item.totalValue).toBe(1400);
    expect(ret.body.movement).toMatchObject({
      type: "RETURN",
      previousBalance: 10,
      delta: 4,
      balanceAfter: 14,
      reason: "عدم استخدام",
      referenceId: "BATCH-123",
      note: "فائض من الورشة",
    });
  });
  it("إشعار داخل الموقع عند وصول المنتج للحد الأدنى دون تكرار مزعج", async () => {
    await prisma().notification.deleteMany({ where: { type: "INVENTORY_LOW" } });
    const item = await mkItem(manager, { name: "عنصر تنبيه", initialQuantity: 15, minQuantity: 10 });
    expect(await prisma().notification.count({ where: { type: "INVENTORY_LOW" } })).toBe(0);

    // سحب 5 ليصل إلى 10 (= الحد الأدنى) ← يرسل إشعاراً للإدارة
    await move(manager, item.id, "OUT", 5);
    const countAfterFirstLow = await prisma().notification.count({ where: { type: "INVENTORY_LOW" } });
    expect(countAfterFirstLow).toBeGreaterThan(0);

    // تحديث الصفحة (GET) أو سحب إضافي وهو أصلاً تحت الحد الأدنى لا يكرر الإشعار
    await api(manager).get("/api/inventory");
    await move(manager, item.id, "OUT", 2);
    expect(await prisma().notification.count({ where: { type: "INVENTORY_LOW" } })).toBe(countAfterFirstLow);

    // تزويد فوق الحد الأدنى (مرتجع 10 → الرصيد 18) يعيد تفعيل التنبيه عند الانخفاض مستقبلاً
    await move(manager, item.id, "RETURN", 10, "", { reason: "تزويد" });
    await move(manager, item.id, "OUT", 9); // الرصيد 9 <= 10
    expect(await prisma().notification.count({ where: { type: "INVENTORY_LOW" } })).toBe(countAfterFirstLow * 2);
  });
  it("تحقق المدخلات: كمية صفر/سالبة/نوع خاطئ ← 400", async () => {
    const item = await mkItem(manager, { name: "تحقق" });
    expect((await move(manager, item.id, "IN", 0)).status).toBe(400);
    expect((await move(manager, item.id, "OUT", -1)).status).toBe(400);
    expect((await move(manager, item.id, "BAD", 1)).status).toBe(400);
  });
  it("عنصر غير موجود ← 404", async () => {
    expect((await move(manager, "nope", "IN", 1)).status).toBe(404);
  });
  it("إخراجات متزامنة لا تُنزل الرصيد تحت الصفر ولا يضيع منها شيء", async () => {
    const item = await mkItem(manager, { name: "تزامن", initialQuantity: 5 });
    const results = await Promise.all(Array.from({ length: 10 }, () => move(manager, item.id, "OUT", 1)));
    const ok = results.filter((r) => r.status === 201).length;
    const failed = results.filter((r) => r.status === 409).length;
    expect(ok).toBe(5);
    expect(failed).toBe(5);
    const list = await api(manager).get("/api/inventory");
    expect(list.body.items.find((i: any) => i.id === item.id).quantity).toBe(0);
    const log = await api(manager).get(`/api/inventory/${item.id}/movements`);
    expect(log.body.movements).toHaveLength(6); // افتتاحي + 5 إخراجات
  });
});

const IMG = (n: number) => ({ id: `img-${n}`, name: `صورة${n}.png`, dataUrl: "data:image/png;base64,iVBORw0KGgo=" });

describe("inventory: التصنيفات والصور", () => {
  it("إنشاء وتعديل وبحث تصنيف؛ الاسم المكرر ← 409؛ وحذف آمن مع نقل المنتجات", async () => {
    const a = await api(manager).post("/api/inventory/categories").send({ name: "  أكريليك  ", description: "ألواح أكريليك" });
    expect(a.status).toBe(201);
    expect(a.body.category).toMatchObject({ name: "أكريليك", description: "ألواح أكريليك", itemsCount: 0 });
    expect((await api(manager).post("/api/inventory/categories").send({ name: "أكريليك" })).status).toBe(409);
    expect((await api(designer).post("/api/inventory/categories").send({ name: "ممنوع" })).status).toBe(403);

    // تعديل الاسم والوصف
    const patched = await api(manager)
      .patch(`/api/inventory/categories/${a.body.category.id}`)
      .send({ name: "أكريليك شفاف", description: "وصف محدث" });
    expect(patched.status).toBe(200);
    expect(patched.body.category).toMatchObject({ name: "أكريليك شفاف", description: "وصف محدث" });

    // البحث عن تصنيف
    const searchRes = await api(designer).get("/api/inventory/categories?q=شفاف");
    expect(searchRes.status).toBe(200);
    expect(searchRes.body.categories.map((c: any) => c.id)).toContain(a.body.category.id);

    // إضافة منتج للتصنيف يمنع الحذف المباشر (409) ويسمح بالحذف مع نقل المنتجات لتصنيف آخر
    const itemInCat = await mkItem(manager, { name: "لوح أكريليك", categoryId: a.body.category.id });
    const delBlocked = await api(manager).delete(`/api/inventory/categories/${a.body.category.id}`);
    expect(delBlocked.status).toBe(409);

    const delSafe = await api(manager)
      .delete(`/api/inventory/categories/${a.body.category.id}`)
      .send({ reassignToCategoryId: catId });
    expect(delSafe.status).toBe(200);
    expect(delSafe.body.movedItems).toBe(1);

    const movedItem = await api(manager).get(`/api/inventory/${itemInCat.id}`);
    expect(movedItem.body.item.categoryId).toBe(catId);
  });
  it("التصنيف مطلوب وموجود", async () => {
    expect((await api(manager).post("/api/inventory").send({ name: "بلا تصنيف" })).status).toBe(400);
    expect((await api(manager).post("/api/inventory").send({ name: "تصنيف وهمي", categoryId: "nope" })).status).toBe(400);
  });
  it("العنصر يحمل اسم تصنيفه ويمكن تغييره والفلترة به", async () => {
    const other = (await api(manager).post("/api/inventory/categories").send({ name: "جلد" })).body.category;
    const item = await mkItem(manager, { name: "قطعة جلد" });
    expect(item.categoryName).toBe("خشب");
    const upd = await api(manager).patch(`/api/inventory/${item.id}`).send({ categoryId: other.id });
    expect(upd.body.item.categoryName).toBe("جلد");
    const filtered = await api(manager).get(`/api/inventory?categoryId=${other.id}`);
    expect(filtered.body.items.map((i: any) => i.id)).toContain(item.id);
    expect(filtered.body.items.every((i: any) => i.categoryId === other.id)).toBe(true);
  });
  it("عدة صور للعنصر الواحد: إنشاء وتعديل وإزالة", async () => {
    const item = await mkItem(manager, { name: "بصور", attachments: [IMG(1), IMG(2), IMG(3)] });
    expect(item.attachments).toHaveLength(3);
    const two = await api(manager).patch(`/api/inventory/${item.id}`).send({ attachments: [IMG(1), IMG(4)] });
    expect(two.body.item.attachments.map((a: any) => a.id)).toEqual(["img-1", "img-4"]);
    const none = await api(manager).patch(`/api/inventory/${item.id}`).send({ attachments: [] });
    expect(none.body.item.attachments).toHaveLength(0);
  });
  it("أكثر من 10 صور ← 400", async () => {
    const res = await api(manager).post("/api/inventory").send({ name: "كثير", categoryId: catId, attachments: Array.from({ length: 11 }, (_, i) => IMG(i)) });
    expect(res.status).toBe(400);
  });
});

const withdraw = (token: string, lines: { itemId: string; quantity: number }[], note = "", requestId?: string) =>
  api(token).post("/api/inventory/withdrawals").send({ lines, note, ...(requestId ? { requestId } : {}) });

describe("inventory: السحب والتقارير", () => {
  it("المصمم يسحب عدة أصناف في طلب واحد ويُخصم الرصيد مع منع تكرار نفس requestId", async () => {
    const a = await mkItem(manager, { name: "سحب أ", initialQuantity: 10 });
    const b = await mkItem(manager, { name: "سحب ب", initialQuantity: 4 });
    const res = await withdraw(designer, [{ itemId: a.id, quantity: 3 }, { itemId: b.id, quantity: 4 }], "مشروع لوحة", "req-unique-1");
    expect(res.status).toBe(201);
    expect(res.body.movements).toHaveLength(2);
    expect(new Set(res.body.movements.map((m: any) => m.batchId)).size).toBe(1);

    // إعادة إرسال نفس العملية بنفس requestId تمنع التكرار (409)
    const dupReq = await withdraw(designer, [{ itemId: a.id, quantity: 1 }], "مكرر", "req-unique-1");
    expect(dupReq.status).toBe(409);

    const list = await api(designer).get("/api/inventory");
    expect(list.body.items.find((i: any) => i.id === a.id).quantity).toBe(7);
    expect(list.body.items.find((i: any) => i.id === b.id).quantity).toBe(0);
  });
  it("الكل أو لا شيء: رصيد ناقص في صنف يلغي الطلب كله ← 409", async () => {
    const a = await mkItem(manager, { name: "ذرّي أ", initialQuantity: 10 });
    const b = await mkItem(manager, { name: "ذرّي ب", initialQuantity: 1 });
    const res = await withdraw(designer, [{ itemId: a.id, quantity: 5 }, { itemId: b.id, quantity: 2 }]);
    expect(res.status).toBe(409);
    const list = await api(designer).get("/api/inventory");
    expect(list.body.items.find((i: any) => i.id === a.id).quantity).toBe(10);
  });
  it("تكرار الصنف تُجمع كمياته", async () => {
    const a = await mkItem(manager, { name: "تكرار", initialQuantity: 5 });
    expect((await withdraw(designer, [{ itemId: a.id, quantity: 2 }, { itemId: a.id, quantity: 4 }])).status).toBe(409);
    const ok = await withdraw(designer, [{ itemId: a.id, quantity: 2 }, { itemId: a.id, quantity: 3 }]);
    expect(ok.status).toBe(201);
    expect(ok.body.movements).toHaveLength(1);
    expect(ok.body.movements[0].delta).toBe(-5);
  });
  it("تحقق: بدون أصناف / كمية صفر / صنف غير موجود / معطّل", async () => {
    const a = await mkItem(manager, { name: "تحقق سحب", initialQuantity: 5 });
    expect((await withdraw(designer, [])).status).toBe(400);
    expect((await withdraw(designer, [{ itemId: a.id, quantity: 0 }])).status).toBe(400);
    expect((await withdraw(designer, [{ itemId: "nope", quantity: 1 }])).status).toBe(404);
    await api(manager).patch(`/api/inventory/${a.id}`).send({ isActive: false });
    expect((await withdraw(designer, [{ itemId: a.id, quantity: 1 }])).status).toBe(400);
  });
  it("بدون توكن ← 401", async () => {
    expect((await withdraw("", [{ itemId: "x", quantity: 1 }])).status).toBe(401);
  });
  it("سجل السحوبات: المصمم يرى سحوباته فقط والإدارة ترى الكل", async () => {
    const a = await mkItem(manager, { name: "سجل سحب", initialQuantity: 10 });
    await withdraw(manager, [{ itemId: a.id, quantity: 1 }], "المدير");
    await withdraw(designer, [{ itemId: a.id, quantity: 2 }], "المصمم");
    const mine = await api(designer).get("/api/inventory/withdrawals");
    expect(mine.status).toBe(200);
    expect(mine.body.movements.every((m: any) => m.createdByName === "invdes")).toBe(true);
    expect(mine.body.movements.some((m: any) => m.note === "المصمم")).toBe(true);
    const all = await api(manager).get("/api/inventory/withdrawals");
    const notes = all.body.movements.map((m: any) => m.note);
    expect(notes).toContain("المدير");
    expect(notes).toContain("المصمم");
  });
  it("سحبان متزامنان على نفس الصنف لا يتجاوزان الرصيد", async () => {
    const a = await mkItem(manager, { name: "تزامن سحب", initialQuantity: 5 });
    const rs = await Promise.all(Array.from({ length: 8 }, () => withdraw(designer, [{ itemId: a.id, quantity: 2 }])));
    expect(rs.filter((r) => r.status === 201)).toHaveLength(2);
    const list = await api(designer).get("/api/inventory");
    expect(list.body.items.find((i: any) => i.id === a.id).quantity).toBe(1);
  });
  it("استعلام حركات التقارير يدعم الفلترة بالنوع والمنتج والتصنيف والتاريخ", async () => {
    const a = await mkItem(manager, { name: "تقرير فلتر", initialQuantity: 20, unitPrice: 50 });
    await move(manager, a.id, "ADJUST", 18, "جرد تقرير", { reason: "فحص" });
    const res = await api(manager).get(`/api/inventory/movements?type=ADJUST&itemId=${a.id}`);
    expect(res.status).toBe(200);
    expect(res.body.movements).toHaveLength(1);
    expect(res.body.movements[0]).toMatchObject({ itemId: a.id, type: "ADJUST", previousBalance: 20, delta: -2, balanceAfter: 18 });
  });
});
