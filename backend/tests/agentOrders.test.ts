import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db.ts";
import { api, GROUP_ACCESSORIES, login, makeUser, resetDb } from "./helpers.ts";

let admin: string, ag1: string, ag2: string, acct: string, sup: string, edit: string, agSup: string;
let ag1Id: string, ag2Id: string, agSupId: string;
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
const exportIds = (_token: string, ids: string[]) => api(agSup).post("/api/agent-supervisor/orders/export").send({ ids, confirm: true });
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
  agSupId = (await makeUser("agent_sup1", "SALES_AGENT_SUPERVISOR")).id;
  admin = await login("lol");
  ag1 = await login("agent_one");
  ag2 = await login("agent_two");
  acct = await login("acct1");
  sup = await login("sup1");
  edit = await login("edit1");
  agSup = await login("agent_sup1");
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
    // التصدير أصبح محصوراً في مشرف الفتيات (والإدارة): الفتاة تتلقى 403 حتى على أوردراتها
    expect((await api(ag1).post("/api/agent/orders/export").send({ ids: [foreign.id], confirm: true })).status).toBe(403);
    expect((await api(ag1).post("/api/agent-supervisor/orders/export").send({ ids: [foreign.id], confirm: true })).status).toBe(403);
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
    expect((await api(agSup).post("/api/agent-supervisor/orders/export").send({ ids: [o.id] })).status).toBe(400);
    const r = await exportIds(agSup, [o.id]);
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
  it("بعد التصدير: لا تعديل ولا حذف من الفتاة (409)، وغير ADMIN ممنوع من حذف أوردر المبيعات (403)", async () => {
    const mgrTok = await login("amr");
    expect((await api(ag1).patch(`/api/agent/orders/${o.id}`).send({ notes: "x" })).status).toBe(409);
    expect((await api(ag1).delete(`/api/agent/orders/${o.id}`)).status).toBe(409);
    expect((await api(mgrTok).delete(`/api/sales/orders/${so}`)).status).toBe(403);
    expect((await api(sup).delete(`/api/sales/orders/${so}`)).status).toBe(403);
    expect((await api(edit).delete(`/api/sales/orders/${so}`)).status).toBe(403);
    expect((await api(acct).delete(`/api/sales/orders/${so}`)).status).toBe(403);
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

    // لا إلغاء من الفتاة بعد التنفيذ أو التسليم (409)
    expect((await api(t).post(`/api/agent/orders/${c.o.id}/cancel`).send({ reason: "بعد التسليم", confirm: true })).status).toBe(409);

    // إلغاء بعد التصدير وقبل التنفيذ: سبب إلزامي وتأكيد، بلا حركة مخزون، ويُستبعد من الحساب ويبقى محفوظاً
    const e = await mk(t, 150);
    expect((await exportIds(t, [e.id])).status).toBe(200);
    const eso = await salesOrderOf(e.id);
    expect((await api(t).post(`/api/agent/orders/${e.id}/cancel`).send({ confirm: true })).status).toBe(400);
    expect((await api(t).post(`/api/agent/orders/${e.id}/cancel`).send({ reason: "  ", confirm: true })).status).toBe(400);
    expect((await api(t).post(`/api/agent/orders/${e.id}/cancel`).send({ reason: "العميلة ألغت" })).status).toBe(400);
    const mv2 = await movements();
    const cancelled = await api(t).post(`/api/agent/orders/${e.id}/cancel`).send({ reason: "العميلة ألغت", confirm: true });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.order.status).toBe("CANCELLED");
    expect(cancelled.body.order.cancelReason).toBe("العميلة ألغت");
    expect(cancelled.body.order.waybill).toBe(e.waybill);
    expect(await movements()).toBe(mv2);
    expect((await api(t).post(`/api/agent/orders/${e.id}/cancel`).send({ reason: "تاني", confirm: true })).status).toBe(409);
    dash = (await api(t).get("/api/agent/dashboard")).body.summary;
    expect(dash).toMatchObject({ delivered: 3, cancelled: 1, deliveredSales: 600.5, fixedFee: 21, commission: 18.02, totalDue: 39.02 });
    // لا تغيير حالة لأوردر ملغي
    expect((await acctStatus(eso, "SHIPPED")).status).toBe(409);
    expect((await api(admin).patch(`/api/sales/orders/${eso}`).send({ status: "RETURNED" })).status).toBe(409);
    // رقم البوليصة محفوظ ولا يُعاد استخدامه
    const next = await mk(t, 10);
    expect(Number(next.waybill)).toBeGreaterThan(Number(e.waybill));
  });

  it("لوحة المحاسب والحسابات العامة: كل الفتيات، التفاصيل، الشحن مرة واحدة، النسب", async () => {
    const all = await api(acct).get("/api/accounting/agents");
    expect(all.status).toBe(200);
    const calc = all.body.agents.find((a: any) => a.prefix === 800);
    expect(calc).toMatchObject({ delivered: 3, deliveredSales: 600.5, fixedFee: 21, commission: 18.02, totalDue: 39.02 });
    expect(all.body.agents.length).toBeGreaterThanOrEqual(5);
    const detail = await api(acct).get(`/api/accounting/agents/${calc.agentId}?bucket=delivered`);
    expect(detail.status).toBe(200);
    expect(detail.body.orders.length).toBe(3);
    const gen = (await api(acct).get("/api/accounting/general")).body.general;
    // المسلَّم من الفتيات: 100+200+300.5 (calc) + 180 (agent_one، محسوب من مكونات البوكس) = 780.5 ؛ شحن 40 للأوردر 100 فقط
    expect(gen.deliveredSales).toBe(780.5);
    expect(gen.totalShipping).toBe(40);
    expect(gen.grandTotal).toBe(820.5);
    expect(gen.salesPercent + gen.shippingPercent).toBeCloseTo(100, 1);
    // تغيير حالة المسلَّم إلى شحن يعيد الاحتساب
    const so = (await api(acct).get(`/api/accounting/agents/${calc.agentId}?bucket=delivered`)).body.orders[0].id;
    expect((await acctStatus(so, "SHIPPED")).status).toBe(200);
    const again = (await api(acct).get("/api/accounting/agents")).body.agents.find((a: any) => a.prefix === 800);
    expect(again.delivered).toBe(2);
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

  it("مساران جديدان للفتاة فقط: /products بمحتوياتها و/items بلا أسعار مخزون، ولا يصل لهما غير الفتاة", async () => {
    const p = await api(ag1).get("/api/agent/products");
    expect(p.status).toBe(200);
    const b = p.body.products.find((x: { id: string }) => x.id === box.id);
    expect(b.fixedPrice).toBeNull();
    expect(b.components[0]).toEqual({ itemId: watch.id, itemName: "ساعة", unit: "قطعة", quantity: 1, addPrice: 0, removePrice: 0 });
    const it = await api(ag1).get("/api/agent/items");
    expect(it.status).toBe(200);
    expect(it.body.items.some((x: { id: string }) => x.id === retired.id)).toBe(false); // المؤرشف لا يظهر
    expect(Object.keys(it.body.items[0]).sort()).toEqual(["addPrice", "id", "name", "removePrice", "unit"]);
    expect(JSON.stringify(p.body)).not.toMatch(/unitPrice|sellPrice|costPerUnit|sellPerUnit|unitCost|unitSell|available/);
    expect(JSON.stringify(it.body)).not.toMatch(/unitPrice|sellPrice|costPerUnit|sellPerUnit|unitCost|unitSell|available/);
    for (const t of [acct, sup, edit]) {
      expect((await api(t).get("/api/agent/items")).status).toBe(403);
    }
  });
});

