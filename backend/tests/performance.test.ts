import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db.ts";
import { api, GROUP_ACCESSORIES, login, makeUser, resetDb } from "./helpers.ts";

let admin: string;
let agent: string;
let acct: string;
let agentId: string;
let boxId: string;

const EXPECTED_INDEXES = [
  "Task_createdById_idx",
  "TaskTimeLog_userId_idx",
  "TaskComment_userId_idx",
  "Feedback_date_idx",
  "Feedback_createdAt_id_idx",
  "Goal_createdById_idx",
  "CalendarEvent_createdById_idx",
  "InventoryMovement_createdById_createdAt_idx",
  "SalesOrder_status_date_idx",
  "SalesOrder_agentId_date_idx",
  "SalesOrder_createdById_idx",
  "SalesOrderLine_productId_idx",
  "AgentOrder_agentId_date_seq_idx",
  "AgentOrderLine_productId_idx",
  "SalesOrderStatusLog_byId_idx",
];

beforeAll(async () => {
  await resetDb();
  agentId = (await makeUser("perf_agent", "SALES_AGENT")).id;
  await makeUser("perf_acct", "SALES_ACCOUNTANT");
  admin = await login("lol");
  agent = await login("perf_agent");
  acct = await login("perf_acct");

  await api(admin).put(`/api/sales-agents/${agentId}/prefix`).send({ prefix: 810, startSeq: 1 });
  const cat = await api(admin).post("/api/inventory/categories").send({ name: "أداء", groupId: GROUP_ACCESSORIES });
  const item = await api(admin)
    .post("/api/inventory")
    .send({ unit: "قطعة", categoryId: cat.body.category.id, name: "صنف أداء", initialQuantity: 200, unitPrice: 50, sellPrice: 100 });
  const prod = await api(admin)
    .post("/api/sales/products")
    .send({ name: "بوكس أداء", components: [{ itemId: item.body.item.id, quantity: 1 }] });
  boxId = prod.body.product.id;
});

