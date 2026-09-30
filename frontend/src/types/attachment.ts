/**
 * مرفق صورة. شكلان:
 *  - قديم: dataUrl (base64 داخل الصف) — يبقى صالحاً.
 *  - جديد: objectKey/mimeType/size (الملف في Cloudflare R2) + url رابط عرض موقَّع من الخادم (مؤقت، لا يُرسل للحفظ).
 */
export interface ImageAttachment {
  id: string;
  name: string;
  dataUrl?: string;
  objectKey?: string;
  mimeType?: string;
  size?: number;
  url?: string;
}
