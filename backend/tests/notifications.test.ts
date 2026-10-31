import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db.ts";
import { api, login, makeUser, resetDb } from "./helpers.ts";

let admin: string, manager: string, designer: string, other: string;
let designerId: string, otherId: string, managerId: string;

beforeAll(async () => {
  await resetDb();
  const d = await makeUser("notif_designer");
  const o = await makeUser("notif_other");
  designerId = d.id;
  otherId = o.id;
  admin = await login("lol");
  manager = await login("amr");
  designer = await login("notif_designer");
  other = await login("notif_other");
  managerId = (await prisma().user.findUnique({ where: { username: "amr" } }))!.id;
});

const newTask = (assigneeId: string, o: Record<string, unknown> = {}) => ({
  title: "تصميم منتج جديد",
  date: "2026-11-01",
  assigneeId,
  target: 1,
  ...o,
});

describe("notifications: الإنشاء التلقائي", () => {
  let taskId: string;

  it("إسناد مهمة ← إشعار للمسؤول فقط، لا للمنفِّذ ولا لغير المعنيين", async () => {
    const res = await api(manager).post("/api/tasks").send(newTask(designerId));
    expect(res.status).toBe(201);
    taskId = res.body.task.id;
    const mine = await api(designer).get("/api/notifications");
    expect(mine.body.unread).toBe(1);
    expect(mine.body.notifications[0]).toMatchObject({ type: "TASK_ASSIGNED", isRead: false, taskId });
    expect(mine.body.notifications[0].actor.name).toBeTruthy();
    expect((await api(manager).get("/api/notifications")).body.total).toBe(0);
    expect((await api(other).get("/api/notifications")).body.total).toBe(0);
  });

  it("المسؤول لا يُشعَر بمهمة أنشأها لنفسه", async () => {
    await api(other).post("/api/tasks").send({ title: "مهمتي", date: "2026-11-01", target: 1 });
    expect((await api(other).get("/api/notifications")).body.total).toBe(0);
  });

  it("تعليق ← إشعار للمسؤول والمنشئ، و@mention لا يتكرر", async () => {
    const res = await api(manager).post(`/api/tasks/${taskId}/comments`).send({ text: "ممتاز @notif_other راجع" });
    expect(res.status).toBe(200);
    const d = (await api(designer).get("/api/notifications?category=comments")).body;
    expect(d.notifications.map((n: { type: string }) => n.type)).toEqual(["COMMENT_ADDED"]);
    const o = (await api(other).get("/api/notifications?category=comments")).body;
    expect(o.notifications.map((n: { type: string }) => n.type)).toEqual(["MENTION"]);
  });

  it("إنهاء المهمة ← إشعار للمنشئ، وإعادة الفتح ← إشعار", async () => {
    expect((await api(designer).post(`/api/tasks/${taskId}/end`)).status).toBe(200);
    const m = (await api(manager).get("/api/notifications")).body.notifications;
    expect(m.some((n: { type: string }) => n.type === "TASK_COMPLETED")).toBe(true);
    expect((await api(designer).post(`/api/tasks/${taskId}/reopen`)).status).toBe(200);
    const m2 = (await api(manager).get("/api/notifications")).body.notifications;
    expect(m2.some((n: { type: string }) => n.type === "TASK_REOPENED")).toBe(true);
  });

  it("نقل المهمة لمسؤول آخر ← إشعار للجديد وللقديم", async () => {
    expect((await api(manager).post(`/api/tasks/${taskId}/move`).send({ assigneeId: otherId })).status).toBe(200);
    const o = (await api(other).get("/api/notifications?q=نقل")).body.notifications;
    expect(o.some((n: { type: string }) => n.type === "TASK_REASSIGNED")).toBe(true);
    const d = (await api(designer).get("/api/notifications")).body.notifications;
    expect(d.some((n: { type: string; title: string }) => n.type === "TASK_REASSIGNED")).toBe(true);
  });

  it("مستخدم جديد ← إشعار للإدارة الأخرى؛ تغيير الدور ← إشعار للمستخدم", async () => {
    const created = await api(manager)
      .post("/api/users")
      .send({ name: "موظف إشعار", username: "notif.new", email: "notif.new@example.test", password: "password-1234" });
    expect(created.status).toBe(201);
    const a = (await api(admin).get("/api/notifications")).body.notifications;
    expect(a.some((n: { type: string }) => n.type === "USER_CREATED")).toBe(true);
    expect((await api(manager).get("/api/notifications")).body.notifications.some((n: { type: string }) => n.type === "USER_CREATED")).toBe(false);
    const upd = await api(manager).patch(`/api/users/${created.body.user.id}`).send({ role: "manager" });
    expect(upd.status).toBe(200);
    const n = await prisma().notification.findMany({ where: { recipientId: created.body.user.id, type: "ROLE_CHANGED" } });
    expect(n).toHaveLength(1);
  });
});

