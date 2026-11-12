import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db.ts";
import { api, GROUP_ACCESSORIES, login, makeUser, resetDb } from "./helpers.ts";

// سلامة الأوردرات (HANDOFF النواقص): مزامنة الإلغاء، قيد البوليصة في قاعدة البيانات، توحيد العدّادات، فلتر المسودات، تجاوز 5000.
let admin: string, ag1: string, ag2: string, acct: string;
let ag1Id: string, ag2Id: string, userId: string;
let box: { id: string };
let watch: { id: string };
const D = "2026-11-10";

const stock = async () => Number((await prisma().inventoryItem.findUniqueOrThrow({ where: { id: watch.id } })).quantity);
const movements = () => prisma().inventoryMovement.count();
const mk = async (token: string, extra: Record<string, unknown> = {}) => {
  const r = await api(token).post("/api/agent/orders").send({ date: D, customerName: "عميلة", customerPhone: "010", lines: [{ productId: box.id, quantity: 1 }], ...extra });
  expect(r.status).toBe(201);
  return r.body.order as { id: string; waybill: string };
};
const exportIds = (token: string, ids: string[]) => api(token).post("/api/agent/orders/export").send({ ids, confirm: true });
const soOf = async (agentOrderId: string) => (await prisma().agentOrder.findUniqueOrThrow({ where: { id: agentOrderId } })).salesOrderId!;
const execute = (soId: string) => api(admin).patch(`/api/sales/orders/${soId}`).send({ status: "EXECUTED" });
const acctStatus = (soId: string, status: string) => api(acct).patch(`/api/accounting/orders/${soId}/status`).send({ status });
const cancel = (token: string, id: string, reason = "العميلة ألغت") => api(token).post(`/api/agent/orders/${id}/cancel`).send({ reason, confirm: true });
const exported = async (token = ag1) => {
  const o = await mk(token);
  expect((await exportIds(token, [o.id])).status).toBe(200);
  return { ...o, soId: await soOf(o.id) };
};

beforeAll(async () => {
  await resetDb();
  ag1Id = (await makeUser("agent_one", "SALES_AGENT")).id;
  ag2Id = (await makeUser("agent_two", "SALES_AGENT")).id;
  userId = (await makeUser("acct1", "SALES_ACCOUNTANT")).id;
  admin = await login("lol");
  ag1 = await login("agent_one");
  ag2 = await login("agent_two");
  acct = await login("acct1");
  await api(admin).put(`/api/sales-agents/${ag1Id}/prefix`).send({ prefix: 500 });
  await api(admin).put(`/api/sales-agents/${ag2Id}/prefix`).send({ prefix: 600 });
  const cat = await api(admin).post("/api/inventory/categories").send({ name: "هدايا", groupId: GROUP_ACCESSORIES });
  const w = await api(admin).post("/api/inventory").send({ unit: "قطعة", categoryId: cat.body.category.id, name: "ساعة", initialQuantity: 100, unitPrice: 100, sellPrice: 180 });
  watch = w.body.item;
  const p = await api(admin).post("/api/sales/products").send({ name: "بوكس", components: [{ itemId: watch.id, quantity: 1 }] });
  box = p.body.product;
});