describe("performance: الفهارس الجديدة والـ Pagination الخادمي", () => {
  it("تتحقق من وجود جميع فهارس 0027_performance_indexes في قاعدة البيانات", async () => {
    const rows = await prisma().$queryRawUnsafe<{ indexname: string }[]>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`
    );
    const present = new Set(rows.map((r) => r.indexname));
    for (const idx of EXPECTED_INDEXES) {
      expect(present.has(idx), `missing index ${idx}`).toBe(true);
    }
  });

  it("GET /api/agent/orders و GET /api/accounting/orders يدعمان limit و offset بدقة دون تداخل", async () => {
    const createdIds: string[] = [];
    for (let i = 1; i <= 5; i += 1) {
      const r = await api(agent).post("/api/agent/orders").send({
        date: `2026-11-1${i}`,
        customerName: `عميل ${i}`,
        customerPhone: `0100000000${i}`,
        lines: [{ productId: boxId, quantity: 1 }],
      });
      expect(r.status).toBe(201);
      createdIds.push(r.body.order.id as string);
    }

    // 1) Pagination لصفحة أوردراتي (الفتاة)
    const agP1 = await api(agent).get("/api/agent/orders?bucket=all&limit=2&offset=0");
    const agP2 = await api(agent).get("/api/agent/orders?bucket=all&limit=2&offset=2");
    const agP3 = await api(agent).get("/api/agent/orders?bucket=all&limit=2&offset=4");
    expect(agP1.status).toBe(200);
    expect(agP1.body.total).toBe(5);
    expect(agP1.body.hasMore).toBe(true);
    expect(agP1.body.orders).toHaveLength(2);
    expect(agP2.body.orders).toHaveLength(2);
    expect(agP2.body.hasMore).toBe(true);
    expect(agP3.body.orders).toHaveLength(1);
    expect(agP3.body.hasMore).toBe(false);

    const agPageIds = [
      ...agP1.body.orders.map((o: { id: string }) => o.id),
      ...agP2.body.orders.map((o: { id: string }) => o.id),
      ...agP3.body.orders.map((o: { id: string }) => o.id),
    ];
    expect(new Set(agPageIds).size).toBe(5);

    // 2) تصدير وتنفيذ 5 أوردرات ثم Pagination في متابعة أوردرات المبيعات
    expect((await api(agent).post("/api/agent/orders/export").send({ ids: createdIds, confirm: true })).status).toBe(200);
    const linked = await prisma().agentOrder.findMany({ where: { id: { in: createdIds } }, select: { salesOrderId: true } });
    for (let i = 0; i < linked.length; i += 1) {
      const soId = linked[i].salesOrderId!;
      expect((await api(admin).patch(`/api/sales/orders/${soId}`).send({ status: "EXECUTED" })).status).toBe(200);
      if (i === 0) {
        expect((await api(acct).patch(`/api/accounting/orders/${soId}/status`).send({ status: "SHIPPED" })).status).toBe(200);
      }
    }

    const f1 = await api(acct).get("/api/accounting/orders?limit=2&offset=0");
    const f2 = await api(acct).get("/api/accounting/orders?limit=2&offset=2");
    const f3 = await api(acct).get("/api/accounting/orders?limit=2&offset=4");
    expect(f1.status).toBe(200);
    expect(f1.body.total).toBe(5);
    expect(f1.body.counts).toMatchObject({ all: 5, EXECUTED: 4, SHIPPED: 1, DELIVERED: 0, RETURNED: 0 });
    expect(f1.body.hasMore).toBe(true);
    expect(f1.body.orders).toHaveLength(2);
    expect(f2.body.orders).toHaveLength(2);
    expect(f2.body.hasMore).toBe(true);
    expect(f3.body.orders).toHaveLength(1);
    expect(f3.body.hasMore).toBe(false);

    const fIds = [
      ...f1.body.orders.map((o: { id: string }) => o.id),
      ...f2.body.orders.map((o: { id: string }) => o.id),
      ...f3.body.orders.map((o: { id: string }) => o.id),
    ];
    expect(new Set(fIds).size).toBe(5);

    // التحقق من total عند الفلترة بحالة محددة
    const onlyExecuted = await api(acct).get("/api/accounting/orders?status=EXECUTED&limit=2&offset=0");
    expect(onlyExecuted.body.total).toBe(4);
    expect(onlyExecuted.body.counts.all).toBe(5);
    expect(onlyExecuted.body.hasMore).toBe(true);
  });

  it("GET /api/feedback يدعم limit و offset مع الحفاظ على total و hasMore", async () => {
    for (let i = 1; i <= 5; i += 1) {
      const r = await api(admin).post("/api/feedback").send({
        title: `ملاحظة ${i}`,
        description: "تفاصيل",
        type: "idea",
        date: "2026-11-22",
      });
      expect(r.status).toBe(201);
    }

    const p1 = await api(admin).get("/api/feedback?limit=2&offset=0");
    const p2 = await api(admin).get("/api/feedback?limit=2&offset=2");
    const p3 = await api(admin).get("/api/feedback?limit=2&offset=4");
    expect(p1.status).toBe(200);
    expect(p1.body.total).toBe(5);
    expect(p1.body.hasMore).toBe(true);
    expect(p1.body.feedback).toHaveLength(2);
    expect(p2.body.feedback).toHaveLength(2);
    expect(p2.body.hasMore).toBe(true);
    expect(p3.body.feedback).toHaveLength(1);
    expect(p3.body.hasMore).toBe(false);

    const fbIds = [
      ...p1.body.feedback.map((x: { id: string }) => x.id),
      ...p2.body.feedback.map((x: { id: string }) => x.id),
      ...p3.body.feedback.map((x: { id: string }) => x.id),
    ];
    expect(new Set(fbIds).size).toBe(5);
  });
});
