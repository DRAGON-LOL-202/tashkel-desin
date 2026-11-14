import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db.ts";
import { api, GROUP_ACCESSORIES, login, makeUser, resetDb } from "./helpers.ts";

let admin: string, ag1: string, ag2: string, acct: string, sup: string, edit: string;
let ag1Id: string, ag2Id: string;
let box: { id: string };
let watch: { id: string };

const stock = async () => Number((await prisma().inventoryItem.findUniqueOrThrow({ where: { id: watch.id } })).quantity);
const movements = () => prisma().inventoryMovement.count();
const D = "2026-11-10";
// سعر البيع لا تدخله الفتاة: يُحسب من مكونات البوكس (سعر بيع الصنف). لضبط سعر معيّن نُنشئ بوكساً مكوّنه صنف سعر بيعه = price.
const boxByPrice = new Map<number, string>();
const boxFor = async (price: number) => {
  if (!boxByPrice.has(price)) {
    const cat = (await prisma().inventoryCategory.findFirstOrThrow()).id;
    const it = await api(admin).post("/api/inventory").send({ unit: "قطعة", categoryId: cat, name: `صنف ${price}`, initialQuantity: 1000, unitPrice: 1, sellPrice: price });
    const p = await api(admin).post("/api/sales/products").send({ name: `بوكس ${price}`, components: [{ itemId: it.body.item.id, quantity: 1 }] });
    boxByPrice.set(price, p.body.product.id);
  }
  return boxByPrice.get(price)!;
};
const mk = async (token: string, price = 180, extra: Record<string, unknown> = {}) => {
  const productId = price === 180 ? box.id : await boxFor(price);
  const r = await api(token).post("/api/agent/orders").send({ date: D, customerName: "عميلة", customerPhone: "010", lines: [{ productId, quantity: 1 }], ...extra });
  expect(r.status).toBe(201);
  return r.body.order as { id: string; waybill: string; seq: number };
};
const exportIds = (token: string, ids: string[]) => api(token).post("/api/agent/orders/export").send({ ids, confirm: true });
const salesOrderOf = async (agentOrderId: string) => (await prisma().agentOrder.findUniqueOrThrow({ where: { id: agentOrderId } })).salesOrderId!;
const execute = (soId: string) => api(admin).patch(`/api/sales/orders/${soId}`).send({ status: "EXECUTED" });
const acctStatus = (soId: string, status: string) => api(acct).patch(`/api/accounting/orders/${soId}/status`).send({ status });

beforeAll(async () => {
  await resetDb();
  ag1Id = (await makeUser("agent_one", "SALES_AGENT")).id;
  ag2Id = (await makeUser("agent_two", "SALES_AGENT")).id;
  await makeUser("acct1", "SALES_ACCOUNTANT");
  await makeUser("sup1", "SALES_SUPERVISOR");
  await makeUser("edit1", "SALES_EDITOR");
  admin = await login("lol");
  ag1 = await login("agent_one");
  ag2 = await login("agent_two");
  acct = await login("acct1");
  sup = await login("sup1");
  edit = await login("edit1");
  const cat = await api(admin).post("/api/inventory/categories").send({ name: "هدايا", groupId: GROUP_ACCESSORIES });
  const w = await api(admin).post("/api/inventory").send({ unit: "قطعة", categoryId: cat.body.category.id, name: "ساعة", initialQuantity: 100, unitPrice: 100, sellPrice: 180 });
  watch = w.body.item;
  const p = await api(admin).post("/api/sales/products").send({ name: "بوكس", components: [{ itemId: watch.id, quantity: 1 }] });
  box = p.body.product;
});

