-- سعر البوكس الثابت اليدوي على المنتج الثابت + سعر الإضافة والحذف على أصناف المخزون
ALTER TABLE "SalesProduct" ADD COLUMN "fixedPrice" DECIMAL(12,2);
ALTER TABLE "InventoryItem" ADD COLUMN "addPrice" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "InventoryItem" ADD COLUMN "removePrice" DECIMAL(14,2) NOT NULL DEFAULT 0;
