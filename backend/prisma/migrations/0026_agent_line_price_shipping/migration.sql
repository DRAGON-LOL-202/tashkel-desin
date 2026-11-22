-- سعر البوكس الذي تدخله الفتاة لكل بند + مصاريف الشحن الاختيارية على الأوردر
ALTER TABLE "AgentOrder" ADD COLUMN "shippingPrice" DECIMAL(12,2);
ALTER TABLE "AgentOrderLine" ADD COLUMN "boxPrice" DECIMAL(12,2);
ALTER TABLE "SalesOrderLine" ADD COLUMN "boxPrice" DECIMAL(12,2);