describe("الترقيم وحسابات الفتيات", () => {
  it("بلا Prefix لا يمكن إنشاء أوردر، والإدارة وحدها تحدد Prefix", async () => {
    const r = await api(ag1).post("/api/agent/orders").send({ date: D, customerName: "x", lines: [{ productId: box.id, quantity: 1 }] });
    expect(r.status).toBe(400);
    expect((await api(ag1).put(`/api/sales-agents/${ag1Id}/prefix`).send({ prefix: 500 })).status).toBe(403);
    expect((await api(acct).put(`/api/sales-agents/${ag1Id}/prefix`).send({ prefix: 500 })).status).toBe(403);
    expect((await api(admin).put(`/api/sales-agents/${ag1Id}/prefix`).send({ prefix: 500 })).status).toBe(200);
    expect((await api(admin).put(`/api/sales-agents/${ag2Id}/prefix`).send({ prefix: 600 })).status).toBe(200);
    expect((await api(admin).put(`/api/sales-agents/${ag2Id}/prefix`).send({ prefix: 500 })).status).toBe(409); // مستخدم
  });

  it("ترقيم مستقل لكل فتاة ولا يُعاد استخدام الرقم بعد الحذف", async () => {
    const a1 = await mk(ag1);
    const a2 = await mk(ag1);
    const b1 = await mk(ag2);
    expect([a1.waybill, a2.waybill, b1.waybill]).toEqual(["50001", "50002", "60001"]);
    expect((await api(ag1).delete(`/api/agent/orders/${a2.id}`)).status).toBe(200);
    const a3 = await mk(ag1);
    expect(a3.waybill).toBe("50003");
  });

  it("إنشاء متزامن لا يكرر الأرقام", async () => {
    const rs = await Promise.all(Array.from({ length: 6 }, () => mk(ag2)));
    const nums = rs.map((r) => r.waybill);
    expect(new Set(nums).size).toBe(6);
  });

  it("تجاوز نطاق الفتاة (قبل Prefix التالي) مرفوض ولا يلمس فتاة أخرى", async () => {
    await api(admin).put(`/api/sales-agents/${(await makeUser("agent_three", "SALES_AGENT")).id}/prefix`).send({ prefix: 501 });
    await prisma().salesAgentProfile.update({ where: { userId: ag1Id }, data: { nextSeq: 100 } });
    const r = await api(ag1).post("/api/agent/orders").send({ date: D, customerName: "x", lines: [{ productId: box.id, quantity: 1 }] });
    expect(r.status).toBe(409);
    await prisma().salesAgentProfile.update({ where: { userId: ag1Id }, data: { nextSeq: 10 } });
  });

  it("تعارض النطاق عند ضبط Prefix جديد مرفوض، وتغيير Prefix بعد الحجز مرفوض", async () => {
    expect((await api(admin).put(`/api/sales-agents/${ag1Id}/prefix`).send({ prefix: 700 })).status).toBe(409); // حجزت أرقاماً
    const u = await makeUser("agent_four", "SALES_AGENT");
    expect((await api(admin).put(`/api/sales-agents/${u.id}/prefix`).send({ prefix: 502 })).status).toBe(200);
  });
});

describe("العزل والصلاحيات", () => {
  let foreign: { id: string };
  beforeAll(async () => {
    foreign = await mk(ag2, 50);
  });
  it("الفتاة لا ترى ولا تعدّل ولا تحذف ولا تصدّر ولا تلغي أوردر فتاة أخرى (404)", async () => {
    const list = await api(ag1).get("/api/agent/orders");
    expect(list.status).toBe(200);
    expect(list.body.orders.every((o: any) => o.waybill.startsWith("500"))).toBe(true);
    expect(list.body.orders.find((o: any) => o.id === foreign.id)).toBeUndefined();
    expect((await api(ag1).patch(`/api/agent/orders/${foreign.id}`).send({ notes: "x" })).status).toBe(404);
    expect((await api(ag1).delete(`/api/agent/orders/${foreign.id}`)).status).toBe(404);
    const ex = await exportIds(ag1, [foreign.id]);
    expect(ex.body.results[0].result).toBe("ERROR");
    expect((await api(ag1).post(`/api/agent/orders/${foreign.id}/cancel`).send({ reason: "سبب", confirm: true })).status).toBe(404);
    expect((await prisma().agentOrder.findUniqueOrThrow({ where: { id: foreign.id } })).status).toBe("DRAFT");
  });
  it("الفتاة لا تصل لمسارات المبيعات والمخزون والمحاسب والإدارة", async () => {
    for (const url of ["/api/sales/orders?date=2026-11-10", "/api/sales/products", "/api/inventory", "/api/accounting/agents", "/api/accounting/orders", "/api/users", "/api/sales-agents"]) {
      expect((await api(ag1).get(url)).status, url).toBe(403);
    }
  });
  it("المحاسب لا يصل لمساحة الفتاة، ومحاسب/مشرف/منفذ لا يصلون لـ /api/agent", async () => {
    for (const t of [acct, sup, edit]) expect((await api(t).get("/api/agent/orders")).status).toBe(403);
  });
  it("منفذ الأوردرات وفتاة لا يصلان لمسارات الحسابات", async () => {
    for (const t of [edit, sup]) expect((await api(t).get("/api/accounting/agents")).status).toBe(403);
  });
});

