import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db.ts";
import { api, login, makeUser, resetDb } from "./helpers.ts";

let admin: string, manager: string, d1: string, d2: string;
let d1Id: string, d2Id: string;

beforeAll(async () => {
  await resetDb();
  d1Id = (await makeUser("sdes1")).id;
  d2Id = (await makeUser("sdes2")).id;
  admin = await login("lol");
  manager = await login("amr");
  d1 = await login("sdes1");
  d2 = await login("sdes2");
});

const mk = async (token: string, o: Record<string, unknown> = {}) => {
  const res = await api(token).post("/api/tasks").send({ title: "مهمة", ...o });
  expect(res.status).toBe(201);
  return res.body.task as { id: string; [k: string]: any };
};
const end = async (token: string, id: string) => expect((await api(token).post(`/api/tasks/${id}/end`)).status).toBe(200);

describe("tasks/day-states: ألوان أيام التقويم", () => {
  const FROM = "2027-02-01";
  const TO = "2027-02-28";

  beforeAll(async () => {
    // 02-01: أوردر بفرعيتين (واحدة منتهية وواحدة لا) ← pending
    const p1 = await mk(d1, { date: "2027-02-01" });
    await end(d1, (await mk(d1, { date: "2027-02-01", parentId: p1.id })).id);
    await mk(d1, { date: "2027-02-01", parentId: p1.id });
    // 02-02: أوردر كل فرعياته منتهية ← completed
    const p2 = await mk(d1, { date: "2027-02-02" });
    await end(d1, (await mk(d1, { date: "2027-02-02", parentId: p2.id })).id);
    // 02-03: أوردر بلا فرعيات منتهٍ ← completed
    await end(d1, (await mk(d1, { date: "2027-02-03" })).id);
    // 02-04: أوردر بلا فرعيات غير منتهٍ ← pending
    await mk(d1, { date: "2027-02-04" });
    // 02-05: أوردران، واحد منتهٍ وواحد لا ← pending
    await end(d1, (await mk(d1, { date: "2027-02-05" })).id);
    await mk(d1, { date: "2027-02-05" });
    // 02-06: فرعية غير منتهية بتاريخ مختلف عن أمّها ← يوم الأم pending، ولا يظهر تاريخ الفرعية
    const p5 = await mk(d1, { date: "2027-02-06" });
    await mk(d1, { date: "2027-03-20", parentId: p5.id });
    // 02-07 للمصمم الأول، و02-08 للمصمم الثاني
    await mk(d1, { date: "2027-02-07" });
    await mk(d2, { date: "2027-02-08" });
  });

  it("المسار يرجع 200 وليس 404 (لا يبتلعه /:id)", async () => {
    const res = await api(admin).get(`/api/tasks/day-states?from=${FROM}&to=${TO}`);
    expect(res.status).toBe(200);
    expect(res.body.states).toBeTypeOf("object");
  });

  it("قاعدة اللون مطابقة لـ isTaskTreeCompleted", async () => {
    const { states } = (await api(admin).get(`/api/tasks/day-states?from=${FROM}&to=${TO}`)).body;
    expect(states["2027-02-01"]).toBe("pending");
    expect(states["2027-02-02"]).toBe("completed");
    expect(states["2027-02-03"]).toBe("completed");
    expect(states["2027-02-04"]).toBe("pending");
    expect(states["2027-02-05"]).toBe("pending");
    expect(states["2027-02-06"]).toBe("pending");
    expect(states["2027-02-09"]).toBeUndefined();
    expect(states["2027-03-20"]).toBeUndefined();
  });

  it("المصمم يرى ألوان مهامه فقط، والإدارة ترى الكل ويعمل assigneeId", async () => {
    const own = (await api(d1).get(`/api/tasks/day-states?from=${FROM}&to=${TO}&assigneeId=${d2Id}`)).body.states;
    expect(own["2027-02-07"]).toBe("pending");
    expect(own["2027-02-08"]).toBeUndefined();
    const second = (await api(d2).get(`/api/tasks/day-states?from=${FROM}&to=${TO}`)).body.states;
    expect(Object.keys(second)).toEqual(["2027-02-08"]);
    const all = (await api(manager).get(`/api/tasks/day-states?from=${FROM}&to=${TO}`)).body.states;
    expect(all["2027-02-07"]).toBe("pending");
    expect(all["2027-02-08"]).toBe("pending");
    const onlyD2 = (await api(manager).get(`/api/tasks/day-states?from=${FROM}&to=${TO}&assigneeId=${d2Id}`)).body.states;
    expect(Object.keys(onlyD2)).toEqual(["2027-02-08"]);
  });

  it("تحقق من النطاق: بدون فترة، أو معكوسة، أو أطول من 45 يوماً ← 400؛ بدون توكن ← 401", async () => {
    expect((await api(admin).get("/api/tasks/day-states")).status).toBe(400);
    expect((await api(admin).get(`/api/tasks/day-states?from=${FROM}`)).status).toBe(400);
    expect((await api(admin).get(`/api/tasks/day-states?from=${TO}&to=${FROM}`)).status).toBe(400);
    expect((await api(admin).get("/api/tasks/day-states?from=2027-01-01&to=2027-02-15")).status).toBe(400); // 46 يوماً
    expect((await api(admin).get("/api/tasks/day-states?from=2027-01-01&to=2027-02-14")).status).toBe(200); // 45 يوماً (الحد)
    expect((await api().get(`/api/tasks/day-states?from=${FROM}&to=${TO}`)).status).toBe(401);
  });
});

