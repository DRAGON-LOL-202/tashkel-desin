-- مستوى وصول المستخدم للمخزون: NONE (بلا وصول) / WITHDRAW (السحب فقط) / FULL (المخزون كامل).
DO $$ BEGIN
  CREATE TYPE "InventoryAccess" AS ENUM ('NONE', 'WITHDRAW', 'FULL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "inventoryAccess" "InventoryAccess" NOT NULL DEFAULT 'NONE';

-- المصممون الحاليون يحتفظون بوصولهم الحالي (مخزون كامل). الجدد يبدأون بلا وصول.
UPDATE "User" SET "inventoryAccess" = 'FULL' WHERE "role" = 'DESIGNER';

-- التصنيفات المسموح السحب منها لدوري «تعبئة» و«مشغل».
CREATE TABLE IF NOT EXISTS "UserInventoryCategory" (
  "userId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserInventoryCategory_pkey" PRIMARY KEY ("userId", "categoryId")
);

CREATE INDEX IF NOT EXISTS "UserInventoryCategory_categoryId_idx" ON "UserInventoryCategory"("categoryId");

DO $$ BEGIN
  ALTER TABLE "UserInventoryCategory" ADD CONSTRAINT "UserInventoryCategory_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "UserInventoryCategory" ADD CONSTRAINT "UserInventoryCategory_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "InventoryCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