describe("تفاصيل متابعة المحاسب والبحث بالعميل/الهاتف مع الحفاظ على الصلاحيات", () => {
  it("يعرض تفاصيل العميل ومكونات البوكس والعدّادات ويدعم البحث بالعميل والهاتف دون كشف التكاليف أو توسيع الصلاحيات", async () => {
    const r = await api(ag1).post("/api/agent/orders").send({
      date: D,
      customerName: "سارة محمود",
      customerPhone: "01099887766",
      customerAddress: "المعادي — شارع 9 عمارة 12",
      notes: "التوصيل بعد العصر",
      lines: [{ productId: box.id, quantity: 1 }],
    });
    expect(r.status).toBe(201);
    const wb = r.body.order.waybill as string;
    expect((await exportIds(ag1, [r.body.order.id])).status).toBe(200);
    const soId = await salesOrderOf(r.body.order.id);
    expect((await execute(soId)).status).toBe(200);

    // قراءة التفاصيل من نقطة المحاسب والبحث بالاسم والهاتف
    const byName = await api(acct).get(`/api/accounting/orders?q=${encodeURIComponent("سارة محمود")}`);
    expect(byName.status).toBe(200);
    expect(byName.body.counts).toMatchObject({ all: expect.any(Number), EXECUTED: expect.any(Number) });
    const row = byName.body.orders.find((x: { id: string }) => x.id === soId);
    expect(row).toBeDefined();
    expect(row.waybill).toBe(wb);
    expect(row.customerName).toBe("سارة محمود");
    expect(row.customerPhone).toBe("01099887766");
    expect(row.customerAddress).toBe("المعادي — شارع 9 عمارة 12");
    expect(row.notes).toBe("التوصيل بعد العصر");
    expect(row.lines).toHaveLength(1);
    expect(row.lines[0].components[0]).toMatchObject({ itemName: "ساعة", unit: "قطعة", quantity: 1 });

    const byPhone = await api(acct).get("/api/accounting/orders?q=01099887766");
    expect(byPhone.status).toBe(200);
    expect(byPhone.body.orders.some((x: { id: string }) => x.id === soId)).toBe(true);

    // لا تسرب لأي أسعار تكلفة أو أسعار مكوّنات، وصلاحيات المحاسب تبقى محصورة تماماً
    expect(JSON.stringify(byName.body)).not.toMatch(/unitCost|unitPrice|unitSell|costTotal|profit|available/);
    expect((await acctStatus(soId, "RETURNED")).status).toBe(400);
    expect((await acctStatus(soId, "SHIPPED")).status).toBe(200);
    expect((await api(acct).patch(`/api/sales/orders/${soId}`).send({ customerName: "تعديل" })).status).toBe(403);
    expect((await api(acct).delete(`/api/sales/orders/${soId}`)).status).toBe(403);
  });
});