describe("tasks/months: الأشهر المتاحة", () => {
  it("أشهر مرتبة بلا تكرار، والمصمم يرى أشهره فقط", async () => {
    const all = (await api(admin).get("/api/tasks/months")).body.months as string[];
    expect(all).toEqual([...new Set(all)].sort());
    expect(all).toContain("2027-02");
    expect(all).toContain("2027-03");
    await mk(d2, { date: "2027-05-10" });
    const mine = (await api(d1).get("/api/tasks/months")).body.months as string[];
    expect(mine).not.toContain("2027-05");
    expect((await api(d2).get("/api/tasks/months")).body.months).toEqual(["2027-02", "2027-05"]);
  });
});

describe("tasks/stats/time: وقت العمل اليومي لكل موظف", () => {
  const min = (n: number) => n * 60_000;

  beforeAll(async () => {
    const db = prisma();
    const log = (taskId: string, userId: string, startMin: number, stopMin: number | null) =>
      db.taskTimeLog.create({
        data: {
          taskId,
          userId,
          startTime: new Date(Date.UTC(2027, 3, 5, 0, startMin)),
          stopTime: stopMin === null ? null : new Date(Date.UTC(2027, 3, 5, 0, stopMin)),
        },
      });
    const t1 = await mk(d1, { date: "2027-04-05" });
    await log(t1.id, d1Id, 0, 30); // 30 د
    await log(t1.id, d1Id, 60, 75); // 15 د
    const kid = await mk(d1, { date: "2027-04-05", parentId: t1.id });
    await log(kid.id, d1Id, 100, 160); // فرعية: 60 د ← تُحسب كما في الشهري
    const t2 = await mk(d2, { date: "2027-04-05" });
    await log(t2.id, d2Id, 0, 20); // 20 د لمصمم آخر
    // مهمة جارية بتاريخ 2027-04-06: سجل مفتوح بدأ قبل ساعة
    const running = await mk(d1, { date: "2027-04-06" });
    await db.task.update({ where: { id: running.id }, data: { status: "RUNNING", startedAt: new Date() } });
    await db.taskTimeLog.create({ data: { taskId: running.id, userId: d1Id, startTime: new Date(Date.now() - 3_600_000), stopTime: null } });
  });

  it("يجمع لكل (يوم، موظف) ويدخل الفرعيات ويحسب السجل المفتوح", async () => {
    const res = await api(admin).get("/api/tasks/stats/time?from=2027-04-01&to=2027-04-30");
    expect(res.status).toBe(200);
    const rows = res.body.rows as { date: string; assigneeId: string; durationMs: number }[];
    const find = (date: string, id: string) => rows.find((r) => r.date === date && r.assigneeId === id);
    expect(find("2027-04-05", d1Id)!.durationMs).toBe(min(105));
    expect(find("2027-04-05", d2Id)!.durationMs).toBe(min(20));
    const live = find("2027-04-06", d1Id)!.durationMs;
    expect(live).toBeGreaterThanOrEqual(3_600_000);
    expect(live).toBeLessThan(3_600_000 + min(2));
  });

  it("المصمم يرى أرقامه فقط ولو مرّر assigneeId لغيره، والإدارة تفلتر بالمسؤول", async () => {
    const mine = (await api(d1).get(`/api/tasks/stats/time?from=2027-04-01&to=2027-04-30&assigneeId=${d2Id}`)).body.rows;
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((r: any) => r.assigneeId === d1Id)).toBe(true);
    const only2 = (await api(manager).get(`/api/tasks/stats/time?from=2027-04-01&to=2027-04-30&assigneeId=${d2Id}`)).body.rows;
    expect(only2).toEqual([{ date: "2027-04-05", assigneeId: d2Id, durationMs: min(20) }]);
  });

  it("يطابق مجموع سجلات الوقت التي تعرضها الواجهة (totalDuration) لنفس اليوم", async () => {
    const day = (await api(admin).get(`/api/tasks?date=2027-04-05&assigneeId=${d1Id}`)).body.tasks as { totalDuration: number }[];
    const fromTasks = day.reduce((s, t) => s + t.totalDuration, 0);
    const rows = (await api(admin).get(`/api/tasks/stats/time?from=2027-04-05&to=2027-04-05&assigneeId=${d1Id}`)).body.rows;
    expect(rows).toEqual([{ date: "2027-04-05", assigneeId: d1Id, durationMs: fromTasks }]);
  });

  it("تحقق: بدون فترة أو معكوسة أو أطول من 400 يوم ← 400؛ سنة كاملة ← 200؛ بدون توكن ← 401", async () => {
    expect((await api(admin).get("/api/tasks/stats/time")).status).toBe(400);
    expect((await api(admin).get("/api/tasks/stats/time?from=2027-04-30&to=2027-04-01")).status).toBe(400);
    expect((await api(admin).get("/api/tasks/stats/time?from=2027-01-01&to=2028-03-01")).status).toBe(400);
    expect((await api(admin).get("/api/tasks/stats/time?from=2027-01-01&to=2027-12-31")).status).toBe(200);
    expect((await api().get("/api/tasks/stats/time?from=2027-04-01&to=2027-04-30")).status).toBe(401);
  });
});

