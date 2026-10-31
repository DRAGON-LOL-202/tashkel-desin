-- استكمال جداول المخزون (التصنيفات، الأسعار، الجرد، المرتجعات، التنبيهات) بشكل آمن دون فقد أي بيانات.

ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'RETURN';

-- حقول تصنيفات المخزون
ALTER TABLE "InventoryCategory" ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL DEFAULT '';
ALTER TABLE "InventoryCategory" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- حقول عناصر المخزون (سعر الوحدة وعلم عدم تكرار إشعار النقص)
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "unitPrice" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "lowAlertSent" BOOLEAN NOT NULL DEFAULT false;

DO $$ BEGIN
  ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_unitPrice_nonneg" CHECK ("unitPrice" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- حقول حركات المخزون (الرصيد السابق، لقطة السعر وقت الحركة، السبب، رقم العملية المرجعية)
ALTER TABLE "InventoryMovement" ADD COLUMN IF NOT EXISTS "previousBalance" DECIMAL(14,3) NOT NULL DEFAULT 0;
ALTER TABLE "InventoryMovement" ADD COLUMN IF NOT EXISTS "unitPriceSnapshot" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "InventoryMovement" ADD COLUMN IF NOT EXISTS "reason" TEXT NOT NULL DEFAULT '';
ALTER TABLE "InventoryMovement" ADD COLUMN IF NOT EXISTS "referenceId" TEXT;

-- تحديث الرصيد السابق للحركات القديمة إن وُجدت (balanceAfter - delta)
UPDATE "InventoryMovement"
SET "previousBalance" = "balanceAfter" - "delta"
WHERE "previousBalance" = 0 AND ("balanceAfter" - "delta") <> 0;

CREATE INDEX IF NOT EXISTS "InventoryMovement_type_createdAt_idx" ON "InventoryMovement"("type", "createdAt");
