-- تقسيم سعر التكلفة إلى تكلفة الخامة + تكلفة وقت الماكينة
ALTER TABLE "ProductVariant" ADD COLUMN "materialCost" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "ProductVariant" ADD COLUMN "machineCost" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- المنتجات الحالية: كل التكلفة القديمة تُعتبر تكلفة خامة (وقت الماكينة = 0) فيبقى الإجمالي كما هو
UPDATE "ProductVariant" SET "materialCost" = "cost";