describe("التصدير وتدفق المخزون", () => {
  let o: { id: string; waybill: string };
  let so: string;
  it("الأوردر غير المصدَّر لا يظهر في المبيعات ويمكن تعديله، ولا خصم مخزون", async () => {
    o = await mk(ag1);
    const before = await stock();
    expect((await api(ag1).patch(`/api/agent/orders/${o.id}`).send({ notes: "تعديل" })).status).toBe(200);
    const list = await api(admin).get(`/api/sales/orders?q=${o.waybill}`);
    expect(list.body.orders.length).toBe(0);
    expect(await stock()).toBe(before);
  });
  it("التصدير يتطلب تأكيداً، ثم ينشئ أوردر المبيعات دون خصم", async () => {
    const before = await stock();
    const mv = await movements();
    expect((await api(ag1).post("/api/agent/orders/export").send({ ids: [o.id] })).status).toBe(400);
    const r = await exportIds(ag1, [o.id]);
    expect(r.status).toBe(200);
    expect(r.body.results[0].result).toBe("EXPORTED");
    so = await salesOrderOf(o.id);
    const list = await api(admin).get(`/api/sales/orders?q=${o.waybill}`);
    expect(list.body.orders.length).toBe(1);
    expect(list.body.orders[0].status).toBe("REGISTERED");
    expect(await stock()).toBe(before);
    expect(await movements()).toBe(mv);
    const row = await prisma().salesOrder.findUniqueOrThrow({ where: { id: so } });
    expect(row.agentId).toBe(ag1Id);
    expect(row.source).toBe("AGENT");
    expect(Number(row.agentSellPrice)).toBe(180); // محسوب من مكونات البوكس لا مُدخل
  });
  it("التصدير المكرر لا ينشئ نسخة ثانية", async () => {
    const r = await exportIds(ag1, [o.id]);
    expect(r.body.results[0].result).toBe("ALREADY_EXPORTED");
    expect(await prisma().salesOrder.count({ where: { waybill: o.waybill } })).toBe(1);
    const both = await Promise.all([exportIds(ag1, [o.id]), exportIds(ag1, [o.id])]);
    expect(both.every((x) => x.status === 200)).toBe(true);
    expect(await prisma().salesOrder.count({ where: { waybill: o.waybill } })).toBe(1);
  });
  it("بعد التصدير: لا تعديل ولا حذف (409)، والإدارة لا تحذف أوردر فتاة", async () => {
    expect((await api(ag1).patch(`/api/agent/orders/${o.id}`).send({ notes: "x" })).status).toBe(409);
    expect((await api(ag1).delete(`/api/agent/orders/${o.id}`)).status).toBe(409);
    expect((await api(admin).delete(`/api/sales/orders/${so}`)).status).toBe(409);
  });
  it("لا شحن ولا تسليم قبل «تم التنفيذ»", async () => {
    expect((await acctStatus(so, "SHIPPED")).status).toBe(409);
    expect((await api(admin).patch(`/api/sales/orders/${so}`).send({ status: "SHIPPED" })).status).toBe(409);
  });
  it("«تم التنفيذ» يخصم مرة واحدة؛ الشحن والتسليم لا يخصمان؛ المشرف والمنفذ لا يشحنان", async () => {
    const before = await stock();
    expect((await execute(so)).status).toBe(200);
    expect(await stock()).toBe(before - 1);
    for (const st of ["SHIPPED", "DELIVERED"]) {
      expect((await api(sup).patch(`/api/sales/orders/${so}`).send({ status: st })).status, `sup ${st}`).toBe(403);
      expect((await api(edit).patch(`/api/sales/orders/${so}`).send({ status: st })).status, `edit ${st}`).toBe(403);
      expect((await api(acct).patch(`/api/sales/orders/${so}`).send({ status: st })).status, `acct on /sales ${st}`).toBe(403);
    }
    const mv = await movements();
    expect((await acctStatus(so, "SHIPPED")).status).toBe(200);
    expect(await stock()).toBe(before - 1);
    expect((await acctStatus(so, "DELIVERED")).status).toBe(200);
    expect(await stock()).toBe(before - 1);
    expect(await movements()).toBe(mv);
    const logs = await api(acct).get(`/api/accounting/orders/${so}/log`);
    expect(logs.body.logs.map((l: any) => l.to)).toEqual(expect.arrayContaining(["SHIPPED", "DELIVERED"]));
  });
  it("المحاسب لا يرسل حالات غير شحن/تسليم", async () => {
    for (const st of ["REGISTERED", "EXECUTED", "RETURNED"]) expect((await acctStatus(so, st)).status, st).toBe(400);
  });
});

