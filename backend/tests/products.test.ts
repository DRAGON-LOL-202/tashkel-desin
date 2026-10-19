import { beforeAll, describe, expect, it } from "vitest";
import { api, login, makeUser, resetDb } from "./helpers.ts";

let admin: string, manager: string, designer: string;

beforeAll(async () => {
  await resetDb();
  await makeUser("proddes");
  admin = await login("lol");
  manager = await login("amr");
  designer = await login("proddes");
});

const mkCategory = async (token: string, name: string) => {
  const res = await api(token).post("/api/products/categories").send({ name });
  expect(res.status).toBe(201);
  return res.body.category as { id: string; name: string };
};
const mkProduct = async (token: string, categoryId: string, o: Record<string, unknown> = {}) => {
  const res = await api(token)
    .post("/api/products")
    .send({ name: "ميدالية خشب", categoryId, variants: [{ label: "خشب", cost: 8, price: 20 }], ...o });
  expect(res.status).toBe(201);
  return res.body.product as { id: string; [k: string]: any };
};

describe("products: الوصول", () => {
  it("بدون توكن ← 401", async () => {
    expect((await api().get("/api/products")).status).toBe(401);
    expect((await api().get("/api/products/categories")).status).toBe(401);
  });
  it("المصمم ممنوع من كل المسارات ← 403", async () => {
    const cat = await mkCategory(manager, "وصول");
    const p = await mkProduct(manager, cat.id);
    expect((await api(designer).get("/api/products")).status).toBe(403);
    expect((await api(designer).get("/api/products/categories")).status).toBe(403);
    expect((await api(designer).post("/api/products/categories").send({ name: "x" })).status).toBe(403);
    expect((await api(designer).post("/api/products").send({ name: "x", categoryId: cat.id, variants: [{ cost: 1, price: 2 }] })).status).toBe(403);
    expect((await api(designer).patch(`/api/products/${p.id}`).send({ name: "y" })).status).toBe(403);
    expect((await api(designer).delete(`/api/products/${p.id}`)).status).toBe(403);
  });
});

describe("products: التصنيفات", () => {
  it("إنشاء وقائمة (الأقدم أولاً) مع تنظيف المسافات", async () => {
    const a = await mkCategory(admin, "  لوحات جدارية  ");
    expect(a.name).toBe("لوحات جدارية");
    const b = await mkCategory(manager, "ميداليات");
    const res = await api(admin).get("/api/products/categories");
    expect(res.status).toBe(200);
    const names = (res.body.categories as { name: string }[]).map((c) => c.name);
    expect(names.indexOf("لوحات جدارية")).toBeLessThan(names.indexOf("ميداليات"));
    expect(b.id).toBeTruthy();
  });
  it("التكرار بغض النظر عن حالة الأحرف ← 409", async () => {
    await mkCategory(admin, "Keychains");
    const res = await api(manager).post("/api/products/categories").send({ name: "keychains" });
    expect(res.status).toBe(409);
  });
  it("اسم فارغ أو أطول من 60 ← 400", async () => {
    expect((await api(admin).post("/api/products/categories").send({ name: "   " })).status).toBe(400);
    expect((await api(admin).post("/api/products/categories").send({ name: "x".repeat(61) })).status).toBe(400);
  });
});

describe("products: تقسيم التكلفة (خامة + وقت ماكينة)", () => {
  it("الإجمالي = الخامة + الماكينة ويُقرَّب لخانتين", async () => {
    const cat = await mkCategory(admin, "تقسيم التكلفة");
    const p = await mkProduct(admin, cat.id, { variants: [{ label: "خشب", materialCost: 50.456, machineCost: 29.999, price: 180 }] });
    expect(p.variants[0]).toMatchObject({ materialCost: 50.46, machineCost: 30, cost: 80.46, price: 180 });
  });
  it("وقت الماكينة اختياري (الافتراضي 0) و cost القديم يُعتبر خامة", async () => {
    const cat = await mkCategory(admin, "توافق التكلفة");
    const a = await mkProduct(admin, cat.id, { variants: [{ materialCost: 12, price: 30 }] });
    expect(a.variants[0]).toMatchObject({ materialCost: 12, machineCost: 0, cost: 12 });
    const b = await mkProduct(admin, cat.id, { variants: [{ cost: 8, price: 20 }] });
    expect(b.variants[0]).toMatchObject({ materialCost: 8, machineCost: 0, cost: 8 });
  });
  it("قيم سالبة أو بدون أي تكلفة ← 400، والتعديل يعيد حساب الإجمالي", async () => {
    const cat = await mkCategory(admin, "تحقق التكلفة");
    const post = (variants: unknown) => api(admin).post("/api/products").send({ name: "م", categoryId: cat.id, variants });
    expect((await post([{ materialCost: 1, machineCost: -1, price: 2 }])).status).toBe(400);
    expect((await post([{ machineCost: 5, price: 2 }])).status).toBe(400);
    const p = await mkProduct(admin, cat.id);
    const res = await api(admin).patch(`/api/products/${p.id}`).send({ variants: [{ label: "جلد", materialCost: 20, machineCost: 15, price: 60 }] });
    expect(res.status).toBe(200);
    expect(res.body.product.variants[0]).toMatchObject({ materialCost: 20, machineCost: 15, cost: 35 });
  });
});