describe("سعر كل بوكس من الفتاة + مصاريف الشحن + الحسابات العامة (سعر الخروج وفرق الصرف)", () => {
  it("يحفظ سعر البوكس والشحن ورقم الهاتف المزدوج، ويحسب سعر الخروج من المخزون وسعر الخروج والإجمالي الكلي وفرق الصرف بدقة", async () => {
    const agCustom = await makeUser("ag_box_price", "SALES_AGENT");
    await api(admin).put(`/api/sales-agents/${agCustom.id}/prefix`).send({ prefix: 950 });
    const agTok = await login("ag_box_price");

    const cat = (await prisma().inventoryCategory.findFirstOrThrow()).id;
    const item = (await api(admin).post("/api/inventory").send({ unit: "قطعة", categoryId: cat, name: "ميدالية نحاس", initialQuantity: 50, unitPrice: 80, sellPrice: 180 })).body.item;
    const customBox = (await api(admin).post("/api/sales/products").send({ name: "بوكس تهادوا تحابوا", components: [{ itemId: item.id, quantity: 1 }] })).body.product;

    const D2 = "2026-11-22";
    const created = await api(agTok).post("/api/agent/orders").send({
      date: D2,
      customerName: "هيثم جمال عبد المجيد احمد",
      customerPhone: "01097457278 / 01029793559",
      customerAddress: "محافظة الدقهلية مركز بلقاس",
      notes: "الاسم على الميدالية (هيثم)",
      shippingPrice: 70,
      lines: [{ productId: customBox.id, quantity: 1, boxPrice: 650 }],
    });
    expect(created.status).toBe(201);
    expect(created.body.order.customerPhone).toBe("01097457278 / 01029793559");
    expect(created.body.order.sellPrice).toBe(650);
    expect(created.body.order.shippingPrice).toBe(70);
    expect(created.body.order.totalWithShipping).toBe(720);
    expect(created.body.order.lines[0]).toMatchObject({ boxPrice: 650, lineTotal: 650 });

    const aoId = created.body.order.id as string;
    expect((await exportIds(agTok, [aoId])).status).toBe(200);
    const soId = await salesOrderOf(aoId);
    expect((await execute(soId)).status).toBe(200);
    expect((await acctStatus(soId, "DELIVERED")).status).toBe(200);

    const savedSo = await prisma().salesOrder.findUniqueOrThrow({ where: { id: soId }, include: { lines: true } });
    expect(Number(savedSo.agentSellPrice)).toBe(650);
    expect(Number(savedSo.shippingPrice)).toBe(70);
    expect(Number(savedSo.lines[0].boxPrice)).toBe(650);

    // الحسابات العامة لنفس اليوم: سعر الخروج من المخزون = 180، سعر الخروج = 650، الشحن = 70، الإجمالي = 720
    const gen = (await api(acct).get(`/api/accounting/general?from=${D2}&to=${D2}`)).body.general;
    expect(gen.deliveredCount).toBe(1);
    expect(gen.deliveredSales).toBe(180);
    expect(gen.deliveredExitPrice).toBe(650);
    expect(gen.totalShipping).toBe(70);
    expect(gen.grandTotal).toBe(720);
    expect(gen.priceDiff).toBe(470);
    expect(gen.priceDiffPercent).toBe(261.11);
    expect(gen.salesPercent).toBe(90.28);
    expect(gen.shippingPercent).toBe(9.72);

    // المتابعة تعيد سعر الخروج وسعر المخزون وسعر البوكس بدون أي تسريب للتكاليف
    const follow = await api(acct).get(`/api/accounting/orders?from=${D2}&to=${D2}`);
    expect(follow.status).toBe(200);
    expect(follow.body.orders[0]).toMatchObject({
      sellPrice: 650,
      inventorySellPrice: 180,
      shippingPrice: 70,
    });
    expect(follow.body.orders[0].lines[0]).toMatchObject({ boxPrice: 650, lineTotal: 650 });
    expect(JSON.stringify(follow.body)).not.toMatch(/unitCost|unitPrice|unitSell|costTotal|profit|available/);
  });

  it("مدير النظام ADMIN فقط يحذف أوردر فتاة منفّذ من المبيعات مع إعادة المخزون وحذف سجل الفتاة", async () => {
    const mgrTok = await login("amr");
    const ord = await mk(ag1, 180);
    expect((await exportIds(ag1, [ord.id])).status).toBe(200);
    const soId = await salesOrderOf(ord.id);
    const sBefore = await stock();
    expect((await execute(soId)).status).toBe(200);
    expect((await acctStatus(soId, "DELIVERED")).status).toBe(200);
    expect(await stock()).toBe(sBefore - 1);

    // غير ADMIN مرفوض دائماً
    expect((await api(mgrTok).delete(`/api/sales/orders/${soId}`)).status).toBe(403);
    expect((await api(sup).delete(`/api/sales/orders/${soId}`)).status).toBe(403);
    expect((await api(edit).delete(`/api/sales/orders/${soId}`)).status).toBe(403);
    expect((await api(acct).delete(`/api/sales/orders/${soId}`)).status).toBe(403);
    expect((await api(ag1).delete(`/api/sales/orders/${soId}`)).status).toBe(403);

    // ADMIN يحذف نهائياً ويعيد المخزون ويزيل سجل الفتاة
    const del = await api(admin).delete(`/api/sales/orders/${soId}`);
    expect(del.status).toBe(200);
    expect(await stock()).toBe(sBefore);
    expect(await prisma().salesOrder.findUnique({ where: { id: soId } })).toBeNull();
    expect(await prisma().agentOrder.findUnique({ where: { id: ord.id } })).toBeNull();
  });

  it("السعر التلقائي للبوكس الثابت + سعر الإضافة والحذف فقط (يتجاهل أي سعر مرسل من الفتاة ولا يعتمد على أسعار المخزون)", async () => {
    const agAuto = await makeUser("ag_fixed_auto", "SALES_AGENT");
    await api(admin).put(`/api/sales-agents/${agAuto.id}/prefix`).send({ prefix: 960 });
    const agTok = await login("ag_fixed_auto");

    const cat = (await prisma().inventoryCategory.findFirstOrThrow()).id;
    const mkAdjItem = async (name: string, unitPrice: number, sellPrice: number, addPrice: number, removePrice: number) =>
      (await api(admin).post("/api/inventory").send({ unit: "قطعة", categoryId: cat, name, initialQuantity: 100, unitPrice, sellPrice, addPrice, removePrice })).body.item;

    // أسعار التكلفة/البيع بالمخزون مختلفة عمداً عن أسعار الإضافة والحذف وعن سعر البوكس الثابت
    const iWatch = await mkAdjItem("ساعة ثابتة", 100, 180, 120, 90);
    const iPerfume = await mkAdjItem("عطر ثابت", 60, 110, 80, 50);
    const iRose = await mkAdjItem("وردة ثابتة", 10, 20, 25, 15);
    const iMug = await mkAdjItem("مج ثابت", 40, 70, 65, 45);

    const fixedBoxRes = await api(admin).post("/api/sales/products").send({
      name: "بوكس هدية ثابت",
      fixedPrice: 500, // مجموع بيع المخزون = 180 + 110 + 40 = 330؛ السعر الثابت اليدوي = 500
      components: [
        { itemId: iWatch.id, quantity: 1 },
        { itemId: iPerfume.id, quantity: 1 },
        { itemId: iRose.id, quantity: 2 },
      ],
    });
    expect(fixedBoxRes.status).toBe(201);
    const fixedBox = fixedBoxRes.body.product;
    expect(fixedBox.fixedPrice).toBe(500);
    expect(fixedBox.sellPerUnit).toBe(330);

    // 1. مسار /api/agent/products يكشف السعر الثابت وأسعار الإضافة/الحذف فقط دون تكلفة أو سعر بيع مخزون
    const agentProds = await api(agTok).get("/api/agent/products");
    expect(agentProds.status).toBe(200);
    const ap = agentProds.body.products.find((p: { id: string }) => p.id === fixedBox.id);
    expect(ap.fixedPrice).toBe(500);
    expect(ap.components.find((c: { itemId: string }) => c.itemId === iPerfume.id)).toMatchObject({ addPrice: 80, removePrice: 50 });
    expect(JSON.stringify(agentProds.body)).not.toMatch(/unitPrice|sellPrice|costPerUnit|sellPerUnit|unitCost|unitSell|available/);

    // 2. الفتاة تختار البوكس بلا إرسال boxPrice → يُحسب تلقائياً 500
    const D3 = "2026-11-24";
    const o1 = await api(agTok).post("/api/agent/orders").send({
      date: D3,
      customerName: "نور الهدى",
      lines: [{ productId: fixedBox.id, quantity: 1 }],
    });
    expect(o1.status).toBe(201);
    expect(o1.body.order.sellPrice).toBe(500);
    expect(o1.body.order.lines[0]).toMatchObject({ boxPrice: 500, lineTotal: 500 });

    // 3. لو أرسلت الفتاة سعراً مزيفاً boxPrice: 1 على بوكس بسعر ثابت ← السيرفر يتجاهله ويفرض 500
    const spoofed = await api(agTok).post("/api/agent/orders").send({
      date: D3,
      customerName: "محاولة تعديل يدوي",
      lines: [{ productId: fixedBox.id, quantity: 1, boxPrice: 1 }],
    });
    expect(spoofed.status).toBe(201);
    expect(spoofed.body.order.sellPrice).toBe(500);
    expect(spoofed.body.order.lines[0].boxPrice).toBe(500);

    // 4. تعديل المحتويات: حذف عطر (-50)، إنقاص الورد 2 ← 1 (-15)، إضافة مج × 2 (+130)
    // النتيجة = 500 - 50 - 15 + 130 = 565 (وليس مجموع المخزون!)
    const edited = await api(agTok).patch(`/api/agent/orders/${o1.body.order.id}`).send({
      shippingPrice: 70,
      lines: [
        {
          productId: fixedBox.id,
          quantity: 1,
          boxPrice: 999, // يُتجاهل دائماً للبوكس الثابت
          components: [
            { itemId: iWatch.id, quantity: 1 },
            { itemId: iRose.id, quantity: 1 },
            { itemId: iMug.id, quantity: 2 },
          ],
        },
      ],
    });
    expect(edited.status).toBe(200);
    expect(edited.body.order.sellPrice).toBe(565);
    expect(edited.body.order.totalWithShipping).toBe(635);
    expect(edited.body.order.lines[0]).toMatchObject({ boxPrice: 565, lineTotal: 565 });

    // 5. أوردر بكمية 2 بوكس معدّل ومضروب × 2 ← 565 × 2 = 1130، وحذف كل المكونات تقريباً يثبت السعر عند >= 0
    const cheapFixed = (
      await api(admin).post("/api/sales/products").send({
        name: "بوكس منخفض",
        fixedPrice: 50,
        components: [
          { itemId: iWatch.id, quantity: 1 }, // removePrice 90
          { itemId: iRose.id, quantity: 1 }, // removePrice 15
        ],
      })
    ).body.product;
    const clamped = await api(agTok).post("/api/agent/orders").send({
      date: D3,
      customerName: "سقف الصفر",
      lines: [{ productId: cheapFixed.id, quantity: 1, components: [{ itemId: iRose.id, quantity: 1 }] }],
    });
    expect(clamped.status).toBe(201);
    expect(clamped.body.order.sellPrice).toBe(0); // 50 - 90 = -40 => 0

    // 6. تصدير وتنفيذ وتسليم الأوردر المعدّل + شحن 70 => الحسابات العامة ومتابعة المحاسب متطابقتان تماماً
    expect((await exportIds(agTok, [o1.body.order.id])).status).toBe(200);
    const soId = await salesOrderOf(o1.body.order.id);
    expect((await execute(soId)).status).toBe(200);
    expect((await acctStatus(soId, "DELIVERED")).status).toBe(200);

    const savedSo = await prisma().salesOrder.findUniqueOrThrow({ where: { id: soId }, include: { lines: true } });
    expect(Number(savedSo.agentSellPrice)).toBe(565);
    expect(Number(savedSo.lines[0].boxPrice)).toBe(565);

    const gen = (await api(acct).get(`/api/accounting/general?from=${D3}&to=${D3}`)).body.general;
    // سعر الخروج من المخزون للمحتويات المعدّلة (ساعة 180 + وردة 20 + مج ×2 = 140) = 340
    expect(gen.deliveredCount).toBe(1);
    expect(gen.deliveredSales).toBe(340);
    expect(gen.deliveredExitPrice).toBe(565);
    expect(gen.totalShipping).toBe(70);
    expect(gen.grandTotal).toBe(635);
    expect(gen.priceDiff).toBe(225);

    const follow = await api(acct).get(`/api/accounting/orders?from=${D3}&to=${D3}`);
    expect(follow.status).toBe(200);
    expect(JSON.stringify(follow.body)).not.toMatch(/unitCost|unitPrice|unitSell|costTotal|profit|available/);
  });
});