describe("علامة المرتجع والإلغاء وسعر الشحن والحسابات", () => {
  const deliver = async (token: string, price: number) => {
    const o = await mk(token, price);
    expect((await exportIds(token, [o.id])).status).toBe(200);
    const so = await salesOrderOf(o.id);
    expect((await execute(so)).status).toBe(200);
    expect((await acctStatus(so, "DELIVERED")).status).toBe(200);
    return { o, so };
  };

  it("حساب 7 جنيه و3% للمسلَّم فقط (مع استبعاد المشحون والمرتجع والملغي) وإعادة الاحتساب", async () => {
    // فتاة جديدة نظيفة
    const u = await makeUser("agent_calc", "SALES_AGENT");
    await api(admin).put(`/api/sales-agents/${u.id}/prefix`).send({ prefix: 800 });
    const t = await login("agent_calc");
    const a = await deliver(t, 100);
    const b = await deliver(t, 200);
    const c = await deliver(t, 300.5);
    // مشحون فقط
    const d = await mk(t, 999);
    await exportIds(t, [d.id]);
    const dso = await salesOrderOf(d.id);
    await execute(dso);
    await acctStatus(dso, "SHIPPED");
    // مسودة
    await mk(t, 777);

    let dash = (await api(t).get("/api/agent/dashboard")).body.summary;
    expect(dash).toMatchObject({ total: 5, unexported: 1, exported: 4, delivered: 3, shipped: 1, deliveredSales: 600.5, fixedFee: 21, commission: 18.02, totalDue: 39.02 });

    // سعر الشحن لا يدخل العمولة
    expect((await api(acct).put(`/api/accounting/orders/${a.so}/shipping`).send({ shippingPrice: 40 })).status).toBe(200);
    dash = (await api(t).get("/api/agent/dashboard")).body.summary;
    expect(dash.commission).toBe(18.02);
    const agentList = await api(t).get("/api/agent/orders");
    expect(JSON.stringify(agentList.body)).not.toContain("shippingPrice");

    // علامة مرتجع: تستبعد الأوردر بلا حركة مخزون، وإزالتها تعيده
    const mv = await movements();
    const q = await stock();
    expect((await api(acct).patch(`/api/accounting/orders/${b.so}/return-flag`).send({ flagged: true })).status).toBe(200);
    expect(await movements()).toBe(mv);
    expect(await stock()).toBe(q);
    dash = (await api(t).get("/api/agent/dashboard")).body.summary;
    expect(dash).toMatchObject({ delivered: 2, returned: 1, deliveredSales: 400.5, fixedFee: 14, commission: 12.02, totalDue: 26.02 });
    expect((await api(acct).patch(`/api/accounting/orders/${b.so}/return-flag`).send({ flagged: false })).status).toBe(200);
    dash = (await api(t).get("/api/agent/dashboard")).body.summary;
    expect(dash.delivered).toBe(3);

    // إلغاء بعد التصدير: سبب إلزامي وتأكيد، بلا حركة مخزون، ويُستبعد من الحساب ويبقى محفوظاً
    expect((await api(t).post(`/api/agent/orders/${c.o.id}/cancel`).send({ confirm: true })).status).toBe(400);
    expect((await api(t).post(`/api/agent/orders/${c.o.id}/cancel`).send({ reason: "  ", confirm: true })).status).toBe(400);
    expect((await api(t).post(`/api/agent/orders/${c.o.id}/cancel`).send({ reason: "العميلة ألغت" })).status).toBe(400);
    const mv2 = await movements();
    const cancelled = await api(t).post(`/api/agent/orders/${c.o.id}/cancel`).send({ reason: "العميلة ألغت", confirm: true });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.order.status).toBe("CANCELLED");
    expect(cancelled.body.order.cancelReason).toBe("العميلة ألغت");
    expect(cancelled.body.order.waybill).toBe(c.o.waybill);
    expect(await movements()).toBe(mv2);
    expect((await api(t).post(`/api/agent/orders/${c.o.id}/cancel`).send({ reason: "تاني", confirm: true })).status).toBe(409);
    dash = (await api(t).get("/api/agent/dashboard")).body.summary;
    expect(dash).toMatchObject({ delivered: 2, cancelled: 1, deliveredSales: 300, fixedFee: 14, commission: 9, totalDue: 23 });
    // لا تغيير حالة لأوردر ملغي
    expect((await acctStatus(c.so, "SHIPPED")).status).toBe(409);
    expect((await api(admin).patch(`/api/sales/orders/${c.so}`).send({ status: "RETURNED" })).status).toBe(409);
    // رقم البوليصة محفوظ ولا يُعاد استخدامه
    const next = await mk(t, 10);
    expect(Number(next.waybill)).toBeGreaterThan(Number(d.waybill));
  });

  it("لوحة المحاسب والحسابات العامة: كل الفتيات، التفاصيل، الشحن مرة واحدة، النسب", async () => {
    const all = await api(acct).get("/api/accounting/agents");
    expect(all.status).toBe(200);
    const calc = all.body.agents.find((a: any) => a.prefix === 800);
    expect(calc).toMatchObject({ delivered: 2, deliveredSales: 300, fixedFee: 14, commission: 9, totalDue: 23 });
    expect(all.body.agents.length).toBeGreaterThanOrEqual(5);
    const detail = await api(acct).get(`/api/accounting/agents/${calc.agentId}?bucket=delivered`);
    expect(detail.status).toBe(200);
    expect(detail.body.orders.length).toBe(2);
    const gen = (await api(acct).get("/api/accounting/general")).body.general;
    // المسلَّم من الفتيات: 100+200 (calc) + 180 (agent_one، محسوب من مكونات البوكس) = 480 ؛ شحن 40 للأوردر 100 فقط
    expect(gen.deliveredSales).toBe(480);
    expect(gen.totalShipping).toBe(40);
    expect(gen.grandTotal).toBe(520);
    expect(gen.salesPercent + gen.shippingPercent).toBeCloseTo(100, 1);
    // تغيير حالة المسلَّم إلى شحن يعيد الاحتساب
    const so = (await api(acct).get(`/api/accounting/agents/${calc.agentId}?bucket=delivered`)).body.orders[0].id;
    expect((await acctStatus(so, "SHIPPED")).status).toBe(200);
    const again = (await api(acct).get("/api/accounting/agents")).body.agents.find((a: any) => a.prefix === 800);
    expect(again.delivered).toBe(1);
  });

  it("سعر الشحن: يدخله المحاسب، يُعدَّل، ويمكن مسحه، وبعد التنفيذ فقط", async () => {
    const o = await mk(ag2, 10);
    await exportIds(ag2, [o.id]);
    const so = await salesOrderOf(o.id);
    expect((await api(acct).put(`/api/accounting/orders/${so}/shipping`).send({ shippingPrice: 30 })).status).toBe(400); // قبل التنفيذ
    await execute(so);
    expect((await api(acct).put(`/api/accounting/orders/${so}/shipping`).send({ shippingPrice: -5 })).status).toBe(400);
    expect((await api(acct).put(`/api/accounting/orders/${so}/shipping`).send({ shippingPrice: 30.555 })).status).toBe(400);
    const ok = await api(acct).put(`/api/accounting/orders/${so}/shipping`).send({ shippingPrice: 32.5 });
    expect(ok.body.order.shippingPrice).toBe(32.5);
    expect((await api(acct).put(`/api/accounting/orders/${so}/shipping`).send({ shippingPrice: 35 })).body.order.shippingPrice).toBe(35);
    expect((await api(acct).put(`/api/accounting/orders/${so}/shipping`).send({ shippingPrice: null })).body.order.shippingPrice).toBeNull();
    expect((await api(sup).put(`/api/accounting/orders/${so}/shipping`).send({ shippingPrice: 1 })).status).toBe(403);
  });

  it("المحاسب لا يعدّل محتوى الأوردر ولا يحذفه ولا ينفّذ مرتجعاً مخزنياً", async () => {
    const o = await mk(ag2, 10);
    await exportIds(ag2, [o.id]);
    const so = await salesOrderOf(o.id);
    await execute(so);
    expect((await api(acct).patch(`/api/sales/orders/${so}`).send({ notes: "x" })).status).toBe(403);
    expect((await api(acct).patch(`/api/sales/orders/${so}`).send({ status: "RETURNED" })).status).toBe(403);
    expect((await api(acct).delete(`/api/sales/orders/${so}`)).status).toBe(403);
    expect((await api(acct).post(`/api/sales/orders/${so}/lines`).send({ productId: box.id, quantity: 1 })).status).toBe(403);
    const r = await api(acct).get("/api/accounting/orders");
    expect(r.status).toBe(200);
    expect(r.body.orders.every((x: any) => x.source === "MANUAL" || x.agentName)).toBe(true);
  });
});

