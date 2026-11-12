-- 0023: (1) مزامنة إلغاء أوردر الفتاة مع SalesOrder، (2) قيد Unique لرقم البوليصة على مستوى قاعدة البيانات.

-- (1) أعمدة الإلغاء (اختيارية: الأوردرات القديمة لا تتأثر)
ALTER TABLE "SalesOrder" ADD COLUMN "cancelledAt" TIMESTAMP(3);
ALTER TABLE "SalesOrder" ADD COLUMN "cancelReason" TEXT;
ALTER TABLE "SalesOrder" ADD COLUMN "cancelledById" TEXT;

-- مزامنة ما أُلغي سابقاً من مساحة الفتاة (لا تغيير في الحالة ولا المخزون)
UPDATE "SalesOrder" s
SET "cancelledAt" = a."cancelledAt", "cancelReason" = a."cancelReason", "cancelledById" = a."cancelledById"
FROM "AgentOrder" a
WHERE a."salesOrderId" = s."id" AND a."status" = 'CANCELLED' AND a."cancelledAt" IS NOT NULL;

-- (2) لا نغيّر ولا نحذف أي رقم قديم: إن وُجدت بوالص مكررة تاريخياً يتوقف الترحيل مع قائمة بها
DO $$
DECLARE dups text;
BEGIN
  SELECT string_agg(w || ' (x' || c || ')', ', ') INTO dups
  FROM (
    SELECT lower("waybill") AS w, count(*) AS c
    FROM "SalesOrder"
    WHERE "waybill" <> ''
    GROUP BY lower("waybill")
    HAVING count(*) > 1
  ) d;
  IF dups IS NOT NULL THEN
    RAISE EXCEPTION 'أرقام بوليصة مكررة تاريخياً في SalesOrder، عالجها يدوياً قبل الترحيل: %', dups;
  END IF;
END $$;

-- فريد بلا حساسية لحالة الأحرف، ويتجاهل الأوردرات بلا بوليصة (القيمة الفارغة مسموحة لعدد غير محدود)
CREATE UNIQUE INDEX "SalesOrder_waybill_lower_key" ON "SalesOrder" (lower("waybill")) WHERE "waybill" <> '';