describe("صفحات البيع (مصدر الأوردر) وحسابات كل صفحة على حدة في الحسابات العامة", () => {
  it("الإدارة تدير الصفحات، والاختيار إجباري للفتاة بعد الإضافة، والحسابات العامة تُخرج حسابات منفردة لكل صفحة", async () => {
    const mgrTok = await login("amr");
    const agPages = await makeUser("ag_pages_user", "SALES_AGENT");
    await api(admin).put(`/api/sales-agents/${agPages.id}/prefix`).send({ prefix: 970 });
    const agTok = await login("ag_pages_user");

    // 1. غير الإدارة ممنوع من إدارة الصفحات
    for (const tok of [agTok, acct, sup, edit]) {
      expect((await api(tok).get("/api/sales-agents/pages")).status).toBe(403);
      expect((await api(tok).post("/api/sales-agents/pages").send({ name: "ممنوع" })).status).toBe(403);
    }

    // 2. الإدارة تضيف صفحتين + صفحة مؤقتة (التكرار بحالة أحرف مختلفة مرفوض 409)
    const pARes = await api(admin).post("/api/sales-agents/pages").send({ name: "Page Alpha" });
    expect(pARes.status).toBe(201);
    const pageA = pARes.body.page as { id: string; name: string };
    expect((await api(admin).post("/api/sales-agents/pages").send({ name: "page alpha" })).status).toBe(409);

    const pBRes = await api(mgrTok).post("/api/sales-agents/pages").send({ name: "صفحة التشكيل 2" });
    expect(pBRes.status).toBe(201);
    const pageB = pBRes.body.page as { id: string; name: string };

    const pTmpRes = await api(admin).post("/api/sales-agents/pages").send({ name: "صفحة مؤقتة" });
    expect(pTmpRes.status).toBe(201);
    const pageTmp = pTmpRes.body.page as { id: string; name: string };

    // تعديل الاسم وإيقاف التفعيل والحذف
    const renamed = await api(admin).patch(`/api/sales-agents/pages/${pageA.id}`).send({ name: "صفحة التشكيل 1" });
    expect(renamed.status).toBe(200);
    expect(renamed.body.page.name).toBe("صفحة التشكيل 1");

    expect((await api(admin).patch(`/api/sales-agents/pages/${pageTmp.id}`).send({ isActive: false })).status).toBe(200);

    // 3. مسار الفتاة يعيد الصفحات النشطة فقط وبحقول (id, name) دون أي مبالغ
    const agentPagesRes = await api(agTok).get("/api/agent/pages");
    expect(agentPagesRes.status).toBe(200);
    expect(agentPagesRes.body.pages.some((p: { id: string }) => p.id === pageTmp.id)).toBe(false);
    expect(agentPagesRes.body.pages.map((p: { id: string }) => p.id)).toEqual(expect.arrayContaining([pageA.id, pageB.id]));
    expect(Object.keys(agentPagesRes.body.pages[0]).sort()).toEqual(["id", "name"]);

    // حذف صفحة غير مستخدمة مسموح
    expect((await api(admin).delete(`/api/sales-agents/pages/${pageTmp.id}`)).status).toBe(200);

    // 4. بعد وجود صفحات نشطة يصبح اختيار اسم الصفحة إجبارياً عند الإنشاء ويرفض غير الصالح/الموقوف
    const D4 = "2026-11-28";
    const missingPage = await api(agTok).post("/api/agent/orders").send({
      date: D4,
      customerName: "بدون صفحة",
      lines: [{ productId: box.id, quantity: 1 }],
    });
    expect(missingPage.status).toBe(400);

    const invalidPage = await api(agTok).post("/api/agent/orders").send({
      date: D4,
      customerName: "صفحة غير موجودة",
      salesPageId: "not_existing_page",
      lines: [{ productId: box.id, quantity: 1 }],
    });
    expect(invalidPage.status).toBe(400);

    // إيقاف صفحة مؤقتاً يمنع استخدامها في أوردر جديد
    const pDisabled = (await api(admin).post("/api/sales-agents/pages").send({ name: "صفحة موقوفة" })).body.page;
    await api(admin).patch(`/api/sales-agents/pages/${pDisabled.id}`).send({ isActive: false });
    expect(
      (
        await api(agTok).post("/api/agent/orders").send({
          date: D4,
          customerName: "صفحة معطلة",
          salesPageId: pDisabled.id,
          lines: [{ productId: box.id, quantity: 1 }],
        })
      ).status
    ).toBe(400);

    // 5. إنشاء أوردرات على صفحتين مختلفتين:
    // صفحة 1: مسودة واحدة + أوردر مُسلَّم (بوكس ثابت = 500، مخزون watch = 180، شحن = 50)
    // صفحة 2: أوردر مُسلَّم (بوكس ثابت = 400، مخزون watch = 180، شحن = 80)
    const box500 = (
      await api(admin).post("/api/sales/products").send({
        name: "بوكس صفحة 1",
        fixedPrice: 500,
        components: [{ itemId: watch.id, quantity: 1 }],
      })
    ).body.product;
    const box400 = (
      await api(admin).post("/api/sales/products").send({
        name: "بوكس صفحة 2",
        fixedPrice: 400,
        components: [{ itemId: watch.id, quantity: 1 }],
      })
    ).body.product;

    const draftA = await api(agTok).post("/api/agent/orders").send({
      date: D4,
      salesPageId: pageA.id,
      customerName: "مسودة صفحة 1",
      lines: [{ productId: box500.id, quantity: 1 }],
    });
    expect(draftA.status).toBe(201);
    expect(draftA.body.order).toMatchObject({ salesPageId: pageA.id, salesPageName: "صفحة التشكيل 1" });

    // حذف صفحة مرتبطة بأوردر مرفوض (409)
    expect((await api(admin).delete(`/api/sales-agents/pages/${pageA.id}`)).status).toBe(409);

    const ordA = await api(agTok).post("/api/agent/orders").send({
      date: D4,
      salesPageId: pageA.id,
      customerName: "عميل صفحة 1",
      shippingPrice: 50,
      lines: [{ productId: box500.id, quantity: 1 }],
    });
    const ordB = await api(agTok).post("/api/agent/orders").send({
      date: D4,
      salesPageId: pageB.id,
      customerName: "عميل صفحة 2",
      shippingPrice: 80,
      lines: [{ productId: box400.id, quantity: 1 }],
    });
    expect(ordA.status).toBe(201);
    expect(ordB.status).toBe(201);

    expect((await exportIds(agTok, [ordA.body.order.id, ordB.body.order.id])).status).toBe(200);
    const soA = await salesOrderOf(ordA.body.order.id);
    const soB = await salesOrderOf(ordB.body.order.id);
    expect((await execute(soA)).status).toBe(200);
    expect((await execute(soB)).status).toBe(200);
    expect((await acctStatus(soA, "DELIVERED")).status).toBe(200);
    expect((await acctStatus(soB, "DELIVERED")).status).toBe(200);

    // 6. المحاسب يقرأ الصفحات والحسابات العامة مع التفصيل المنفرد لكل صفحة والتصفية
    const acctPages = await api(acct).get("/api/accounting/pages");
    expect(acctPages.status).toBe(200);
    expect(acctPages.body.pages.map((p: { id: string }) => p.id)).toEqual(expect.arrayContaining([pageA.id, pageB.id]));

    const genAll = await api(acct).get(`/api/accounting/general?from=${D4}&to=${D4}`);
    expect(genAll.status).toBe(200);
    expect(genAll.body.general).toMatchObject({
      totalOrders: 3,
      draftCount: 1,
      deliveredCount: 2,
      deliveredSales: 360,
      deliveredExitPrice: 900,
      totalShipping: 130,
      grandTotal: 1030,
      priceDiff: 540,
    });

    const rowA = genAll.body.byPage.find((p: { pageId: string | null }) => p.pageId === pageA.id);
    const rowB = genAll.body.byPage.find((p: { pageId: string | null }) => p.pageId === pageB.id);
    expect(rowA).toMatchObject({
      pageId: pageA.id,
      pageName: "صفحة التشكيل 1",
      totalOrders: 2,
      draftCount: 1,
      deliveredCount: 1,
      deliveredSales: 180,
      deliveredExitPrice: 500,
      totalShipping: 50,
      grandTotal: 550,
      priceDiff: 320,
    });
    expect(rowB).toMatchObject({
      pageId: pageB.id,
      pageName: "صفحة التشكيل 2",
      totalOrders: 1,
      draftCount: 0,
      deliveredCount: 1,
      deliveredSales: 180,
      deliveredExitPrice: 400,
      totalShipping: 80,
      grandTotal: 480,
      priceDiff: 220,
    });

    // التصفية بصفحة محددة في /accounting/general وفي /accounting/orders
    const genPageA = await api(acct).get(`/api/accounting/general?from=${D4}&to=${D4}&salesPageId=${pageA.id}`);
    expect(genPageA.status).toBe(200);
    expect(genPageA.body.general).toMatchObject({
      totalOrders: 2,
      deliveredCount: 1,
      deliveredExitPrice: 500,
      totalShipping: 50,
      grandTotal: 550,
    });

    const followA = await api(acct).get(`/api/accounting/orders?from=${D4}&to=${D4}&salesPageId=${pageA.id}`);
    expect(followA.status).toBe(200);
    expect(followA.body.orders.map((o: { id: string }) => o.id)).toEqual([soA]);
    expect(followA.body.orders[0]).toMatchObject({ salesPageId: pageA.id, salesPageName: "صفحة التشكيل 1" });
    expect(JSON.stringify(followA.body)).not.toMatch(/unitCost|unitPrice|unitSell|costTotal|profit|available/);
  });
});

