import { beforeAll, describe, expect, it } from "vitest";
import { api, login, makeUser, resetDb } from "./helpers.ts";

let admin: string, manager: string, designer: string;
let catId: string;

beforeAll(async () => {
  await resetDb();
  await makeUser("invdes");
  admin = await login("lol");
  manager = await login("amr");
  designer = await login("invdes");
  const cat = await api(manager).post("/api/inventory/categories").send({ name: "خشب" });
  expect(cat.status).toBe(201);
  catId = cat.body.category.id;
});

const mkItem = async (token: string, o: Record<string, unknown> = {}) => {
  const res = await api(token).post("/api/inventory").send({ name: "خشب MDF 3مم", unit: "لوح", categoryId: catId, ...o });
  expect(res.status).toBe(201);
  return res.body.item as { id: string; [k: string]: any };
};
const move = (token: string, id: string, type: string, quantity: number, note = "") =>
  api(token).post(`/api/inventory/${id}/movements`).send({ type, quantity, note });

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
    expect((await api(designer).delete(`/api/inventory/${item.id}`)).status).toBe(403);
  });
  it("الحذف النهائي للمدير العام فقط", async () => {
    const item = await mkItem(manager, { name: "للحذف" });
    expect((await api(manager).delete(`/api/inventory/${item.id}`)).status).toBe(403);
    expect((await api(admin).delete(`/api/inventory/${item.id}`)).status).toBe(200);
    expect((await api(admin).get(`/api/inventory/${item.id}/movements`)).status).toBe(404);
  });
});

describe("inventory: العناصر", () => {
  it("رصيد افتتاحي يُسجَّل كحركة إدخال", async () => {
    const item = await mkItem(manager, { name: "افتتاحي", initialQuantity: 10, minQuantity: 3 });
    expect(item.quantity).toBe(10);
    expect(item.isLow).toBe(false);
    const res = await api(manager).get(`/api/inventory/${item.id}/movements`);
    expect(res.body.movements).toHaveLength(1);
    expect(res.body.movements[0]).toMatchObject({ type: "IN", delta: 10, balanceAfter: 10 });
  });
  it("الكود فريد ← 409", async () => {
    await mkItem(manager, { name: "أ", sku: "SKU-1" });
    const dup = await api(manager).post("/api/inventory").send({ name: "ب", sku: "SKU-1" });
    expect(dup.status).toBe(409);
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
  it("lowOnly يعيد العناصر الناقصة فقط", async () => {
    const low = await mkItem(manager, { name: "ناقص", initialQuantity: 2, minQuantity: 5 });
    const ok = await mkItem(manager, { name: "كافٍ", initialQuantity: 50, minQuantity: 5 });
    const res = await api(manager).get("/api/inventory?lowOnly=true");
    const ids = res.body.items.map((i: any) => i.id);
    expect(ids).toContain(low.id);
    expect(ids).not.toContain(ok.id);
  });
});

describe("inventory: الحركات", () => {
  it("إدخال ثم إخراج يحدّثان الرصيد والسجل", async () => {
    const item = await mkItem(manager, { name: "حركات" });
    const a = await move(manager, item.id, "IN", 10, "شراء");
    expect(a.status).toBe(201);
    expect(a.body.item.quantity).toBe(10);
    const b = await move(manager, item.id, "OUT", 4.5, "استهلاك");
    expect(b.body.item.quantity).toBe(5.5);
    expect(b.body.movement).toMatchObject({ type: "OUT", delta: -4.5, balanceAfter: 5.5, note: "استهلاك" });
  });
  it("منع الرصيد السالب ← 409 دون تغيير الرصيد", async () => {
    const item = await mkItem(manager, { name: "سالب", initialQuantity: 3 });
    const res = await move(manager, item.id, "OUT", 3.001);
    expect(res.status).toBe(409);
    const list = await api(manager).get("/api/inventory");
    expect(list.body.items.find((i: any) => i.id === item.id).quantity).toBe(3);
  });
  it("الجرد يضبط الرصيد ويسجّل الفرق", async () => {
    const item = await mkItem(manager, { name: "جرد", initialQuantity: 10 });
    const res = await move(manager, item.id, "ADJUST", 7);
    expect(res.body.item.quantity).toBe(7);
    expect(res.body.movement).toMatchObject({ type: "ADJUST", delta: -3, balanceAfter: 7 });
    expect((await move(manager, item.id, "ADJUST", 0)).body.item.quantity).toBe(0);
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
  it("إنشاء تصنيف وقائمة؛ الاسم المكرر (بغض النظر عن الحالة) ← 409؛ المصمم ممنوع من الإنشاء", async () => {
    const a = await api(manager).post("/api/inventory/categories").send({ name: "  أكريليك  " });
    expect(a.status).toBe(201);
    expect(a.body.category.name).toBe("أكريليك");
    expect((await api(manager).post("/api/inventory/categories").send({ name: "أكريليك" })).status).toBe(409);
    expect((await api(designer).post("/api/inventory/categories").send({ name: "ممنوع" })).status).toBe(403);
    const list = await api(designer).get("/api/inventory/categories");
    expect(list.status).toBe(200);
    expect(list.body.categories.map((c: any) => c.name)).toContain("أكريليك");
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

const withdraw = (token: string, lines: { itemId: string; quantity: number }[], note = "") =>
  api(token).post("/api/inventory/withdrawals").send({ lines, note });

describe("inventory: السحب", () => {
  it("المصمم يسحب عدة أصناف في طلب واحد ويُخصم الرصيد", async () => {
    const a = await mkItem(manager, { name: "سحب أ", initialQuantity: 10 });
    const b = await mkItem(manager, { name: "سحب ب", initialQuantity: 4 });
    const res = await withdraw(designer, [{ itemId: a.id, quantity: 3 }, { itemId: b.id, quantity: 4 }], "مشروع لوحة");
    expect(res.status).toBe(201);
    expect(res.body.movements).toHaveLength(2);
    expect(new Set(res.body.movements.map((m: any) => m.batchId)).size).toBe(1);
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
});
