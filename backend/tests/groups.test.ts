import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db.ts";
import { api, GROUP_ACCESSORIES, GROUP_MATERIALS, login, makeUser, PASSWORD, resetDb } from "./helpers.ts";
import { readFileSync } from "node:fs";

// المجموعتان الرئيسيتان (خامات / اكسسوارات وهدايا) لتحديد وصول تعبئة ومشغل
let admin: string, manager: string, designerFull: string, designerWd: string;
let packer: string, operator: string, both: string, none: string, packerId: string;
let wood: string, acrylic: string, keychains: string, orphan: string;
let iWood: string, iAcrylic: string, iKey: string, iOrphan: string;

const mkCat = (name: string, groupId?: string) => api(admin).post("/api/inventory/categories").send({ name, ...(groupId ? { groupId } : {}) });
async function mkItem(categoryId: string, name: string) {
  return (await api(admin).post("/api/inventory").send({ name, categoryId, initialQuantity: 50, unitPrice: 10, minQuantity: 1 })).body.item.id as string;
}
const withdraw = (t: string, lines: { itemId: string; quantity: number }[]) => api(t).post("/api/inventory/withdrawals").send({ lines, note: "x" });
const qty = async (id: string) => Number((await prisma().inventoryItem.findUniqueOrThrow({ where: { id } })).quantity);
const ids = (r: any) => r.body.items.map((i: any) => i.id).sort();

beforeAll(async () => {
  await resetDb();
  await makeUser("g_mgr", "MANAGER");
  await makeUser("g_des_full", "DESIGNER", { inventoryAccess: "FULL" });
  await makeUser("g_des_wd", "DESIGNER", { inventoryAccess: "WITHDRAW" });
  admin = await login("lol");
  manager = await login("g_mgr");
  designerFull = await login("g_des_full");
  designerWd = await login("g_des_wd");
  wood = (await mkCat("خشب", GROUP_MATERIALS)).body.category.id;
  acrylic = (await mkCat("أكريليك", GROUP_MATERIALS)).body.category.id;
  keychains = (await mkCat("ميداليات", GROUP_ACCESSORIES)).body.category.id;
  // تصنيف قديم بلا مجموعة (كما بعد الترحيل)
  orphan = (await prisma().inventoryCategory.create({ data: { name: "قديم" } })).id;
  iWood = await mkItem(wood, "لوح خشب");
  iAcrylic = await mkItem(acrylic, "لوح أكريليك");
  iKey = await mkItem(keychains, "ميدالية");
  iOrphan = await mkItem(orphan, "صنف قديم");
  const p = await makeUser("g_packer", "PACKER");
  packerId = p.id;
  await prisma().userInventoryGroup.create({ data: { userId: p.id, groupId: GROUP_MATERIALS } });
  const o = await makeUser("g_operator", "OPERATOR");
  await prisma().userInventoryGroup.createMany({ data: [GROUP_MATERIALS, GROUP_ACCESSORIES].map((groupId) => ({ userId: o.id, groupId })) });
  await makeUser("g_none", "PACKER");
  packer = await login("g_packer");
  operator = await login("g_operator");
  both = operator;
  none = await login("g_none");
});

describe("المجموعتان", () => {
  it("موجودتان بعد تطبيق كل المهاجرات، والبذر لا يكرّرهما", async () => {
    const { runSeed } = await import("../prisma/seed.ts");
    await runSeed();
    const rows = await prisma().inventoryGroup.findMany({ orderBy: { sortOrder: "asc" } });
    expect(rows.map((g) => g.key)).toEqual(["MATERIALS", "ACCESSORIES_GIFTS"]);
    expect(rows.map((g) => g.name)).toEqual(["خامات", "اكسسوارات وهدايا"]);
  });
  it("migration 0013 تبذر المجموعتين وتحذف الجدول القديم", () => {
    const sql = readFileSync(new URL("../prisma/migrations/0013_inventory_groups/migration.sql", import.meta.url), "utf8");
    expect(sql).toMatch(/ON CONFLICT \("key"\) DO NOTHING/);
    expect(sql).toMatch(/DROP TABLE IF EXISTS "UserInventoryCategory"/);
  });
  it("GET /groups للإدارة فقط مع العدّادات", async () => {
    const r = await api(manager).get("/api/inventory/groups");
    expect(r.status).toBe(200);
    const m = r.body.groups.find((g: any) => g.key === "MATERIALS");
    expect(m.categoriesCount).toBe(2);
    expect(m.itemsCount).toBe(2);
    expect(r.body.unassigned).toEqual({ categoriesCount: 1, itemsCount: 1 });
    for (const t of [packer, operator, designerWd, designerFull]) expect((await api(t).get("/api/inventory/groups")).status).toBe(403);
  });
  it("لا إنشاء ولا تعديل ولا حذف للمجموعات من الـ API", async () => {
    for (const m of ["post", "patch", "delete"] as const) {
      const r = await (api(admin) as any)[m]("/api/inventory/groups/" + GROUP_MATERIALS).send({ name: "x" });
      expect(r.status).toBeGreaterThanOrEqual(400);
    }
    expect((await api(admin).post("/api/inventory/groups").send({ name: "x" })).status).toBeGreaterThanOrEqual(400);
    expect(await prisma().inventoryGroup.count()).toBe(2);
  });
});