describe("مشرف الفتيات (SALES_AGENT_SUPERVISOR)", () => {
  it("إنشاء حساب مشرف فتيات من الإدارة، مع العزل الكامل (403) وحصر التصدير", async () => {
    const createRes = await api(admin).post("/api/users").send({
      name: "سمر مشرفة",
      username: "ag_sup_created",
      email: "ag_sup_created@example.test",
      password: "Password123!",
      role: "sales_agent_supervisor",
    });
    expect(createRes.status).toBe(201);
    expect(createRes.body.user).toMatchObject({
      role: "sales_agent_supervisor",
      jobTitle: "مشرف فتيات",
      inventoryAccess: "none",
      showTaskCard: false,
      showProductionCard: false,
    });
    const supTok = await login("ag_sup_created", "Password123!");

    // محظور من جميع المسارات خارج /api/agent-supervisor
    for (const url of [
      "/api/agent/orders",
      "/api/sales/orders?date=2026-11-10",
      "/api/sales/products",
      "/api/inventory",
      "/api/accounting/orders",
      "/api/accounting/agents",
      "/api/accounting/general",
      "/api/sales-agents",
      "/api/users",
      "/api/tasks?date=2026-11-10",
      "/api/feedback?date=2026-11-10",
    ]) {
      expect((await api(supTok).get(url)).status, url).toBe(403);
    }

    // لا تعديل ولا حذف على مسارات مشرف الفتيات
    expect((await api(supTok).patch("/api/agent-supervisor/orders/fake").send({ notes: "x" })).status).toBe(404);
    expect((await api(supTok).delete("/api/agent-supervisor/orders/fake")).status).toBe(404);

    // بقية الأدوار محظورة من /api/agent-supervisor
    const des = await makeUser("des_sup_chk", "DESIGNER");
    const desTok = await login(des.username);
    for (const [label, tok] of [
      ["SALES_AGENT", ag1],
      ["SALES_ACCOUNTANT", acct],
      ["SALES_EDITOR", edit],
      ["SALES_SUPERVISOR", sup],
      ["DESIGNER", desTok],
    ] as const) {
      expect((await api(tok).get("/api/agent-supervisor/orders")).status, `${label} GET orders`).toBe(403);
      expect((await api(tok).get("/api/agent-supervisor/filters")).status, `${label} GET filters`).toBe(403);
      expect(
        (await api(tok).post("/api/agent-supervisor/orders/export").send({ ids: ["x"], confirm: true })).status,
        `${label} POST export`
      ).toBe(403);
    }
    // الفتاة محظورة أيضاً من /api/agent/orders/export
    expect((await api(ag1).post("/api/agent/orders/export").send({ ids: ["x"], confirm: true })).status).toBe(403);
  });

  it("تجميع المسودات من عدة فتيات، الفلترة، التصدير الجماعي مع حفظ هوية الفتاة والمُصدِّر، ومنع تسريب التكاليف", async () => {
    const D5 = "2026-12-10";
    const D6 = "2026-12-11";
    const supUser = await makeUser("ag_sup_flow", "SALES_AGENT_SUPERVISOR");
    const supTok = await login(supUser.username);
    const mgrTok = await login("amr");
    const page1 = (await api(admin).post("/api/sales-agents/pages").send({ name: "صفحة المشرف 1" })).body.page as { id: string; name: string };
    const page2 = (await api(admin).post("/api/sales-agents/pages").send({ name: "صفحة المشرف 2" })).body.page as { id: string; name: string };

    const g1 = await mk(ag1, 180, {
      date: D5,
      customerName: "عميلة مشرف 1",
      customerPhone: "01055511111",
      salesPageId: page1.id,
    });
    const g2 = await mk(ag2, 180, {
      date: D6,
      customerName: "عميلة مشرف 2",
      customerPhone: "01055522222",
      salesPageId: page2.id,
    });

    // فلاتر مشرف الفتيات
    const filtersRes = await api(supTok).get("/api/agent-supervisor/filters");
    expect(filtersRes.status).toBe(200);
    expect(filtersRes.body.agents.length).toBeGreaterThanOrEqual(2);
    expect(filtersRes.body.pages.some((p: { id: string }) => p.id === page1.id)).toBe(true);
    expect(JSON.stringify(filtersRes.body)).not.toMatch(/unitCost|unitPrice|unitSell|inventorySellPrice|costTotal|profit|available|passwordHash/);

    // عرض المسودات المجمّعة من عدة فتيات (D5..D6)
    const draftsList = await api(supTok).get(`/api/agent-supervisor/orders?status=DRAFT&from=${D5}&to=${D6}`);
    expect(draftsList.status).toBe(200);
    expect(draftsList.body.total).toBe(2);
    expect(draftsList.body.counts).toMatchObject({ all: 2, DRAFT: 2, EXPORTED: 0, CANCELLED: 0 });
    expect(draftsList.body.orders.map((o: { id: string }) => o.id).sort()).toEqual([g1.id, g2.id].sort());
    expect(JSON.stringify(draftsList.body)).not.toMatch(/unitCost|unitPrice|unitSell|inventorySellPrice|costTotal|profit|available/);

    // التصفية بالفتاة والصفحة والبحث والـ Pagination
    const byAg1 = await api(supTok).get(`/api/agent-supervisor/orders?status=DRAFT&agentId=${ag1Id}&from=${D5}&to=${D6}`);
    expect(byAg1.status).toBe(200);
    expect(byAg1.body.orders.map((o: { id: string }) => o.id)).toEqual([g1.id]);

    const byPage2 = await api(supTok).get(`/api/agent-supervisor/orders?status=DRAFT&salesPageId=${page2.id}&from=${D5}&to=${D6}`);
    expect(byPage2.status).toBe(200);
    expect(byPage2.body.orders.map((o: { id: string }) => o.id)).toEqual([g2.id]);

    const paged1 = await api(supTok).get(`/api/agent-supervisor/orders?status=DRAFT&from=${D5}&to=${D6}&limit=1&offset=0`);
    expect(paged1.status).toBe(200);
    expect(paged1.body.total).toBe(2);
    expect(paged1.body.hasMore).toBe(true);
    expect(paged1.body.orders).toHaveLength(1);

    // الإدارة (MANAGER / ADMIN) تصل أيضاً لشاشة مشرف الفتيات
    expect((await api(mgrTok).get(`/api/agent-supervisor/orders?status=DRAFT&from=${D5}&to=${D6}`)).status).toBe(200);

    // التصدير الجماعي لأوردرات عدة فتيات دفعة واحدة دون خصم مخزون مع الحفاظ على ملكية الفتاة وتسجيل المشرف كمُصدِّر
    const beforeStock = await stock();
    const beforeMoves = await movements();
    const batchRes = await api(supTok).post("/api/agent-supervisor/orders/export").send({ ids: [g1.id, g2.id], confirm: true });
    expect(batchRes.status).toBe(200);
    expect(batchRes.body.results.every((r: { result: string }) => r.result === "EXPORTED")).toBe(true);
    expect(await stock()).toBe(beforeStock);
    expect(await movements()).toBe(beforeMoves);

    // التحقق من ملكية الفتاة والصفحة والمُصدِّر وسجل الحالة
    const ao1 = await prisma().agentOrder.findUniqueOrThrow({ where: { id: g1.id } });
    const ao2 = await prisma().agentOrder.findUniqueOrThrow({ where: { id: g2.id } });
    expect(ao1.exportedById).toBe(supUser.id);
    expect(ao2.exportedById).toBe(supUser.id);

    const so1 = await prisma().salesOrder.findUniqueOrThrow({ where: { id: ao1.salesOrderId! } });
    const so2 = await prisma().salesOrder.findUniqueOrThrow({ where: { id: ao2.salesOrderId! } });
    expect(so1).toMatchObject({ agentId: ag1Id, closerName: "agent_one", salesPageId: page1.id, source: "AGENT", status: "REGISTERED" });
    expect(so2).toMatchObject({ agentId: ag2Id, closerName: "agent_two", salesPageId: page2.id, source: "AGENT", status: "REGISTERED" });

    const expLog = await prisma().salesOrderStatusLog.findFirstOrThrow({ where: { orderId: so1.id, event: "EXPORT" } });
    expect(expLog.byId).toBe(supUser.id);

    // إعادة التصدير idempotent وتظهر في تبويب EXPORTED مع اسم المُصدِّر
    const again = await api(supTok).post("/api/agent-supervisor/orders/export").send({ ids: [g1.id, g2.id], confirm: true });
    expect(again.status).toBe(200);
    expect(again.body.results.every((r: { result: string }) => r.result === "ALREADY_EXPORTED")).toBe(true);

    const exportedList = await api(supTok).get(`/api/agent-supervisor/orders?status=EXPORTED&from=${D5}&to=${D6}`);
    expect(exportedList.status).toBe(200);
    expect(exportedList.body.counts).toMatchObject({ all: 2, DRAFT: 0, EXPORTED: 2, CANCELLED: 0 });
    expect(exportedList.body.orders[0].exportedByName).toBe(supUser.name);
  });
});
