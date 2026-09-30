import { api, ApiError } from "../lib/api";
import { generateId } from "../lib/id";
import type { ImageAttachment } from "../types";

export type UploadScope = "tasks" | "feedback";

export interface FilesConfig {
  enabled: boolean;
  maxFileSize: number;
  allowedTypes: string[];
}

interface PresignResponse {
  objectKey: string;
  uploadUrl: string;
  headers: Record<string, string>;
  previewUrl: string;
}

let configPromise: Promise<FilesConfig> | null = null;

/** هل رفع الملفات إلى R2 مفعّل على الخادم؟ يُخزَّن الجواب طوال الجلسة (وتُعاد المحاولة عند فشل الطلب). */
export function getFilesConfig(): Promise<FilesConfig> {
  if (!configPromise) {
    configPromise = api<FilesConfig>("/files/config").catch((error: unknown) => {
      configPromise = null;
      throw error;
    });
  }
  return configPromise;
}

/** يطلب رابط رفع من الخادم ثم يرفع الملف مباشرة إلى R2 (لا يمر عبر الخادم). */
export async function uploadImage(file: File, scope: UploadScope): Promise<ImageAttachment> {
  const presign = await api<PresignResponse>("/files/presign-upload", {
    method: "POST",
    body: { scope, mimeType: file.type, size: file.size },
  });

  let response: Response;
  try {
    response = await fetch(presign.uploadUrl, { method: "PUT", headers: presign.headers, body: file });
  } catch {
    // فشل شبكي، وغالباً سببه قاعدة CORS ناقصة في bucket على Cloudflare
    throw new ApiError("تعذّر رفع الملف. تحقق من الاتصال ومن إعداد CORS للـ bucket", 0);
  }
  if (!response.ok) throw new ApiError(`فشل رفع الملف (${response.status})`, response.status);

  return { id: generateId("attachment"), name: file.name, objectKey: presign.objectKey, mimeType: file.type, size: file.size, url: presign.previewUrl };
}

/** حذف ملف رُفع ولم يُحفظ في أي سجل بعد. الخادم يرفض حذف ما هو مستخدم فعلاً (409) فنتجاهل الأخطاء. */
export async function discardUpload(objectKey: string): Promise<void> {
  try {
    await api("/files", { method: "DELETE", query: { key: objectKey } });
  } catch {
    // أفضل جهد
  }
}
