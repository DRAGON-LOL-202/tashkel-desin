import { beforeAll, describe, expect, it } from "vitest";
import { api, login, makeUser, resetDb, PASSWORD } from "./helpers.ts";
import { prisma } from "../src/db.ts";

// دورا «تعبئة» و«مشغل» + مستوى وصول المصمم للمخزون (بلا وصول / السحب فقط / كامل)
let admin: string, manager: string;
let packer: string, operator: string, packerId: string, operatorId: string;
let catA: string, catB: string, itemA: string, itemB: string;

async function mkCat(name: string) {
  return (await api(admin).post("/api/inventory/categories").send({ name })).body.category.id as string;
}
async function mkItem(categoryId: string, name: string, qty = 50) {
  const r = await api(admin).post("/api/inventory").send({ name, categoryId, initialQuantity: qty, unitPrice: 10, minQuantity: 1 });
  return r.body.item.id as string;
}
const withdraw = (t: string, lines: { itemId: string; quantity: number }[]) => api(t).post("/api/inventory/withdrawals").send({ lines, note: "x" });
const qty = async (id: string) => Number((await prisma().inventoryItem.findUniqueOrThrow({ where: { id } })).quantity);

beforeAll(async () => {
  await resetDb();
  await makeUser("acc_mgr", "MANAGER");
  admin = await login("lol");
  manager = await login("acc_mgr");
  catA = await mkCat("تصنيف أ");
  catB = await mkCat("تصنيف ب");
  itemA = await mkItem(catA, "صنف أ");
  itemB = await mkItem(catB, "صنف ب");
  const p = await makeUser("acc_packer", "PACKER");
  const o = await makeUser("acc_operator", "OPERATOR");
  packerId = p.id;
  operatorId = o.id;
  await prisma().userInventoryCategory.create({ data: { userId: packerId, categoryId: catA } });
  await prisma().userInventoryCategory.create({ data: { userId: operatorId, categoryId: catB } });
  packer = await login("acc_packer");
  operator = await login("acc_operator");
});

describe("تعبئة/مشغل: القائمة البيضاء", () => {
  const blocked: [string, string][] = [
    ["get", "/api/tasks"],
    ["get", "/api/feedback"],
    ["get", "/api/goals"],
    ["get", "/api/products"],
    ["get", "/api/calendar-events"],
    ["get", "/api/attendance/me"],
    ["get", "/api/notifications"],
    ["get", "/api/notifications/counts"],
    ["get", "/api/users"],
    ["get", "/api/inventory/units"],
    ["get", "/api/inventory/movements"],
    ["get", "/api/inventory/next-sku"],
    ["post", "/api/inventory"],
    ["post", "/api/inventory/categories"],
    ["post", "/api/files/presign"],
    ["post", "/api/push/subscribe"],
    ["get", "/api/this-route-does-not-exist-yet"],
  ];
  for (const [who, getToken] of [["تعبئة", () => packer], ["مشغل", () => operator]] as const) {
    it(`${who}: كل مسار خارج القائمة ← 403`, async () => {
      for (const [m, url] of blocked) {
        const r = await (api(getToken()) as any)[m](url).send({});
        expect(r.status, `${m} ${url}`).toBe(403);
      }
      expect((await api(getToken()).get(`/api/inventory/${itemA}`)).status).toBe(403);
      expect((await api(getToken()).get(`/api/inventory/${itemA}/movements`)).status).toBe(403);
      expect((await api(getToken()).patch(`/api/inventory/${itemA}`).send({ name: "x" })).status).toBe(403);
      expect((await api(getToken()).delete(`/api/inventory/${itemA}`)).status).toBe(403);
    });
    it(`${who}: المسموح ← 200`, async () => {
      for (const url of ["/api/auth/me", "/api/sync", "/api/inventory", "/api/inventory/categories", "/api/inventory/withdrawals"]) {
        expect((await api(getToken()).get(url)).status, url).toBe(200);
      }
      expect((await api(getToken()).post("/api/auth/logout")).status).toBe(200);
      expect((await api(getToken()).patch("/api/users/me").send({ name: "اسم جديد" })).status).toBe(200);
    });
  }
  it("بلا توكن ← 401 (البوابة لا تغيّر ذلك)", async () => {
    expect((await api().get("/api/tasks")).status).toBe(401);
  });
  it("تسجيل الدخول يعيد الدور والمسمى الافتراضي", async () => {
    const me = await api(packer).get("/api/auth/me");
    expect(me.body.user.role).toBe("packer");
    expect(me.body.user.inventoryAccess).toBe("withdraw");
  });
});

