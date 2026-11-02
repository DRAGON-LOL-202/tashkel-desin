-- سعر البيع لعناصر المخزون (الموجودة حالياً تبدأ بـ 0)
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "sellPrice" DECIMAL(14,2) NOT NULL DEFAULT 0;
