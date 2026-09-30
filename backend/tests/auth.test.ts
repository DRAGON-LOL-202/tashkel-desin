import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/db.ts";
import { runSeed } from "../prisma/seed.ts";
import { api, app, login, makeUser, PASSWORD, resetDb } from "./helpers.ts";

describe("seed", () => {
  beforeAll(resetDb);

  it("ينشئ 3 مستخدمي نظام بأدوارهم الصحيحة", async () => {
    const users = await prisma().user.findMany({ orderBy: { username: "asc" } });
    expect(users.map((u) => [u.username, u.role, u.isSystemUser])).toEqual([
      ["abdullah", "MANAGER", true],
      ["amr", "MANAGER", true],
      ["lol", "ADMIN", true],
    ]);
  });

  it("idempotent: التشغيل مرة ثانية لا يكرر", async () => {
    await runSeed();
    await runSeed();
    expect(await prisma().user.count()).toBe(3);
  });

  it("كلمة المرور مجزأة (bcrypt)", async () => {
    const u = await prisma().user.findUnique({ where: { username: "lol" } });
    expect(u!.passwordHash).not.toBe(PASSWORD);
    expect(u!.passwordHash.startsWith("$2")).toBe(true);
  });
});

describe("auth", () => {
  beforeAll(async () => {
    await resetDb();
    await makeUser("designer1");
    await makeUser("off", "DESIGNER", { isActive: false });
  });

  it("دخول ناجح ولا يرجع passwordHash", async () => {
    const res = await request(app).post("/api/auth/login").send({ username: "lol", password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.role).toBe("admin");
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });

  it("username غير حساس لحالة الأحرف", async () => {
    const res = await request(app).post("/api/auth/login").send({ username: "LOL", password: PASSWORD });
    expect(res.status).toBe(200);
  });

  it("كلمة مرور خاطئة → 401", async () => {
    const res = await request(app).post("/api/auth/login").send({ username: "lol", password: "wrong-pass" });
    expect(res.status).toBe(401);
  });

  it("مستخدم غير موجود → 401", async () => {
    const res = await request(app).post("/api/auth/login").send({ username: "nobody", password: "x" });
    expect(res.status).toBe(401);
  });

  it("حساب معطّل → 403", async () => {
    const res = await request(app).post("/api/auth/login").send({ username: "off", password: PASSWORD });
    expect(res.status).toBe(403);
  });

  it("مدخلات ناقصة → 400", async () => {
    const res = await request(app).post("/api/auth/login").send({ username: "lol" });
    expect(res.status).toBe(400);
  });

  it("/me بدون توكن → 401، وبتوكن → المستخدم", async () => {
    expect((await api().get("/api/auth/me")).status).toBe(401);
    expect((await api("garbage").get("/api/auth/me")).status).toBe(401);
    const token = await login("designer1");
    const res = await api(token).get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe("designer1");
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it("تعطيل الحساب يُبطل التوكن الحالي فوراً", async () => {
    const token = await login("designer1");
    await prisma().user.update({ where: { username: "designer1" }, data: { isActive: false } });
    expect((await api(token).get("/api/auth/me")).status).toBe(401);
    await prisma().user.update({ where: { username: "designer1" }, data: { isActive: true } });
  });

  it("logout يحتاج مصادقة", async () => {
    expect((await api().post("/api/auth/logout")).status).toBe(401);
    const token = await login("designer1");
    expect((await api(token).post("/api/auth/logout")).status).toBe(200);
  });

  it("health بدون مصادقة", async () => {
    expect((await api().get("/api/health")).status).toBe(200);
  });
});
