-- علامة «مرتجع»: تنبيه من الشركة للموظف لمراجعة الأوردر وتسجيله مرتجعاً (لا تغيّر الحالة ولا المخزون)
ALTER TABLE "SalesOrder" ADD COLUMN "returnFlagged" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SalesOrder" ADD COLUMN "returnFlaggedAt" TIMESTAMP(3);
