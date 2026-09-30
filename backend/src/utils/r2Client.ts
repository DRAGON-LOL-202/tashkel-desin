// عميل Cloudflare R2 (متوافق مع S3) فوق presign() — بدون AWS SDK.
// دالة صرفة: الإعداد وfetch يُمرَّران من الخارج، لتُختبر بدون شبكة (انظر tests/r2Client.test.ts).
import { presign } from "./s3sign.ts";

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** اختياري: بديل للعنوان الافتراضي https://<account>.r2.cloudflarestorage.com (للاختبار المحلي مثلاً) */
  endpoint?: string;
}

export interface HeadResult {
  exists: boolean;
  size?: number;
  contentType?: string;
}

type FetchLike = (url: string, init: { method: string; signal?: AbortSignal }) => Promise<{ status: number; ok: boolean; headers: { get(name: string): string | null } }>;

const REGION = "auto";
const SERVICE = "s3";
const UPLOAD_TTL_SEC = 600; // رابط الرفع صالح 10 دقائق
const READ_WINDOW_SEC = 3600; // روابط العرض: تُقرَّب لبداية الساعة وتصلح ساعتين (تبقى ثابتة داخل الساعة فيستفيد كاش المتصفح)
const NET_TIMEOUT_MS = 8000;

export function createR2Client(cfg: R2Config, fetchFn: FetchLike = (url, init) => globalThis.fetch(url, init) as ReturnType<FetchLike>) {
  const base = new URL(cfg.endpoint ?? `https://${cfg.accountId}.r2.cloudflarestorage.com`);
  const protocol = base.protocol as "https:" | "http:";

  const sign = (method: "GET" | "PUT" | "HEAD" | "DELETE", key: string, expiresSec: number, date: Date, signedHeaders?: Record<string, string>) =>
    presign({
      method,
      protocol,
      host: base.host,
      path: `/${cfg.bucket}/${key}`,
      region: REGION,
      service: SERVICE,
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
      expiresSec,
      date,
      signedHeaders,
    });

  return {
    /** رابط رفع مباشر من المتصفح. يجب أن يرسل العميل Content-Type بنفس القيمة الموقَّعة. */
    presignPut(key: string, contentType: string, now: Date = new Date()) {
      return {
        url: sign("PUT", key, UPLOAD_TTL_SEC, now, { "content-type": contentType }),
        headers: { "Content-Type": contentType },
        expiresIn: UPLOAD_TTL_SEC,
      };
    },

    /** رابط قراءة للعرض. متزامن، فيصلح للاستخدام داخل المُسلسِلات (serializers). */
    presignGet(key: string, now: Date = new Date()): string {
      const floored = new Date(Math.floor(now.getTime() / (READ_WINDOW_SEC * 1000)) * READ_WINDOW_SEC * 1000);
      return sign("GET", key, READ_WINDOW_SEC * 2, floored);
    },

    async head(key: string, now: Date = new Date()): Promise<HeadResult> {
      const res = await fetchFn(sign("HEAD", key, 60, now), { method: "HEAD", signal: AbortSignal.timeout(NET_TIMEOUT_MS) });
      if (res.status === 404) return { exists: false };
      if (!res.ok) throw new Error(`R2 HEAD فشل (${res.status})`);
      const len = Number(res.headers.get("content-length"));
      return { exists: true, size: Number.isFinite(len) ? len : undefined, contentType: res.headers.get("content-type")?.toLowerCase() ?? undefined };
    },

    /** حذف كائن. 404 يُعدّ نجاحاً. لا يرمي أبداً: يُرجع false عند الفشل ليبقى الحذف "أفضل جهد". */
    async remove(key: string, now: Date = new Date()): Promise<boolean> {
      try {
        const res = await fetchFn(sign("DELETE", key, 60, now), { method: "DELETE", signal: AbortSignal.timeout(NET_TIMEOUT_MS) });
        return res.ok || res.status === 404;
      } catch {
        return false;
      }
    },
  };
}

export type R2Client = ReturnType<typeof createR2Client>;