describe("2.1 مزامنة الإلغاء مع أوردر المبيعات الرئيسي", () => {
  it("الإلغاء قبل التنفيذ: يظهر ملغياً في المبيعات، ويُرفض التعديل والتنفيذ والبنود، وتبقى البوليصة والسجل، ولا حركة مخزون", async () => {
    const o = await exported();
    const beforeStock = await stock();
    const beforeMoves = await movements();
    const c = await cancel(ag1, o.id, "تغيير رأي العميلة");
    expect(c.status).toBe(200);

    const so = await prisma().salesOrder.findUniqueOrThrow({ where: { id: o.soId } });
    expect(so.cancelledAt).not.toBeNull();
    expect(so.cancelReason).toBe("تغيير رأي العميلة");
    expect(so.cancelledById).toBe(ag1Id);
    expect(so.waybill).toBe(o.waybill);

    // ظاهر بوضوح في واجهة المبيعات الرئيسية (API الذي تقرأه الصفحة)
    const list = await api(admin).get(`/api/sales/orders?date=${D}`);
    const row = (list.body.orders as { id: string; cancelled: boolean; cancelReason: string }[]).find((x) => x.id === o.soId);
    expect(row?.cancelled).toBe(true);
    expect(row?.cancelReason).toBe("تغيير رأي العميلة");

    // لا تنفيذ ولا تعديل ولا بنود عبر API مباشرة
    expect((await execute(o.soId)).status).toBe(409);
    expect((await api(admin).patch(`/api/sales/orders/${o.soId}`).send({ notes: "تعديل" })).status).toBe(409);
    expect((await api(admin).post(`/api/sales/orders/${o.soId}/lines`).send({ productId: box.id, quantity: 1 })).status).toBe(409);
    // لا حذف نهائي بعد التصدير
    expect((await api(admin).delete(`/api/sales/orders/${o.soId}`)).status).toBe(409);

    // سجل الأحداث: تصدير + إلغاء بهوية الفاعل
    const logs = await prisma().salesOrderStatusLog.findMany({ where: { orderId: o.soId }, orderBy: { createdAt: "asc" } });
    expect(logs.map((l) => l.event)).toEqual(["EXPORT", "CANCEL"]);
    expect(logs[1].byId).toBe(ag1Id);
    expect(await stock()).toBe(beforeStock);
    expect(await movements()).toBe(beforeMoves);
  });

  it("الإلغاء بعد التنفيذ والتسليم: لا حركة مخزون ولا إعادة كميات، ويُمنع أي تغيير حالة بعده", async () => {
    const o = await exported();
    expect((await execute(o.soId)).status).toBe(200);
    expect((await acctStatus(o.soId, "SHIPPED")).status).toBe(200);
    expect((await acctStatus(o.soId, "DELIVERED")).status).toBe(200);
    const stockAfterExec = await stock();
    const movesAfterExec = await movements();

    expect((await cancel(ag1, o.id)).status).toBe(200);
    expect(await stock()).toBe(stockAfterExec);
    expect(await movements()).toBe(movesAfterExec);

    const so = await prisma().salesOrder.findUniqueOrThrow({ where: { id: o.soId } });
    expect(so.status).toBe("DELIVERED"); // الحالة تبقى للمرجع، والإلغاء علامة مستقلة
    expect(so.cancelledAt).not.toBeNull();
    expect((await acctStatus(o.soId, "SHIPPED")).status).toBe(409);
    expect((await api(admin).patch(`/api/sales/orders/${o.soId}`).send({ status: "RETURNED" })).status).toBe(409);
    expect((await api(acct).patch(`/api/sales/orders/${o.soId}`).send({ returnFlagged: true })).status).toBe(409);
    expect((await api(admin).delete(`/api/sales/orders/${o.soId}`)).status).toBe(409);
  });

  it("إلغاء مكرر مرفوض، والأوردر الملغي لا يدخل الحساب", async () => {
    const o = await exported();
    expect((await execute(o.soId)).status).toBe(200);
    expect((await acctStatus(o.soId, "DELIVERED")).status).toBe(200);
    const before = (await api(acct).get(`/api/accounting/agents/${ag1Id}`)).body.summary;
    expect((await cancel(ag1, o.id)).status).toBe(200);
    expect((await cancel(ag1, o.id)).status).toBe(409);
    const after = (await api(acct).get(`/api/accounting/agents/${ag1Id}`)).body.summary;
    expect(after.delivered).toBe(before.delivered - 1);
    expect(after.cancelled).toBe(before.cancelled + 1);
    expect(after.total).toBe(before.total); // نفس الأوردر لا يُعدّ مرتين
  });
});

