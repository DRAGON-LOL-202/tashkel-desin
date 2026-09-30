import { beforeAll, describe, expect, it } from "vitest";
import { api, login, makeUser, resetDb } from "./helpers.ts";

let admin: string, manager: string, designer: string;

beforeAll(async () => {
  await resetDb();
  await makeUser("goaldes");
  admin = await login("lol");
  manager = await login("amr");
  designer = await login("goaldes");
});

const base = { title: "هدف", type: "weekly", target: 10, current: 0, startDate: "2026-03-01", endDate: "2026-03-07" };
const mk = async (token: string, o: Record<string, unknown> = {}) => {
  const res = await api(token).post("/api/goals").send({ ...base, ...o });
  expect(res.status).toBe(201);
  return res.body.goal as { id: string; [k: string]: any };
};

describe("goals: الوصول", () => {
  it("بدون توكن ← 401", async () => {
    expect((await api().get("/api/goals")).status).toBe(401);
    expect((await api().post("/api/goals").send(base)).status).toBe(401);
  });
  it("المصمم ممنوع من كل المسارات ← 403", async () => {
    const g = await mk(manager);
    expect((await api(designer).get("/api/goals")).status).toBe(403);
    expect((await api(designer).post("/api/goals").send(base)).status).toBe(403);
    expect((await api(designer).get(`/api/goals/${g.id}`)).status).toBe(403);
    expect((await api(designer).patch(`/api/goals/${g.id}`).send({ title: "x" })).status).toBe(403);
    expect((await api(designer).delete(`/api/goals/${g.id}`)).status).toBe(403);
  });
});

describe("goals: الإنشاء", () => {
  it("MANAGER وADMIN ينشئان؛ createdBy من المستخدم الحالي ويُتجاهل المُمرَّر", async () => {
    const g = await mk(manager, { createdById: "someone-else", description: "  وصف  " });
    expect(g).toMatchObject({ title: "هدف", type: "weekly", status: "not_started", target: 10, current: 0, progress: 0, description: "وصف" });
    expect(g.createdById).not.toBe("someone-else");
    const g2 = await mk(admin);
    expect(g2.createdByName).toBeTruthy();
  });
  it("النوع والحالة تُقبل بأي حالة أحرف وتُرجَع بحروف صغيرة", async () => {
    const g = await mk(admin, { type: "MONTHLY", status: "Paused" });
    expect(g).toMatchObject({ type: "monthly", status: "paused" });
  });
  it("current >= target ← completed تلقائياً، والتقدّم 100", async () => {
    const g = await mk(admin, { current: 12, status: "not_started" });
    expect(g).toMatchObject({ status: "completed", progress: 100 });
  });
  it("حالة completed يدوية وهو أقل من الهدف ← in_progress", async () => {
    const g = await mk(admin, { current: 3, status: "completed" });
    expect(g.status).toBe("in_progress");
  });
  it("endDate الافتراضي: أسبوعي +6، شهري +29، ربع سنوي +89", async () => {
    const { endDate: _e, ...noEnd } = base;
    const w = await api(admin).post("/api/goals").send({ ...noEnd, type: "weekly" });
    const m = await api(admin).post("/api/goals").send({ ...noEnd, type: "monthly" });
    const q = await api(admin).post("/api/goals").send({ ...noEnd, type: "quarterly" });
    expect(w.body.goal.endDate).toBe("2026-03-07");
    expect(m.body.goal.endDate).toBe("2026-03-30");
    expect(q.body.goal.endDate).toBe("2026-05-29");
  });
  it("التحقق ← 400", async () => {
    const post = (o: Record<string, unknown>) => api(admin).post("/api/goals").send({ ...base, ...o });
    expect((await post({ title: "  " })).status).toBe(400);
    expect((await post({ type: "yearly" })).status).toBe(400);
    expect((await post({ target: 0 })).status).toBe(400);
    expect((await post({ current: -1 })).status).toBe(400);
    expect((await post({ target: 1.5 })).status).toBe(400);
    expect((await post({ startDate: "01/03/2026" })).status).toBe(400);
    expect((await post({ endDate: "2026-02-01" })).status).toBe(400);
  });
});

