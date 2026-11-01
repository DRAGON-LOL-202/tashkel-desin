-- هل يظهر للمستخدم كرت مهام في لوحة المهام؟ الموجودون حالياً يبقون ظاهرين (DEFAULT true).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "showTaskCard" BOOLEAN NOT NULL DEFAULT true;
