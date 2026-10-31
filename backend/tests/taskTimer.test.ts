import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db.ts";
import { api, login, makeUser, resetDb } from "./helpers.ts";

let manager: string, d1: string, d2: string;
const DAY = "2026-11-01";
const MIN = 60_000;

beforeAll(async () => {
  await resetDb();
  await makeUser("tm_des1");
  await makeUser("tm_des2");
  manager = await login("amr");
  d1 = await login("tm_des1");
  d2 = await login("tm_des2");
});

const mk = async (token: string, o: Record<string, unknown> = {}) => {
  const res = await api(token).post("/api/tasks").send({ title: "مهمة بمؤقت", date: DAY, ...o });
  expect(res.status).toBe(201);
  return res.body.task as { id: string; [k: string]: any };
};
const timerOf = async (token: string, id: string) => (await api(token).get(`/api/tasks/${id}`)).body.task.timer;

describe("timer: التحديد والبدء", () => {
  it("مهمة بلا مؤقت: timer غير موجود", async () => {
    expect((await mk(d1)).timer).toBeUndefined();
  });

  it("plannedMinutes عند الإنشاء ← مؤقت معلّق بالمدة المحددة", async () => {
    const t = await mk(d1, { plannedMinutes: 30 });
    expect(t.timer).toMatchObject({ status: "pending", plannedMs: 30 * MIN, remainingMs: 30 * MIN });
    expect(t.timer.expiresAt).toBeUndefined();
  });

  it("تحقق: مدة صفر/سالبة/كسرية/فوق 24 ساعة ← 400", async () => {
    const t = await mk(d1);
    for (const minutes of [0, -5, 1.5, 1441, "10"]) {
      expect((await api(d1).post(`/api/tasks/${t.id}/timer/start`).send({ minutes })).status).toBe(400);
    }
  });

  it("start بلا مؤقت وبلا مدة ← 400", async () => {
    const t = await mk(d1);
    expect((await api(d1).post(`/api/tasks/${t.id}/timer/start`).send({})).status).toBe(400);
  });

  it("start بمدة: المؤقت يعمل والمهمة تبدأ وينشأ سجل وقت", async () => {
    const t = await mk(d1);
    const res = await api(d1).post(`/api/tasks/${t.id}/timer/start`).send({ minutes: 25 });
    expect(res.status).toBe(200);
    expect(res.body.task.status).toBe("running");
    expect(res.body.task.timer).toMatchObject({ status: "running", plannedMs: 25 * MIN });
    expect(res.body.task.timer.remainingMs).toBeGreaterThan(24 * MIN);
    expect(res.body.task.timer.expiresAt).toBeGreaterThan(res.body.task.timer.serverNow);
    expect(await prisma().taskTimeLog.count({ where: { taskId: t.id, stopTime: null } })).toBe(1);
  });

  it("start مرتين ← 409", async () => {
    const t = await mk(d1);
    await api(d1).post(`/api/tasks/${t.id}/timer/start`).send({ minutes: 5 });
    expect((await api(d1).post(`/api/tasks/${t.id}/timer/start`).send({ minutes: 5 })).status).toBe(409);
  });

  it("تشغيل المهمة نفسها يُشغّل المؤقت المعلّق", async () => {
    const t = await mk(d1, { plannedMinutes: 15 });
    const res = await api(d1).post(`/api/tasks/${t.id}/start`);
    expect(res.body.task.timer.status).toBe("running");
  });
});

describe("timer: الإيقاف والاستكمال", () => {
  it("pause يحفظ المتبقي ويوقف المهمة، وresume يكمل من المتبقي", async () => {
    const t = await mk(d1);
    await api(d1).post(`/api/tasks/${t.id}/timer/start`).send({ minutes: 10 });
    const paused = await api(d1).post(`/api/tasks/${t.id}/timer/pause`);
    expect(paused.status).toBe(200);
    expect(paused.body.task.status).toBe("paused");
    expect(paused.body.task.timer.status).toBe("paused");
    const frozen = paused.body.task.timer.remainingMs;
    expect(frozen).toBeLessThanOrEqual(10 * MIN);
    expect(frozen).toBeGreaterThan(9 * MIN);
    // لا ينقص أثناء الإيقاف
    expect((await timerOf(d1, t.id)).remainingMs).toBe(frozen);
    const resumed = await api(d1).post(`/api/tasks/${t.id}/timer/resume`);
    expect(resumed.body.task.status).toBe("running");
    expect(resumed.body.task.timer.status).toBe("running");
    expect(resumed.body.task.timer.remainingMs).toBeLessThanOrEqual(frozen);
  });

  it("إيقاف المهمة (stop) يوقف المؤقت أيضاً", async () => {
    const t = await mk(d1);
    await api(d1).post(`/api/tasks/${t.id}/timer/start`).send({ minutes: 10 });
    const res = await api(d1).post(`/api/tasks/${t.id}/stop`).send({ note: "استراحة" });
    expect(res.body.task.timer.status).toBe("paused");
  });

  it("pause بلا مؤقت أو والمؤقت موقوف ← 409؛ resume والمؤقت يعمل ← 409", async () => {
    const t = await mk(d1);
    expect((await api(d1).post(`/api/tasks/${t.id}/timer/pause`)).status).toBe(409);
    await api(d1).post(`/api/tasks/${t.id}/timer/start`).send({ minutes: 10 });
    expect((await api(d1).post(`/api/tasks/${t.id}/timer/resume`)).status).toBe(409);
    await api(d1).post(`/api/tasks/${t.id}/timer/pause`);
    expect((await api(d1).post(`/api/tasks/${t.id}/timer/pause`)).status).toBe(409);
  });
});