describe("سعر البيع محسوب تلقائياً من مكونات الأوردر (لا تدخله الفتاة)", () => {
  it("يتجاهل أي سعر ترسله الفتاة، ويتبع سعر بيع المكونات قبل التنفيذ، ويثبت بعد التنفيذ", async () => {
    const cat = (await prisma().inventoryCategory.findFirstOrThrow()).id;
    const it = (await api(admin).post("/api/inventory").send({ unit: "قطعة", categoryId: cat, name: "صنف سعر آلي", initialQuantity: 50, unitPrice: 5, sellPrice: 50 })).body.item;
    const bx = (await api(admin).post("/api/sales/products").send({ name: "بوكس آلي", components: [{ itemId: it.id, quantity: 2 }] })).body.product;
    // سعر مُرسَل من الفتاة يُتجاهل: 2 × 50 = 100
    const r = await api(ag1).post("/api/agent/orders").send({ date: D, customerName: "عميلة", sellPrice: 9999, lines: [{ productId: bx.id, quantity: 1 }] });
    expect(r.status).toBe(201);
    expect(r.body.order.sellPrice).toBe(100);
    const id = r.body.order.id as string;
    // تغيّر سعر بيع المكوّن قبل التنفيذ ← تعديل المسودة يعيد الحساب (2 × 70 = 140)
    await api(admin).patch(`/api/inventory/${it.id}`).send({ sellPrice: 70 });
    const upd = await api(ag1).patch(`/api/agent/orders/${id}`).send({ notes: "تحديث" });
    expect(upd.body.order.sellPrice).toBe(140);
    expect((await exportIds(ag1, [id])).status).toBe(200);
    const so = await salesOrderOf(id);
    expect((await execute(so)).status).toBe(200);
    // بعد التنفيذ يثبت السعر: تغيير سعر المخزون لا يغيّره عند الفتاة ولا عند المحاسب
    await api(admin).patch(`/api/inventory/${it.id}`).send({ sellPrice: 999 });
    const mine = await api(ag1).get(`/api/agent/orders?q=${r.body.order.waybill}`);
    expect(mine.body.orders[0].sellPrice).toBe(140);
    const follow = await api(acct).get(`/api/accounting/orders?q=${r.body.order.waybill}`);
    expect(follow.body.orders[0].sellPrice).toBe(140);
    // لا يظهر للفتاة أي سعر مكوّن
    expect(JSON.stringify(mine.body)).not.toContain("unitSell");
  });
  it("لا يوجد حقل سعر بيع في إنشاء الأوردر أو تعديله (يُتجاهل بصمت ولا يؤثر)", async () => {
    const o = await mk(ag1);
    const res = await api(ag1).patch(`/api/agent/orders/${o.id}`).send({ sellPrice: 1 });
    expect(res.status).toBe(400); // لا حقول صالحة للتعديل
  });
});

