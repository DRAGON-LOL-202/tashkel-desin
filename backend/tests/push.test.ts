import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/db.ts";
import { api, app, login, makeUser, resetDb } from "./helpers.ts";
import { buildPayload, flushPushes, MAX_BODY_CHARS, setPushSender, ttlFor, type PushSender } from "../src/utils/push.ts";
import { processTimers } from "../src/utils/timerWatcher.ts";

const MIN = 60_000;
let admin: string, mgr: string, des: string, other: string;
let desId: string, otherId: string;

const sub = (n: string) => ({ endpoint: `https://push.example.test/send/${n}`, keys: { p256dh: `p256dh-key-${n}-0123456789`, auth: `auth-key-${n}-0123456789` } });

// مرسل وهمي يسجّل ما أُرسل ويمكن جعله يفشل لجهاز معيّن
interface Call { endpoint: string; body: { title: string; body: string; url: string; tag: string; type: string; timer: boolean; notificationId?: string }; ttl: number; urgency: string }
let calls: Call[] = [];
let failWith: Record<string, number> = {};
const fake: PushSender = async (target, body, options) => {
  const status = failWith[target.endpoint];
  if (status) throw Object.assign(new Error(`push ${status}`), { statusCode: status });
  calls.push({ endpoint: target.endpoint, body: JSON.parse(body), ttl: options.TTL, urgency: options.urgency });
};

beforeAll(async () => {
  await resetDb();
  desId = (await makeUser("push_des")).id;
  otherId = (await makeUser("push_other")).id;
  admin = await login("lol");
  mgr = await login("amr");
  des = await login("push_des");
  other = await login("push_other");
});
beforeEach(async () => {
  calls = [];
  failWith = {};
  setPushSender(fake);
  await prisma().pushSubscription.deleteMany({});
  await prisma().notification.deleteMany({});
});
afterEach(async () => {
  await flushPushes();
  setPushSender(null);
});

const subscribe = (token: string, n: string) => api(token).post("/api/push/subscribe").send(sub(n));
const mkTask = async (assigneeId: string, o: Record<string, unknown> = {}) =>
  (await api(mgr).post("/api/tasks").send({ title: "مهمة الدفع", date: "2026-11-01", assigneeId, ...o })).body.task as { id: string };

describe("push: الإعداد والتسجيل", () => {
  it("يتطلب تسجيل الدخول", async () => {
    expect((await request(app).get("/api/push/config")).status).toBe(401);
    expect((await request(app).post("/api/push/subscribe").send(sub("x"))).status).toBe(401);
    expect((await request(app).post("/api/push/unsubscribe").send({ endpoint: "x" })).status).toBe(401);
    expect((await request(app).post("/api/push/test")).status).toBe(401);
  });

  it("config يعيد التفعيل والمفتاح العام وعدد أجهزتي فقط", async () => {
    await subscribe(des, "a");
    const mine = await api(des).get("/api/push/config");
    expect(mine.status).toBe(200);
    expect(mine.body).toMatchObject({ enabled: true, devices: 1 });
    expect(typeof mine.body.publicKey).toBe("string");
    expect((await api(other).get("/api/push/config")).body.devices).toBe(0);
  });

  it("يرفض endpoint غير https أو مفاتيح ناقصة", async () => {
    expect((await api(des).post("/api/push/subscribe").send({ ...sub("a"), endpoint: "http://push.example.test/x" })).status).toBe(400);
    expect((await api(des).post("/api/push/subscribe").send({ endpoint: sub("a").endpoint })).status).toBe(400);
    expect((await api(des).post("/api/push/subscribe").send({ endpoint: sub("a").endpoint, keys: { p256dh: "x", auth: "y" } })).status).toBe(400);
    expect(await prisma().pushSubscription.count()).toBe(0);
  });

  it("التسجيل مرتين لنفس الجهاز لا يكرر، وتحديث المفاتيح يُحفظ", async () => {
    expect((await subscribe(des, "a")).body.devices).toBe(1);
    const again = await api(des).post("/api/push/subscribe").send({ endpoint: sub("a").endpoint, keys: { p256dh: "new-p256dh-0123456789", auth: "new-auth-0123456789" } });
    expect(again.body.devices).toBe(1);
    expect((await prisma().pushSubscription.findFirst())!.p256dh).toBe("new-p256dh-0123456789");
    expect((await subscribe(des, "b")).body.devices).toBe(2);
  });

  it("جهاز مشترك: تسجيل مستخدم آخر لنفس الـ endpoint ينقله إليه", async () => {
    await subscribe(des, "shared");
    await subscribe(other, "shared");
    const row = await prisma().pushSubscription.findUnique({ where: { endpoint: sub("shared").endpoint } });
    expect(row!.userId).toBe(otherId);
    expect((await api(des).get("/api/push/config")).body.devices).toBe(0);
  });

  it("الإلغاء لصاحب الجهاز فقط", async () => {
    await subscribe(des, "a");
    // مستخدم آخر لا يستطيع حذف جهاز غيره
    await api(other).post("/api/push/unsubscribe").send({ endpoint: sub("a").endpoint });
    expect(await prisma().pushSubscription.count()).toBe(1);
    const res = await api(des).post("/api/push/unsubscribe").send({ endpoint: sub("a").endpoint });
    expect(res.body).toMatchObject({ ok: true, devices: 0 });
  });

  it("حذف المستخدم يحذف أجهزته", async () => {
    const u = await makeUser("push_tmp");
    await prisma().pushSubscription.create({ data: { userId: u.id, endpoint: sub("tmp").endpoint, p256dh: "p", auth: "a" } });
    await prisma().user.delete({ where: { id: u.id } });
    expect(await prisma().pushSubscription.count()).toBe(0);
  });
});