describe("2.2 البوليصة: قيد قاعدة البيانات هو الضمان", () => {
  it("قاعدة البيانات نفسها ترفض بوليصة مكررة في SalesOrder (حتى باختلاف حالة الأحرف)", async () => {
    const mkRow = (waybill: string) => prisma().salesOrder.create({ data: { date: D, waybill, createdById: userId } });
    await mkRow("ZX-1");
    await expect(mkRow("ZX-1")).rejects.toMatchObject({ code: "P2002" });
    await expect(mkRow("zx-1")).rejects.toMatchObject({ code: "P2002" });
    await mkRow(""); // الفارغ مسموح بلا حد
    await mkRow("");
  });

  it("إنشاءان يدويان متزامنان بنفس الرقم: ينجح واحد فقط والآخر 409", async () => {
    const send = () => api(admin).post("/api/sales/orders").send({ date: D, waybill: "MAN-77", closerName: "س", notes: "", lines: [{ productId: box.id, quantity: 1 }] });
    const rs = await Promise.all([send(), send(), send()]);
    expect(rs.filter((r) => r.status === 201).length).toBe(1);
    expect(rs.filter((r) => r.status === 409).length).toBe(2);
  });

  it("رقم سبق تخصيصه لفتاة (حتى بعد حذف المسودة أو الإلغاء) لا يُستخدم يدوياً", async () => {
    const draft = await mk(ag2);
    expect((await api(ag2).delete(`/api/agent/orders/${draft.id}`)).status).toBe(200);
    const r = await api(admin).post("/api/sales/orders").send({ date: D, waybill: draft.waybill, closerName: "س", notes: "", lines: [{ productId: box.id, quantity: 1 }] });
    expect(r.status).toBe(409);
    const next = await mk(ag2); // العداد يتقدم ولا يعيد الرقم
    expect(next.waybill).not.toBe(draft.waybill);
  });

  it("إعادة محاولة التصدير بعد انقطاع لا تنشئ نسخة ثانية", async () => {
    const o = await mk(ag1);
    const rs = await Promise.all([exportIds(ag1, [o.id]), exportIds(ag1, [o.id])]);
    expect(rs.every((r) => r.status === 200)).toBe(true);
    expect(await prisma().salesOrder.count({ where: { waybill: o.waybill } })).toBe(1);
  });

  it("أوردر يدوي قائم برقم يقع في نطاق الفتاة يُتخطّى عند التوليد ولا يتكرر", async () => {
    const taken = String(600 * 100 + (await prisma().salesAgentProfile.findUniqueOrThrow({ where: { userId: ag2Id } })).nextSeq);
    await prisma().salesOrder.create({ data: { date: D, waybill: taken, createdById: userId } });
    const o = await mk(ag2);
    expect(o.waybill).not.toBe(taken);
  });
});

describe("3.1/3.2 توحيد العدّادات وفلتر المسودات بالتاريخ", () => {
  it("إجمالي الأوردرات يشمل المسودات في كل الشاشات: العام = مجموع حسابات الفتيات", async () => {
    await mk(ag1, { date: "2026-03-01" }); // مسودة
    await mk(ag2, { date: "2026-03-02" });
    const agents = (await api(acct).get("/api/accounting/agents")).body;
    const general = (await api(acct).get("/api/accounting/general")).body.general;
    expect(general.totalOrders).toBe(agents.totals.total);
    expect(general.draftCount).toBe(agents.agents.reduce((a: number, r: { unexported: number }) => a + r.unexported, 0));
    // حساب كل فتاة منفرداً = صفها في الجدول المجمّع = لوحتها
    for (const [id, tok] of [[ag1Id, ag1], [ag2Id, ag2]] as const) {
      const one = (await api(acct).get(`/api/accounting/agents/${id}`)).body.summary;
      const row = agents.agents.find((r: { agentId: string }) => r.agentId === id);
      const dash = (await api(tok).get("/api/agent/dashboard")).body.summary;
      expect(one.total).toBe(row.total);
      expect(dash.total).toBe(row.total);
    }
  });

  it("المسودات فقط: تُعدّ في الإجمالي وفي عداد المسودات", async () => {
    const u = await makeUser("agent_only_drafts", "SALES_AGENT");
    await api(admin).put(`/api/sales-agents/${u.id}/prefix`).send({ prefix: 800 });
    const t = await login("agent_only_drafts");
    await mk(t);
    await mk(t);
    const one = (await api(acct).get(`/api/accounting/agents/${u.id}`)).body.summary;
    expect(one).toMatchObject({ total: 2, unexported: 2, delivered: 0, totalDue: 0 });
  });

  it("فلتر الفترة يطبَّق على المسودات في حساب الفتاة الفردي والعام والمجمّع بالتساوي", async () => {
    const u = await makeUser("agent_dates", "SALES_AGENT");
    await api(admin).put(`/api/sales-agents/${u.id}/prefix`).send({ prefix: 810 });
    const t = await login("agent_dates");
    await mk(t, { date: "2025-01-10" }); // قبل الفترة
    await mk(t, { date: "2025-02-10" }); // داخلها
    await mk(t, { date: "2025-02-11" }); // داخلها
    await mk(t, { date: "2025-03-10" }); // بعدها
    const q = "from=2025-02-01&to=2025-02-28";
    const one = (await api(acct).get(`/api/accounting/agents/${u.id}?${q}`)).body.summary;
    const row = (await api(acct).get(`/api/accounting/agents?${q}`)).body.agents.find((r: { agentId: string }) => r.agentId === u.id);
    expect(one.unexported).toBe(2);
    expect(row.unexported).toBe(2);
    expect(one.total).toBe(row.total);
    const all = (await api(acct).get(`/api/accounting/agents/${u.id}`)).body.summary;
    expect(all.unexported).toBe(4);
    const gAll = (await api(acct).get("/api/accounting/general")).body.general.draftCount;
    const gRange = (await api(acct).get(`/api/accounting/general?${q}`)).body.general.draftCount;
    expect(gAll - gRange).toBeGreaterThanOrEqual(2);
  });
});

