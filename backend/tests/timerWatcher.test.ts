import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/db.ts";
import { api, login, makeUser, resetDb } from "./helpers.ts";
import { processTimers } from "../src/utils/timerWatcher.ts";
import request from "supertest";
import { app } from "./helpers.ts";

const MIN = 60_000;
let des: string, desId: string, mgr: string, mgrId: string;

beforeAll(async () => {
  await resetDb();
  desId = (await makeUser("tw_des")).id;
  des = await login("tw_des");
  mgr = await login("amr");
  mgrId = (await prisma().user.findUnique({ where: { username: "amr" } }))!.id;
});
beforeEach(async () => {
  await prisma().taskTimer.deleteMany({});
  await prisma().notification.deleteMany({});
});

// مهمة أنشأها المدير للمصمم، ومؤقتها يعمل وبقي عليه remainingMs من أصل plannedMin
async function mkRunning(plannedMin: number, remainingMs: number) {
  const t = (await api(mgr).post("/api/tasks").send({ title: "مهمة المراقب", date: "2026-11-01", assigneeId: desId })).body.task;
  await api(des).post(`/api/tasks/${t.id}/timer/start`).send({ minutes: plannedMin });
  const now = Date.now();
  await prisma().taskTimer.update({ where: { taskId: t.id }, data: { remainingMs, runningSince: new Date(now) } });
  await prisma().notification.deleteMany({});
  return { id: t.id as string, now };
}
const types = async () => (await prisma().notification.findMany({ orderBy: { createdAt: "asc" } })).map((n) => `${n.type}:${n.recipientId === desId ? "des" : "mgr"}`).sort();

describe("timerWatcher", () => {
  it("لا شيء قبل عتبة العشر دقائق", async () => {
    const { now } = await mkRunning(60, 30 * MIN);
    const r = await processTimers(now);
    expect(r).toMatchObject({ warned10: 0, warned1: 0, expired: 0 });
    expect(await prisma().notification.count()).toBe(0);
  });

  it("10 دقائق: إشعار للمصمم والمدير مرة واحدة فقط", async () => {
    const { now } = await mkRunning(60, 9 * MIN + 30_000);
    expect((await processTimers(now)).warned10).toBe(1);
    expect(await types()).toEqual(["TIMER_WARNING_10:des", "TIMER_WARNING_10:mgr"]);
    expect((await processTimers(now + 5000)).warned10).toBe(0);
    expect(await prisma().notification.count()).toBe(2);
  });

  it("دقيقة: إشعار مرة واحدة", async () => {
    const { now } = await mkRunning(60, 50_000);
    expect((await processTimers(now)).warned1).toBe(1);
    expect((await processTimers(now + 1000)).warned1).toBe(0);
    expect((await types()).every((t) => t.startsWith("TIMER_WARNING_1:"))).toBe(true);
  });

  it("الانتهاء: المؤقت EXPIRED وإشعار واحد ولا تكرار", async () => {
    const { id, now } = await mkRunning(60, 10_000);
    expect((await processTimers(now + 20_000)).expired).toBe(1);
    const row = await prisma().taskTimer.findUnique({ where: { taskId: id } });
    expect(row).toMatchObject({ status: "EXPIRED", remainingMs: 0, expiredNotified: true });
    expect((await processTimers(now + 40_000)).expired).toBe(0);
    expect(await types()).toEqual(["TIMER_EXPIRED:des", "TIMER_EXPIRED:mgr"]);
  });

  it("تأخر المراقب حتى بعد الانتهاء: إشعار الانتهاء فقط دون تحذيرات قديمة", async () => {
    const { now } = await mkRunning(60, 8 * MIN);
    await processTimers(now + 30 * MIN);
    expect((await types()).every((t) => t.startsWith("TIMER_EXPIRED"))).toBe(true);
  });

  it("مؤقت مدته 5 دقائق لا ينبّه «10 دقائق» ويضع العلم فقط", async () => {
    const { id, now } = await mkRunning(5, 4 * MIN);
    expect((await processTimers(now)).warned10).toBe(0);
    expect(await prisma().notification.count()).toBe(0);
    expect((await prisma().taskTimer.findUnique({ where: { taskId: id } }))!.warned10).toBe(true);
  });

  it("المؤقت الموقوف لا يُنبَّه", async () => {
    const { id, now } = await mkRunning(60, 30_000);
    await api(des).post(`/api/tasks/${id}/timer/pause`);
    await prisma().notification.deleteMany({});
    await processTimers(now + 10 * MIN);
    expect(await prisma().notification.count()).toBe(0);
  });

  it("التمديد بعد الانتهاء يعيد تفعيل التنبيهات", async () => {
    const { id, now } = await mkRunning(60, 10_000);
    await processTimers(now + 20_000);
    await prisma().notification.deleteMany({});
    await api(des).post(`/api/tasks/${id}/timer/extend`).send({ minutes: 2 });
    const row = await prisma().taskTimer.findUnique({ where: { taskId: id } });
    expect(row).toMatchObject({ status: "RUNNING", expiredNotified: false, warned1: false });
  });

  it("تنبيه لا يُرسل لمستخدم معطّل", async () => {
    const { now } = await mkRunning(60, 5 * 1000);
    await prisma().user.update({ where: { id: mgrId }, data: { isActive: false } });
    await processTimers(now + 10_000);
    await prisma().user.update({ where: { id: mgrId }, data: { isActive: true } });
    expect(await types()).toEqual(["TIMER_EXPIRED:des"]);
  });
});

describe("/api/internal/tick", () => {
  it("بدون CRON_SECRET مضبوط ← 404", async () => {
    delete process.env.CRON_SECRET;
    expect((await request(app).get("/api/internal/tick")).status).toBe(404);
  });
});
