import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db.ts";
import { api, login, makeUser, PASSWORD, resetDb } from "./helpers.ts";

let admin: string, manager: string, designer: string;

beforeAll(async () => {
  await resetDb();
  await makeUser("designer1");
  admin = await login("lol");
  manager = await login("amr");
  designer = await login("designer1");
});

const newUser = (o: Record<string, unknown> = {}) => ({
  name: "مصمم جديد",
  username: "New.User",
  email: "New@Example.test",
  password: "password-1234",
  ...o,
});

describe("users: الوصول", () => {
  it("بدون توكن ← 401", async () => {
    expect((await api().get("/api/users")).status).toBe(401);
  });
  it("DESIGNER لا يستدعي /users ← 403", async () => {
    expect((await api(designer).get("/api/users")).status).toBe(403);
    expect((await api(designer).post("/api/users").send(newUser())).status).toBe(403);
    expect((await api(designer).patch("/api/users/x/status").send({ isActive: false })).status).toBe(403);
    expect((await api(designer).delete("/api/users/x")).status).toBe(403);
  });
  it("MANAGER يقرأ القائمة ولا يرجع passwordHash", async () => {
    const res = await api(manager).get("/api/users");
    expect(res.status).toBe(200);
    expect(res.body.users.length).toBeGreaterThanOrEqual(4);
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });
});

describe("users: إنشاء", () => {
  it("MANAGER ينشئ مصمماً (username/email lowercase) ويستطيع الدخول", async () => {
    const res = await api(manager).post("/api/users").send(newUser());
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ username: "new.user", email: "new@example.test", role: "designer", isSystemUser: false, isActive: true });
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
    expect(await login("new.user", "password-1234")).toBeTruthy();
  });
  it("تكرار username أو email ← 409", async () => {
    expect((await api(manager).post("/api/users").send(newUser())).status).toBe(409);
    expect((await api(manager).post("/api/users").send(newUser({ username: "other" }))).status).toBe(409);
  });
  it("تحقق: كلمة مرور قصيرة/بريد خاطئ ← 400", async () => {
    expect((await api(manager).post("/api/users").send(newUser({ username: "x1", email: "x1@e.test", password: "123" }))).status).toBe(400);
    expect((await api(manager).post("/api/users").send(newUser({ username: "x2", email: "bad" }))).status).toBe(400);
  });
  it("MANAGER لا يسند ADMIN، وADMIN يستطيع", async () => {
    expect((await api(manager).post("/api/users").send(newUser({ username: "adm1", email: "adm1@e.test", role: "admin" }))).status).toBe(403);
    const ok = await api(admin).post("/api/users").send(newUser({ username: "adm2", email: "adm2@e.test", role: "admin" }));
    expect(ok.status).toBe(201);
    expect(ok.body.user.role).toBe("admin");
  });
});

describe("users: تعديل وتفعيل", () => {
  it("تعديل الاسم والمسمى", async () => {
    const u = await prisma().user.findUnique({ where: { username: "new.user" } });
    const res = await api(manager).patch(`/api/users/${u!.id}`).send({ name: "اسم معدّل", jobTitle: "رسام" });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ name: "اسم معدّل", jobTitle: "رسام" });
  });
  it("MANAGER لا يعدّل حساب ADMIN ولا يعطّله", async () => {
    const a = await prisma().user.findUnique({ where: { username: "lol" } });
    expect((await api(manager).patch(`/api/users/${a!.id}`).send({ password: "hacked-pass-1" })).status).toBe(403);
    expect((await api(manager).patch(`/api/users/${a!.id}/status`).send({ isActive: false })).status).toBe(403);
  });
  it("تعطيل مستخدم يُبطل توكنه ثم إعادة تفعيله", async () => {
    const u = await makeUser("toggle1");
    const t = await login("toggle1");
    const off = await api(manager).patch(`/api/users/${u.id}/status`).send({ isActive: false });
    expect(off.status).toBe(200);
    expect(off.body.user.isActive).toBe(false);
    expect((await api(t).get("/api/auth/me")).status).toBe(401);
    const on = await api(manager).patch(`/api/users/${u.id}/status`).send({ isActive: true });
    expect(on.body.user.isActive).toBe(true);
    expect(await login("toggle1")).toBeTruthy();
  });
  it("مستخدم النظام لا يُعطَّل ولا يتغير دوره", async () => {
    const s = await prisma().user.findUnique({ where: { username: "abdullah" } });
    expect((await api(admin).patch(`/api/users/${s!.id}/status`).send({ isActive: false })).status).toBe(403);
    expect((await api(admin).patch(`/api/users/${s!.id}`).send({ role: "designer" })).status).toBe(403);
  });
  it("لا تعطيل ولا تغيير دور للنفس", async () => {
    const me = await prisma().user.findUnique({ where: { username: "lol" } });
    expect((await api(admin).patch(`/api/users/${me!.id}/status`).send({ isActive: false })).status).toBe(400);
  });
  it("id غير موجود ← 404", async () => {
    expect((await api(manager).get("/api/users/nope")).status).toBe(404);
  });
});