describe("التصنيفات", () => {
  it("إنشاء بلا groupId ← 400، وبمجموعة غير موجودة ← 400", async () => {
    expect((await mkCat("بلا مجموعة")).status).toBe(400);
    expect((await mkCat("مجموعة وهمية", "nope")).status).toBe(400);
  });
  it("الرد يحوي groupId وgroupName", async () => {
    const r = await mkCat("هدايا", GROUP_ACCESSORIES);
    expect(r.status).toBe(201);
    expect(r.body.category.groupId).toBe(GROUP_ACCESSORIES);
    expect(r.body.category.groupName).toBe("اكسسوارات وهدايا");
    await api(admin).delete(`/api/inventory/categories/${r.body.category.id}`);
  });
  it("PATCH يغيّر المجموعة ويرفض مجموعة غير موجودة؛ والقديم يظهر بلا مجموعة", async () => {
    expect((await api(admin).patch(`/api/inventory/categories/${acrylic}`).send({ groupId: "nope" })).status).toBe(400);
    const list = await api(admin).get("/api/inventory/categories");
    expect(list.body.categories.find((c: any) => c.id === orphan).groupId).toBeNull();
  });
});

describe("تعبئة بمجموعة «خامات»", () => {
  it("ترى أصناف كل تصنيفات خامات فقط، لا اكسسوارات ولا غير المصنَّف", async () => {
    expect(ids(await api(packer).get("/api/inventory?includeInactive=true"))).toEqual([iWood, iAcrylic].sort());
    const c = await api(packer).get("/api/inventory/categories");
    expect(c.body.categories.map((x: any) => x.id).sort()).toEqual([wood, acrylic].sort());
  });
  it("تسحب من تصنيف داخل خامات ← 201 وخصم", async () => {
    expect((await withdraw(packer, [{ itemId: iAcrylic, quantity: 2 }])).status).toBe(201);
    expect(await qty(iAcrylic)).toBe(48);
  });
  it("صنف من المجموعة الأخرى أو غير المصنَّف ← 403 بلا خصم، والطلب المختلط يُرفض كله", async () => {
    expect((await withdraw(packer, [{ itemId: iKey, quantity: 1 }])).status).toBe(403);
    expect((await withdraw(packer, [{ itemId: iOrphan, quantity: 1 }])).status).toBe(403);
    const before = await qty(iWood);
    expect((await withdraw(packer, [{ itemId: iWood, quantity: 1 }, { itemId: iKey, quantity: 1 }])).status).toBe(403);
    expect(await qty(iWood)).toBe(before);
    expect(await qty(iKey)).toBe(50);
    expect(await qty(iOrphan)).toBe(50);
  });
});

