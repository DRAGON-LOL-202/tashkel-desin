import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { api, login, makeUser, resetDb } from "./helpers.ts";
import { prisma } from "../src/db.ts";

// "bucket" في الذاكرة يحل محل R2: HEAD/DELETE عبر fetch المُستبدَل. لا شبكة حقيقية.
const bucket = new Map<string, { size: number; type: string }>();
const BUCKET = "test-bucket";
const DAY = "2026-03-10";

let admin: string, manager: string, d1: string, d2: string;
let d1Id: string, d2Id: string;

beforeAll(async () => {
  vi.stubGlobal("fetch", async (input: unknown, init?: { method?: string }) => {
    const u = new URL(String(input));
    const key = decodeURIComponent(u.pathname.slice(`/${BUCKET}/`.length));
    const method = init?.method ?? "GET";
    const obj = bucket.get(key);
    if (method === "HEAD") {
      return obj ? new Response(null, { status: 200, headers: { "content-length": String(obj.size), "content-type": obj.type } }) : new Response(null, { status: 404 });
    }
    if (method === "DELETE") {
      bucket.delete(key);
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 405 });
  });
  await resetDb();
  d1Id = (await makeUser("fdes1")).id;
  d2Id = (await makeUser("fdes2")).id;
  admin = await login("lol");
  manager = await login("amr");
  d1 = await login("fdes1");
  d2 = await login("fdes2");
});

afterAll(() => {
  vi.unstubAllGlobals();
});

/** يحاكي رفعاً ناجحاً مباشرة إلى R2 ويُرجع مرفقاً جاهزاً للإرسال */
function uploaded(ownerId: string, scope: "tasks" | "feedback", o: { size?: number; type?: string; ext?: string; realSize?: number } = {}) {
  const ext = o.ext ?? "png";
  const key = `${scope}/${ownerId}/${randomUUID()}.${ext}`;
  const size = o.size ?? 1000;
  bucket.set(key, { size: o.realSize ?? size, type: o.type ?? "image/png" });
  return { id: `att_${randomUUID().slice(0, 8)}`, name: "pic.png", objectKey: key, mimeType: o.type ?? "image/png", size };
}

const mkTask = (token: string, attachments: unknown[]) => api(token).post("/api/tasks").send({ title: "مهمة", date: DAY, attachments });
const mkFeedback = (token: string, attachments: unknown[]) =>
  api(token).post("/api/feedback").send({ title: "ملاحظة", type: "idea", date: DAY, attachments });

describe("files: config و presign-upload", () => {
  it("بدون توكن ← 401", async () => {
    expect((await api().get("/api/files/config")).status).toBe(401);
    expect((await api().post("/api/files/presign-upload").send({})).status).toBe(401);
    expect((await api().delete("/api/files?key=x")).status).toBe(401);
  });

  it("config: مفعّل مع الحد والأنواع", async () => {
    const res = await api(d1).get("/api/files/config");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ enabled: true, maxFileSize: 1024 * 1024 });
    expect(res.body.allowedTypes).toEqual(expect.arrayContaining(["image/png", "image/jpeg"]));
  });

  it("presign-upload: المفتاح داخل نطاق المستخدم، والرابط يوقّع content-type", async () => {
    const res = await api(d1).post("/api/files/presign-upload").send({ scope: "tasks", mimeType: "image/png", size: 5000 });
    expect(res.status).toBe(200);
    expect(res.body.objectKey).toMatch(new RegExp(`^tasks/${d1Id}/[0-9a-f-]{36}\\.png$`));
    expect(res.body.uploadUrl).toContain("http://r2.test.invalid/test-bucket/tasks/");
    expect(res.body.uploadUrl).toContain("X-Amz-SignedHeaders=content-type%3Bhost");
    expect(res.body.headers).toEqual({ "Content-Type": "image/png" });
    expect(res.body.previewUrl).toContain("X-Amz-Signature=");
  });

  it("يرفض نوعاً غير مدعوم (svg/pdf/exe) ← 400", async () => {
    for (const mimeType of ["image/svg+xml", "application/pdf", "application/x-msdownload"]) {
      expect((await api(d1).post("/api/files/presign-upload").send({ scope: "tasks", mimeType, size: 100 })).status).toBe(400);
    }
  });

  it("يرفض نطاقاً غير معروف وحجماً غير صالح ← 400، وأكبر من الحد ← 413", async () => {
    expect((await api(d1).post("/api/files/presign-upload").send({ scope: "profiles", mimeType: "image/png", size: 100 })).status).toBe(400);
    expect((await api(d1).post("/api/files/presign-upload").send({ scope: "tasks", mimeType: "image/png", size: 0 })).status).toBe(400);
    expect((await api(d1).post("/api/files/presign-upload").send({ scope: "tasks", mimeType: "image/png", size: 1024 * 1024 + 1 })).status).toBe(413);
  });
});

