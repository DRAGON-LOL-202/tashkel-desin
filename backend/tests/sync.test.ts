import type { AddressInfo } from "node:net";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db.ts";
import { api, GROUP_ACCESSORIES, login, makeUser, PASSWORD, resetDb } from "./helpers.ts";
import type { SyncChannel } from "../src/utils/syncVersion.ts";

let admin: string, agent: string, accountant: string, packer: string, operator: string;
let agentId: string;

interface SyncBody {
  version: string;
  channels: Record<SyncChannel, number>;
}

async function getSync(token = admin): Promise<SyncBody> {
  const res = await api(token).get("/api/sync");
  expect(res.status).toBe(200);
  expect(res.headers["cache-control"]).toBe("no-store");
  return res.body as SyncBody;
}

async function readSseEvent(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder,
  buffer: { text: string },
  timeoutMs = 3000
): Promise<SyncBody> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    buffer.text = buffer.text.replace(/\r\n/g, "\n");
    const idx = buffer.text.indexOf("\n\n");
    if (idx !== -1) {
      const raw = buffer.text.slice(0, idx);
      buffer.text = buffer.text.slice(idx + 2);
      const dataLine = raw.split("\n").find((l) => l.startsWith("data:"));
      if (dataLine) return JSON.parse(dataLine.slice(5).trim()) as SyncBody;
      continue;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("Timed out waiting for SSE event");
    const chunk = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("SSE read timeout")), remaining)),
    ]);
    if (chunk.done) throw new Error("SSE stream closed before event arrived");
    if (chunk.value) buffer.text += decoder.decode(chunk.value, { stream: true });
  }
}

beforeAll(async () => {
  await resetDb();
  agentId = (await makeUser("sync_agent", "SALES_AGENT")).id;
  await makeUser("sync_acct", "SALES_ACCOUNTANT");
  await makeUser("sync_packer", "PACKER");
  await makeUser("sync_oper", "OPERATOR");
  admin = await login("lol");
  agent = await login("sync_agent");
  accountant = await login("sync_acct");
  packer = await login("sync_packer");
  operator = await login("sync_oper");
});

