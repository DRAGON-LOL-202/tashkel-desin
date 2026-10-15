import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db.ts";
import { workDateOf } from "../src/utils/attendance.ts";
import { api, login, makeUser, resetDb } from "./helpers.ts";

let d1: string;
let d1Id: string;

beforeAll(async () => {
  await resetDb();
  d1Id = (await makeUser("att1")).id;
  d1 = await login("att1");
});

describe("workDateOf: اليوم بتوقيت القاهرة", () => {
  it("بعد منتصف الليل بتوقيت القاهرة ينسب لليوم الجديد حتى لو UTC ما زال أمس", () => {
    // 2026-03-10 22:30 UTC = 2026-03-11 00:30 بتوقيت القاهرة (UTC+2 شتاءً)
    expect(workDateOf(new Date("2026-03-10T22:30:00Z"), "Africa/Cairo")).toBe("2026-03-11");
    expect(workDateOf(new Date("2026-03-10T21:30:00Z"), "Africa/Cairo")).toBe("2026-03-10");
  });
});

describe("attendance: الحضور والانصراف والعودة", () => {
  it("بدون توكن ← 401", async () => {
    expect((await api().post("/api/attendance/check-in")).status).toBe(401);
  });

  it("حضور ← جلسة مفتوحة، وحضور ثانٍ وهي مفتوحة ← 409", async () => {
    const res = await api(d1).post("/api/attendance/check-in");
    expect(res.status).toBe(201);
    expect(res.body.session).toMatchObject({ userId: d1Id, endTime: null });
    expect(typeof res.body.session.startTime).toBe("number");
    expect((await api(d1).post("/api/attendance/check-in")).status).toBe(409);
  });

  it("انصراف يغلق الجلسة، وانصراف ثانٍ بلا جلسة مفتوحة ← 409", async () => {
    const res = await api(d1).post("/api/attendance/check-out");
    expect(res.status).toBe(200);
    expect(res.body.session.endTime).toBeGreaterThanOrEqual(res.body.session.startTime);
    expect((await api(d1).post("/api/attendance/check-out")).status).toBe(409);
  });

  it("عودة = جلسة جديدة منفصلة في نفس اليوم", async () => {
    const res = await api(d1).post("/api/attendance/check-in");
    expect(res.status).toBe(201);
    await api(d1).post("/api/attendance/check-out");
    const today = await api(d1).get("/api/attendance/today");
    expect(today.status).toBe(200);
    const mine = today.body.sessions.filter((s: any) => s.userId === d1Id);
    expect(mine).toHaveLength(2);
    expect(mine.every((s: any) => s.endTime !== null)).toBe(true);
    expect(new Set(mine.map((s: any) => s.workDate)).size).toBe(1);
  });
});

describe("attendance: الجلسة تُنسب ليوم بدايتها وتعبر منتصف الليل", () => {
  it("جلسة بدأت أمس وما زالت مفتوحة تظهر في today بيوم بدايتها", async () => {
    await resetDb();
    const u = await makeUser("night1");
    const token = await login("night1");
    const start = new Date(Date.now() - 26 * 3600_000);
    await prisma().attendanceSession.create({ data: { userId: u.id, workDate: workDateOf(start), startTime: start } });
    const today = await api(token).get("/api/attendance/today");
    expect(today.body.sessions).toHaveLength(1);
    expect(today.body.sessions[0].workDate).toBe(workDateOf(start));
    // الانصراف يغلقها ولا ينشئ جلسة جديدة ولا يغيّر يومها
    const out = await api(token).post("/api/attendance/check-out");
    expect(out.status).toBe(200);
    expect(out.body.session.workDate).toBe(workDateOf(start));
  });
});

describe("attendance: العزل والتقرير الشهري", () => {
  it("المصمم لا يرى جلسات غيره في today، والإدارة ترى الكل", async () => {
    await resetDb();
    const a = await makeUser("iso1");
    const b = await makeUser("iso2");
    const ta = await login("iso1");
    const tb = await login("iso2");
    await api(ta).post("/api/attendance/check-in");
    await api(tb).post("/api/attendance/check-in");
    const mine = await api(ta).get("/api/attendance/today");
    expect(mine.body.sessions.map((s: any) => s.userId)).toEqual([a.id]);
    const all = await api(await login("lol")).get("/api/attendance/today");
    expect(all.body.sessions.map((s: any) => s.userId).sort()).toEqual([a.id, b.id].sort());
  });

  it("/month للإدارة فقط (المصمم 403) ويتحقق من الصيغة", async () => {
    const adminToken = await login("lol");
    const designer = await login("iso1");
    const month = workDateOf(new Date()).slice(0, 7);
    expect((await api(designer).get(`/api/attendance/month?month=${month}`)).status).toBe(403);
    expect((await api(adminToken).get("/api/attendance/month?month=2026-13")).status).toBe(400);
    expect((await api(adminToken).get("/api/attendance/month")).status).toBe(400);
    const ok = await api(adminToken).get(`/api/attendance/month?month=${month}`);
    expect(ok.status).toBe(200);
    expect(ok.body.sessions.length).toBe(2);
  });

  it("حذف مستخدم لديه جلسات حضور ← 409 (يُعطَّل بدل الحذف)", async () => {
    const adminToken = await login("lol");
    const u = await prisma().user.findUnique({ where: { username: "iso1" } });
    expect((await api(adminToken).delete(`/api/users/${u!.id}`)).status).toBe(409);
  });
});