describe("products: الإنشاء", () => {
  it("منتج بخامتين: الأسعار تُقرَّب لخانتين والترتيب محفوظ", async () => {
    const cat = await mkCategory(admin, "إنشاء");
    const p = await mkProduct(admin, cat.id, {
      name: "  حامل أقلام  ",
      variants: [
        { label: "خشب", cost: 10.456, price: 22 },
        { label: "أكريليك", cost: 15, price: 35.999 },
      ],
    });
    expect(p).toMatchObject({ name: "حامل أقلام", categoryId: cat.id, categoryName: "إنشاء" });
    expect(p.variants).toHaveLength(2);
    expect(p.variants[0]).toMatchObject({ label: "خشب", cost: 10.46, price: 22 });
    expect(p.variants[1]).toMatchObject({ label: "أكريليك", cost: 15, price: 36 });
  });
  it("اسم الخامة اختياري", async () => {
    const cat = await mkCategory(admin, "بلا اسم خامة");
    const p = await mkProduct(admin, cat.id, { variants: [{ cost: 1, price: 2 }] });
    expect(p.variants[0].label).toBe("");
  });
  it("التحقق: اسم/تصنيف/خامات/أسعار", async () => {
    const cat = await mkCategory(admin, "تحقق");
    const post = (b: Record<string, unknown>) => api(admin).post("/api/products").send(b);
    const ok = { name: "م", categoryId: cat.id, variants: [{ cost: 1, price: 2 }] };
    expect((await post({ ...ok, name: " " })).status).toBe(400);
    expect((await post({ ...ok, categoryId: "nope" })).status).toBe(400);
    expect((await post({ ...ok, variants: [] })).status).toBe(400);
    expect((await post({ ...ok, variants: Array.from({ length: 21 }, () => ({ cost: 1, price: 2 })) })).status).toBe(400);
    expect((await post({ ...ok, variants: [{ cost: -1, price: 2 }] })).status).toBe(400);
    expect((await post({ ...ok, variants: [{ cost: 1, price: 10_000_001 }] })).status).toBe(400);
    expect((await post({ ...ok, variants: [{ cost: "abc", price: 2 }] })).status).toBe(400);
    expect((await post({ ...ok, variants: [{ label: "x".repeat(101), cost: 1, price: 2 }] })).status).toBe(400);
  });
  it("أكثر من صورة واحدة ← 400", async () => {
    const cat = await mkCategory(admin, "صور");
    const img = (n: number) => ({ id: `a${n}`, name: "a.png", dataUrl: "data:image/png;base64,AAAA" });
    const res = await api(admin).post("/api/products").send({ name: "م", categoryId: cat.id, variants: [{ cost: 1, price: 2 }], attachments: [img(1), img(2)] });
    expect(res.status).toBe(400);
  });
  it("صورة base64 القديمة تُقبل وتُعاد", async () => {
    const cat = await mkCategory(admin, "صورة قديمة");
    const p = await mkProduct(admin, cat.id, { attachments: [{ id: "a1", name: "a.png", dataUrl: "data:image/png;base64,AAAA" }] });
    expect(p.attachments).toHaveLength(1);
    expect(p.attachments[0].dataUrl).toContain("data:image/png");
  });
});

describe("products: القائمة والتعديل والحذف", () => {
  it("القائمة: الأحدث أولاً مع الخامات", async () => {
    const cat = await mkCategory(admin, "قائمة");
    const first = await mkProduct(admin, cat.id, { name: "الأول" });
    const second = await mkProduct(admin, cat.id, { name: "الثاني" });
    const res = await api(manager).get("/api/products");
    expect(res.status).toBe(200);
    const ids = (res.body.products as { id: string }[]).map((p) => p.id);
    expect(ids.indexOf(second.id)).toBeLessThan(ids.indexOf(first.id));
    expect(res.body.products[0].variants.length).toBeGreaterThan(0);
  });
  it("PATCH: تغيير الاسم والتصنيف دون المساس بالخامات", async () => {
    const c1 = await mkCategory(admin, "قديم");
    const c2 = await mkCategory(admin, "جديد");
    const p = await mkProduct(admin, c1.id);
    const res = await api(manager).patch(`/api/products/${p.id}`).send({ name: "اسم جديد", categoryId: c2.id });
    expect(res.status).toBe(200);
    expect(res.body.product).toMatchObject({ name: "اسم جديد", categoryId: c2.id, categoryName: "جديد" });
    expect(res.body.product.variants).toHaveLength(1);
  });
  it("PATCH: الخامات تُستبدل كاملة", async () => {
    const cat = await mkCategory(admin, "استبدال");
    const p = await mkProduct(admin, cat.id, { variants: [{ cost: 1, price: 2 }, { cost: 3, price: 4 }] });
    const res = await api(admin).patch(`/api/products/${p.id}`).send({ variants: [{ label: "جلد", cost: 5, price: 9 }] });
    expect(res.status).toBe(200);
    expect(res.body.product.variants).toHaveLength(1);
    expect(res.body.product.variants[0]).toMatchObject({ label: "جلد", cost: 5, price: 9 });
  });
  it("PATCH: جسم فارغ أو تصنيف غير موجود أو منتج غير موجود", async () => {
    const cat = await mkCategory(admin, "أخطاء");
    const p = await mkProduct(admin, cat.id);
    expect((await api(admin).patch(`/api/products/${p.id}`).send({})).status).toBe(400);
    expect((await api(admin).patch(`/api/products/${p.id}`).send({ categoryId: "nope" })).status).toBe(400);
    expect((await api(admin).patch("/api/products/nope").send({ name: "x" })).status).toBe(404);
  });
  it("DELETE: يحذف المنتج وخاماته", async () => {
    const cat = await mkCategory(admin, "حذف");
    const p = await mkProduct(admin, cat.id);
    expect((await api(manager).delete(`/api/products/${p.id}`)).status).toBe(200);
    const list = await api(admin).get("/api/products");
    expect((list.body.products as { id: string }[]).some((x) => x.id === p.id)).toBe(false);
    expect((await api(admin).delete(`/api/products/${p.id}`)).status).toBe(404);
  });
});