describe("GET /api/tasks: الوضع الصارم (TASKS_REQUIRE_RANGE)", () => {
  it("بدون الوضع الصارم يبقى السلوك القديم: طلب بلا فترة ينجح", async () => {
    delete process.env.TASKS_REQUIRE_RANGE;
    expect((await api(admin).get("/api/tasks")).status).toBe(200);
  });

  it("مع الوضع الصارم: بلا فترة/من فقط/معكوسة/أطول من 45 يوماً ← 400، واليوم والفترة الصالحة ← 200", async () => {
    process.env.TASKS_REQUIRE_RANGE = "true";
    try {
      expect((await api(admin).get("/api/tasks")).status).toBe(400);
      expect((await api(admin).get("/api/tasks?from=2027-02-01")).status).toBe(400);
      expect((await api(admin).get("/api/tasks?from=2027-02-10&to=2027-02-01")).status).toBe(400);
      expect((await api(admin).get("/api/tasks?from=2027-01-01&to=2027-02-15")).status).toBe(400); // 46 يوماً
      expect((await api(admin).get("/api/tasks?from=2027-01-01&to=2027-02-14")).status).toBe(200); // 45 يوماً (الحد)
      expect((await api(admin).get("/api/tasks?date=2027-02-01")).status).toBe(200);
      const month = await api(d1).get("/api/tasks?from=2027-02-01&to=2027-02-28");
      expect(month.status).toBe(200);
      expect(month.body.tasks.every((t: any) => t.assigneeId === d1Id)).toBe(true);
      expect(month.body.tasks.length).toBeGreaterThan(0);
    } finally {
      delete process.env.TASKS_REQUIRE_RANGE;
    }
  });
});
