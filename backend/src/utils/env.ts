import "dotenv/config";
import { z } from "zod";

// قيمة فارغة (مثل R2_ACCOUNT_ID= في .env) تُعامَل كأنها غير مضبوطة
const optionalText = z
  .string()
  .optional()
  .transform((v) => v?.trim() || undefined);

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().min(1, "DATABASE_URL مطلوب"),
    JWT_SECRET: z.string().min(16, "JWT_SECRET يجب ألا يقل عن 16 حرفاً"),
    PORT: z.coerce.number().int().positive().default(4000),
    FRONTEND_URL: z.string().default("http://localhost:5173"),
    // شهادة CA لقاعدة البيانات (PEM) — اختيارية؛ مطلوبة عادةً مع Aiven. تُقبل \n نصّية بدل أسطر جديدة.
    DATABASE_CA_CERT: z.string().optional(),
    DB_POOL_MAX: z.coerce.number().int().positive().default(10),
    ADMIN_USERNAME: z.string().optional(),
    ADMIN_PASSWORD: z.string().optional(),
    ADMIN_EMAIL: z.string().optional(),
    // Cloudflare R2 (اختياري): بدون هذه المتغيرات يعمل التطبيق كما كان (مرفقات base64 داخل قاعدة البيانات).
    R2_ACCOUNT_ID: optionalText,
    R2_ACCESS_KEY_ID: optionalText,
    R2_SECRET_ACCESS_KEY: optionalText,
    R2_BUCKET_NAME: optionalText,
    R2_ENDPOINT: optionalText, // بديل للعنوان الافتراضي (اختباري/محلي فقط)
    R2_MAX_FILE_MB: z.coerce.number().positive().max(50).default(10),
  })
  .superRefine((v, ctx) => {
    const required = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"] as const;
    const set = required.filter((k) => v[k]);
    if (set.length > 0 && set.length < required.length) {
      for (const k of required.filter((k) => !v[k])) {
        ctx.addIssue({ code: "custom", path: [k], message: "مطلوب عند ضبط أي متغير R2 (اضبط الأربعة معاً أو لا شيء)" });
      }
    }
  });

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    // نطبع أسماء الحقول فقط، وليس القيم
    const fields = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`متغيرات البيئة غير صالحة — ${fields}`);
  }
  return parsed.data;
}

let cached: Env | null = null;
export function env(): Env {
  if (!cached) cached = loadEnv();
  return cached;
}
