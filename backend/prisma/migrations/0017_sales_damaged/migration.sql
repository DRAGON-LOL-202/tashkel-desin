-- مرتجع المبيعات: تحديد المكونات التالفة (لا تعود للمخزون)
ALTER TABLE "SalesOrderComponent" ADD COLUMN "damaged" BOOLEAN NOT NULL DEFAULT false;