describe("push: الإرسال عند حدوث إشعار", () => {
  it("إسناد مهمة ← Push لأجهزة المسؤول فقط برابط اليوم", async () => {
    await subscribe(des, "d1");
    await subscribe(des, "d2");
    await subscribe(other, "o1");
    const t = await mkTask(desId);
    await flushPushes();
    expect(calls.map((c) => c.endpoint).sort()).toEqual([sub("d1").endpoint, sub("d2").endpoint]);
    expect(calls[0].body).toMatchObject({ type: "TASK_ASSIGNED", timer: false });
    expect(calls[0].body.url).toBe(`/#/daily-tasks?date=2026-11-01&nid=${calls[0].body.notificationId}`);
    expect(calls[0].body.title).toBeTruthy();
    expect(calls[0].urgency).toBe("normal");
    expect(typeof calls[0].body.notificationId).toBe("string");
    expect(t.id).toBeTruthy();
  });

  it("لا Push لمن نفّذ الحدث ولا لمستخدم بلا أجهزة", async () => {
    await subscribe(mgr, "m1"); // المدير أسند المهمة بنفسه
    await mkTask(desId);
    await flushPushes();
    expect(calls).toHaveLength(0);
  });

  it("فشل مؤقت (500) لا يكسر العملية ولا يحذف الجهاز", async () => {
    await subscribe(des, "d1");
    failWith[sub("d1").endpoint] = 500;
    const res = await api(mgr).post("/api/tasks").send({ title: "x", date: "2026-11-01", assigneeId: desId });
    expect(res.status).toBe(201);
    await flushPushes();
    expect(await prisma().pushSubscription.count()).toBe(1);
    expect((await api(des).get("/api/notifications")).body.unread).toBe(1); // الإشعار داخل الموقع محفوظ رغم فشل الدفع
  });

  it("اشتراك منتهٍ (410/404) يُحذف تلقائياً ويبقى السليم", async () => {
    await subscribe(des, "dead");
    await subscribe(des, "gone");
    await subscribe(des, "alive");
    failWith[sub("dead").endpoint] = 410;
    failWith[sub("gone").endpoint] = 404;
    await mkTask(desId);
    await flushPushes();
    const left = await prisma().pushSubscription.findMany();
    expect(left.map((s) => s.endpoint)).toEqual([sub("alive").endpoint]);
    expect(left[0].lastPushAt).not.toBeNull();
  });

  it("إشعار بلا مهمة (موظف جديد) يفتح صفحة الإشعارات", async () => {
    await subscribe(mgr, "m1"); // المدير من الإدارة فيُشعَر بإضافة الحساب
    const res = await api(admin).post("/api/users").send({ name: "موظف جديد", username: "push_nu", email: "push_nu@example.test", password: "test-only-pass-1234", role: "DESIGNER" });
    expect(res.status).toBe(201);
    await flushPushes();
    expect(calls).toHaveLength(1);
    expect(calls[0].body.type).toBe("USER_CREATED");
    expect(calls[0].body.url).toBe(`/#/notifications?nid=${calls[0].body.notificationId}`);
  });
});