describe("goals: القراءة والفلاتر", () => {
  it("القائمة والفلترة بالنوع والحالة", async () => {
    const all = await api(manager).get("/api/goals");
    expect(all.status).toBe(200);
    expect(all.body.goals.length).toBeGreaterThan(3);
    const q = await api(manager).get("/api/goals?type=monthly");
    expect(q.body.goals.length).toBeGreaterThan(0);
    expect(q.body.goals.every((g: any) => g.type === "monthly")).toBe(true);
    const s = await api(manager).get("/api/goals?status=completed");
    expect(s.body.goals.every((g: any) => g.status === "completed")).toBe(true);
    expect((await api(manager).get("/api/goals?type=bad")).status).toBe(400);
  });
  it("GET /:id و404", async () => {
    const g = await mk(manager);
    const res = await api(admin).get(`/api/goals/${g.id}`);
    expect(res.body.goal.id).toBe(g.id);
    expect((await api(admin).get("/api/goals/nope")).status).toBe(404);
  });
});

describe("goals: التعديل والحذف", () => {
  it("تعديل العنوان والتقدّم يحسب النسبة والحالة", async () => {
    const g = await mk(manager, { target: 4 });
    const r1 = await api(manager).patch(`/api/goals/${g.id}`).send({ title: "جديد", current: 2 });
    expect(r1.status).toBe(200);
    expect(r1.body.goal).toMatchObject({ title: "جديد", current: 2, progress: 50, status: "in_progress" });
    const r2 = await api(manager).patch(`/api/goals/${g.id}`).send({ current: 4 });
    expect(r2.body.goal).toMatchObject({ status: "completed", progress: 100 });
  });
  it("خفض التقدّم عن الهدف يُخرج الهدف من completed", async () => {
    const g = await mk(manager, { target: 4, current: 4 });
    expect(g.status).toBe("completed");
    const r = await api(manager).patch(`/api/goals/${g.id}`).send({ current: 1 });
    expect(r.body.goal).toMatchObject({ status: "in_progress", progress: 25 });
    const r0 = await api(manager).patch(`/api/goals/${g.id}`).send({ current: 0 });
    expect(r0.body.goal.status).toBe("not_started");
  });
  it("تغيير الحالة إلى paused يدوياً، وخفض الهدف يُكمل الهدف", async () => {
    const g = await mk(manager, { target: 10, current: 5 });
    const p = await api(manager).patch(`/api/goals/${g.id}`).send({ status: "paused" });
    expect(p.body.goal.status).toBe("paused");
    const t = await api(manager).patch(`/api/goals/${g.id}`).send({ target: 5 });
    expect(t.body.goal.status).toBe("completed");
  });
  it("مسح الوصف، ورفض تاريخ نهاية قبل البداية، وجسم فارغ", async () => {
    const g = await mk(manager, { description: "وصف" });
    const c = await api(manager).patch(`/api/goals/${g.id}`).send({ description: "" });
    expect(c.body.goal.description).toBeUndefined();
    expect((await api(manager).patch(`/api/goals/${g.id}`).send({ endDate: "2026-01-01" })).status).toBe(400);
    expect((await api(manager).patch(`/api/goals/${g.id}`).send({})).status).toBe(400);
    expect((await api(manager).patch("/api/goals/nope").send({ title: "x" })).status).toBe(404);
  });
  it("حذف الهدف ثم 404", async () => {
    const g = await mk(admin);
    expect((await api(manager).delete(`/api/goals/${g.id}`)).status).toBe(200);
    expect((await api(manager).get(`/api/goals/${g.id}`)).status).toBe(404);
    expect((await api(manager).delete(`/api/goals/${g.id}`)).status).toBe(404);
  });
});
