import bcrypt from "bcryptjs";
import { prisma, disconnect } from "../src/db.ts";
import { env } from "../src/utils/env.ts";

// مستخدمو النظام الثلاثة. كلمة المرور تُقرأ من ADMIN_PASSWORD ولا تُكتب في الكود.
const SYSTEM_USERS = [
  { key: "abdullah", name: "بشمهندس عبدالله", role: "MANAGER" as const, jobTitle: "مشرف الفريق", email: "abdullah@tashkeel.cnc" },
  { key: "amr", name: "عمرو", role: "MANAGER" as const, jobTitle: "مدير", email: "amr@tashkeel.cnc" },
];

export async function runSeed() {
  const e = env();
  const password = e.ADMIN_PASSWORD;
  if (!password || password.length < 8) {
    throw new Error("ADMIN_PASSWORD مطلوب (8 أحرف على الأقل) لتشغيل الـ seed");
  }
  const hash = await bcrypt.hash(password, 12);
  const db = prisma();

  const adminUsername = (e.ADMIN_USERNAME || "lol").toLowerCase();
  await db.user.upsert({
    where: { username: adminUsername },
    update: { name: "عبدالرحمن", role: "ADMIN", isSystemUser: true, isActive: true },
    create: {
      name: "عبدالرحمن",
      username: adminUsername,
      email: (e.ADMIN_EMAIL || "abdelrahman@tashkeel.cnc").toLowerCase(),
      passwordHash: hash,
      role: "ADMIN",
      jobTitle: "مدير النظام",
      isSystemUser: true,
    },
  });

  for (const u of SYSTEM_USERS) {
    await db.user.upsert({
      where: { username: u.key },
      update: { name: u.name, role: u.role, isSystemUser: true, isActive: true },
      create: {
        name: u.name,
        username: u.key,
        email: u.email,
        passwordHash: hash,
        role: u.role,
        jobTitle: u.jobTitle,
        isSystemUser: true,
      },
    });
  }
}

// تشغيل مباشر: tsx prisma/seed.ts
if (process.argv[1] && process.argv[1].endsWith("seed.ts")) {
  runSeed()
    .then(() => console.log("Seed completed"))
    .catch((err) => {
      console.error("Seed failed:", err.message);
      process.exitCode = 1;
    })
    .finally(disconnect);
}
