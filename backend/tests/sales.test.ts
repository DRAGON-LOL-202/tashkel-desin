import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db.ts";
import { api, GROUP_ACCESSORIES, login, makeUser, resetDb } from "./helpers.ts";

let admin: string, manager: string, designer: string;
let catId: string;
let watch: { id: string }, perfume: { id: string }, rose: { id: string };
let bigBox: { id: string };

const qty = async (id: string) => Number((await prisma().inventoryItem.findUniqueOrThrow({ where: { id } })).quantity);
const mkItem = async (o: Record<string, unknown>) => {
  const r = await api(admin).post("/api/inventory").send({ unit: "قطعة", categoryId: catId, ...o });
  expect(r.status).toBe(201);
  return r.body.item as { id: string };
};
const mkOrder = async (o: Record<string, unknown> = {}) => {
  const r = await api(manager).post("/api/sales/orders").send({ date: "2026-11-01", lines: [{ productId: bigBox.id, quantity: 1 }], ...o });
  expect(r.status).toBe(201);
  return r.body.order as any;
};
const setStatus = (id: string, status: string) => api(manager).patch(`/api/sales/orders/${id}`).send({ status });

beforeAll(async () => {
  await resetDb();
  await makeUser("salesdes", "DESIGNER", { inventoryAccess: "FULL" });
  admin = await login("lol");
  manager = await login("amr");
  designer = await login("salesdes");
  const cat = await api(admin).post("/api/inventory/categories").send({ name: "هدايا", groupId: GROUP_ACCESSORIES });
  catId = cat.body.category.id;
  watch = await mkItem({ name: "ساعة", initialQuantity: 10, unitPrice: 100, sellPrice: 180, minQuantity: 2 });
  perfume = await mkItem({ name: "عطر", initialQuantity: 10, unitPrice: 50, sellPrice: 90 });
  rose = await mkItem({ name: "وردة", initialQuantity: 20, unitPrice: 5, sellPrice: 12 });
  const p = await api(manager)
    .post("/api/sales/products")
    .send({ name: "بوكس كبير", components: [{ itemId: watch.id, quantity: 1 }, { itemId: perfume.id, quantity: 1 }, { itemId: rose.id, quantity: 2 }] });
  expect(p.status).toBe(201);
  bigBox = p.body.product;
});

describe("sales: الوصول", () => {
  it("بدون توكن ← 401، والمصمم ← 403 لكل المسارات", async () => {
    expect((await api().get("/api/sales/orders?date=2026-11-01")).status).toBe(401);
    expect((await api(designer).get("/api/sales/orders?date=2026-11-01")).status).toBe(403);
    expect((await api(designer).get("/api/sales/products")).status).toBe(403);
    expect((await api(designer).post("/api/sales/orders").send({})).status).toBe(403);
  });
  it("المدير والمدير العام يصلان", async () => {
    expect((await api(manager).get("/api/sales/products")).status).toBe(200);
    expect((await api(admin).get("/api/sales/orders?date=2026-11-01")).status).toBe(200);
  });
});

describe("sales: المنتجات الثابتة", () => {
  it("التكلفة وسعر البيع يُحسبان من المخزون: 100+50+2×5=160 و180+90+2×12=294", () => {
    expect((bigBox as any).costPerUnit).toBe(160);
    expect((bigBox as any).sellPerUnit).toBe(294);
    expect((bigBox as any).components).toHaveLength(3);
  });
  it("اسم مكرر ← 409، مكوّن غير موجود ← 400، بلا مكونات ← 400، كمية صفر ← 400", async () => {
    expect((await api(manager).post("/api/sales/products").send({ name: "بوكس كبير", components: [{ itemId: rose.id, quantity: 1 }] })).status).toBe(409);
    expect((await api(manager).post("/api/sales/products").send({ name: "س", components: [{ itemId: "nope", quantity: 1 }] })).status).toBe(400);
    expect((await api(manager).post("/api/sales/products").send({ name: "ص", components: [] })).status).toBe(400);
    expect((await api(manager).post("/api/sales/products").send({ name: "ع", components: [{ itemId: rose.id, quantity: 0 }] })).status).toBe(400);
  });
  it("تكرار نفس المكوّن يُجمع، والتعديل يستبدل المحتويات", async () => {
    const c = await api(manager).post("/api/sales/products").send({ name: "صغير", components: [{ itemId: rose.id, quantity: 1 }, { itemId: rose.id, quantity: 2 }] });
    expect(c.status).toBe(201);
    expect(c.body.product.components).toHaveLength(1);
    expect(c.body.product.components[0].quantity).toBe(3);
    const u = await api(manager).patch(`/api/sales/products/${c.body.product.id}`).send({ components: [{ itemId: perfume.id, quantity: 1 }] });
    expect(u.body.product.components[0].itemName).toBe("عطر");
    expect((await api(manager).delete(`/api/sales/products/${c.body.product.id}`)).status).toBe(200);
  });
});

