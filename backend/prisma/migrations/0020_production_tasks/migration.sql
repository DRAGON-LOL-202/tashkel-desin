-- مهام الإنتاج: لوحة ثانية بنفس نموذج المهام. كل المهام الموجودة تبقى في لوحة التصميم (DEFAULT 'DESIGN').
CREATE TYPE "TaskBoard" AS ENUM ('DESIGN', 'PRODUCTION');
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "board" "TaskBoard" NOT NULL DEFAULT 'DESIGN';
CREATE INDEX IF NOT EXISTS "Task_board_date_idx" ON "Task"("board", "date");

-- هل يظهر للمستخدم كرت في لوحة مهام الإنتاج؟ لا أحد يظهر افتراضياً؛ المدير يحدده.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "showProductionCard" BOOLEAN NOT NULL DEFAULT false;
