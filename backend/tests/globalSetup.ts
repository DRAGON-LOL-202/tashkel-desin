import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

// قاعدة Postgres حقيقية (WASM) في الذاكرة — لا تلمس أي قاعدة خارجية.
let server: PGLiteSocketServer;
let db: PGlite;

export async function setup() {
  db = await PGlite.create();
  await db.exec(readFileSync(new URL("../prisma/migrations/0001_init/migration.sql", import.meta.url), "utf8"));
  server = new PGLiteSocketServer({ db, port: 54329, host: "127.0.0.1" });
  await server.start();
  process.env.DATABASE_URL = "postgresql://postgres@127.0.0.1:54329/postgres";
  process.env.JWT_SECRET = "test-only-jwt-secret-not-real-0123456789";
  process.env.FRONTEND_URL = "http://localhost:5173";
  process.env.ADMIN_PASSWORD = "test-only-pass-1234";
  // R2 وهمي: العنوان غير موجود فعلياً، واختبارات الملفات تستبدل fetch بـ "bucket" في الذاكرة.
  process.env.R2_ACCOUNT_ID = "test-account";
  process.env.R2_ACCESS_KEY_ID = "test-access-key";
  process.env.R2_SECRET_ACCESS_KEY = "test-secret-key";
  process.env.R2_BUCKET_NAME = "test-bucket";
  process.env.R2_ENDPOINT = "http://r2.test.invalid";
  process.env.R2_MAX_FILE_MB = "1";
}

export async function teardown() {
  await server?.stop();
  await db?.close();
}