describe("تعبئة/مشغل: الترشيح بالتصنيفات", () => {
  it("يرى أصناف تصنيفاته فقط، بلا أسعار ولا إحصاءات", async () => {
    const r = await api(packer).get("/api/inventory?includeInactive=true");
    expect(r.body.items.map((i: any) => i.id)).toEqual([itemA]);
    expect(r.body.stats).toBeUndefined();
    const it0 = r.body.items[0];
    for (const k of ["unitPrice", "totalValue", "suggestedReorderQty"]) expect(it0).not.toHaveProperty(k);
    const c = await api(packer).get("/api/inventory/categories");
    expect(c.body.categories.map((x: any) => x.id)).toEqual([catA]);
    const o = await api(operator).get("/api/inventory");
    expect(o.body.items.map((i: any) => i.id)).toEqual([itemB]);
  });
  it("السحب من تصنيفه ← 201 وخصم، وبلا أسعار في الرد والسجل", async () => {
    const r = await withdraw(packer, [{ itemId: itemA, quantity: 4 }]);
    expect(r.status).toBe(201);
    expect(await qty(itemA)).toBe(46);
    expect(r.body.movements[0]).not.toHaveProperty("unitPriceSnapshot");
    const log = await api(packer).get("/api/inventory/withdrawals");
    expect(log.body.movements.length).toBe(1);
    expect(log.body.movements[0]).not.toHaveProperty("movementValue");
  });
  it("صنف خارج تصنيفاته ← 403 بلا خصم، والطلب المختلط يُرفض كله", async () => {
    expect((await withdraw(packer, [{ itemId: itemB, quantity: 1 }])).status).toBe(403);
    expect(await qty(itemB)).toBe(50);
    const before = await qty(itemA);
    const mixed = await withdraw(packer, [{ itemId: itemA, quantity: 1 }, { itemId: itemB, quantity: 1 }]);
    expect(mixed.status).toBe(403);
    expect(await qty(itemA)).toBe(before);
    expect(await qty(itemB)).toBe(50);
  });
  it("صفر تصنيفات ← قائمة فارغة وسحب مرفوض", async () => {
    await makeUser("acc_none", "PACKER");
    const t = await login("acc_none");
    expect((await api(t).get("/api/inventory")).body.items).toEqual([]);
    expect((await api(t).get("/api/inventory/categories")).body.categories).toEqual([]);
    expect((await withdraw(t, [{ itemId: itemA, quantity: 1 }])).status).toBe(403);
  });
  it("منح تصنيف أو سحبه ينعكس فوراً دون إعادة دخول", async () => {
    const db = prisma();
    await db.userInventoryCategory.create({ data: { userId: packerId, categoryId: catB } });
    expect((await api(packer).get("/api/inventory")).body.items.length).toBe(2);
    expect((await withdraw(packer, [{ itemId: itemB, quantity: 1 }])).status).toBe(201);
    await db.userInventoryCategory.delete({ where: { userId_categoryId: { userId: packerId, categoryId: catB } } });
    expect((await api(packer).get("/api/inventory")).body.items.length).toBe(1);
    expect((await withdraw(packer, [{ itemId: itemB, quantity: 1 }])).status).toBe(403);
  });
  it("لا يرى سحوبات غيره", async () => {
    await withdraw(operator, [{ itemId: itemB, quantity: 2 }]);
    const log = await api(packer).get("/api/inventory/withdrawals");
    expect(log.body.movements.length).toBeGreaterThan(0);
    expect(log.body.movements.every((m: any) => m.createdById === packerId)).toBe(true);
  });
  it("حذف تصنيف أو مستخدم ينظّف صفوف الربط (cascade)", async () => {
    const c = await mkCat("مؤقت");
    const u = await makeUser("acc_tmp", "OPERATOR");
    await prisma().userInventoryCategory.create({ data: { userId: u.id, categoryId: c } });
    expect((await api(admin).delete(`/api/inventory/categories/${c}`)).status).toBe(200);
    expect(await prisma().userInventoryCategory.count({ where: { userId: u.id } })).toBe(0);
    const c2 = await mkCat("مؤقت2");
    await prisma().userInventoryCategory.create({ data: { userId: u.id, categoryId: c2 } });
    expect((await api(admin).delete(`/api/users/${u.id}`)).status).toBe(200);
    expect(await prisma().userInventoryCategory.count({ where: { categoryId: c2 } })).toBe(0);
  });
});