describe("files: مرفقات المهام", () => {
  it("مصمم ينشئ مهمة بمرفق R2: يُحفظ ويعود برابط عرض، ويبقى بعد إعادة التحميل", async () => {
    const att = uploaded(d1Id, "tasks");
    const res = await mkTask(d1, [att]);
    expect(res.status).toBe(201);
    const [a] = res.body.task.attachments;
    expect(a).toMatchObject({ id: att.id, objectKey: att.objectKey, mimeType: "image/png", size: 1000 });
    expect(a.url).toContain(`/test-bucket/${att.objectKey}?`);
    expect(a.dataUrl).toBeUndefined();

    const list = await api(d1).get(`/api/tasks?date=${DAY}`);
    expect(list.body.tasks.find((t: any) => t.id === res.body.task.id).attachments[0].objectKey).toBe(att.objectKey);
  });

  it("رابط العرض الموقَّع لا يُخزَّن في قاعدة البيانات", async () => {
    const att = uploaded(d1Id, "tasks");
    const res = await api(d1).post("/api/tasks").send({ title: "x", date: DAY, attachments: [{ ...att, url: "https://evil.example/x.png" }] });
    expect(res.status).toBe(201);
    const row = await prisma().task.findUnique({ where: { id: res.body.task.id } });
    expect(JSON.stringify(row!.attachments)).not.toContain("url");
    expect(JSON.stringify(row!.attachments)).not.toContain("evil.example");
  });

  it("المرفقات القديمة (base64) ما زالت تُقبل، وتُخلط مع الجديدة", async () => {
    const att = uploaded(d1Id, "tasks");
    const res = await mkTask(d1, [{ id: "old", name: "o.png", dataUrl: "data:image/png;base64,AAAA" }, att]);
    expect(res.status).toBe(201);
    expect(res.body.task.attachments).toHaveLength(2);
    expect(res.body.task.attachments[0].dataUrl).toBe("data:image/png;base64,AAAA");
  });

  it("مفتاح كائن لم يُرفع ← 400", async () => {
    const ghost = { id: "g", name: "g.png", objectKey: `tasks/${d1Id}/${randomUUID()}.png`, mimeType: "image/png", size: 10 };
    expect((await mkTask(d1, [ghost])).status).toBe(400);
  });

  it("لا يمكن إرفاق ملف رفعه مستخدم آخر ← 403", async () => {
    const theirs = uploaded(d2Id, "tasks");
    expect((await mkTask(d1, [theirs])).status).toBe(403);
    expect(bucket.has(theirs.objectKey)).toBe(true); // لم يُحذف
  });

  it("مفتاح من نطاق آخر (feedback على مهمة) أو مزوَّر الشكل ← 400", async () => {
    expect((await mkTask(d1, [uploaded(d1Id, "feedback")])).status).toBe(400);
    const forged = { id: "f", name: "f.png", objectKey: `tasks/${d1Id}/../${d2Id}/x.png`, mimeType: "image/png", size: 10 };
    expect((await mkTask(d1, [forged])).status).toBe(400);
  });

  it("الحجم المُعلَن لا يطابق الفعلي ← 400 ويُحذف الكائن", async () => {
    const att = uploaded(d1Id, "tasks", { size: 500, realSize: 900 });
    expect((await mkTask(d1, [att])).status).toBe(400);
    expect(bucket.has(att.objectKey)).toBe(false);
  });

  it("كائن فعلي أكبر من الحد رغم إعلان صغير ← 400 ويُحذف", async () => {
    const att = uploaded(d1Id, "tasks", { size: 500, realSize: 2 * 1024 * 1024 });
    expect((await mkTask(d1, [att])).status).toBe(400);
    expect(bucket.has(att.objectKey)).toBe(false);
  });

  it("حجم مُعلَن فوق الحد ← 400 قبل أي فحص شبكي", async () => {
    const att = uploaded(d1Id, "tasks", { size: 2 * 1024 * 1024 });
    expect((await mkTask(d1, [att])).status).toBe(400);
  });

  it("نوع MIME لا يطابق امتداد المفتاح ← 400", async () => {
    const att = { ...uploaded(d1Id, "tasks", { ext: "png" }), mimeType: "image/jpeg" };
    expect((await mkTask(d1, [att])).status).toBe(400);
  });

  it("نوع غير مدعوم في المرفق (svg) ← 400", async () => {
    const att = { ...uploaded(d1Id, "tasks"), mimeType: "image/svg+xml" };
    expect((await mkTask(d1, [att])).status).toBe(400);
  });

  it("تعديل الإدارة: تحتفظ بمرفق المصمم دون أن تملكه، وإزالة مرفق تحذفه من R2", async () => {
    const keep = uploaded(d1Id, "tasks");
    const drop = uploaded(d1Id, "tasks");
    const created = await mkTask(d1, [keep, drop]);
    const id = created.body.task.id as string;

    const res = await api(manager).patch(`/api/tasks/${id}`).send({ attachments: [created.body.task.attachments[0]] });
    expect(res.status).toBe(200);
    expect(res.body.task.attachments).toHaveLength(1);
    expect(res.body.task.attachments[0].objectKey).toBe(keep.objectKey);
    expect(bucket.has(keep.objectKey)).toBe(true);
    expect(bucket.has(drop.objectKey)).toBe(false);
  });

  it("الإدارة لا تُرفق ملف مستخدم آخر أيضاً ← 403", async () => {
    const created = await mkTask(d1, []);
    const theirs = uploaded(d2Id, "tasks");
    expect((await api(manager).patch(`/api/tasks/${created.body.task.id}`).send({ attachments: [theirs] })).status).toBe(403);
  });

  it("مصمم آخر لا يقرأ مهمة غيره ولا مرفقاتها ← 403", async () => {
    const created = await mkTask(d1, [uploaded(d1Id, "tasks")]);
    expect((await api(d2).get(`/api/tasks/${created.body.task.id}`)).status).toBe(403);
  });

  it("حذف مهمة أم يحذف مرفقاتها ومرفقات مهامها الفرعية من R2", async () => {
    const parentAtt = uploaded(d1Id, "tasks");
    const parent = await mkTask(d1, [parentAtt]);
    const childAtt = uploaded(d1Id, "tasks");
    const child = await api(d1).post("/api/tasks").send({ title: "فرعية", date: DAY, parentId: parent.body.task.id, attachments: [childAtt] });
    expect(child.status).toBe(201);

    expect((await api(manager).delete(`/api/tasks/${parent.body.task.id}`)).status).toBe(200);
    expect(bucket.has(parentAtt.objectKey)).toBe(false);
    expect(bucket.has(childAtt.objectKey)).toBe(false);
  });
});