describe("notifications: القراءة والحذف والعزل", () => {
  it("عدّاد غير المقروء + تحديد كمقروء + إعادته غير مقروء", async () => {
    const list = (await api(designer).get("/api/notifications")).body;
    const unreadBefore = list.unread;
    expect(unreadBefore).toBeGreaterThan(0);
    const id = list.notifications.find((n: { isRead: boolean }) => !n.isRead).id;
    const r = await api(designer).patch(`/api/notifications/${id}/read`).send({});
    expect(r.status).toBe(200);
    expect(r.body.notification.isRead).toBe(true);
    expect(r.body.unread).toBe(unreadBefore - 1);
    expect((await api(designer).get("/api/notifications/unread-count")).body.unread).toBe(unreadBefore - 1);
    const back = await api(designer).patch(`/api/notifications/${id}/read`).send({ isRead: false });
    expect(back.body.unread).toBe(unreadBefore);
  });

  it("الفلاتر: unread / read / category / q", async () => {
    const unread = (await api(designer).get("/api/notifications?filter=unread")).body.notifications;
    expect(unread.every((n: { isRead: boolean }) => !n.isRead)).toBe(true);
    const tasks = (await api(designer).get("/api/notifications?category=tasks")).body.notifications;
    expect(tasks.every((n: { category: string }) => n.category === "tasks")).toBe(true);
    expect((await api(designer).get("/api/notifications?q=zzz-لا-يوجد")).body.notifications).toHaveLength(0);
    expect((await api(designer).get("/api/notifications?category=bad")).status).toBe(400);
  });

  it("لا يقرأ أو يحذف أحد إشعار غيره", async () => {
    const id = (await api(designer).get("/api/notifications")).body.notifications[0].id;
    expect((await api(other).patch(`/api/notifications/${id}/read`).send({})).status).toBe(404);
    expect((await api(other).delete(`/api/notifications/${id}`)).status).toBe(404);
    expect(await prisma().notification.findUnique({ where: { id } })).not.toBeNull();
  });

  it("بدون توكن ← 401، ولا يوجد POST لإنشاء إشعار من المتصفح", async () => {
    expect((await api().get("/api/notifications")).status).toBe(401);
    expect((await api(admin).post("/api/notifications").send({ recipientId: designerId, title: "x", message: "y" })).status).toBe(404);
  });

  it("تحديد الكل كمقروء، ثم حذف المقروءة، ثم حذف إشعار واحد", async () => {
    const all = await api(designer).post("/api/notifications/read-all");
    expect(all.body.unread).toBe(0);
    const total = all.body.total;
    expect(total).toBeGreaterThan(0);
    const del = await api(designer).delete("/api/notifications/read");
    expect(del.body.deleted).toBe(total);
    expect(del.body.total).toBe(0);
    await api(manager).post(`/api/tasks`).send(newTask(designerId, { title: "مهمة ثانية" }));
    const one = (await api(designer).get("/api/notifications")).body.notifications[0].id;
    expect((await api(designer).delete(`/api/notifications/${one}`)).status).toBe(200);
    expect((await api(designer).get("/api/notifications")).body.total).toBe(0);
    expect(managerId).toBeTruthy();
  });
});
