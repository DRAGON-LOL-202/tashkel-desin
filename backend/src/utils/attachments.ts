// طبقة الخادم للمرفقات: التسلسل للواجهة + التحقق من صلاحية المرفقات الجديدة + الحذف من R2.
import { prisma } from "../db.js";
import { forbidden, badRequest, HttpError } from "./httpError.js";
import { maxFileBytes, r2 } from "./r2.js";
import type { HeadResult } from "./r2Client.ts";
import {
  ALLOWED_IMAGE_TYPES,
  ALLOWED_IMAGE_TYPE_LIST,
  isR2Attachment,
  keysOf,
  parseObjectKey,
  serializeAttachmentsWith,
  type AllowedImageType,
  type AttachmentData,
  type AttachmentScope,
} from "./attachmentKeys.ts";

export function serializeAttachments(raw: unknown): unknown[] {
  const client = r2();
  return serializeAttachmentsWith(raw, client ? (key) => client.presignGet(key) : () => undefined);
}

/**
 * يتحقق من المرفقات المُرسَلة قبل حفظها:
 *  - المرفق الموجود أصلاً في السجل يمر كما هو (مثلاً تعديل الإدارة لمهمة رفع مرفقاتها المصمم).
 *  - المرفق الجديد: مفتاحه صحيح الشكل ومن نطاق هذا المورد، ومرفوع باسم المستخدم الحالي نفسه،
 *    وامتداده يطابق mimeType، والكائن موجود فعلاً في R2 وحجمه ونوعه مقبولان ويطابقان المُعلَن.
 */
export async function assertAttachmentsAllowed(
  userId: string,
  scope: AttachmentScope,
  incoming: AttachmentData[],
  existingRaw: unknown
): Promise<void> {
  const known = new Set(keysOf(existingRaw));
  const fresh = incoming.filter(isR2Attachment).filter((a) => !known.has(a.objectKey));
  if (fresh.length === 0) return;

  const client = r2();
  if (!client) throw badRequest("تخزين الملفات غير مُفعّل على الخادم");

  const seen = new Set<string>();
  for (const a of fresh) {
    if (seen.has(a.objectKey)) throw badRequest("مرفق مكرَّر");
    seen.add(a.objectKey);
    const parsed = parseObjectKey(a.objectKey);
    if (!parsed || parsed.scope !== scope) throw badRequest("مفتاح المرفق غير صالح");
    if (parsed.ownerId !== userId) throw forbidden("لا يمكنك إرفاق ملف رفعه مستخدم آخر");
    if (ALLOWED_IMAGE_TYPES[a.mimeType] !== parsed.ext) throw badRequest("نوع المرفق لا يطابق مفتاحه");
    if (a.size > maxFileBytes()) throw badRequest("حجم المرفق أكبر من المسموح");
  }

  let heads: HeadResult[];
  try {
    heads = await Promise.all(fresh.map((a) => client.head(a.objectKey)));
  } catch {
    throw new HttpError(502, "تعذّر التحقق من المرفقات، حاول لاحقاً", "STORAGE_ERROR");
  }

  for (let i = 0; i < fresh.length; i++) {
    const a = fresh[i];
    const h = heads[i];
    if (!h.exists) throw badRequest("أحد المرفقات لم يُرفع بعد");
    if (h.size === undefined || h.size > maxFileBytes() || h.size !== a.size) {
      // كائن أكبر من المسموح أو لا يطابق ما أُعلن: نحذفه ونرفض
      await client.remove(a.objectKey);
      throw badRequest("حجم المرفق لا يطابق المُعلَن أو يتجاوز الحد");
    }
    if (h.contentType !== undefined && !ALLOWED_IMAGE_TYPE_LIST.includes(h.contentType as AllowedImageType)) {
      await client.remove(a.objectKey);
      throw badRequest("نوع الملف المرفوع غير مدعوم");
    }
  }
}

/** حذف كائنات R2 بأفضل جهد (لا يرمي): يُستدعى بعد نجاح تعديل/حذف السجل في قاعدة البيانات. */
export async function deleteStoredObjects(keys: string[]): Promise<void> {
  const client = r2();
  if (!client || keys.length === 0) return;
  const unique = [...new Set(keys)];
  for (let i = 0; i < unique.length; i += 5) {
    await Promise.all(unique.slice(i, i + 5).map((k) => client.remove(k)));
  }
}

/** هل المفتاح مُشار إليه من أي مهمة أو ملاحظة؟ (يمنع حذف ملف مستخدم فعلاً) */
export async function isKeyReferenced(key: string): Promise<boolean> {
  const db = prisma();
  const probe = { array_contains: [{ objectKey: key }] };
  const [task, feedback] = await Promise.all([
    db.task.findFirst({ where: { attachments: probe }, select: { id: true } }),
    db.feedback.findFirst({ where: { attachments: probe }, select: { id: true } }),
  ]);
  return !!(task || feedback);
}