describe("files: مرفقات الملاحظات", () => {
  it("إنشاء وحذف ملاحظة بمرفق R2", async () => {
    const att = uploaded(d1Id, "feedback");
    const res = await mkFeedback(d1, [att]);
    expect(res.status).toBe(201);
    expect(res.body.feedback.attachments[0]).toMatchObject({ objectKey: att.objectKey });
    expect(res.body.feedback.attachments[0].url).toContain("X-Amz-Signature=");

    expect((await api(manager).delete(`/api/feedback/${res.body.feedback.id}`)).status).toBe(200);
    expect(bucket.has(att.objectKey)).toBe(false);
  });

  it("مفتاح مهمة على ملاحظة ← 400، ومفتاح مستخدم آخر ← 403", async () => {
    expect((await mkFeedback(d1, [uploaded(d1Id, "tasks")])).status).toBe(400);
    expect((await mkFeedback(d1, [uploaded(d2Id, "feedback")])).status).toBe(403);
  });

  it("الحذف الجماعي يحذف مرفقات كل الملاحظات المحذوفة", async () => {
    const a1 = uploaded(d1Id, "feedback");
    const a2 = uploaded(d2Id, "feedback");
    await mkFeedback(d1, [a1]);
    await mkFeedback(d2, [a2]);
    const res = await api(admin).post("/api/feedback/bulk-delete").send({});
    expect(res.status).toBe(200);
    expect(bucket.has(a1.objectKey)).toBe(false);
    expect(bucket.has(a2.objectKey)).toBe(false);
  });
});

describe("files: DELETE /api/files (ملف لم يُحفظ بعد)", () => {
  it("يحذف ملف المستخدم غير المرتبط بأي سجل", async () => {
    const att = uploaded(d1Id, "tasks");
    const res = await api(d1).delete(`/api/files?key=${encodeURIComponent(att.objectKey)}`);
    expect(res.status).toBe(200);
    expect(bucket.has(att.objectKey)).toBe(false);
  });

  it("ملف مستخدم آخر ← 403 ولا يُحذف", async () => {
    const theirs = uploaded(d2Id, "tasks");
    expect((await api(d1).delete(`/api/files?key=${encodeURIComponent(theirs.objectKey)}`)).status).toBe(403);
    expect(bucket.has(theirs.objectKey)).toBe(true);
  });

  it("ملف مستخدم في مهمة محفوظة ← 409 ولا يُحذف", async () => {
    const att = uploaded(d1Id, "tasks");
    expect((await mkTask(d1, [att])).status).toBe(201);
    expect((await api(d1).delete(`/api/files?key=${encodeURIComponent(att.objectKey)}`)).status).toBe(409);
    expect(bucket.has(att.objectKey)).toBe(true);
  });

  it("مفتاح غير صالح ← 400", async () => {
    expect((await api(d1).delete(`/api/files?key=${encodeURIComponent("../etc/passwd")}`)).status).toBe(400);
    expect((await api(d1).delete("/api/files")).status).toBe(400);
  });
});
