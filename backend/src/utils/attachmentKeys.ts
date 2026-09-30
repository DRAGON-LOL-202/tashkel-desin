// منطق صرف لمفاتيح المرفقات وشكلها المخزَّن (بلا اعتماديات — يُختبر مباشرة).
//
// شكل المرفق في عمود Json (Task.attachments / Feedback.attachments):
//   قديم : { id, name, dataUrl }                          — base64 داخل الصف، يبقى صالحاً
//   جديد : { id, name, objectKey, mimeType, size }        — الملف في R2
// حقل url لا يُخزَّن أبداً؛ يُولَّد عند الإرسال للواجهة (رابط قراءة موقَّع).

export const ALLOWED_IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
} as const;
export type AllowedImageType = keyof typeof ALLOWED_IMAGE_TYPES;
export const ALLOWED_IMAGE_TYPE_LIST = Object.keys(ALLOWED_IMAGE_TYPES) as AllowedImageType[];

export type AttachmentScope = "tasks" | "feedback";

// <scope>/<ownerUserId>/<uuid>.<ext> — اسم الملف الأصلي لا يدخل المفتاح إطلاقاً (لا حروف خاصة ولا تخمين)
const KEY_RE = /^(tasks|feedback)\/([A-Za-z0-9_-]{1,64})\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(jpg|png|webp|gif)$/;

export interface ParsedKey {
  scope: AttachmentScope;
  ownerId: string;
  uuid: string;
  ext: string;
}

export function parseObjectKey(key: string): ParsedKey | null {
  const m = KEY_RE.exec(key);
  if (!m) return null;
  return { scope: m[1] as AttachmentScope, ownerId: m[2], uuid: m[3], ext: m[4] };
}

export function buildObjectKey(scope: AttachmentScope, ownerId: string, uuid: string, mime: AllowedImageType): string {
  return `${scope}/${ownerId}/${uuid}.${ALLOWED_IMAGE_TYPES[mime]}`;
}

export interface R2AttachmentData {
  id: string;
  name: string;
  objectKey: string;
  mimeType: AllowedImageType;
  size: number;
}
export interface LegacyAttachmentData {
  id: string;
  name: string;
  dataUrl: string;
}
export type AttachmentData = R2AttachmentData | LegacyAttachmentData;

export const isR2Attachment = (a: AttachmentData): a is R2AttachmentData => "objectKey" in a;

function rawObjects(raw: unknown): Record<string, unknown>[] {
  return Array.isArray(raw) ? raw.filter((x): x is Record<string, unknown> => !!x && typeof x === "object") : [];
}

/** مفاتيح R2 داخل قيمة مخزَّنة (متسامحة مع أي شكل قديم أو تالف) */
export function keysOf(raw: unknown): string[] {
  return rawObjects(raw).flatMap((a) => (typeof a.objectKey === "string" ? [a.objectKey] : []));
}

/** مفاتيح كانت في القيمة القديمة ولم تعد في الجديدة */
export function removedKeys(before: unknown, after: unknown): string[] {
  const keep = new Set(keysOf(after));
  return keysOf(before).filter((k) => !keep.has(k));
}

/** التسلسل للواجهة: مرفقات R2 تحصل على url موقَّع، والقديمة تمر كما هي */
export function serializeAttachmentsWith(raw: unknown, urlFor: (key: string) => string | undefined): unknown[] {
  return rawObjects(raw).map((a) => {
    if (typeof a.objectKey !== "string") return a;
    const url = urlFor(a.objectKey);
    return { id: a.id, name: a.name, objectKey: a.objectKey, mimeType: a.mimeType, size: a.size, ...(url ? { url } : {}) };
  });
}