describe("إدارة المستخدمين: الدور والتصنيفات", () => {
  const mk = (t: string, body: Record<string, unknown>) =>
    api(t).post("/api/users").send({ name: "م", password: PASSWORD, ...body });

  it("إنشاء مشغل بتصنيفات + مسمى افتراضي + يظهر في القائمة", async () => {
    const r = await mk(manager, { username: "u_op1", email: "u_op1@e.test", role: "operator", allowedCategoryIds: [catA, catB, catA] });
    expect(r.status).toBe(201);
    expect(r.body.user.jobTitle).toBe("مشغل");
    expect(r.body.user.inventoryAccess).toBe("withdraw");
    expect([...r.body.user.allowedCategoryIds].sort()).toEqual([catA, catB].sort());
    const list = await api(admin).get("/api/users");
    const u = list.body.users.find((x: any) => x.username === "u_op1");
    expect(u.allowedCategoryIds.length).toBe(2);
    const pk = await mk(admin, { username: "u_pk1", email: "u_pk1@e.test", role: "packer" });
    expect(pk.body.user.jobTitle).toBe("تعبئة");
    expect(pk.body.user.allowedCategoryIds).toEqual([]);
  });
  it("تصنيف غير موجود ← 400 ولا يُنشأ المستخدم", async () => {
    const r = await mk(admin, { username: "u_bad", email: "u_bad@e.test", role: "packer", allowedCategoryIds: ["nope"] });
    expect(r.status).toBe(400);
    expect(await prisma().user.count({ where: { username: "u_bad" } })).toBe(0);
  });
  it("تعديل التصنيفات يستبدلها، وحذفها كلها يترك صفراً", async () => {
    const id = (await prisma().user.findUniqueOrThrow({ where: { username: "u_op1" } })).id;
    const r = await api(admin).patch(`/api/users/${id}`).send({ allowedCategoryIds: [catB] });
    expect(r.status).toBe(200);
    expect(r.body.user.allowedCategoryIds).toEqual([catB]);
    const r2 = await api(admin).patch(`/api/users/${id}`).send({ allowedCategoryIds: [] });
    expect(r2.body.user.allowedCategoryIds).toEqual([]);
    // تعديل بيانات أخرى لا يمسّ التصنيفات
    await api(admin).patch(`/api/users/${id}`).send({ allowedCategoryIds: [catA] });
    const r3 = await api(admin).patch(`/api/users/${id}`).send({ name: "اسم" });
    expect(r3.body.user.allowedCategoryIds).toEqual([catA]);
  });
  it("تحويل مشغل إلى مصمم يمسح التصنيفات ويبدأ بلا وصول", async () => {
    const id = (await prisma().user.findUniqueOrThrow({ where: { username: "u_op1" } })).id;
    const r = await api(admin).patch(`/api/users/${id}`).send({ role: "designer" });
    expect(r.status).toBe(200);
    expect(r.body.user.role).toBe("designer");
    expect(r.body.user.inventoryAccess).toBe("none");
    expect(r.body.user.jobTitle).toBe("مصمم");
    expect(r.body.user.allowedCategoryIds).toBeUndefined();
    expect(await prisma().userInventoryCategory.count({ where: { userId: id } })).toBe(0);
  });
  it("المدير لا يسند ADMIN (القاعدة القديمة باقية)", async () => {
    expect((await mk(manager, { username: "u_adm", email: "u_adm@e.test", role: "admin" })).status).toBe(403);
  });
  it("تعبئة/مشغل لا يستدعيان إدارة المستخدمين", async () => {
    expect((await mk(packer, { username: "u_x", email: "u_x@e.test" })).status).toBe(403);
  });
});