describe("users: حذف", () => {
  it("مستخدم النظام لا يُحذف أبداً (حتى ADMIN)", async () => {
    const s = await prisma().user.findUnique({ where: { username: "amr" } });
    expect((await api(admin).delete(`/api/users/${s!.id}`)).status).toBe(403);
    expect(await prisma().user.findUnique({ where: { username: "amr" } })).not.toBeNull();
  });
  it("حذف مستخدم عادي بلا بيانات ← 200", async () => {
    const u = await makeUser("deleteme");
    expect((await api(manager).delete(`/api/users/${u.id}`)).status).toBe(200);
    expect(await prisma().user.findUnique({ where: { id: u.id } })).toBeNull();
  });
  it("مستخدم له بيانات تاريخية ← 409 (يُعطَّل بدل الحذف)", async () => {
    const u = await makeUser("hasdata");
    await prisma().feedback.create({
      data: { title: "t", description: "d", type: "IDEA", date: "2026-01-01", createdById: u.id },
    });
    expect((await api(manager).delete(`/api/users/${u.id}`)).status).toBe(409);
    expect(await prisma().user.findUnique({ where: { id: u.id } })).not.toBeNull();
  });
  it("مستخدم نفّذ حركات مخزون: حذف عادي ← 409 (لا 500)، وpurge ← 200 وتبقى الحركات منسوبة لمن حذف", async () => {
    const u = await makeUser("stockuser");
    const me = await prisma().user.findUnique({ where: { username: "amr" } });
    const cat = await prisma().inventoryCategory.create({ data: { name: "حذف-مستخدم", groupId: "invgrp_materials" } });
    const item = await prisma().inventoryItem.create({ data: { name: "صنف حذف", categoryId: cat.id, quantity: 5 } });
    await prisma().inventoryMovement.create({
      data: { itemId: item.id, type: "OUT", delta: -1, balanceAfter: 4, previousBalance: 5, createdById: u.id },
    });
    expect((await api(manager).delete(`/api/users/${u.id}`)).status).toBe(409);
    expect((await api(manager).delete(`/api/users/${u.id}?purge=true`)).status).toBe(200);
    expect(await prisma().user.findUnique({ where: { id: u.id } })).toBeNull();
    const mv = await prisma().inventoryMovement.findMany({ where: { itemId: item.id } });
    expect(mv).toHaveLength(1);
    expect(mv[0].createdById).toBe(me!.id);
  });
  it("purge=true ← يحذف الحساب مع كل بياناته وينقل المنتجات لمن يحذف", async () => {
    const u = await makeUser("purgeme");
    const me = await prisma().user.findUnique({ where: { username: "amr" } });
    await prisma().feedback.create({
      data: { title: "t", description: "d", type: "IDEA", date: "2026-01-01", createdById: u.id },
    });
    await prisma().goal.create({
      data: { title: "g", type: "WEEKLY", startDate: "2026-01-01", endDate: "2026-01-07", createdById: u.id },
    });
    const task = await prisma().task.create({
      data: { title: "task", date: "2026-01-01", createdById: u.id, assignedToId: u.id },
    });
    await prisma().taskComment.create({ data: { taskId: task.id, userId: u.id, text: "c" } });
    const cat = await prisma().productCategory.create({ data: { name: "cat-purge" } });
    const product = await prisma().product.create({ data: { name: "p", categoryId: cat.id, createdById: u.id } });

    const res = await api(manager).delete(`/api/users/${u.id}?purge=true`);
    expect(res.status).toBe(200);
    expect(await prisma().user.findUnique({ where: { id: u.id } })).toBeNull();
    expect(await prisma().feedback.count({ where: { createdById: u.id } })).toBe(0);
    expect(await prisma().task.findUnique({ where: { id: task.id } })).toBeNull();
    const kept = await prisma().product.findUnique({ where: { id: product.id } });
    expect(kept).not.toBeNull();
    expect(kept!.createdById).not.toBe(u.id);
    expect(me).not.toBeNull();
  });
  it("purge=true لا يتجاوز حماية مستخدم النظام أو الحساب الذاتي", async () => {
    const s = await prisma().user.findUnique({ where: { username: "amr" } });
    expect((await api(admin).delete(`/api/users/${s!.id}?purge=true`)).status).toBe(403);
  });
  it("MANAGER لا يحذف ADMIN غير نظامي", async () => {
    const a = await makeUser("adm3", "ADMIN");
    expect((await api(manager).delete(`/api/users/${a.id}`)).status).toBe(403);
  });
});

describe("users: PATCH /users/me", () => {
  it("المصمم يعدّل بياناته المسموحة", async () => {
    const res = await api(designer).patch("/api/users/me").send({ name: "اسمي الجديد" });
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe("اسمي الجديد");
  });
  it("المصمم لا يستطيع تغيير الدور/التفعيل (حقول مرفوضة)", async () => {
    expect((await api(designer).patch("/api/users/me").send({ role: "admin" })).status).toBe(400);
    expect((await api(designer).patch("/api/users/me").send({ isSystemUser: true })).status).toBe(400);
    expect((await api(designer).patch("/api/users/me").send({ isActive: false })).status).toBe(400);
  });
  it("تغيير كلمة المرور يتطلب الحالية الصحيحة", async () => {
    expect((await api(designer).patch("/api/users/me").send({ newPassword: "brand-new-pass" })).status).toBe(400);
    expect((await api(designer).patch("/api/users/me").send({ currentPassword: "wrong", newPassword: "brand-new-pass" })).status).toBe(400);
    const ok = await api(designer).patch("/api/users/me").send({ currentPassword: PASSWORD, newPassword: "brand-new-pass" });
    expect(ok.status).toBe(200);
    expect(await login("designer1", "brand-new-pass")).toBeTruthy();
  });
});