describe("sync: تتبّع القنوات، منع الكاش، والبث اللحظي SSE", () => {
  it("استجابات /api تحمل Cache-Control: no-store وتتحدث القنوات الصحيحة لا general فقط", async () => {
    const usersRes = await api(admin).get("/api/users");
    expect(usersRes.status).toBe(200);
    expect(usersRes.headers["cache-control"]).toBe("no-store");

    // 1. المهام ← tasks + notifications
    let before = await getSync();
    const taskRes = await api(admin).post("/api/tasks").send({ title: "مهمة فورية", date: "2026-11-22" });
    expect(taskRes.status).toBe(201);
    let after = await getSync();
    expect(after.channels.tasks).toBeGreaterThan(before.channels.tasks);
    expect(after.channels.notifications).toBeGreaterThan(before.channels.notifications);
    expect(after.channels.general).toBe(before.channels.general);

    // 2. Feedback ← tasks
    before = after;
    const fbRes = await api(admin).post("/api/feedback").send({ title: "ملاحظة", description: "تفاصيل", type: "idea", date: "2026-11-22" });
    expect(fbRes.status).toBe(201);
    after = await getSync();
    expect(after.channels.tasks).toBeGreaterThan(before.channels.tasks);
    expect(after.channels.general).toBe(before.channels.general);

    // 3. الأهداف ← tasks
    before = after;
    const goalRes = await api(admin)
      .post("/api/goals")
      .send({ title: "هدف", type: "weekly", target: 5, current: 0, startDate: "2026-11-01", endDate: "2026-11-07" });
    expect(goalRes.status).toBe(201);
    after = await getSync();
    expect(after.channels.tasks).toBeGreaterThan(before.channels.tasks);
    expect(after.channels.general).toBe(before.channels.general);

    // 4. المستخدمون ← users + tasks + notifications + accounting + sales
    before = after;
    const userRes = await api(admin).post("/api/users").send({
      name: "مستخدم مزامنة",
      username: "sync_new_u",
      email: "sync_new_u@example.test",
      password: PASSWORD,
      role: "DESIGNER",
    });
    expect(userRes.status).toBe(201);
    after = await getSync();
    expect(after.channels.users).toBeGreaterThan(before.channels.users);
    expect(after.channels.tasks).toBeGreaterThan(before.channels.tasks);
    expect(after.channels.notifications).toBeGreaterThan(before.channels.notifications);
    expect(after.channels.accounting).toBeGreaterThan(before.channels.accounting);
    expect(after.channels.sales).toBeGreaterThan(before.channels.sales);
    expect(after.channels.general).toBe(before.channels.general);

    // 5. المخزون (تصنيف + صنف) ← inventory + sales + notifications
    before = after;
    const catRes = await api(admin).post("/api/inventory/categories").send({ name: "تصنيف مزامنة", groupId: GROUP_ACCESSORIES });
    expect(catRes.status).toBe(201);
    after = await getSync();
    expect(after.channels.inventory).toBeGreaterThan(before.channels.inventory);
    expect(after.channels.sales).toBeGreaterThan(before.channels.sales);
    expect(after.channels.notifications).toBeGreaterThan(before.channels.notifications);
    expect(after.channels.general).toBe(before.channels.general);

    const itemRes = await api(admin)
      .post("/api/inventory")
      .send({ unit: "قطعة", categoryId: catRes.body.category.id, name: "صنف مزامنة", initialQuantity: 50, unitPrice: 40, sellPrice: 80 });
    expect(itemRes.status).toBe(201);

    // 6. منتج ثابت + أوردر مبيعات ← sales + inventory + accounting + notifications
    before = await getSync();
    const prodRes = await api(admin)
      .post("/api/sales/products")
      .send({ name: "بوكس مزامنة", components: [{ itemId: itemRes.body.item.id, quantity: 1 }] });
    expect(prodRes.status).toBe(201);
    after = await getSync();
    expect(after.channels.sales).toBeGreaterThan(before.channels.sales);
    expect(after.channels.accounting).toBeGreaterThan(before.channels.accounting);
    expect(after.channels.general).toBe(before.channels.general);

    before = after;
    const salesOrderRes = await api(admin)
      .post("/api/sales/orders")
      .send({ date: "2026-11-22", lines: [{ productId: prodRes.body.product.id, quantity: 1 }] });
    expect(salesOrderRes.status).toBe(201);
    after = await getSync();
    expect(after.channels.sales).toBeGreaterThan(before.channels.sales);
    expect(after.channels.inventory).toBeGreaterThan(before.channels.inventory);
    expect(after.channels.accounting).toBeGreaterThan(before.channels.accounting);
    expect(after.channels.notifications).toBeGreaterThan(before.channels.notifications);
    expect(after.channels.general).toBe(before.channels.general);

    // 7. Prefix الفتيات ← accounting + sales + users
    before = after;
    const prefixRes = await api(admin).put(`/api/sales-agents/${agentId}/prefix`).send({ prefix: 710, startSeq: 1 });
    expect(prefixRes.status).toBe(200);
    after = await getSync();
    expect(after.channels.accounting).toBeGreaterThan(before.channels.accounting);
    expect(after.channels.sales).toBeGreaterThan(before.channels.sales);
    expect(after.channels.users).toBeGreaterThan(before.channels.users);
    expect(after.channels.general).toBe(before.channels.general);

    // 8. أوردرات الفتيات + التصدير + المحاسبة
    before = after;
    const agOrderRes = await api(agent).post("/api/agent/orders").send({
      date: "2026-11-22",
      customerName: "عميلة مزامنة",
      customerPhone: "01000000001",
      lines: [{ productId: prodRes.body.product.id, quantity: 1 }],
    });
    expect(agOrderRes.status).toBe(201);
    after = await getSync();
    expect(after.channels.sales).toBeGreaterThan(before.channels.sales);
    expect(after.channels.accounting).toBeGreaterThan(before.channels.accounting);
    expect(after.channels.general).toBe(before.channels.general);

    const expRes = await api(admin).post("/api/agent-supervisor/orders/export").send({ ids: [agOrderRes.body.order.id], confirm: true });
    expect(expRes.status).toBe(200);
    const exportedRow = await prisma().agentOrder.findUniqueOrThrow({ where: { id: agOrderRes.body.order.id } });
    const followOrderId = exportedRow.salesOrderId!;
    expect(typeof followOrderId).toBe("string");

    const execRes = await api(admin).patch(`/api/sales/orders/${followOrderId}`).send({ status: "EXECUTED" });
    expect(execRes.status).toBe(200);

    before = await getSync();
    const shipRes = await api(accountant).put(`/api/accounting/orders/${followOrderId}/shipping`).send({ shippingPrice: 65 });
    expect(shipRes.status).toBe(200);
    after = await getSync();
    expect(after.channels.accounting).toBeGreaterThan(before.channels.accounting);
    expect(after.channels.sales).toBeGreaterThan(before.channels.sales);
    expect(after.channels.general).toBe(before.channels.general);

    // 9. الإشعارات ← notifications
    before = after;
    const readRes = await api(admin).post("/api/notifications/read-all");
    expect(readRes.status).toBe(200);
    after = await getSync();
    expect(after.channels.notifications).toBeGreaterThan(before.channels.notifications);
    expect(after.channels.general).toBe(before.channels.general);
  });

  it("تسجيل الدخول والطلبات الفاشلة لا ترفع نسخة البيانات", async () => {
    const before = await getSync();
    const loginRes = await api().post("/api/auth/login").send({ username: "lol", password: PASSWORD });
    expect(loginRes.status).toBe(200);
    const badTask = await api(admin).post("/api/tasks").send({ title: " ", date: "invalid" });
    expect(badTask.status).toBe(400);
    const after = await getSync();
    expect(after.version).toBe(before.version);
  });

  it("يدفع SSE /api/sync/stream التحديث لحظياً فور حدوث كتابة", async () => {
    const { createApp } = await import("../src/app.ts");
    const server = createApp().listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const { port } = server.address() as AddressInfo;
    const sseAbort = new AbortController();

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/sync/stream`, {
        headers: { Authorization: `Bearer ${admin}`, Accept: "text/event-stream" },
        signal: sseAbort.signal,
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/event-stream");
      expect(response.body).toBeTruthy();

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      const buffer = { text: "" };

      const initial = await readSseEvent(reader, decoder, buffer);
      expect(typeof initial.channels.tasks).toBe("number");

      const writeRes = await fetch(`http://127.0.0.1:${port}/api/tasks`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${admin}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: "مهمة SSE فورية", date: "2026-11-22" }),
      });
      expect(writeRes.status).toBe(201);

      const pushed = await readSseEvent(reader, decoder, buffer);
      expect(pushed.channels.tasks).toBe(initial.channels.tasks + 1);
      expect(pushed.channels.notifications).toBe(initial.channels.notifications + 1);
      expect(pushed.channels.general).toBe(initial.channels.general);

      await reader.cancel().catch(() => undefined);
    } finally {
      sseAbort.abort();
      await new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      });
    }
  });

  it("الأدوار المقيّدة وأدوار المبيعات تصل إلى /api/sync و /api/sync/stream", async () => {
    const { createApp } = await import("../src/app.ts");
    const server = createApp().listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const { port } = server.address() as AddressInfo;

    try {
      for (const token of [agent, accountant, packer, operator]) {
        const s = await getSync(token);
        expect(typeof s.version).toBe("string");

        const ac = new AbortController();
        try {
          const streamRes = await fetch(`http://127.0.0.1:${port}/api/sync/stream`, {
            headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
            signal: ac.signal,
          });
          expect(streamRes.status).toBe(200);
          expect(streamRes.headers.get("content-type")).toContain("text/event-stream");
          const reader = streamRes.body!.getReader();
          const first = await readSseEvent(reader, new TextDecoder(), { text: "" });
          expect(typeof first.version).toBe("string");
          await reader.cancel().catch(() => undefined);
        } finally {
          ac.abort();
        }
      }
    } finally {
      await new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      });
    }
  });
});
