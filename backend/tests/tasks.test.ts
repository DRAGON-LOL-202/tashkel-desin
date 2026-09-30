import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db.ts";
import { api, login, makeUser, resetDb } from "./helpers.ts";

let admin: string, manager: string, d1: string, d2: string;
let d1Id: string, d2Id: string, managerId: string;
const DAY = "2026-03-10";

beforeAll(async () => {
  await resetDb();
  d1Id = (await makeUser("des1")).id;
  d2Id = (await makeUser("des2")).id;
  admin = await login("lol");
  manager = await login("amr");
  d1 = await login("des1");
  d2 = await login("des2");
  managerId = (await prisma().user.findUnique({ where: { username: "amr" } }))!.id;
});

const mk = async (token: string, o: Record<string, unknown> = {}) => {
  const res = await api(token).post("/api/tasks").send({ title: "مهمة", date: DAY, ...o });
  expect(res.status).toBe(201);
  return res.body.task as { id: string; [k: string]: any };
};

describe("tasks: الوصول والإنشاء", () => {
  it("بدون توكن ← 401", async () => {
    expect((await api().get("/api/tasks")).status).toBe(401);
  });
  it("المصمم ينشئ مهمته: createdBy = assignedTo = هو", async () => {
    const t = await mk(d1);
    expect(t).toMatchObject({ assigneeId: d1Id, createdById: d1Id, status: "not_started", priority: "medium", target: 1, current: 0 });
  });
  it("المصمم لا يعيّن لغيره ← 403", async () => {
    const res = await api(d1).post("/api/tasks").send({ title: "x", date: DAY, assigneeId: d2Id });
    expect(res.status).toBe(403);
  });
  it("MANAGER يعيّن مهمة لمصمم: createdBy = المدير، assignedTo = المصمم", async () => {
    const t = await mk(manager, { assigneeId: d1Id, priority: "high" });
    expect(t).toMatchObject({ assigneeId: d1Id, createdById: managerId, priority: "high" });
  });
  it("تحقق: تاريخ خاطئ/عنوان فارغ ← 400", async () => {
    expect((await api(d1).post("/api/tasks").send({ title: "x", date: "10-03-2026" })).status).toBe(400);
    expect((await api(d1).post("/api/tasks").send({ title: "  ", date: DAY })).status).toBe(400);
  });
  it("مسؤول غير موجود ← 400", async () => {
    expect((await api(manager).post("/api/tasks").send({ title: "x", date: DAY, assigneeId: "nope" })).status).toBe(400);
  });
});

describe("tasks: العزل بين المصممين", () => {
  it("المصمم يرى مهامه فقط ولو مرّر assigneeId لغيره", async () => {
    await mk(d2, { title: "مهمة d2" });
    const res = await api(d1).get(`/api/tasks?date=${DAY}&assigneeId=${d2Id}`);
    expect(res.status).toBe(200);
    expect(res.body.tasks.length).toBeGreaterThan(0);
    expect(res.body.tasks.every((t: any) => t.assigneeId === d1Id)).toBe(true);
  });
  it("المصمم لا يقرأ/يبدأ/يعلّق على مهمة غيره ← 403", async () => {
    const t = await mk(d2, { title: "خاصة" });
    expect((await api(d1).get(`/api/tasks/${t.id}`)).status).toBe(403);
    expect((await api(d1).post(`/api/tasks/${t.id}/start`)).status).toBe(403);
    expect((await api(d1).post(`/api/tasks/${t.id}/comments`).send({ text: "hi" })).status).toBe(403);
  });
  it("الإدارة تفلتر بالمسؤول", async () => {
    const res = await api(manager).get(`/api/tasks?date=${DAY}&assigneeId=${d2Id}`);
    expect(res.body.tasks.every((t: any) => t.assigneeId === d2Id)).toBe(true);
  });
});

describe("tasks: المصمم لا يعدّل ولا يحذف", () => {
  it("PATCH/DELETE ← 403 للمصمم، وتنجح للمدير", async () => {
    const t = await mk(d1);
    expect((await api(d1).patch(`/api/tasks/${t.id}`).send({ title: "غيّرت" })).status).toBe(403);
    expect((await api(d1).delete(`/api/tasks/${t.id}`)).status).toBe(403);
    const ok = await api(manager).patch(`/api/tasks/${t.id}`).send({ title: "عنوان جديد" });
    expect(ok.status).toBe(200);
    expect(ok.body.task.title).toBe("عنوان جديد");
    expect((await api(manager).delete(`/api/tasks/${t.id}`)).status).toBe(200);
    expect((await api(manager).get(`/api/tasks/${t.id}`)).status).toBe(404);
  });
});

describe("tasks: Start / Stop / End", () => {
  it("دورة كاملة مع سبب الإيقاف", async () => {
    const t = await mk(d1);
    const s1 = await api(d1).post(`/api/tasks/${t.id}/start`);
    expect(s1.body.task.status).toBe("running");
    expect(s1.body.task.startTime).toBeTypeOf("number");
    expect((await api(d1).post(`/api/tasks/${t.id}/start`)).status).toBe(409);

    const stop = await api(d1).post(`/api/tasks/${t.id}/stop`).send({ note: "استراحة" });
    expect(stop.body.task.status).toBe("paused");
    expect(stop.body.task.stopNotes).toHaveLength(1);
    expect(stop.body.task.stopNotes[0].note).toBe("استراحة");
    expect((await api(d1).post(`/api/tasks/${t.id}/stop`).send({})).status).toBe(409);

    const s2 = await api(d1).post(`/api/tasks/${t.id}/start`);
    expect(s2.body.task.stopNotes[0].resumedAt).toBeTypeOf("number");

    const end = await api(d1).post(`/api/tasks/${t.id}/end`);
    expect(end.body.task).toMatchObject({ status: "completed", current: 1 });
    expect(end.body.task.totalDuration).toBeGreaterThanOrEqual(0);
    expect((await api(d1).post(`/api/tasks/${t.id}/end`)).status).toBe(409);
    expect((await api(d1).post(`/api/tasks/${t.id}/start`)).status).toBe(409);
    const logs = await prisma().taskTimeLog.findMany({ where: { taskId: t.id } });
    expect(logs).toHaveLength(2);
    expect(logs.every((l) => l.stopTime !== null && l.userId === d1Id)).toBe(true);
  });
});

