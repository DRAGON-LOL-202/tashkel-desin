import { beforeAll, describe, expect, it } from "vitest";
import { api, login, makeUser, resetDb } from "./helpers.ts";

let admin: string, manager: string, d1: string, d2: string;
let d1Id: string;

beforeAll(async () => {
  await resetDb();
  d1Id = (await makeUser("fbdes1")).id;
  await makeUser("fbdes2");
  admin = await login("lol");
  manager = await login("amr");
  d1 = await login("fbdes1");
  d2 = await login("fbdes2");
});

const mk = async (token: string, o: Record<string, unknown> = {}) => {
  const res = await api(token).post("/api/feedback").send({ title: "ملاحظة", description: "تفاصيل", type: "problem", date: "2026-03-10", ...o });
  expect(res.status).toBe(201);
  return res.body.feedback as { id: string; [k: string]: any };
};

describe("feedback: الوصول والإنشاء", () => {
  it("بدون توكن ← 401", async () => {
    expect((await api().get("/api/feedback")).status).toBe(401);
    expect((await api().post("/api/feedback").send({})).status).toBe(401);
  });
  it("المصمم ينشئ ملاحظة: createdBy = هو، الحالة open، النوع بحروف صغيرة", async () => {
    const f = await mk(d1, { type: "idea" });
    expect(f).toMatchObject({ createdById: d1Id, status: "open", type: "idea", title: "ملاحظة", attachments: [] });
  });
  it("لا يمكن تمرير createdById في الطلب (يُتجاهل)", async () => {
    const f = await mk(d1, { createdById: "someone-else" });
    expect(f.createdById).toBe(d1Id);
  });
  it("تحقق: نوع خاطئ/عنوان فارغ/تاريخ خاطئ ← 400", async () => {
    const base = { title: "x", type: "idea", date: "2026-03-10" };
    expect((await api(d1).post("/api/feedback").send({ ...base, type: "bad" })).status).toBe(400);
    expect((await api(d1).post("/api/feedback").send({ ...base, title: "  " })).status).toBe(400);
    expect((await api(d1).post("/api/feedback").send({ ...base, date: "10/03/2026" })).status).toBe(400);
  });
  it("المرفقات: صورة data URL تُقبل، وغير الصور ← 400", async () => {
    const ok = await mk(d1, { attachments: [{ id: "a1", name: "p.png", dataUrl: "data:image/png;base64,AAAA" }] });
    expect(ok.attachments).toHaveLength(1);
    const bad = await api(d1).post("/api/feedback").send({ title: "x", type: "idea", date: "2026-03-10", attachments: [{ id: "a", name: "x", dataUrl: "http://evil" }] });
    expect(bad.status).toBe(400);
  });
});

describe("feedback: العزل والقراءة", () => {
  it("المصمم يرى ملاحظاته فقط", async () => {
    await mk(d2, { title: "خاصة بالمصمم 2" });
    const res = await api(d1).get("/api/feedback");
    expect(res.status).toBe(200);
    expect(res.body.feedback.every((f: any) => f.createdById === d1Id)).toBe(true);
    expect(res.body.feedback.some((f: any) => f.title === "خاصة بالمصمم 2")).toBe(false);
  });
  it("الإدارة ترى الكل", async () => {
    const res = await api(manager).get("/api/feedback");
    expect(res.body.feedback.some((f: any) => f.title === "خاصة بالمصمم 2")).toBe(true);
    expect(res.body.feedback.some((f: any) => f.createdById === d1Id)).toBe(true);
  });
  it("المصمم لا يفتح ملاحظة مصمم آخر ← 403، وغير الموجودة ← 404", async () => {
    const other = await mk(d2);
    expect((await api(d1).get(`/api/feedback/${other.id}`)).status).toBe(403);
    expect((await api(d2).get(`/api/feedback/${other.id}`)).status).toBe(200);
    expect((await api(admin).get("/api/feedback/nope")).status).toBe(404);
  });
  it("فلترة: type و status و from/to", async () => {
    const res = await api(admin).get("/api/feedback?type=idea");
    expect(res.body.feedback.length).toBeGreaterThan(0);
    expect(res.body.feedback.every((f: any) => f.type === "idea")).toBe(true);
    const none = await api(admin).get("/api/feedback?from=2030-01-01");
    expect(none.body.feedback).toHaveLength(0);
    expect((await api(admin).get("/api/feedback?type=bad")).status).toBe(400);
  });
});

describe("feedback: التعديل والحذف", () => {
  it("المصمم لا يعدّل ولا يحذف (حتى ملاحظته) ← 403", async () => {
    const mine = await mk(d1);
    expect((await api(d1).patch(`/api/feedback/${mine.id}`).send({ title: "جديد" })).status).toBe(403);
    expect((await api(d1).delete(`/api/feedback/${mine.id}`)).status).toBe(403);
    expect((await api(admin).get(`/api/feedback/${mine.id}`)).body.feedback.title).toBe("ملاحظة");
  });
  it("MANAGER يعدّل الحالة والنص", async () => {
    const f = await mk(d1);
    const res = await api(manager).patch(`/api/feedback/${f.id}`).send({ status: "resolved", title: "معدّلة" });
    expect(res.status).toBe(200);
    expect(res.body.feedback).toMatchObject({ status: "resolved", title: "معدّلة", createdById: d1Id });
  });
  it("تعديل بلا حقول أو بقيمة خاطئة ← 400", async () => {
    const f = await mk(d1);
    expect((await api(admin).patch(`/api/feedback/${f.id}`).send({})).status).toBe(400);
    expect((await api(admin).patch(`/api/feedback/${f.id}`).send({ status: "weird" })).status).toBe(400);
  });
  it("ADMIN يحذف ملاحظة ← 200 ثم 404", async () => {
    const f = await mk(d1);
    expect((await api(admin).delete(`/api/feedback/${f.id}`)).status).toBe(200);
    expect((await api(admin).get(`/api/feedback/${f.id}`)).status).toBe(404);
  });
});

describe("feedback: الحذف الجماعي", () => {
  it("المصمم ← 403", async () => {
    expect((await api(d1).post("/api/feedback/bulk-delete").send({})).status).toBe(403);
  });
  it("حسب النوع والفترة", async () => {
    await resetDb();
    d1Id = (await makeUser("fbdes1")).id;
    await makeUser("fbdes2");
    admin = await login("lol");
    manager = await login("amr");
    d1 = await login("fbdes1");
    d2 = await login("fbdes2");
    await mk(d1, { type: "idea", date: "2026-01-05" });
    await mk(d1, { type: "idea", date: "2026-02-05" });
    await mk(d1, { type: "problem", date: "2026-02-06" });
    const r1 = await api(manager).post("/api/feedback/bulk-delete").send({ type: "idea", fromDate: "2026-02-01", toDate: "2026-02-28" });
    expect(r1.body).toMatchObject({ ok: true, deleted: 1 });
    const r2 = await api(admin).post("/api/feedback/bulk-delete").send({ type: "idea" });
    expect(r2.body.deleted).toBe(1);
    expect((await api(admin).get("/api/feedback")).body.feedback).toHaveLength(1);
    const r3 = await api(admin).post("/api/feedback/bulk-delete").send({});
    expect(r3.body.deleted).toBe(1);
  });
});