describe("3.3 تجاوز 5000 أوردر: لا عيّنة صامتة", () => {
  it("المجاميع والمستحقات تشمل كل السجلات، والقائمة المعروضة محدودة مع عدد كلي دقيق", async () => {
    const before = (await api(acct).get(`/api/accounting/agents/${ag1Id}`)).body.summary;
    const N = 5100;
    const soIds = Array.from({ length: N }, (_, i) => `bulk_so_${i}`);
    await prisma().salesOrder.createMany({
      data: soIds.map((id, i) => ({ id, date: "2024-06-01", waybill: `BULK${i}`, createdById: userId, agentId: ag1Id, source: "AGENT", status: "DELIVERED" as const, stockDeducted: true })),
    });
    await prisma().agentOrder.createMany({
      data: soIds.map((id, i) => ({ agentId: ag1Id, seq: 100000 + i, waybill: `BULKA${i}`, date: "2024-06-01", sellPrice: "0", status: "EXPORTED" as const, salesOrderId: id })),
    });
    const after = await api(acct).get(`/api/accounting/agents/${ag1Id}?from=2024-06-01&to=2024-06-01`);
    expect(after.body.summary.delivered).toBe(N);
    expect(after.body.summary.fixedFee).toBe(N * 7);
    expect(after.body.summary.total).toBe(N);
    expect(after.body.ordersTotal).toBe(N);
    expect(after.body.orders.length).toBeLessThan(N);
    expect(after.body.hasMore).toBe(true);
    const full = (await api(acct).get(`/api/accounting/agents/${ag1Id}`)).body.summary;
    expect(full.delivered).toBe(before.delivered + N);
    const general = (await api(acct).get("/api/accounting/general?from=2024-06-01&to=2024-06-01")).body.general;
    expect(general.deliveredCount).toBe(N);
    expect(general.totalOrders).toBe(N);
    const follow = (await api(acct).get("/api/accounting/orders?from=2024-06-01&to=2024-06-01")).body;
    expect(follow.total).toBe(N);
    expect(follow.hasMore).toBe(true);
  }, 120_000);
});