describe("سريان التغييرات فوراً", () => {
  it("تصنيف جديد داخل مجموعة مسموحة يظهر ويُسحب منه دون تعديل المستخدم", async () => {
    const c = (await mkCat("جلد", GROUP_MATERIALS)).body.category.id as string;
    const i = await mkItem(c, "قطعة جلد");
    expect(ids(await api(packer).get("/api/inventory"))).toContain(i);
    expect((await withdraw(packer, [{ itemId: i, quantity: 1 }])).status).toBe(201);
  });
  it("نقل تصنيف بين المجموعتين: يختفي من الأول ويظهر للثاني", async () => {
    const c = (await mkCat("مؤقت-نقل", GROUP_MATERIALS)).body.category.id as string;
    const i = await mkItem(c, "صنف نقل");
    const onlyAcc = await makeUser("g_acc_only", "PACKER");
    await prisma().userInventoryGroup.create({ data: { userId: onlyAcc.id, groupId: GROUP_ACCESSORIES } });
    const t = await login("g_acc_only");
    expect(ids(await api(packer).get("/api/inventory"))).toContain(i);
    expect(ids(await api(t).get("/api/inventory"))).not.toContain(i);
    expect((await api(admin).patch(`/api/inventory/categories/${c}`).send({ groupId: GROUP_ACCESSORIES })).status).toBe(200);
    expect(ids(await api(packer).get("/api/inventory"))).not.toContain(i);
    expect(ids(await api(t).get("/api/inventory"))).toContain(i);
    expect((await withdraw(packer, [{ itemId: i, quantity: 1 }])).status).toBe(403);
    expect((await withdraw(t, [{ itemId: i, quantity: 1 }])).status).toBe(201);
  });
  it("منح مجموعة أو سحبها ينعكس في الطلب التالي دون إعادة دخول", async () => {
    const db = prisma();
    await db.userInventoryGroup.create({ data: { userId: packerId, groupId: GROUP_ACCESSORIES } });
    expect(ids(await api(packer).get("/api/inventory"))).toContain(iKey);
    expect((await withdraw(packer, [{ itemId: iKey, quantity: 1 }])).status).toBe(201);
    await db.userInventoryGroup.delete({ where: { userId_groupId: { userId: packerId, groupId: GROUP_ACCESSORIES } } });
    expect(ids(await api(packer).get("/api/inventory"))).not.toContain(iKey);
    expect((await withdraw(packer, [{ itemId: iKey, quantity: 1 }])).status).toBe(403);
  });
});

describe("مشغل بالمجموعتين / صفر مجموعات / الإدارة والمصمم", () => {
  it("المشغل بالمجموعتين يرى كل المصنَّف ولا يرى غير المصنَّف", async () => {
    const list = ids(await api(both).get("/api/inventory"));
    expect(list).toEqual(expect.arrayContaining([iWood, iAcrylic, iKey]));
    expect(list).not.toContain(iOrphan);
    expect((await withdraw(both, [{ itemId: iWood, quantity: 1 }, { itemId: iKey, quantity: 1 }])).status).toBe(201);
  });
  it("صفر مجموعات ← قائمة فارغة وسحب مرفوض", async () => {
    expect((await api(none).get("/api/inventory")).body.items).toEqual([]);
    expect((await api(none).get("/api/inventory/categories")).body.categories).toEqual([]);
    expect((await withdraw(none, [{ itemId: iWood, quantity: 1 }])).status).toBe(403);
  });
  it("الإدارة والمصمم (سحب فقط / كامل) لا يتأثرون بالمجموعات، حتى بالتصنيف غير المصنَّف", async () => {
    expect(ids(await api(manager).get("/api/inventory"))).toContain(iOrphan);
    expect(ids(await api(designerFull).get("/api/inventory"))).toContain(iOrphan);
    expect(ids(await api(designerWd).get("/api/inventory"))).toEqual(expect.arrayContaining([iWood, iKey, iOrphan]));
    expect((await withdraw(designerWd, [{ itemId: iOrphan, quantity: 1 }])).status).toBe(201);
  });
});

describe("المستخدمون والمجموعات", () => {
  const mk = (body: Record<string, unknown>) => api(admin).post("/api/users").send({ name: "م", password: PASSWORD, ...body });
  it("مجموعة غير موجودة ← 400 ولا يُنشأ المستخدم؛ وتُزال التكرارات", async () => {
    expect((await mk({ username: "g_bad", email: "g_bad@e.test", role: "packer", allowedGroupIds: ["nope"] })).status).toBe(400);
    expect(await prisma().user.count({ where: { username: "g_bad" } })).toBe(0);
    const ok = await mk({ username: "g_ok", email: "g_ok@e.test", role: "operator", allowedGroupIds: [GROUP_MATERIALS, GROUP_MATERIALS] });
    expect(ok.body.user.allowedGroupIds).toEqual([GROUP_MATERIALS]);
  });
  it("الحقل القديم allowedCategoryIds يُتجاهل ولا يمنح شيئاً", async () => {
    const r = await mk({ username: "g_old", email: "g_old@e.test", role: "packer", allowedCategoryIds: [wood] });
    expect(r.status).toBe(201);
    expect(r.body.user.allowedGroupIds).toEqual([]);
  });
});