describe("المصمم: مستوى الوصول للمخزون", () => {
  const mkDesigner = async (name: string, inventoryAccess?: string) => {
    const r = await api(admin).post("/api/users").send({ name, username: name, email: `${name}@e.test`, password: PASSWORD, role: "designer", ...(inventoryAccess ? { inventoryAccess } : {}) });
    expect(r.status).toBe(201);
    return { id: r.body.user.id as string, token: await login(name), user: r.body.user };
  };

  it("الافتراضي بلا وصول ← 403 على كل مسارات المخزون، وباقي النظام يعمل", async () => {
    const d = await mkDesigner("des_none");
    expect(d.user.inventoryAccess).toBe("none");
    for (const url of ["/api/inventory", "/api/inventory/categories", "/api/inventory/withdrawals", "/api/inventory/units", "/api/inventory/movements"]) {
      expect((await api(d.token).get(url)).status, url).toBe(403);
    }
    expect((await withdraw(d.token, [{ itemId: itemA, quantity: 1 }])).status).toBe(403);
    expect((await api(d.token).get("/api/tasks")).status).toBe(200);
  });
  it("السحب فقط: يسحب من كل التصنيفات، بلا أسعار ولا حركات ولا وحدات", async () => {
    const d = await mkDesigner("des_wd", "withdraw");
    const list = await api(d.token).get("/api/inventory");
    expect(list.status).toBe(200);
    expect(list.body.items.length).toBe(2);
    expect(list.body.stats).toBeUndefined();
    expect(list.body.items[0]).not.toHaveProperty("unitPrice");
    const cats = (await api(d.token).get("/api/inventory/categories")).body.categories.map((c: any) => c.id);
    expect(cats).toEqual(expect.arrayContaining([catA, catB]));
    expect((await withdraw(d.token, [{ itemId: itemA, quantity: 1 }, { itemId: itemB, quantity: 1 }])).status).toBe(201);
    expect((await api(d.token).get("/api/inventory/withdrawals")).status).toBe(200);
    for (const url of ["/api/inventory/units", "/api/inventory/movements", `/api/inventory/${itemA}`, `/api/inventory/${itemA}/movements`]) {
      expect((await api(d.token).get(url)).status, url).toBe(403);
    }
    expect((await api(d.token).post("/api/inventory").send({})).status).toBe(403);
  });
  it("كامل: يرى المخزون والأسعار كما كان", async () => {
    const d = await mkDesigner("des_full", "full");
    const list = await api(d.token).get("/api/inventory");
    expect(list.body.stats).toBeDefined();
    expect(list.body.items[0]).toHaveProperty("unitPrice");
    expect((await api(d.token).get("/api/inventory/units")).status).toBe(200);
    expect((await api(d.token).post("/api/inventory").send({ name: "x", categoryId: catA })).status).toBe(403);
  });
  it("تغيير المستوى يسري فوراً دون إعادة دخول، والقيمة الخاطئة ← 400", async () => {
    const d = await mkDesigner("des_chg", "full");
    expect((await api(d.token).get("/api/inventory")).status).toBe(200);
    expect((await api(admin).patch(`/api/users/${d.id}`).send({ inventoryAccess: "none" })).status).toBe(200);
    expect((await api(d.token).get("/api/inventory")).status).toBe(403);
    expect((await api(admin).patch(`/api/users/${d.id}`).send({ inventoryAccess: "everything" })).status).toBe(400);
  });
  it("الإدارة دائماً كاملة، وinventoryAccess يُتجاهل لها", async () => {
    const r = await api(admin).post("/api/users").send({ name: "م", username: "mgr2", email: "mgr2@e.test", password: PASSWORD, role: "manager", inventoryAccess: "none" });
    expect(r.body.user.inventoryAccess).toBe("full");
  });
  it("المصممون الحاليون قبل التحديث يحتفظون بالمخزون الكامل (backfill في 0012)", async () => {
    const { readFileSync } = await import("node:fs");
    const sql = readFileSync(new URL("../prisma/migrations/0012_inventory_access/migration.sql", import.meta.url), "utf8");
    expect(sql).toMatch(/UPDATE "User" SET "inventoryAccess" = 'FULL' WHERE "role" = 'DESIGNER'/);
  });
});
