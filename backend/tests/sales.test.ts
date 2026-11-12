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

describe("sales: نقل أوردر ليوم آخر", () => {
  it("تغيير التاريخ فقط: يظهر في اليوم الجديد ويختفي من القديم، والحالة والمخزون كما هما", async () => {
    const o = await mkOrder({ date: "2026-08-01", waybill: "MOVE-1" });
    expect((await setStatus(o.id, "EXECUTED")).status).toBe(200);
    const before = await qty(watch.id);
    const r = await api(manager).patch(`/api/sales/orders/${o.id}`).send({ date: "2026-08-09" });
    expect(r.status).toBe(200);
    expect(r.body.order.date).toBe("2026-08-09");
    expect(r.body.order.status).toBe("EXECUTED");
    expect(await qty(watch.id)).toBe(before);
    const oldDay = await api(manager).get("/api/sales/orders?date=2026-08-01");
    const newDay = await api(manager).get("/api/sales/orders?date=2026-08-09");
    expect(oldDay.body.orders.map((x: any) => x.id)).not.toContain(o.id);
    expect(newDay.body.orders.map((x: any) => x.id)).toContain(o.id);
    expect((await api(manager).patch(`/api/sales/orders/${o.id}`).send({ date: "غلط" })).status).toBe(400);
  });
});

describe("sales: علامة «مرتجع» للمراجعة", () => {
  it("التعليم لا يغيّر الحالة ولا المخزون، ويُلغى، ويُمسح عند التحويل إلى مرتجع", async () => {
    const o = await mkOrder({ date: "2026-07-01", waybill: "FLAG-1" });
    expect((await setStatus(o.id, "EXECUTED")).status).toBe(200);
    const before = await qty(watch.id);
    const f = await api(manager).patch(`/api/sales/orders/${o.id}`).send({ returnFlagged: true });
    expect(f.status).toBe(200);
    expect(f.body.order.returnFlagged).toBe(true);
    expect(f.body.order.returnFlaggedAt).toBeTruthy();
    expect(f.body.order.status).toBe("EXECUTED");
    expect(f.body.order.stockDeducted).toBe(true);
    expect(await qty(watch.id)).toBe(before);

    const off = await api(manager).patch(`/api/sales/orders/${o.id}`).send({ returnFlagged: false });
    expect(off.body.order.returnFlagged).toBe(false);
    expect(off.body.order.returnFlaggedAt).toBeNull();

    await api(manager).patch(`/api/sales/orders/${o.id}`).send({ returnFlagged: true });
    const ret = await api(manager).patch(`/api/sales/orders/${o.id}`).send({ status: "RETURNED", damagedComponentIds: [] });
    expect(ret.status).toBe(200);
    expect(ret.body.order.returnFlagged).toBe(false);
    expect(await qty(watch.id)).toBe(before + 1); // الإرجاع الفعلي هو الذي يعيد المخزون
    expect((await api(manager).patch(`/api/sales/orders/${o.id}`).send({ returnFlagged: true })).status).toBe(400);
    expect((await api(manager).patch(`/api/sales/orders/${o.id}`).send({ returnFlagged: "x" })).status).toBe(400);
  });
});

const FORBIDDEN_MONEY_KEYS = new Set([
  "costTotal",
  "sellTotal",
  "profit",
  "damagedTotal",
  "unitCost",
  "unitSell",
  "costPerUnit",
  "sellPerUnit",
  "totalCost",
  "totalSell",
  "unitPrice",
  "sellPrice",
  "totalValue",
  "unitPriceSnapshot",
  "movementValue",
]);

function collectMoneyKeys(value: unknown, path = "$"): string[] {
  if (value === null || typeof value !== "object") return [];
  if (Array.isArray(value)) {
    return value.flatMap((item, idx) => collectMoneyKeys(item, `${path}[${idx}]`));
  }
  const hits: string[] = [];
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_MONEY_KEYS.has(k)) hits.push(`${path}.${k}`);
    hits.push(...collectMoneyKeys(v, `${path}.${k}`));
  }
  return hits;
}

function assertNoMoneyLeak(body: unknown, label = "") {
  expect(collectMoneyKeys(body), `تسريب مالي في ${label}`).toEqual([]);
}

