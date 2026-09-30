import { z } from "zod";
import { ALLOWED_IMAGE_TYPE_LIST, type AllowedImageType } from "../utils/attachmentKeys.ts";

const id = z.string().min(1).max(100);
const name = z.string().max(255);

// قديم: صورة base64 داخل الصف (الحد الكلي للطلب 15MB في app.ts)
const legacyAttachment = z.object({
  id,
  name,
  dataUrl: z.string().startsWith("data:image/").max(8_000_000),
});

// جديد: مرجع لكائن في R2. حقل url (رابط العرض الموقَّع) يُهمَل هنا ولا يُخزَّن.
// صلاحية المفتاح وملكيته ووجود الكائن تُفحص في assertAttachmentsAllowed (تحتاج المستخدم والشبكة).
const r2Attachment = z.object({
  id,
  name,
  objectKey: z.string().min(1).max(300),
  mimeType: z.enum(ALLOWED_IMAGE_TYPE_LIST as [AllowedImageType, ...AllowedImageType[]]),
  size: z.number().int().positive().max(100 * 1024 * 1024),
});

export const attachmentsSchema = z.array(z.union([r2Attachment, legacyAttachment])).max(20);

export const presignUploadSchema = z.object({
  scope: z.enum(["tasks", "feedback"]),
  mimeType: z.enum(ALLOWED_IMAGE_TYPE_LIST as [AllowedImageType, ...AllowedImageType[]], { message: "نوع الملف غير مدعوم (JPG أو PNG أو WebP أو GIF)" }),
  size: z.number().int().positive(),
});

export const deleteFileQuerySchema = z.object({ key: z.string().min(1).max(300) });