describe("push: تنبيهات المؤقت", () => {
  async function mkRunning(plannedMin: number, remainingMs: number) {
    const t = await mkTask(desId);
    await api(des).post(`/api/tasks/${t.id}/timer/start`).send({ minutes: plannedMin });
    const now = Date.now();
    await prisma().taskTimer.update({ where: { taskId: t.id }, data: { remainingMs, runningSince: new Date(now) } });
    await flushPushes();
    calls = [];
    await prisma().notification.deleteMany({});
    return { id: t.id, now };
  }

  it("الانتهاء: Push عاجل لجهاز المسؤول بعمر قصير ورمز مؤقت", async () => {
    await subscribe(des, "d1");
    const { id, now } = await mkRunning(60, 10_000);
    expect((await processTimers(now + 20_000)).expired).toBe(1);
    expect(calls).toHaveLength(1); // المراقب ينتظر خروج الرسائل قبل أن يعيد
    expect(calls[0]).toMatchObject({ ttl: 3600, urgency: "high" });
    expect(calls[0].body).toMatchObject({ type: "TIMER_EXPIRED", timer: true, tag: `timer-${id}` });
    expect(calls[0].body.url).toMatch(/^\/#\/daily-tasks\?date=2026-11-01&nid=.+/);
  });

  it("عشر دقائق ثم دقيقة: عمر الرسالة يقصر، ولا تكرار عند إعادة الفحص", async () => {
    await subscribe(des, "d1");
    const a = await mkRunning(60, 9 * MIN);
    await processTimers(a.now);
    await processTimers(a.now + 1000);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ ttl: 600, urgency: "high" });
    expect(calls[0].body.type).toBe("TIMER_WARNING_10");

    calls = [];
    const b = await mkRunning(60, 50_000);
    await processTimers(b.now);
    expect(calls).toHaveLength(1);
    expect(calls[0].ttl).toBe(120);
    expect(calls[0].body.type).toBe("TIMER_WARNING_1");
  });
});

describe("push: إشعار تجريبي", () => {
  it("يصل لأجهزتي أنا فقط", async () => {
    await subscribe(des, "d1");
    await subscribe(other, "o1");
    const res = await api(des).post("/api/push/test");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, devices: 1, sent: 1, failed: 0 });
    expect(calls.map((c) => c.endpoint)).toEqual([sub("d1").endpoint]);
    expect(calls[0].body.tag).toBe("push-test");
    expect(await prisma().notification.count()).toBe(0); // لا يلوّث صفحة الإشعارات
  });

  it("بلا أجهزة: devices=0 دون خطأ", async () => {
    const res = await api(other).post("/api/push/test");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ devices: 0, sent: 0 });
  });
});

describe("push: دوال صرفة", () => {
  it("ttlFor", () => {
    expect([ttlFor("TIMER_WARNING_1"), ttlFor("TIMER_WARNING_10"), ttlFor("TIMER_EXPIRED"), ttlFor("TASK_ASSIGNED")]).toEqual([120, 600, 3600, 86_400]);
  });

  it("buildPayload: اقتطاع النص الطويل والرابط والـ tag", () => {
    const long = buildPayload({ type: "COMMENT_ADDED", title: "t", message: "ا".repeat(500), taskId: "k1", taskDate: "2026-11-02", notificationId: "n1" });
    expect(long.body.length).toBeLessThanOrEqual(MAX_BODY_CHARS);
    expect(long.url).toBe("/#/daily-tasks?date=2026-11-02&nid=n1");
    expect(long.tag).toBe("n-n1");
    expect(buildPayload({ type: "ROLE_CHANGED", title: "t", message: "m" }).url).toBe("/#/notifications");
    expect(buildPayload({ type: "ROLE_CHANGED", title: "t", message: "m", notificationId: "n3" }).url).toBe("/#/notifications?nid=n3");
    expect(buildPayload({ type: "TIMER_EXPIRED", title: "t", message: "m", taskId: "k1", taskDate: "2026-11-02", notificationId: "n2" }).tag).toBe("timer-k1");
  });
});