describe("sales roles: الأدوار الثلاثة المحصورة في المبيعات الإلكترونية", () => {
  let flagger: string;
  let editor: string;
  let supervisor: string;

  beforeAll(async () => {
    await makeUser("s_flagger", "SALES_ACCOUNTANT");
    await makeUser("s_editor", "SALES_EDITOR");
    await makeUser("s_supervisor", "SALES_SUPERVISOR");
    flagger = await login("s_flagger");
    editor = await login("s_editor");
    supervisor = await login("s_supervisor");
  });

  it("إنشاء المستخدمين بالأدوار الثلاثة عبر /api/users يضبط المسمى الافتراضي ويخفي كرت المهام", async () => {
    const r1 = await api(admin).post("/api/users").send({
      name: "مراجع 1",
      username: "u_flagger",
      email: "u_flagger@e.test",
      password: process.env.ADMIN_PASSWORD!,
      role: "sales_accountant",
    });
    expect(r1.status).toBe(201);
    expect(r1.body.user.role).toBe("sales_accountant");
    expect(r1.body.user.jobTitle).toBe("محاسب مبيعات");
    expect(r1.body.user.showTaskCard).toBe(false);

    const r2 = await api(admin).post("/api/users").send({
      name: "منفذ 1",
      username: "u_editor",
      email: "u_editor@e.test",
      password: process.env.ADMIN_PASSWORD!,
      role: "sales_editor",
    });
    expect(r2.status).toBe(201);
    expect(r2.body.user.role).toBe("sales_editor");
    expect(r2.body.user.jobTitle).toBe("منفّذ أوردرات");
    expect(r2.body.user.showTaskCard).toBe(false);

    const r3 = await api(admin).post("/api/users").send({
      name: "مشرف 1",
      username: "u_supervisor",
      email: "u_supervisor@e.test",
      password: process.env.ADMIN_PASSWORD!,
      role: "sales_supervisor",
    });
    expect(r3.status).toBe(201);
    expect(r3.body.user.role).toBe("sales_supervisor");
    expect(r3.body.user.jobTitle).toBe("مشرف مبيعات");
    expect(r3.body.user.showTaskCard).toBe(false);
  });

  it("المسارات المشتركة المسموحة (auth/me, sync, users/me, logout) تعمل، وأي مسار خارج القائمة أو مستقبلي ← 403 (fail-closed)", async () => {
    const commonBlocked: [string, string][] = [
      ["get", "/api/tasks"],
      ["get", "/api/feedback"],
      ["get", "/api/goals"],
      ["get", "/api/products"],
      ["get", "/api/calendar-events"],
      ["get", "/api/attendance/me"],
      ["get", "/api/notifications"],
      ["get", "/api/notifications/counts"],
      ["get", "/api/users"],
      ["post", "/api/files/presign"],
      ["post", "/api/push/subscribe"],
      ["get", "/api/this-route-does-not-exist-yet"],
      ["post", "/api/future-endpoint"],
    ];

    for (const [label, token] of [
      ["SALES_ACCOUNTANT", flagger],
      ["SALES_EDITOR", editor],
      ["SALES_SUPERVISOR", supervisor],
    ] as const) {
      expect((await api(token).get("/api/auth/me")).status, `${label} auth/me`).toBe(200);
      expect((await api(token).get("/api/sync")).status, `${label} sync`).toBe(200);
      expect((await api(token).patch("/api/users/me").send({ name: `اسم ${label}` })).status, `${label} users/me`).toBe(200);
      expect((await api(token).post("/api/auth/logout")).status, `${label} logout`).toBe(200);

      for (const [method, url] of commonBlocked) {
        const res = await (api(token) as any)[method](url).send({});
        expect(res.status, `${label}: ${method.toUpperCase()} ${url}`).toBe(403);
      }
    }
  });

  it("الدور 1 (SALES_ACCOUNTANT): يقرأ الأوردرات بلا مبالغ ويعدّل returnFlagged فقط؛ أي حقل أو مسار آخر ← 403", async () => {
    const o = await mkOrder({ date: "2026-06-15", waybill: "FLG-ONLY-1" });

    // قراءة الأوردرات مسموحة وخالية تماماً من أي حقل مالي
    const list = await api(flagger).get("/api/sales/orders?date=2026-06-15");
    expect(list.status).toBe(200);
    expect(list.body.orders.length).toBeGreaterThan(0);
    assertNoMoneyLeak(list.body, "SALES_ACCOUNTANT GET /orders");

    // تعليم وإلغاء علامة المرتجع مسموح وخالٍ من المبالغ
    const flagOn = await api(flagger).patch(`/api/sales/orders/${o.id}`).send({ returnFlagged: true });
    expect(flagOn.status).toBe(200);
    expect(flagOn.body.order.returnFlagged).toBe(true);
    assertNoMoneyLeak(flagOn.body, "SALES_ACCOUNTANT PATCH returnFlagged=true");

    const flagOff = await api(flagger).patch(`/api/sales/orders/${o.id}`).send({ returnFlagged: false });
    expect(flagOff.status).toBe(200);
    expect(flagOff.body.order.returnFlagged).toBe(false);
    assertNoMoneyLeak(flagOff.body, "SALES_ACCOUNTANT PATCH returnFlagged=false");

    // أي حقل آخر في PATCH /orders/:id (حتى لو معه returnFlagged) ← 403
    for (const badBody of [
      {},
      { waybill: "NEW-WB" },
      { closerName: "أحمد" },
      { notes: "ملاحظة" },
      { date: "2026-06-16" },
      { status: "EXECUTED" },
      { status: "RETURNED" },
      { returnFlagged: true, notes: "تهريب حقل" },
      { returnFlagged: true, status: "RETURNED" },
    ]) {
      const r = await api(flagger).patch(`/api/sales/orders/${o.id}`).send(badBody);
      expect(r.status, `SALES_ACCOUNTANT body=${JSON.stringify(badBody)}`).toBe(403);
    }

    // منع الإضافة والحذف وتعديل البنود والمكوّنات والمنتجات الثابتة والمخزون
    const lineId = o.lines[0].id;
    const compId = o.lines[0].components[0].id;
    expect((await api(flagger).post("/api/sales/orders").send({ date: "2026-06-15", lines: [{ productId: bigBox.id, quantity: 1 }] })).status).toBe(403);
    expect((await api(flagger).delete(`/api/sales/orders/${o.id}`)).status).toBe(403);
    expect((await api(flagger).post(`/api/sales/orders/${o.id}/lines`).send({ productId: bigBox.id, quantity: 1 })).status).toBe(403);
    expect((await api(flagger).patch(`/api/sales/orders/${o.id}/lines/${lineId}`).send({ quantity: 2 })).status).toBe(403);
    expect((await api(flagger).delete(`/api/sales/orders/${o.id}/lines/${lineId}`)).status).toBe(403);
    expect((await api(flagger).post(`/api/sales/orders/${o.id}/lines/${lineId}/components`).send({ itemId: watch.id, quantity: 1 })).status).toBe(403);
    expect((await api(flagger).patch(`/api/sales/orders/${o.id}/lines/${lineId}/components/${compId}`).send({ quantity: 2 })).status).toBe(403);
    expect((await api(flagger).delete(`/api/sales/orders/${o.id}/lines/${lineId}/components/${compId}`)).status).toBe(403);
    expect((await api(flagger).get("/api/sales/products")).status).toBe(403);
    expect((await api(flagger).post("/api/sales/products").send({ name: "بوكس", components: [{ itemId: watch.id, quantity: 1 }] })).status).toBe(403);
    expect((await api(flagger).patch(`/api/sales/products/${bigBox.id}`).send({ name: "تعديل" })).status).toBe(403);
    expect((await api(flagger).delete(`/api/sales/products/${bigBox.id}`)).status).toBe(403);
    expect((await api(flagger).get("/api/sales/closers")).status).toBe(403);
    expect((await api(flagger).get("/api/inventory")).status).toBe(403);
    expect((await api(flagger).post("/api/inventory").send({})).status).toBe(403);
  });

  it("الدور 2 (SALES_EDITOR): يدير الأوردرات وبنودها ومكوّناتها وينشئ منتجاً ثابتاً بلا أي مبالغ، ويُمنع من تغيير الحالة أو إضافة مخزون", async () => {
    // إنشاء منتج ثابت جديد مسموح وبلا أسعار في الاستجابة
    const newProd = await api(editor).post("/api/sales/products").send({
      name: "بوكس منفذ الأوردرات",
      notes: "تجربة",
      components: [
        { itemId: watch.id, quantity: 1 },
        { itemId: rose.id, quantity: 2 },
      ],
    });
    expect(newProd.status).toBe(201);
    assertNoMoneyLeak(newProd.body, "SALES_EDITOR POST /products");
    const prodId = newProd.body.product.id as string;

    const prodList = await api(editor).get("/api/sales/products");
    expect(prodList.status).toBe(200);
    assertNoMoneyLeak(prodList.body, "SALES_EDITOR GET /products");

    // تعديل وإيقاف وحذف منتج ثابت موجود مسموح (بلا أي مبالغ في الاستجابة)
    const edRename = await api(editor).patch(`/api/sales/products/${prodId}`).send({ name: "اسم آخر" });
    expect(edRename.status).toBe(200);
    assertNoMoneyLeak(edRename.body, "SALES_EDITOR PATCH /products/:id");
    expect((await api(editor).patch(`/api/sales/products/${prodId}`).send({ isActive: false })).status).toBe(200);
    expect((await api(editor).delete(`/api/sales/products/${prodId}`)).status).toBe(200);

    // إضافة أوردر جديد وتعديل بياناته ونقله ليوم آخر وتعليم المرتجع
    const created = await api(editor).post("/api/sales/orders").send({
      date: "2026-06-20",
      waybill: "EDT-100",
      closerName: "سارة",
      notes: "ملاحظة أولى",
      lines: [{ productId: bigBox.id, quantity: 1 }],
    });
    expect(created.status).toBe(201);
    assertNoMoneyLeak(created.body, "SALES_EDITOR POST /orders");
    const orderId = created.body.order.id as string;

    const patched = await api(editor).patch(`/api/sales/orders/${orderId}`).send({
      waybill: "EDT-101",
      closerName: "منى",
      notes: "ملاحظة معدلة",
      date: "2026-06-21",
      returnFlagged: true,
    });
    expect(patched.status).toBe(200);
    expect(patched.body.order.waybill).toBe("EDT-101");
    expect(patched.body.order.date).toBe("2026-06-21");
    expect(patched.body.order.returnFlagged).toBe(true);
    assertNoMoneyLeak(patched.body, "SALES_EDITOR PATCH /orders/:id");

    // ممنوع إرسال status أو damagedComponentIds نهائياً
    for (const st of ["REGISTERED", "EXECUTED", "SHIPPED", "DELIVERED", "RETURNED"]) {
      expect((await api(editor).patch(`/api/sales/orders/${orderId}`).send({ status: st })).status, `status=${st}`).toBe(403);
      expect((await api(editor).patch(`/api/sales/orders/${orderId}`).send({ waybill: "EDT-102", status: st })).status).toBe(403);
    }
    expect((await api(editor).patch(`/api/sales/orders/${orderId}`).send({ damagedComponentIds: [] })).status).toBe(403);

    // إضافة وتعديل وحذف البنود والمكوّنات بلا تسريب مبالغ
    // المنتج الأول حُذف أعلاه، فنُنشئ منتجاً جديداً لإضافة بند
    const newProd2 = await api(editor).post("/api/sales/products").send({
      name: "بوكس منفذ الأوردرات 2",
      components: [
        { itemId: watch.id, quantity: 1 },
        { itemId: rose.id, quantity: 2 },
      ],
    });
    expect(newProd2.status).toBe(201);
    const prodId2 = newProd2.body.product.id as string;
    const addL = await api(editor).post(`/api/sales/orders/${orderId}/lines`).send({ productId: prodId2, quantity: 2 });
    expect(addL.status).toBe(201);
    assertNoMoneyLeak(addL.body, "SALES_EDITOR POST line");
    const addedLine = addL.body.order.lines.find((l: any) => l.productId === prodId2);

    const updL = await api(editor).patch(`/api/sales/orders/${orderId}/lines/${addedLine.id}`).send({ quantity: 3 });
    expect(updL.status).toBe(200);
    assertNoMoneyLeak(updL.body, "SALES_EDITOR PATCH line");

    const addC = await api(editor).post(`/api/sales/orders/${orderId}/lines/${addedLine.id}/components`).send({ itemId: perfume.id, quantity: 1 });
    expect(addC.status).toBe(201);
    assertNoMoneyLeak(addC.body, "SALES_EDITOR POST component");
    const addedComp = addC.body.order.lines.find((l: any) => l.id === addedLine.id).components.find((c: any) => c.itemId === perfume.id);

    const updC = await api(editor).patch(`/api/sales/orders/${orderId}/lines/${addedLine.id}/components/${addedComp.id}`).send({ quantity: 4 });
    expect(updC.status).toBe(200);
    assertNoMoneyLeak(updC.body, "SALES_EDITOR PATCH component");

    const delC = await api(editor).delete(`/api/sales/orders/${orderId}/lines/${addedLine.id}/components/${addedComp.id}`);
    expect(delC.status).toBe(200);
    assertNoMoneyLeak(delC.body, "SALES_EDITOR DELETE component");

    const delL = await api(editor).delete(`/api/sales/orders/${orderId}/lines/${addedLine.id}`);
    expect(delL.status).toBe(200);
    assertNoMoneyLeak(delL.body, "SALES_EDITOR DELETE line");

    // حذف الأوردر مسموح
    expect((await api(editor).delete(`/api/sales/orders/${orderId}`)).status).toBe(200);

    // قراءة الأصناف والتصنيفات لاختيار المكونات مسموحة وبلا أي سعر أو إحصاءات مالية، وكل عمليات المخزون الأخرى ← 403
    const invForPicker = await api(editor).get("/api/inventory");
    expect(invForPicker.status).toBe(200);
    expect(invForPicker.body.stats).toBeUndefined();
    assertNoMoneyLeak(invForPicker.body, "SALES_EDITOR GET /inventory");

    expect((await api(editor).post("/api/inventory").send({ name: "صنف", categoryId: catId, unitPrice: 10, sellPrice: 20 })).status).toBe(403);
    expect((await api(editor).post(`/api/inventory/${watch.id}/movements`).send({ type: "IN", quantity: 5 })).status).toBe(403);
    expect((await api(editor).get(`/api/inventory/${watch.id}`)).status).toBe(403);
    expect((await api(editor).get(`/api/inventory/${watch.id}/movements`)).status).toBe(403);
    expect((await api(editor).get("/api/inventory/movements")).status).toBe(403);

    // السحب من المخزون مسموح لمنفّذ الأوردرات (بلا أسعار في الرد)، والرصيد يُخصم فعلاً
    const before = await qty(rose.id);
    const wd = await api(editor).post("/api/inventory/withdrawals").send({ lines: [{ itemId: rose.id, quantity: 2 }], note: "سحب منفّذ" });
    expect(wd.status).toBe(201);
    assertNoMoneyLeak(wd.body, "SALES_EDITOR POST /inventory/withdrawals");
    expect(await qty(rose.id)).toBe(before - 2);
    const wdLog = await api(editor).get("/api/inventory/withdrawals");
    expect(wdLog.status).toBe(200);
    assertNoMoneyLeak(wdLog.body, "SALES_EDITOR GET /inventory/withdrawals");
  });

  it("الدور 3 (SALES_SUPERVISOR): يضيف صنفاً بسعر وسعر بيع فيُحفظان في القاعدة ويظهران للمدير ولا يظهران في أي استجابة له، ويضيف وارد IN فقط", async () => {
    // 1. إنشاء صنف جديد مع unitPrice و sellPrice (كتابة فقط)
    const createRes = await api(supervisor).post("/api/inventory").send({
      name: "عطر مشرف المبيعات",
      categoryId: catId,
      unit: "قطعة",
      initialQuantity: 10,
      minQuantity: 2,
      unitPrice: 85.5,
      sellPrice: 140.75,
      notes: "أضيف بواسطة مشرف المبيعات",
    });
    expect(createRes.status).toBe(201);
    assertNoMoneyLeak(createRes.body, "SALES_SUPERVISOR POST /inventory");
    const newItemId = createRes.body.item.id as string;

    // التحقق من الحفظ الفعلي في قاعدة البيانات
    const dbRow = await prisma().inventoryItem.findUniqueOrThrow({ where: { id: newItemId } });
    expect(Number(dbRow.unitPrice)).toBe(85.5);
    expect(Number(dbRow.sellPrice)).toBe(140.75);
    expect(Number(dbRow.quantity)).toBe(10);

    // 2. يظهران للمدير في قائمة المخزون وتفاصيل الصنف والحركات
    const mgrDetail = await api(manager).get(`/api/inventory/${newItemId}`);
    expect(mgrDetail.status).toBe(200);
    expect(mgrDetail.body.item.unitPrice).toBe(85.5);
    expect(mgrDetail.body.item.sellPrice).toBe(140.75);
    expect(mgrDetail.body.item.totalValue).toBe(855);

    // 3. لا يظهران للمشرف في أي استجابة (GET /inventory, GET /inventory/:id, POST movement IN, GET /inventory/:id/movements)
    const supList = await api(supervisor).get("/api/inventory");
    expect(supList.status).toBe(200);
    assertNoMoneyLeak(supList.body, "SALES_SUPERVISOR GET /inventory");

    const supDetail = await api(supervisor).get(`/api/inventory/${newItemId}`);
    expect(supDetail.status).toBe(200);
    assertNoMoneyLeak(supDetail.body, "SALES_SUPERVISOR GET /inventory/:id");

    // 4. إضافة كمية (حركة IN) مسموحة وبلا أسعار في الاستجابة
    const inMove = await api(supervisor).post(`/api/inventory/${newItemId}/movements`).send({
      type: "IN",
      quantity: 5,
      note: "توريد إضافي",
    });
    expect(inMove.status).toBe(201);
    expect(inMove.body.item.quantity).toBe(15);
    assertNoMoneyLeak(inMove.body, "SALES_SUPERVISOR POST /inventory/:id/movements IN");

    const supMoves = await api(supervisor).get(`/api/inventory/${newItemId}/movements`);
    expect(supMoves.status).toBe(200);
    expect(supMoves.body.movements.length).toBe(2);
    assertNoMoneyLeak(supMoves.body, "SALES_SUPERVISOR GET /inventory/:id/movements");

    // 5. منع باقي أنواع الحركات والتعديل والحذف والتقارير والسحب والتصنيفات
    for (const badType of ["OUT", "ADJUST", "RETURN"]) {
      const r = await api(supervisor).post(`/api/inventory/${newItemId}/movements`).send({
        type: badType,
        quantity: 1,
        reason: "تجربة",
        note: "ممنوع",
      });
      expect(r.status, `movement type=${badType}`).toBe(403);
    }
    // تعديل بيانات الصنف مسموح (بلا أسعار في الرد، ودون المساس بالأسعار المخزّنة عند عدم إرسالها)، أما الأرشفة فممنوعة
    const priceBefore = await prisma().inventoryItem.findUniqueOrThrow({ where: { id: newItemId } });
    const supPatch = await api(supervisor).patch(`/api/inventory/${newItemId}`).send({ name: "اسم معدّل", notes: "ملاحظة", minQuantity: 3 });
    expect(supPatch.status).toBe(200);
    expect(supPatch.body.item.name).toBe("اسم معدّل");
    assertNoMoneyLeak(supPatch.body, "SALES_SUPERVISOR PATCH /inventory/:id");
    const priceAfter = await prisma().inventoryItem.findUniqueOrThrow({ where: { id: newItemId } });
    expect(Number(priceAfter.unitPrice)).toBe(Number(priceBefore.unitPrice));
    expect(Number(priceAfter.sellPrice)).toBe(Number(priceBefore.sellPrice));
    expect((await api(supervisor).patch(`/api/inventory/${newItemId}`).send({ isActive: false })).status).toBe(403);
    expect((await api(supervisor).delete(`/api/inventory/${newItemId}`)).status).toBe(403);
    expect((await api(supervisor).get("/api/inventory/movements")).status).toBe(403);
    expect((await api(supervisor).get("/api/inventory/groups")).status).toBe(403);
    expect((await api(supervisor).post("/api/inventory/categories").send({ name: "تصنيف", groupId: "invgrp_materials" })).status).toBe(403);
    expect((await api(supervisor).patch(`/api/inventory/categories/${catId}`).send({ name: "تعديل" })).status).toBe(403);
    expect((await api(supervisor).delete(`/api/inventory/categories/${catId}`)).status).toBe(403);
    // السحب من المخزون مسموح للمشرف (بلا أسعار في الرد)
    expect((await api(supervisor).get("/api/inventory/withdrawals")).status).toBe(200);
    const supWd = await api(supervisor).post("/api/inventory/withdrawals").send({ lines: [{ itemId: newItemId, quantity: 1 }], note: "x" });
    expect(supWd.status).toBe(201);
    assertNoMoneyLeak(supWd.body, "SALES_SUPERVISOR POST /inventory/withdrawals");

    // 6. وفي المبيعات: يتمتع بصلاحيات الدور 2 + تغيير حالة الأوردر، مع عدم تسريب أي مبالغ
    const supOrders = await api(supervisor).get("/api/sales/orders?date=2026-06-15");
    expect(supOrders.status).toBe(200);
    assertNoMoneyLeak(supOrders.body, "SALES_SUPERVISOR GET /sales/orders");
    // تعديل وحذف المنتج الثابت مسموح للمشرف أيضاً (نجرّب على منتج مؤقت كي لا نمس bigBox)
    const tmpProd = await api(supervisor).post("/api/sales/products").send({ name: "منتج مؤقت للمشرف", components: [{ itemId: rose.id, quantity: 1 }] });
    expect(tmpProd.status).toBe(201);
    const tmpId = tmpProd.body.product.id as string;
    const supEditProd = await api(supervisor).patch(`/api/sales/products/${tmpId}`).send({ name: "منتج معدّل" });
    expect(supEditProd.status).toBe(200);
    assertNoMoneyLeak(supEditProd.body, "SALES_SUPERVISOR PATCH /products/:id");
    expect((await api(supervisor).delete(`/api/sales/products/${tmpId}`)).status).toBe(200);

    // 7. تغيير حالة الأوردر مسموح للمشرف (يخصم ويعيد المخزون) بلا أي مبالغ في الرد؛ نجرّب على أوردر وصنف خاصَّين بهذا الاختبار
    const stProd = await api(supervisor).post("/api/sales/products").send({ name: "منتج حالة المشرف", components: [{ itemId: newItemId, quantity: 1 }] });
    expect(stProd.status).toBe(201);
    const stOrder = await api(supervisor).post("/api/sales/orders").send({ date: "2026-06-16", waybill: "SUP-ST-1", lines: [{ productId: stProd.body.product.id, quantity: 1 }] });
    expect(stOrder.status).toBe(201);
    const stId = stOrder.body.order.id as string;
    const qtyNow = async () => Number((await prisma().inventoryItem.findUniqueOrThrow({ where: { id: newItemId } })).quantity);
    const before = await qtyNow();

    const supExec = await api(supervisor).patch(`/api/sales/orders/${stId}`).send({ status: "EXECUTED" });
    expect(supExec.status).toBe(200);
    expect(supExec.body.order.status).toBe("EXECUTED");
    assertNoMoneyLeak(supExec.body, "SALES_SUPERVISOR PATCH status=EXECUTED");
    expect(await qtyNow()).toBe(before - 1);

    // الشحن والتسليم لم يعودا من صلاحيات المشرف (محاسب المبيعات والإدارة فقط) — يُفرض في الباكند
    for (const st of ["SHIPPED", "DELIVERED"]) {
      expect((await api(supervisor).patch(`/api/sales/orders/${stId}`).send({ status: st })).status, `supervisor status=${st}`).toBe(403);
    }
    expect(await qtyNow()).toBe(before - 1);
    // الإدارة ما زالت تستطيع الشحن (سلوك قديم) ولا خصم مزدوج
    const adminShip = await api(admin).patch(`/api/sales/orders/${stId}`).send({ status: "SHIPPED" });
    expect(adminShip.status).toBe(200);
    expect(await qtyNow()).toBe(before - 1); // لا خصم مزدوج

    const supRet = await api(supervisor).patch(`/api/sales/orders/${stId}`).send({ status: "RETURNED", damagedComponentIds: [] });
    expect(supRet.status).toBe(200);
    expect(supRet.body.order.status).toBe("RETURNED");
    assertNoMoneyLeak(supRet.body, "SALES_SUPERVISOR PATCH status=RETURNED");
    expect(await qtyNow()).toBe(before); // عاد للمخزون

    const supBack = await api(supervisor).patch(`/api/sales/orders/${stId}`).send({ status: "REGISTERED" });
    expect(supBack.status).toBe(200);
    expect(supBack.body.order.status).toBe("REGISTERED");
  });
});

