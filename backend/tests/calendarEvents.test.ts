import { beforeAll, describe, expect, it } from "vitest";
import { api, login, makeUser, resetDb } from "./helpers.ts";

let admin: string, manager: string, designer: string;

beforeAll(async () => {
  await resetDb();
  await makeUser("evdes");
  admin = await login("lol");
  manager = await login("amr");
  designer = await login("evdes");
});

const base = { title: "موسم رمضان", startDate: "2026-03-01", endDate: "2026-03-30", color: "#27C6A3" };
const mk = async (token: string, o: Record<string, unknown> = {}) => {
  const res = await api(token).post("/api/calendar-events").send({ ...base, ...o });
  expect(res.status).toBe(201);
  return res.body.event as { id: string; [k: string]: any };
};

describe("calendar-events: الوصول", () => {
  it("بدون توكن ← 401", async () => {
    expect((await api().get("/api/calendar-events")).status).toBe(401);
    expect((await api().post("/api/calendar-events").send(base)).status).toBe(401);
  });
  it("المصمم ممنوع من كل المسارات ← 403", async () => {
    const e = await mk(manager);
    expect((await api(designer).get("/api/calendar-events")).status).toBe(403);
    expect((await api(designer).post("/api/calendar-events").send(base)).status).toBe(403);
    expect((await api(designer).get(`/api/calendar-events/${e.id}`)).status).toBe(403);
    expect((await api(designer).patch(`/api/calendar-events/${e.id}`).send({ title: "x" })).status).toBe(403);
    expect((await api(designer).delete(`/api/calendar-events/${e.id}`)).status).toBe(403);
  });
});

describe("calendar-events: الإنشاء", () => {
  it("MANAGER وADMIN ينشئان؛ createdBy من المستخدم الحالي", async () => {
    const e = await mk(manager, { createdById: "someone-else", description: "  وصف  " });
    expect(e).toMatchObject({ title: "موسم رمضان", startDate: "2026-03-01", endDate: "2026-03-30", color: "#27C6A3", description: "وصف" });
    expect(e.createdById).not.toBe("someone-else");
    expect(e.createdByName).toBeTruthy();
    expect((await mk(admin)).id).toBeTruthy();
  });
  it("اللون اختياري ويأخذ الافتراضي", async () => {
    const { color: _c, ...noColor } = base;
    const res = await api(admin).post("/api/calendar-events").send(noColor);
    expect(res.status).toBe(201);
    expect(res.body.event.color).toBe("#6b8e7f");
  });
  it("التحقق ← 400", async () => {
    const post = (o: Record<string, unknown>) => api(admin).post("/api/calendar-events").send({ ...base, ...o });
    expect((await post({ title: "  " })).status).toBe(400);
    expect((await post({ startDate: "2026-13-01" })).status).toBe(400);
    expect((await post({ startDate: "2026-04-01", endDate: "2026-03-01" })).status).toBe(400);
    expect((await post({ color: "red" })).status).toBe(400);
    expect((await post({ endDate: undefined })).status).toBe(400);
  });
});

describe("calendar-events: القراءة", () => {
  it("القائمة مرتبة بتاريخ البداية وتدعم فلتر التداخل from/to", async () => {
    await mk(admin, { title: "ب", startDate: "2030-06-01", endDate: "2030-06-10" });
    await mk(admin, { title: "أ", startDate: "2030-02-01", endDate: "2030-02-10" });
    const year = await api(admin).get("/api/calendar-events?from=2030-01-01&to=2030-12-31");
    expect(year.status).toBe(200);
    expect(year.body.events.map((e: any) => e.title)).toEqual(["أ", "ب"]);
    const feb = await api(admin).get("/api/calendar-events?from=2030-02-05&to=2030-02-20");
    expect(feb.body.events.map((e: any) => e.title)).toEqual(["أ"]);
    const none = await api(admin).get("/api/calendar-events?from=2031-01-01");
    expect(none.body.events).toEqual([]);
    expect((await api(admin).get("/api/calendar-events?from=2030-09-01&to=2030-01-01")).status).toBe(400);
  });
  it("GET /:id — 200 وغير موجود ← 404", async () => {
    const e = await mk(admin);
    expect((await api(admin).get(`/api/calendar-events/${e.id}`)).body.event.id).toBe(e.id);
    expect((await api(admin).get("/api/calendar-events/nope")).status).toBe(404);
  });
});

describe("calendar-events: التعديل والحذف", () => {
  it("PATCH يعدّل الحقول ويتحقق من النطاق", async () => {
    const e = await mk(manager);
    const ok = await api(manager).patch(`/api/calendar-events/${e.id}`).send({ title: "جديد", color: "#F2B84B", description: "" });
    expect(ok.status).toBe(200);
    expect(ok.body.event).toMatchObject({ title: "جديد", color: "#F2B84B" });
    expect(ok.body.event.description).toBeUndefined();
    expect((await api(manager).patch(`/api/calendar-events/${e.id}`).send({ endDate: "2026-02-01" })).status).toBe(400);
    expect((await api(manager).patch(`/api/calendar-events/${e.id}`).send({})).status).toBe(400);
    expect((await api(manager).patch("/api/calendar-events/nope").send({ title: "x" })).status).toBe(404);
  });
  it("DELETE فعلي ثم 404", async () => {
    const e = await mk(admin);
    expect((await api(admin).delete(`/api/calendar-events/${e.id}`)).status).toBe(200);
    expect((await api(admin).get(`/api/calendar-events/${e.id}`)).status).toBe(404);
    expect((await api(admin).delete(`/api/calendar-events/${e.id}`)).status).toBe(404);
  });
});
