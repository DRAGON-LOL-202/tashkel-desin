-- يجعل جداول المخزون مطابقة للشكل النهائي أياً كانت نسخة 0008 المطبَّقة سابقاً.
-- كل أمر هنا آمن للتكرار ولا يحذف بيانات (عدا عمود productId القديم الذي أُلغي ربطه).

DO $$ BEGIN
  CREATE TYPE "InventoryMovementType" AS ENUM ('IN', 'OUT', 'ADJUST');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "InventoryCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "InventoryItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'قطعة',
    "quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "minQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "InventoryMovement" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "type" "InventoryMovementType" NOT NULL,
    "delta" DECIMAL(14,3) NOT NULL,
    "balanceAfter" DECIMAL(14,3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- أعمدة العنصر (النسخ القديمة قد تفتقر لبعضها)
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "categoryId" TEXT;
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "attachments" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "sku" TEXT;
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "notes" TEXT NOT NULL DEFAULT '';
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

-- النسخة الأولى كانت تسمي الكود "code": ننقل قيمه إلى sku إن وُجد
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'InventoryItem' AND column_name = 'code') THEN
    UPDATE "InventoryItem" SET "sku" = "code" WHERE "sku" IS NULL AND "code" IS NOT NULL;
    ALTER TABLE "InventoryItem" DROP COLUMN "code";
  END IF;
END $$;

-- إلغاء ربط المنتجات
ALTER TABLE "InventoryItem" DROP COLUMN IF EXISTS "productId";

-- أعمدة الحركة
ALTER TABLE "InventoryMovement" ADD COLUMN IF NOT EXISTS "note" TEXT NOT NULL DEFAULT '';
ALTER TABLE "InventoryMovement" ADD COLUMN IF NOT EXISTS "batchId" TEXT;

-- تصنيف افتراضي للعناصر القديمة بلا تصنيف، ثم جعل التصنيف إلزامياً
INSERT INTO "InventoryCategory" ("id", "name")
SELECT 'inv-cat-default', 'عام'
WHERE EXISTS (SELECT 1 FROM "InventoryItem" WHERE "categoryId" IS NULL)
  AND NOT EXISTS (SELECT 1 FROM "InventoryCategory" WHERE "id" = 'inv-cat-default');

UPDATE "InventoryItem" SET "categoryId" = 'inv-cat-default' WHERE "categoryId" IS NULL;
ALTER TABLE "InventoryItem" ALTER COLUMN "categoryId" SET NOT NULL;

-- الفهارس
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryItem_sku_key" ON "InventoryItem"("sku");
CREATE INDEX IF NOT EXISTS "InventoryItem_categoryId_idx" ON "InventoryItem"("categoryId");
CREATE INDEX IF NOT EXISTS "InventoryItem_isActive_idx" ON "InventoryItem"("isActive");
CREATE INDEX IF NOT EXISTS "InventoryMovement_itemId_createdAt_idx" ON "InventoryMovement"("itemId", "createdAt");
CREATE INDEX IF NOT EXISTS "InventoryMovement_batchId_idx" ON "InventoryMovement"("batchId");

-- القيود
DO $$ BEGIN
  ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_quantity_nonneg" CHECK ("quantity" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_minQuantity_nonneg" CHECK ("minQuantity" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "InventoryCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
