import { PrismaPg } from "@prisma/adapter-pg";
import type { PoolConfig } from "pg";
import { PrismaClient } from "./generated/prisma/client.ts";
import { env } from "./utils/env.js";

let client: PrismaClient | null = null;

/**
 * إعداد اتصال pg. بدون CA: يُترك الرابط كما هو (sslmode في الرابط).
 * مع CA (Aiven مثلاً): نُزيل sslmode من الرابط ونمرّر ssl مع التحقق الكامل من الشهادة
 * (لا نعطّل التحقق أبداً). التحقق الكامل يعني أن شهادة الخادم يجب أن تُوقَّع من هذا الـ CA.
 */
export function buildPoolConfig(databaseUrl: string, caCert: string | undefined, max: number): PoolConfig {
  const ca = caCert?.split("\\n").join("\n").trim();
  if (!ca) return { connectionString: databaseUrl, max };
  const url = new URL(databaseUrl);
  url.searchParams.delete("sslmode");
  return { connectionString: url.toString(), max, ssl: { ca, rejectUnauthorized: true } };
}

export function prisma(): PrismaClient {
  if (!client) {
    const e = env();
    const adapter = new PrismaPg(buildPoolConfig(e.DATABASE_URL, e.DATABASE_CA_CERT, e.DB_POOL_MAX));
    client = new PrismaClient({ adapter });
  }
  return client;
}

export async function disconnect(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = null;
  }
}
