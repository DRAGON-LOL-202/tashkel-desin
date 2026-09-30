import { Router } from "express";
import { randomUUID } from "node:crypto";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { forbidden, HttpError, badRequest } from "../utils/httpError.js";
import { maxFileBytes, r2 } from "../utils/r2.js";
import { deleteStoredObjects, isKeyReferenced } from "../utils/attachments.js";
import { ALLOWED_IMAGE_TYPE_LIST, buildObjectKey, parseObjectKey } from "../utils/attachmentKeys.ts";
import { deleteFileQuerySchema, presignUploadSchema } from "../validators/attachments.js";

export const filesRouter = Router();
filesRouter.use(requireAuth);

// الواجهة تسأل أولاً: هل رفع الملفات إلى R2 مفعّل؟ (وإلا تستعمل base64 القديم)
filesRouter.get("/config", (_req, res) => {
  res.json({ enabled: r2() !== null, maxFileSize: maxFileBytes(), allowedTypes: ALLOWED_IMAGE_TYPE_LIST });
});

// رابط رفع مباشر إلى R2. أي مستخدم مفعّل يرفع باسمه هو فقط: معرّفه جزء من المفتاح، ويُفحص عند حفظ المرفق.
filesRouter.post(
  "/presign-upload",
  asyncHandler(async (req, res) => {
    const client = r2();
    if (!client) throw new HttpError(503, "تخزين الملفات غير مُفعّل على الخادم", "R2_NOT_CONFIGURED");
    const body = presignUploadSchema.parse(req.body);
    if (body.size > maxFileBytes()) throw new HttpError(413, "حجم الملف أكبر من المسموح", "FILE_TOO_LARGE");

    const objectKey = buildObjectKey(body.scope, req.user!.id, randomUUID(), body.mimeType);
    const put = client.presignPut(objectKey, body.mimeType);
    res.json({ objectKey, uploadUrl: put.url, headers: put.headers, expiresIn: put.expiresIn, previewUrl: client.presignGet(objectKey) });
  })
);

// حذف ملف رفعه المستخدم ولم يُحفظ في أي سجل بعد (مثلاً أزال المرفق قبل حفظ النموذج).
// حذف مرفقات السجلات المحفوظة يتم تلقائياً عند تعديل/حذف المهمة أو الملاحظة.
filesRouter.delete(
  "/",
  asyncHandler(async (req, res) => {
    if (!r2()) throw new HttpError(503, "تخزين الملفات غير مُفعّل على الخادم", "R2_NOT_CONFIGURED");
    const { key } = deleteFileQuerySchema.parse(req.query);
    const parsed = parseObjectKey(key);
    if (!parsed) throw badRequest("مفتاح الملف غير صالح");
    if (parsed.ownerId !== req.user!.id) throw forbidden("لا يمكنك حذف ملف مستخدم آخر");
    if (await isKeyReferenced(key)) throw new HttpError(409, "الملف مستخدم في سجل محفوظ", "CONFLICT");
    await deleteStoredObjects([key]);
    res.json({ ok: true });
  })
);