describe("timer: التمديد والانتهاء والإلغاء", () => {
  it("extend يضيف إلى المتبقي والمخطّط ويصفّر علامات التنبيه", async () => {
    const t = await mk(d1);
    await api(d1).post(`/api/tasks/${t.id}/timer/start`).send({ minutes: 5 });
    await prisma().taskTimer.update({ where: { taskId: t.id }, data: { warned10: true, warned1: true, expiredNotified: true } });
    const res = await api(d1).post(`/api/tasks/${t.id}/timer/extend`).send({ minutes: 20 });
    expect(res.status).toBe(200);
    expect(res.body.task.timer.plannedMs).toBe(25 * MIN);
    expect(res.body.task.timer.remainingMs).toBeGreaterThan(24 * MIN);
    const row = await prisma().taskTimer.findUnique({ where: { taskId: t.id } });
    expect(row).toMatchObject({ warned10: false, warned1: false, expiredNotified: false, status: "RUNNING" });
  });

  it("extend يتجاوز 24 ساعة ← 400", async () => {
    const t = await mk(d1);
    await api(d1).post(`/api/tasks/${t.id}/timer/start`).send({ minutes: 1000 });
    expect((await api(d1).post(`/api/tasks/${t.id}/timer/extend`).send({ minutes: 1000 })).status).toBe(400);
  });

  it("مؤقت انتهى وقته يظهر expired وremaining = 0، والتمديد يعيده للعمل", async () => {
    const t = await mk(d1);
    await api(d1).post(`/api/tasks/${t.id}/timer/start`).send({ minutes: 5 });
    await prisma().taskTimer.update({ where: { taskId: t.id }, data: { runningSince: new Date(Date.now() - 6 * MIN) } });
    const t1 = await timerOf(d1, t.id);
    expect(t1).toMatchObject({ status: "expired", remainingMs: 0 });
    expect((await api(d1).post(`/api/tasks/${t.id}/timer/start`).send({})).status).toBe(409);
    const ext = await api(d1).post(`/api/tasks/${t.id}/timer/extend`).send({ minutes: 10 });
    expect(ext.body.task.timer.status).toBe("running");
    expect(ext.body.task.timer.remainingMs).toBeGreaterThan(9 * MIN);
  });

  it("start بمدة جديدة على مؤقت منتهٍ", async () => {
    const t = await mk(d1);
    await api(d1).post(`/api/tasks/${t.id}/timer/start`).send({ minutes: 5 });
    await prisma().taskTimer.update({ where: { taskId: t.id }, data: { runningSince: new Date(Date.now() - 6 * MIN) } });
    const res = await api(d1).post(`/api/tasks/${t.id}/timer/start`).send({ minutes: 8 });
    expect(res.status).toBe(200);
    expect(res.body.task.timer).toMatchObject({ status: "running", plannedMs: 8 * MIN });
  });

  it("إنهاء المهمة يحذف المؤقت؛ وعلى مهمة مكتملة ← 409", async () => {
    const t = await mk(d1);
    await api(d1).post(`/api/tasks/${t.id}/timer/start`).send({ minutes: 5 });
    const end = await api(d1).post(`/api/tasks/${t.id}/end`);
    expect(end.body.task.timer).toBeUndefined();
    expect((await api(d1).post(`/api/tasks/${t.id}/timer/start`).send({ minutes: 5 })).status).toBe(409);
  });

  it("إكمال المهمة عبر progress يحذف المؤقت", async () => {
    const t = await mk(d1, { plannedMinutes: 5 });
    const res = await api(d1).patch(`/api/tasks/${t.id}/progress`).send({ current: 1 });
    expect(res.body.task.status).toBe("completed");
    expect(res.body.task.timer).toBeUndefined();
  });

  it("timer/stop يلغي المؤقت ويبقي المهمة تعمل", async () => {
    const t = await mk(d1);
    await api(d1).post(`/api/tasks/${t.id}/timer/start`).send({ minutes: 5 });
    const res = await api(d1).post(`/api/tasks/${t.id}/timer/stop`);
    expect(res.body.task.timer).toBeUndefined();
    expect(res.body.task.status).toBe("running");
  });

  it("حذف المهمة يحذف مؤقتها", async () => {
    const t = await mk(d1, { plannedMinutes: 5 });
    await prisma().task.delete({ where: { id: t.id } });
    expect(await prisma().taskTimer.count({ where: { taskId: t.id } })).toBe(0);
  });
});

describe("timer: الصلاحيات", () => {
  it("مصمم آخر لا يتحكم بمؤقت غيره ← 403", async () => {
    const t = await mk(d1);
    for (const p of ["timer/start", "timer/pause", "timer/resume", "timer/extend", "timer/stop"]) {
      expect((await api(d2).post(`/api/tasks/${t.id}/${p}`).send({ minutes: 5 })).status).toBe(403);
    }
  });

  it("المدير يتحكم بمؤقت مصمم", async () => {
    const t = await mk(d1);
    const res = await api(manager).post(`/api/tasks/${t.id}/timer/start`).send({ minutes: 5 });
    expect(res.status).toBe(200);
    expect(res.body.task.timer.status).toBe("running");
  });

  it("مهمة غير موجودة ← 404، وبلا توكن ← 401", async () => {
    expect((await api(d1).post("/api/tasks/nope/timer/start").send({ minutes: 5 })).status).toBe(404);
    expect((await api().post("/api/tasks/x/timer/start").send({ minutes: 5 })).status).toBe(401);
  });
});
