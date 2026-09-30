import { describe, it, expect } from "vitest";
import { buildPoolConfig } from "../src/db.ts";
import { loadEnv } from "../src/utils/env.ts";

const URL_SSL = "postgres://u:p@host.example:12345/db?sslmode=require";
const PEM = "-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----";

describe("buildPoolConfig", () => {
  it("بدون CA: يترك الرابط كما هو ولا يضيف ssl", () => {
    const cfg = buildPoolConfig(URL_SSL, undefined, 5);
    expect(cfg.connectionString).toBe(URL_SSL);
    expect(cfg.ssl).toBeUndefined();
    expect(cfg.max).toBe(5);
  });

  it("CA فارغ أو مسافات فقط: يُعامل كأنه غير موجود", () => {
    expect(buildPoolConfig(URL_SSL, "", 5).ssl).toBeUndefined();
    expect(buildPoolConfig(URL_SSL, "   ", 5).ssl).toBeUndefined();
  });

  it("مع CA: يُزيل sslmode ويفعّل التحقق الكامل", () => {
    const cfg = buildPoolConfig(URL_SSL, PEM, 3);
    expect(cfg.connectionString).not.toContain("sslmode");
    expect(cfg.ssl).toEqual({ ca: PEM, rejectUnauthorized: true });
  });

  it("يقبل \\n نصّية (الصق في متغيرات Render) ويحوّلها لأسطر حقيقية", () => {
    const flat = PEM.split("\n").join("\\n");
    const cfg = buildPoolConfig(URL_SSL, flat, 3);
    expect((cfg.ssl as { ca: string }).ca).toBe(PEM);
  });

  it("لا يعطّل التحقق من الشهادة أبداً", () => {
    const cfg = buildPoolConfig(URL_SSL, PEM, 3);
    expect((cfg.ssl as { rejectUnauthorized: boolean }).rejectUnauthorized).toBe(true);
  });

  it("يحافظ على باقي معاملات الرابط", () => {
    const cfg = buildPoolConfig("postgres://u:p@h:1/db?sslmode=require&application_name=x", PEM, 3);
    expect(cfg.connectionString).toContain("application_name=x");
  });
});

describe("loadEnv: DATABASE_CA_CERT", () => {
  const base = { DATABASE_URL: "postgres://x", JWT_SECRET: "a".repeat(16) };
  it("اختياري", () => {
    expect(loadEnv(base).DATABASE_CA_CERT).toBeUndefined();
  });
  it("يُمرَّر كما هو", () => {
    expect(loadEnv({ ...base, DATABASE_CA_CERT: PEM }).DATABASE_CA_CERT).toBe(PEM);
  });
});
