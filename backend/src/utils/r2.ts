import { env } from "./env.js";
import { createR2Client, type R2Client } from "./r2Client.ts";

let cached: R2Client | null | undefined;

/** عميل R2 من متغيرات البيئة، أو null إن لم يُضبط R2 (وقتها تبقى المرفقات base64 كما كانت). */
export function r2(): R2Client | null {
  if (cached !== undefined) return cached;
  const e = env();
  cached =
    e.R2_ACCOUNT_ID && e.R2_ACCESS_KEY_ID && e.R2_SECRET_ACCESS_KEY && e.R2_BUCKET_NAME
      ? createR2Client({
          accountId: e.R2_ACCOUNT_ID,
          accessKeyId: e.R2_ACCESS_KEY_ID,
          secretAccessKey: e.R2_SECRET_ACCESS_KEY,
          bucket: e.R2_BUCKET_NAME,
          endpoint: e.R2_ENDPOINT,
        })
      : null;
  return cached;
}

export const maxFileBytes = () => Math.floor(env().R2_MAX_FILE_MB * 1024 * 1024);