describe("تعديل محتويات البوكس داخل أوردر الفتاة", () => {
  let strap: { id: string };
  let retired: { id: string };
  const lineBody = (components?: { itemId: string; quantity: number }[], quantity = 1) => ({ productId: box.id, quantity, ...(components ? { components } : {}) });
  const create = (token: string, lines: unknown[]) => api(token).post("/api/agent/orders").send({ date: D, customerName: "عميلة", lines });
  const sellOf = async (id: string) => Number((await prisma().agentOrder.findUniqueOrThrow({ where: { id } })).sellPrice);

  beforeAll(async () => {
    const cat = (await prisma().inventoryCategory.findFirstOrThrow()).id;
    strap = (await api(admin).post("/api/inventory").send({ unit: "قطعة", categoryId: cat, name: "سوار", initialQuantity: 50, unitPrice: 20, sellPrice: 50 })).body.item;
    retired = (await api(admin).post("/api/inventory").send({ unit: "قطعة", categoryId: cat, name: "صنف مؤرشف", initialQuantity: 5, unitPrice: 1, sellPrice: 1 })).body.item;
    await prisma().inventoryItem.update({ where: { id: retired.id }, data: { isActive: false } });
  });

  it("بلا تعديل تُنسخ محتويات المنتج الثابت، وتظهر للفتاة (اسم وكمية بلا أسعار)", async () => {
    const r = await create(ag1, [lineBody()]);
    expect(r.status).toBe(201);
    const comps = r.body.order.lines[0].components;
    expect(comps).toEqual([{ itemId: watch.id, itemName: "ساعة", unit: "قطعة", quantity: 1 }]);
    expect(JSON.stringify(r.body.order)).not.toMatch(/unitCost|unitSell|unitPrice/);
    expect(JSON.stringify(r.body.order.lines)).not.toMatch(/sellPrice|price/i);
    expect(r.body.order.sellPrice).toBe(180);
  });

  it("الفتاة تعدّل كمية مكوّن وتضيف صنفاً وتحذف آخر، والسعر يُعاد حسابه، والمنتج الثابت لا يتغير", async () => {
    const r = await create(ag1, [lineBody([{ itemId: watch.id, quantity: 2 }, { itemId: strap.id, quantity: 1 }])]);
    expect(r.status).toBe(201);
    expect(r.body.order.sellPrice).toBe(2 * 180 + 50);
    expect(r.body.order.lines[0].components.map((c: { itemName: string; quantity: number }) => [c.itemName, c.quantity]).sort()).toEqual([["ساعة", 2], ["سوار", 1]]);
    // المنتج الثابت كما هو
    const def = await prisma().salesProductComponent.findMany({ where: { productId: box.id } });
    expect(def.map((c) => [c.itemId, Number(c.quantity)])).toEqual([[watch.id, 1]]);
    // حذف الساعة والإبقاء على السوار فقط
    const up = await api(ag1).patch(`/api/agent/orders/${r.body.order.id}`).send({ lines: [lineBody([{ itemId: strap.id, quantity: 3 }])] });
    expect(up.status).toBe(200);
    expect(up.body.order.sellPrice).toBe(150);
    expect(up.body.order.lines[0].components).toHaveLength(1);
    expect(await sellOf(r.body.order.id)).toBe(150);
  });

  it("الكمية تُضرب في عدد البوكسات، والتعديل لا يتحوّل إلى أوردرات أخرى", async () => {
    const r = await create(ag1, [lineBody([{ itemId: watch.id, quantity: 1.5 }], 4)]);
    expect(r.body.order.sellPrice).toBe(Math.round(1.5 * 180 * 4 * 100) / 100);
    const other = await create(ag1, [lineBody()]);
    expect(other.body.order.lines[0].components[0].quantity).toBe(1);
  });

  it("بوكسان من نفس المنتج بمحتويات مختلفة يبقيان بندين، وبنفس المحتويات يندمجان", async () => {
    const r = await create(ag1, [lineBody([{ itemId: watch.id, quantity: 2 }]), lineBody([{ itemId: strap.id, quantity: 1 }]), lineBody([{ itemId: watch.id, quantity: 2 }])]);
    expect(r.status).toBe(201);
    expect(r.body.order.lines).toHaveLength(2);
    expect(r.body.order.lines.map((l: { quantity: number }) => l.quantity).sort()).toEqual([1, 2]);
  });

  it("تحقق المدخلات: صنف غير موجود/مؤرشف، كمية صفر أو سالبة، أكثر من 3 خانات، محتوى فارغ", async () => {
    expect((await create(ag1, [lineBody([{ itemId: "nope", quantity: 1 }])])).status).toBe(404);
    expect((await create(ag1, [lineBody([{ itemId: retired.id, quantity: 1 }])])).status).toBe(400);
    expect((await create(ag1, [lineBody([{ itemId: watch.id, quantity: 0 }])])).status).toBe(400);
    expect((await create(ag1, [lineBody([{ itemId: watch.id, quantity: -1 }])])).status).toBe(400);
    expect((await create(ag1, [lineBody([{ itemId: watch.id, quantity: 0.0001 }])])).status).toBe(400);
    expect((await create(ag1, [lineBody([])])).status).toBe(400);
  });

  it("التصدير ينسخ المحتويات المعدَّلة إلى أوردر المبيعات، والتنفيذ يخصم المعدَّل فقط", async () => {
    const before = await stock();
    const r = await create(ag1, [lineBody([{ itemId: watch.id, quantity: 3 }, { itemId: strap.id, quantity: 2 }], 2)]);
    const ex = await exportIds(ag1, [r.body.order.id]);
    expect(ex.body.results[0].result).toBe("EXPORTED");
    const so = await prisma().salesOrder.findUniqueOrThrow({ where: { id: await salesOrderOf(r.body.order.id) }, include: { lines: { include: { components: true } } } });
    expect(so.lines[0].quantity).toBe(2);
    expect(so.lines[0].components.map((c) => [c.itemId, Number(c.quantity)]).sort()).toEqual([[watch.id, 3], [strap.id, 2]].sort());
    expect(await stock()).toBe(before); // لا خصم قبل التنفيذ
    expect((await execute(so.id)).status).toBe(200);
    expect(await stock()).toBe(before - 3 * 2); // 3 ساعات × بوكسين
    const st = Number((await prisma().inventoryItem.findUniqueOrThrow({ where: { id: strap.id } })).quantity);
    expect(st).toBe(50 - 2 * 2);
    // سعر البيع بعد التصدير يتبع أوردر المبيعات
    const view = await api(ag1).get("/api/agent/orders");
    expect(view.body.orders.find((o: { id: string }) => o.id === r.body.order.id).sellPrice).toBe((3 * 180 + 2 * 50) * 2);
  });

  it("لا تعديل للمحتويات بعد التصدير (409) ولا على أوردر فتاة أخرى (404)", async () => {
    const r = await create(ag1, [lineBody()]);
    expect((await api(ag2).patch(`/api/agent/orders/${r.body.order.id}`).send({ lines: [lineBody([{ itemId: strap.id, quantity: 1 }])] })).status).toBe(404);
    await exportIds(ag1, [r.body.order.id]);
    expect((await api(ag1).patch(`/api/agent/orders/${r.body.order.id}`).send({ lines: [lineBody([{ itemId: strap.id, quantity: 1 }])] })).status).toBe(409);
  });

  it("سطر قديم بلا صفوف محتويات (قبل الميزة) يُقرأ من المنتج الثابت ويُصدَّر سليماً", async () => {
    const r = await create(ag1, [lineBody()]);
    await prisma().agentOrderLineComponent.deleteMany({ where: { line: { orderId: r.body.order.id } } });
    const list = await api(ag1).get("/api/agent/orders");
    expect(list.body.orders.find((o: { id: string }) => o.id === r.body.order.id).lines[0].components).toHaveLength(1);
    const up = await api(ag1).patch(`/api/agent/orders/${r.body.order.id}`).send({ notes: "تعديل ملاحظات فقط" });
    expect(up.body.order.sellPrice).toBe(180);
    const ex = await exportIds(ag1, [r.body.order.id]);
    expect(ex.body.results[0].result).toBe("EXPORTED");
    const so = await prisma().salesOrder.findUniqueOrThrow({ where: { id: await salesOrderOf(r.body.order.id) }, include: { lines: { include: { components: true } } } });
    expect(so.lines[0].components).toHaveLength(1);
  });

  it("مساران جديدان للفتاة فقط: /products بمحتوياتها و/items بلا أسعار، ولا يصل لهما غير الفتاة", async () => {
    const p = await api(ag1).get("/api/agent/products");
    expect(p.status).toBe(200);
    const b = p.body.products.find((x: { id: string }) => x.id === box.id);
    expect(b.components[0]).toEqual({ itemId: watch.id, itemName: "ساعة", unit: "قطعة", quantity: 1 });
    const it = await api(ag1).get("/api/agent/items");
    expect(it.status).toBe(200);
    expect(it.body.items.some((x: { id: string }) => x.id === retired.id)).toBe(false); // المؤرشف لا يظهر
    expect(Object.keys(it.body.items[0]).sort()).toEqual(["id", "name", "unit"]);
    expect(JSON.stringify(p.body)).not.toMatch(/unitPrice|sellPrice|quantity":\d+,"available/);
    for (const t of [acct, sup, edit]) {
      expect((await api(t).get("/api/agent/items")).status).toBe(403);
    }
  });
});