describe("4 دورة المخزون: قبل/بعد لكل حالة (أوردر فتاة وأوردر قديم)", () => {
  const moves = async (type?: "OUT" | "RETURN") => prisma().inventoryMovement.count({ where: { itemId: watch.id, ...(type ? { type } : {}) } });

  it("أوردر فتاة: لا خصم عند الإدخال/التعديل/التصدير، خصم واحد عند التنفيذ حتى مع إعادة الإرسال، ولا خصم عند الشحن/التسليم، وعلامة المرتجع بلا RETURN", async () => {
    const s0 = await stock();
    const out0 = await moves("OUT");
    const o = await mk(ag1);
    await api(ag1).patch(`/api/agent/orders/${o.id}`).send({ notes: "تعديل" });
    expect(await stock()).toBe(s0);
    expect((await exportIds(ag1, [o.id])).status).toBe(200);
    const soId = await soOf(o.id);
    expect(await stock()).toBe(s0);
    expect(await moves("OUT")).toBe(out0);

    expect((await execute(soId)).status).toBe(200);
    expect((await execute(soId)).status).toBe(200); // إعادة إرسال التنفيذ
    expect(await stock()).toBe(s0 - 1);
    expect(await moves("OUT")).toBe(out0 + 1);

    expect((await acctStatus(soId, "SHIPPED")).status).toBe(200);
    expect((await acctStatus(soId, "DELIVERED")).status).toBe(200);
    expect(await stock()).toBe(s0 - 1);
    expect(await moves("OUT")).toBe(out0 + 1);

    const ret0 = await moves("RETURN");
    expect((await api(acct).patch(`/api/accounting/orders/${soId}/return-flag`).send({ flagged: true })).status).toBe(200);
    expect(await moves("RETURN")).toBe(ret0);
    expect(await stock()).toBe(s0 - 1);
  });

  it("المرتجع المخزني الفعلي يبقى من مساره الحالي (الإدارة) ويُنشئ RETURN، والمحاسب لا يستطيعه", async () => {
    const o = await exported();
    expect((await execute(o.soId)).status).toBe(200);
    const s = await stock();
    expect((await api(acct).patch(`/api/sales/orders/${o.soId}`).send({ status: "RETURNED" })).status).toBe(403);
    expect(await stock()).toBe(s);
    const ret0 = await moves("RETURN");
    expect((await api(admin).patch(`/api/sales/orders/${o.soId}`).send({ status: "RETURNED" })).status).toBe(200);
    expect(await moves("RETURN")).toBe(ret0 + 1);
    expect(await stock()).toBe(s + 1);
  });

  it("أوردر قديم (يدوي) يعمل بنفس سلوكه: خصم عند التنفيذ مرة واحدة، والانتقال المباشر إلى الشحن لا يخصم مرتين", async () => {
    const mkOld = async () => (await api(admin).post("/api/sales/orders").send({ date: D, waybill: "", closerName: "س", notes: "", lines: [{ productId: box.id, quantity: 1 }] })).body.order.id as string;
    const s0 = await stock();
    const a = await mkOld();
    expect(await stock()).toBe(s0); // الإدخال لا يخصم
    expect((await execute(a)).status).toBe(200);
    expect((await api(admin).patch(`/api/sales/orders/${a}`).send({ status: "SHIPPED" })).status).toBe(200);
    expect((await api(admin).patch(`/api/sales/orders/${a}`).send({ status: "DELIVERED" })).status).toBe(200);
    expect(await stock()).toBe(s0 - 1);

    // انتقال مباشر REGISTERED → SHIPPED لأوردر قديم: السلوك القديم (خصم واحد عبر stockDeducted) دون تغيير
    const b = await mkOld();
    const before = await stock();
    expect((await api(admin).patch(`/api/sales/orders/${b}`).send({ status: "SHIPPED" })).status).toBe(200);
    expect(await stock()).toBe(before - 1);
    expect((await api(admin).patch(`/api/sales/orders/${b}`).send({ status: "DELIVERED" })).status).toBe(200);
    expect(await stock()).toBe(before - 1);

    // أوردر فتاة: الانتقال المباشر إلى الشحن قبل التنفيذ مرفوض بالكامل (عبر المبيعات والمحاسب)
    const g = await exported();
    const gBefore = await stock();
    expect((await api(admin).patch(`/api/sales/orders/${g.soId}`).send({ status: "SHIPPED" })).status).toBe(409);
    expect((await acctStatus(g.soId, "SHIPPED")).status).toBe(409);
    expect(await stock()).toBe(gBefore);
  });
});