describe("tasks: التقدّم والترتيب", () => {
  it("بلوغ الهدف يُكمل المهمة وينقلها لأسفل، والتراجع يعيدها", async () => {
    const a = await mk(d1, { title: "A", target: 4, date: "2026-04-01" });
    const b = await mk(d1, { title: "B", target: 1, date: "2026-04-01" });
    const mid = await api(d1).patch(`/api/tasks/${a.id}/progress`).send({ current: 2 });
    expect(mid.body.task).toMatchObject({ current: 2, status: "not_started" });
    const done = await api(d1).patch(`/api/tasks/${a.id}/progress`).send({ current: 99 });
    expect(done.body.task).toMatchObject({ current: 4, status: "completed" });
    expect(done.body.task.sortOrder).toBeGreaterThan(b.sortOrder);
    const back = await api(d1).patch(`/api/tasks/${a.id}/progress`).send({ current: 1 });
    expect(back.body.task).toMatchObject({ current: 1, status: "not_started" });
  });
  it("reorder يعيد ترتيب مهام المصمم فقط", async () => {
    const x = await mk(d1, { date: "2026-05-01" });
    const y = await mk(d1, { date: "2026-05-01" });
    const other = await mk(d2, { date: "2026-05-01" });
    const res = await api(d1).post("/api/tasks/reorder").send({ orderedIds: [y.id, x.id, other.id] });
    expect(res.status).toBe(200);
    const rows = await prisma().task.findMany({ where: { id: { in: [x.id, y.id, other.id] } } });
    const order = Object.fromEntries(rows.map((r) => [r.id, r.sortOrder]));
    expect(order[y.id]).toBe(0);
    expect(order[x.id]).toBe(1);
    expect(order[other.id]).not.toBe(2);
  });
});

describe("tasks: التعليقات والمهام الفرعية", () => {
  it("تعليق ثم حذفه (صاحب التعليق)", async () => {
    const t = await mk(d1);
    const c = await api(d1).post(`/api/tasks/${t.id}/comments`).send({ text: "ملاحظة" });
    expect(c.body.task.comments).toHaveLength(1);
    const cid = c.body.task.comments[0].id;
    expect((await api(d1).post(`/api/tasks/${t.id}/comments`).send({ text: "  " })).status).toBe(400);
    const del = await api(d1).delete(`/api/tasks/${t.id}/comments/${cid}`);
    expect(del.body.task.comments).toHaveLength(0);
  });
  it("المهمة الفرعية تتبع مسؤول الأم، وحذف الأم يحذفها (cascade)", async () => {
    const parent = await mk(d1);
    const child = await mk(manager, { parentId: parent.id, title: "فرعية" });
    expect(child).toMatchObject({ parentId: parent.id, assigneeId: d1Id });
    expect((await api(manager).post("/api/tasks").send({ title: "x", date: DAY, parentId: parent.id, assigneeId: d2Id })).status).toBe(400);
    expect((await api(d2).post("/api/tasks").send({ title: "x", date: DAY, parentId: parent.id })).status).toBe(403);
    expect((await api(manager).delete(`/api/tasks/${parent.id}`)).status).toBe(200);
    expect(await prisma().task.findUnique({ where: { id: child.id } })).toBeNull();
  });
});

describe("tasks: نقل بين المسؤولين ونقل غير المنتهي", () => {
  it("move: المدير ينقل مهمة (وفرعياتها) لمسؤول آخر؛ المصمم ← 403", async () => {
    const parent = await mk(d1, { date: "2026-06-01" });
    const child = await mk(d1, { date: "2026-06-01", parentId: parent.id });
    expect((await api(d1).post(`/api/tasks/${parent.id}/move`).send({ assigneeId: d2Id })).status).toBe(403);
    const res = await api(admin).post(`/api/tasks/${parent.id}/move`).send({ assigneeId: d2Id });
    expect(res.status).toBe(200);
    expect(res.body.task.assigneeId).toBe(d2Id);
    expect((await prisma().task.findUnique({ where: { id: child.id } }))!.assignedToId).toBe(d2Id);
  });
  it("move-unfinished: تنتقل غير المكتملة لليوم التالي فقط", async () => {
    const day = "2026-07-30";
    const open = await mk(d1, { date: day, title: "مفتوحة" });
    const finished = await mk(d1, { date: day, title: "منتهية" });
    await api(d1).post(`/api/tasks/${finished.id}/end`);
    expect((await api(d1).post("/api/tasks/move-unfinished").send({ date: day })).status).toBe(403);
    const res = await api(manager).post("/api/tasks/move-unfinished").send({ date: day });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ moved: 1, toDate: "2026-07-31" });
    expect((await prisma().task.findUnique({ where: { id: open.id } }))!.date).toBe("2026-07-31");
    expect((await prisma().task.findUnique({ where: { id: finished.id } }))!.date).toBe(day);
  });
});
