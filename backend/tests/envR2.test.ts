import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/utils/env.ts";

const base = { DATABASE_URL: "postgres://u:p@h/db", JWT_SECRET: "0123456789abcdef0123" };
const r2 = { R2_ACCOUNT_ID: "a", R2_ACCESS_KEY_ID: "k", R2_SECRET_ACCESS_KEY: "s", R2_BUCKET_NAME: "b" };

describe("loadEnv: متغيرات R2", () => {
  it("بدونها: صالح وR2 غير مضبوط", () => {
    const e = loadEnv(base as NodeJS.ProcessEnv);
    expect(e.R2_BUCKET_NAME).toBeUndefined();
    expect(e.R2_MAX_FILE_MB).toBe(10);
  });
  it("قيم فارغة (R2_ACCOUNT_ID= في .env) تُعامَل كغير مضبوطة", () => {
    const e = loadEnv({ ...base, R2_ACCOUNT_ID: "", R2_BUCKET_NAME: "  " } as NodeJS.ProcessEnv);
    expect(e.R2_ACCOUNT_ID).toBeUndefined();
    expect(e.R2_BUCKET_NAME).toBeUndefined();
  });
  it("الأربعة معاً: صالح", () => {
    expect(loadEnv({ ...base, ...r2 } as NodeJS.ProcessEnv).R2_BUCKET_NAME).toBe("b");
  });
  it("ضبط بعضها فقط ← خطأ يسمّي الحقول الناقصة بدون كشف القيم", () => {
    expect(() => loadEnv({ ...base, R2_ACCOUNT_ID: "a", R2_SECRET_ACCESS_KEY: "TOPSECRET" } as NodeJS.ProcessEnv)).toThrowError(/R2_ACCESS_KEY_ID.*R2_BUCKET_NAME|R2_BUCKET_NAME.*R2_ACCESS_KEY_ID/s);
    try {
      loadEnv({ ...base, R2_ACCOUNT_ID: "a", R2_SECRET_ACCESS_KEY: "TOPSECRET" } as NodeJS.ProcessEnv);
    } catch (e) {
      expect(String(e)).not.toContain("TOPSECRET");
    }
  });
});
