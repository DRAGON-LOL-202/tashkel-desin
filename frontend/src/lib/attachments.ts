import type { ImageAttachment } from "../types";

/** مصدر عرض الصورة: رابط R2 الموقَّع إن وُجد، وإلا base64 القديم */
export function attachmentSrc(a: ImageAttachment): string {
  return a.url ?? a.dataUrl ?? "";
}

/** الشكل المُرسَل للحفظ: بدون url (مؤقت) وبدون حقول غير لازمة */
export function toAttachmentPayload(a: ImageAttachment) {
  if (a.objectKey) return { id: a.id, name: a.name, objectKey: a.objectKey, mimeType: a.mimeType, size: a.size };
  return { id: a.id, name: a.name, dataUrl: a.dataUrl };
}
