import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  datasource: {
    // fallback فقط ليعمل `prisma generate` بدون قاعدة بيانات؛ لا يحتوي أي سر
    url: process.env.DATABASE_URL ?? "postgresql://localhost:5432/placeholder",
  },
});