describe("sales: الأوردرات والخصم من المخزون", () => {
  it("إنشاء أوردر ينسخ المحتويات ويحسب السعرين ولا يخصم شيئاً وهو «مسجل»", async () => {
    const o = await mkOrder({ waybill: "W-100", closerName: "أحمد", lines: [{ productId: bigBox.id, quantity: 2 }] });
    expect(o.status).toBe("REGISTERED");
    expect(o.stockDeducted).toBe(false);
    expect(o.costTotal).toBe(320);
    expect(o.sellTotal).toBe(588);
    expect(o.profit).toBe(268);
    expect(o.lines[0].components).toHaveLength(3);
    expect(await qty(watch.id)).toBe(10);
  });

  it("تم التنفيذ يخصم مرة واحدة فقط (تكرار الحالة أو الانتقال للشحن لا يخصم ثانية)", async () => {
    const o = await mkOrder({ waybill: "W-101", lines: [{ productId: bigBox.id, quantity: 2 }] });
    const before = { w: await qty(watch.id), p: await qty(perfume.id), r: await qty(rose.id) };
    const ex = await setStatus(o.id, "EXECUTED");
    expect(ex.status).toBe(200);
    expect(ex.body.order.stockDeducted).toBe(true);
    expect(await qty(watch.id)).toBe(before.w - 2);
    expect(await qty(perfume.id)).toBe(before.p - 2);
    expect(await qty(rose.id)).toBe(before.r - 4);
    await setStatus(o.id, "EXECUTED");
    await setStatus(o.id, "SHIPPED");
    await setStatus(o.id, "DELIVERED");
    expect(await qty(watch.id)).toBe(before.w - 2);
    const mv = await prisma().inventoryMovement.findMany({ where: { referenceId: `sales:${o.id}` } });
    expect(mv).toHaveLength(3);
    expect(mv.every((m) => m.type === "OUT" && m.reason.includes("W-101"))).toBe(true);
  });

  it("المرتجع يعيد الكميات بحركة RETURN، وإعادة التنفيذ تخصم من جديد", async () => {
    const o = await mkOrder({ waybill: "W-102" });
    const w0 = await qty(watch.id);
    await setStatus(o.id, "EXECUTED");
    expect(await qty(watch.id)).toBe(w0 - 1);
    const ret = await setStatus(o.id, "RETURNED");
    expect(ret.body.order.stockDeducted).toBe(false);
    expect(await qty(watch.id)).toBe(w0);
    const types = (await prisma().inventoryMovement.findMany({ where: { referenceId: `sales:${o.id}`, itemId: watch.id }, orderBy: { createdAt: "asc" } })).map((m) => m.type);
    expect(types).toEqual(["OUT", "RETURN"]);
    await setStatus(o.id, "EXECUTED");
    expect(await qty(watch.id)).toBe(w0 - 1);
    await setStatus(o.id, "REGISTERED"); // رجوع للمسجل يعيدها أيضاً
    expect(await qty(watch.id)).toBe(w0);
  });

  it("مرتجع بتالف: التالف لا يعود للمخزون ويُحسب تكلفته، والباقي يعود، والخروج من «مرتجع» يمسح العلامة", async () => {
    const o = await mkOrder({ waybill: "W-DMG" });
    const w0 = await qty(watch.id);
    const p0 = await qty(perfume.id);
    const r0 = await qty(rose.id);
    await setStatus(o.id, "EXECUTED");
    const comps = o.lines[0].components as { id: string; itemName: string }[];
    const watchComp = comps.find((c) => c.itemName === "ساعة")!;
    const roseComp = comps.find((c) => c.itemName === "وردة")!;

    // لا يصح تحديد تالف مع حالة غير «مرتجع»، ولا مكوّن غريب
    expect((await api(manager).patch(`/api/sales/orders/${o.id}`).send({ status: "SHIPPED", damagedComponentIds: [watchComp.id] })).status).toBe(400);
    expect((await api(manager).patch(`/api/sales/orders/${o.id}`).send({ status: "RETURNED", damagedComponentIds: ["nope"] })).status).toBe(400);

    const ret = await api(manager).patch(`/api/sales/orders/${o.id}`).send({ status: "RETURNED", damagedComponentIds: [watchComp.id, roseComp.id] });
    expect(ret.status).toBe(200);
    expect(ret.body.order.stockDeducted).toBe(false);
    // تالف: ساعة (100) + وردتان (2×5) = 110
    expect(ret.body.order.damagedTotal).toBe(110);
    expect(ret.body.order.lines[0].components.filter((c: any) => c.damaged).map((c: any) => c.itemName).sort()).toEqual(["ساعة", "وردة"]);
    // الساعة والوردة لا تعودان، والعطر وحده يعود
    expect(await qty(watch.id)).toBe(w0 - 1);
    expect(await qty(rose.id)).toBe(r0 - 2);
    expect(await qty(perfume.id)).toBe(p0);
    const rets = await prisma().inventoryMovement.findMany({ where: { referenceId: `sales:${o.id}`, type: "RETURN" } });
    expect(rets.map((m) => m.itemId)).toEqual([perfume.id]);

    // الخروج من «مرتجع» يمسح علامات التالف
    const again = await setStatus(o.id, "REGISTERED");
    expect(again.body.order.damagedTotal).toBe(0);
    expect(again.body.order.lines[0].components.some((c: any) => c.damaged)).toBe(false);
  });

  it("تحديد تالف على أوردر «مسجل» لم يُخصم ← 400", async () => {
    const o = await mkOrder();
    const comp = o.lines[0].components[0];
    expect((await api(manager).patch(`/api/sales/orders/${o.id}`).send({ status: "RETURNED", damagedComponentIds: [comp.id] })).status).toBe(400);
  });

  it("الرصيد غير الكافي يرفض التنفيذ كله بلا خصم جزئي (409)", async () => {
    const scarce = await mkItem({ name: "نادر", initialQuantity: 1, unitPrice: 10, sellPrice: 20 });
    const p = await api(manager).post("/api/sales/products").send({ name: "بوكس نادر", components: [{ itemId: rose.id, quantity: 1 }, { itemId: scarce.id, quantity: 2 }] });
    const o = await mkOrder({ lines: [{ productId: p.body.product.id, quantity: 1 }] });
    expect(o.shortages).toHaveLength(1);
    expect(o.shortages[0].itemName).toBe("نادر");
    const r0 = await qty(rose.id);
    const res = await setStatus(o.id, "EXECUTED");
    expect(res.status).toBe(409);
    expect(res.body.error).toContain("نادر");
    expect(await qty(rose.id)).toBe(r0);
    expect(await qty(scarce.id)).toBe(1);
    const still = await api(manager).get("/api/sales/orders?date=2026-11-01");
    expect(still.body.orders.find((x: any) => x.id === o.id).status).toBe("REGISTERED");
  });

  it("تنفيذان متزامنان لنفس الأوردر يخصمان مرة واحدة", async () => {
    const o = await mkOrder({ waybill: "W-103" });
    const w0 = await qty(watch.id);
    const rs = await Promise.all([setStatus(o.id, "EXECUTED"), setStatus(o.id, "EXECUTED"), setStatus(o.id, "SHIPPED")]);
    expect(rs.every((r) => r.status === 200)).toBe(true);
    expect(await qty(watch.id)).toBe(w0 - 1);
  });

  it("الأسعار تُثبَّت عند التنفيذ ولا تتأثر بتغيير أسعار المخزون لاحقاً، وقبله تتبع المخزون", async () => {
    const o = await mkOrder({ waybill: "W-104" });
    expect(o.sellTotal).toBe(294);
    await api(admin).patch(`/api/inventory/${watch.id}`).send({ sellPrice: 200 });
    let cur = (await api(manager).get("/api/sales/orders?date=2026-11-01")).body.orders.find((x: any) => x.id === o.id);
    expect(cur.sellTotal).toBe(314); // حيّ قبل التنفيذ
    await setStatus(o.id, "EXECUTED");
    await api(admin).patch(`/api/inventory/${watch.id}`).send({ sellPrice: 500, unitPrice: 300 });
    cur = (await api(manager).get("/api/sales/orders?date=2026-11-01")).body.orders.find((x: any) => x.id === o.id);
    expect(cur.sellTotal).toBe(314);
    expect(cur.costTotal).toBe(160);
    await api(admin).patch(`/api/inventory/${watch.id}`).send({ sellPrice: 180, unitPrice: 100 });
  });

  it("تعديل المنتج الثابت لا يغيّر أوردراً سابقاً (المحتويات منسوخة)", async () => {
    const p = await api(manager).post("/api/sales/products").send({ name: "قابل للتعديل", components: [{ itemId: rose.id, quantity: 1 }] });
    const o = await mkOrder({ lines: [{ productId: p.body.product.id, quantity: 1 }] });
    await api(manager).patch(`/api/sales/products/${p.body.product.id}`).send({ components: [{ itemId: watch.id, quantity: 5 }] });
    const cur = (await api(manager).get("/api/sales/orders?date=2026-11-01")).body.orders.find((x: any) => x.id === o.id);
    expect(cur.lines[0].components.map((c: any) => c.itemName)).toEqual(["وردة"]);
    await api(manager).delete(`/api/sales/products/${p.body.product.id}`);
    const after = (await api(manager).get("/api/sales/orders?date=2026-11-01")).body.orders.find((x: any) => x.id === o.id);
    expect(after.lines[0].productName).toBe("قابل للتعديل");
    expect(after.lines[0].productId).toBeNull();
  });

  it("رقم بوليصة مكرر ← 409 (بلا حساسية لحالة الأحرف)، والفارغ مسموح مكرراً", async () => {
    await mkOrder({ waybill: "DUP-1" });
    expect((await api(manager).post("/api/sales/orders").send({ date: "2026-11-01", waybill: "dup-1", lines: [{ productId: bigBox.id }] })).status).toBe(409);
    await mkOrder({});
    await mkOrder({});
    const o = await mkOrder({ waybill: "DUP-2" });
    expect((await api(manager).patch(`/api/sales/orders/${o.id}`).send({ waybill: "DUP-1" })).status).toBe(409);
    expect((await api(manager).patch(`/api/sales/orders/${o.id}`).send({ waybill: "DUP-2", closerName: "سارة" })).status).toBe(200);
  });

  it("تعديل البنود قبل التنفيذ فقط", async () => {
    const o = await mkOrder({ waybill: "W-105" });
    const add = await api(manager).post(`/api/sales/orders/${o.id}/lines`).send({ productId: bigBox.id, quantity: 2 });
    expect(add.status).toBe(201);
    expect(add.body.order.lines).toHaveLength(1); // نفس المنتج يزيد العدد
    expect(add.body.order.lines[0].quantity).toBe(3);
    const lineId = add.body.order.lines[0].id;
    const upd = await api(manager).patch(`/api/sales/orders/${o.id}/lines/${lineId}`).send({ quantity: 5 });
    expect(upd.body.order.costTotal).toBe(800);
    expect((await api(manager).delete(`/api/sales/orders/${o.id}/lines/${lineId}`)).status).toBe(400); // آخر بند
    await setStatus(o.id, "EXECUTED");
    expect((await api(manager).patch(`/api/sales/orders/${o.id}/lines/${lineId}`).send({ quantity: 1 })).status).toBe(409);
    expect((await api(manager).post(`/api/sales/orders/${o.id}/lines`).send({ productId: bigBox.id })).status).toBe(409);
    await setStatus(o.id, "REGISTERED");
    expect((await api(manager).patch(`/api/sales/orders/${o.id}/lines/${lineId}`).send({ quantity: 1 })).status).toBe(200);
  });

  it("حذف أوردر منفّذ يعيد المخزون، وحذف المسجل لا يمسه", async () => {
    const a = await mkOrder({ waybill: "W-106" });
    const w0 = await qty(watch.id);
    await setStatus(a.id, "SHIPPED");
    expect(await qty(watch.id)).toBe(w0 - 1);
    expect((await api(manager).delete(`/api/sales/orders/${a.id}`)).status).toBe(200);
    expect(await qty(watch.id)).toBe(w0);
    const b = await mkOrder({ waybill: "W-107" });
    expect((await api(manager).delete(`/api/sales/orders/${b.id}`)).status).toBe(200);
    expect(await qty(watch.id)).toBe(w0);
    expect((await api(manager).delete(`/api/sales/orders/${b.id}`)).status).toBe(404);
  });

  it("حذف صنف مخزون داخل منتج/أوردر مبيعات ← 409 برسالة واضحة (لا 500)", async () => {
    const res = await api(admin).delete(`/api/inventory/${watch.id}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toContain("المبيعات");
  });

  it("منتج مؤرشف في المخزون يمنع التنفيذ", async () => {
    const x = await mkItem({ name: "سيؤرشف", initialQuantity: 5, unitPrice: 1, sellPrice: 2 });
    const p = await api(manager).post("/api/sales/products").send({ name: "بوكس مؤرشف", components: [{ itemId: x.id, quantity: 1 }] });
    const o = await mkOrder({ lines: [{ productId: p.body.product.id }] });
    await api(admin).patch(`/api/inventory/${x.id}`).send({ isActive: false });
    const res = await setStatus(o.id, "EXECUTED");
    expect(res.status).toBe(409);
    expect(await qty(x.id)).toBe(5);
  });

  it("التنفيذ الذي يوصل الرصيد للحد الأدنى يُفعّل تنبيه النقص", async () => {
    const x = await mkItem({ name: "للتنبيه", initialQuantity: 5, minQuantity: 2, unitPrice: 1, sellPrice: 2 });
    const p = await api(manager).post("/api/sales/products").send({ name: "بوكس تنبيه", components: [{ itemId: x.id, quantity: 3 }] });
    const o = await mkOrder({ lines: [{ productId: p.body.product.id }] });
    expect((await setStatus(o.id, "EXECUTED")).status).toBe(200);
    expect(await qty(x.id)).toBe(2);
    expect((await prisma().inventoryItem.findUniqueOrThrow({ where: { id: x.id } })).lowAlertSent).toBe(true);
    expect(await prisma().notification.count({ where: { type: "INVENTORY_LOW", title: { contains: "للتنبيه" } } })).toBeGreaterThan(0);
    await setStatus(o.id, "RETURNED");
    expect((await prisma().inventoryItem.findUniqueOrThrow({ where: { id: x.id } })).lowAlertSent).toBe(false);
  });

  it("البحث برقم البوليصة عبر كل الأيام، وأسماء المقفلين", async () => {
    await mkOrder({ date: "2026-10-15", waybill: "FIND-ME-77", closerName: "منى" });
    const r = await api(manager).get("/api/sales/orders?q=find-me");
    expect(r.body.orders.map((o: any) => o.waybill)).toContain("FIND-ME-77");
    const c = await api(manager).get("/api/sales/closers");
    expect(c.body.closers).toEqual(expect.arrayContaining(["منى", "أحمد"]));
    expect((await api(manager).get("/api/sales/orders")).status).toBe(400);
  });

  it("أوردرات فترة (للتصدير الشهري): from/to، وفترة معكوسة أو طويلة ← 400", async () => {
    await mkOrder({ date: "2026-09-05", waybill: "RNG-1" });
    await mkOrder({ date: "2026-09-20", waybill: "RNG-2" });
    await mkOrder({ date: "2026-10-02", waybill: "RNG-OUT" });
    const r = await api(manager).get("/api/sales/orders?from=2026-09-01&to=2026-09-30");
    expect(r.status).toBe(200);
    const w = r.body.orders.map((o: any) => o.waybill);
    expect(w).toEqual(expect.arrayContaining(["RNG-1", "RNG-2"]));
    expect(w).not.toContain("RNG-OUT");
    expect(r.body.orders.map((o: any) => o.date)).toEqual([...r.body.orders.map((o: any) => o.date)].sort());
    expect((await api(manager).get("/api/sales/orders?from=2026-09-30&to=2026-09-01")).status).toBe(400);
    expect((await api(manager).get("/api/sales/orders?from=2024-01-01&to=2026-09-01")).status).toBe(400);
    expect((await api(manager).get("/api/sales/orders?from=2026-09-01")).status).toBe(400);
  });

  it("تحقق المدخلات: تاريخ/حالة/عدد غير صالح ← 400", async () => {
    expect((await api(manager).post("/api/sales/orders").send({ date: "غلط", lines: [{ productId: bigBox.id }] })).status).toBe(400);
    expect((await api(manager).post("/api/sales/orders").send({ date: "2026-11-01", lines: [] })).status).toBe(400);
    expect((await api(manager).post("/api/sales/orders").send({ date: "2026-11-01", lines: [{ productId: bigBox.id, quantity: 0 }] })).status).toBe(400);
    const o = await mkOrder({});
    expect((await setStatus(o.id, "WHATEVER")).status).toBe(400);
  });
});

describe("sales: تعديل مكوّنات أوردر واحد", () => {
  const base = (o: any) => `/api/sales/orders/${o.id}/lines/${o.lines[0].id}/components`;

  it("تعديل كمية/حذف/إضافة مكوّن يخص هذا الأوردر فقط ولا يغيّر المنتج الثابت ولا أوردراً آخر", async () => {
    const a = await mkOrder({ waybill: "CMP-A" });
    const b = await mkOrder({ waybill: "CMP-B" });
    const rosePerUnit = a.lines[0].components.find((c: any) => c.itemId === rose.id);

    // تعديل الكمية: وردة 2 ← 3 فتتغير التكلفة 160 ← 165
    const upd = await api(manager).patch(`${base(a)}/${rosePerUnit.id}`).send({ quantity: 3 });
    expect(upd.status).toBe(200);
    expect(upd.body.order.costTotal).toBe(165);

    // حذف مكوّن: العطر
    const perfumeComp = a.lines[0].components.find((c: any) => c.itemId === perfume.id);
    const del = await api(manager).delete(`${base(a)}/${perfumeComp.id}`);
    expect(del.status).toBe(200);
    expect(del.body.order.lines[0].components.map((c: any) => c.itemId)).not.toContain(perfume.id);

    // إضافة صنف جديد، ثم إضافة نفس الصنف تجمع الكمية
    const extra = await mkItem({ name: "شريط", initialQuantity: 50, unitPrice: 2, sellPrice: 4 });
    expect((await api(manager).post(base(a)).send({ itemId: extra.id, quantity: 2 })).status).toBe(201);
    const again = await api(manager).post(base(a)).send({ itemId: extra.id, quantity: 1 });
    expect(again.body.order.lines[0].components.find((c: any) => c.itemId === extra.id).quantity).toBe(3);

    // الأوردر الآخر والمنتج الثابت لم يتغيرا
    const other = await api(manager).get("/api/sales/orders?q=CMP-B");
    expect(other.body.orders[0].costTotal).toBe(160);
    const prods = await api(manager).get("/api/sales/products");
    expect(prods.body.products.find((p: any) => p.id === bigBox.id).costPerUnit).toBe(160);
    expect(b.lines[0].components).toHaveLength(3);
  });

  it("التنفيذ بعد التعديل يخصم الكميات المعدّلة، ولا تعديل بعد التنفيذ (409)", async () => {
    const o = await mkOrder({ waybill: "CMP-EXEC" });
    const roseComp = o.lines[0].components.find((c: any) => c.itemId === rose.id);
    await api(manager).patch(`${base(o)}/${roseComp.id}`).send({ quantity: 5 });
    const before = await qty(rose.id);
    expect((await setStatus(o.id, "EXECUTED")).status).toBe(200);
    expect(await qty(rose.id)).toBe(before - 5);
    expect((await api(manager).patch(`${base(o)}/${roseComp.id}`).send({ quantity: 1 })).status).toBe(409);
    expect((await api(manager).delete(`${base(o)}/${roseComp.id}`)).status).toBe(409);
    expect((await api(manager).post(base(o)).send({ itemId: watch.id, quantity: 1 })).status).toBe(409);
  });

  it("تحقق المدخلات: كمية صفر ← 400، آخر مكوّن لا يُحذف ← 400، مكوّن/صنف غير موجود ← 404/400، والمصمم ← 403", async () => {
    const o = await mkOrder({ waybill: "CMP-VAL" });
    const [c1, c2, c3] = o.lines[0].components;
    expect((await api(manager).patch(`${base(o)}/${c1.id}`).send({ quantity: 0 })).status).toBe(400);
    expect((await api(manager).patch(`${base(o)}/nope`).send({ quantity: 1 })).status).toBe(404);
    expect((await api(manager).post(base(o)).send({ itemId: "nope", quantity: 1 })).status).toBe(400);
    expect((await api(designer).patch(`${base(o)}/${c1.id}`).send({ quantity: 1 })).status).toBe(403);
    expect((await api(manager).delete(`${base(o)}/${c1.id}`)).status).toBe(200);
    expect((await api(manager).delete(`${base(o)}/${c2.id}`)).status).toBe(200);
    expect((await api(manager).delete(`${base(o)}/${c3.id}`)).status).toBe(400);
  });
});
