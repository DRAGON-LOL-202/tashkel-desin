-- صفحات البيع (مصدر الأوردرات) وربطها بأوردرات الفتيات وأوردرات المبيعات
CREATE TABLE "SalesPage" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SalesPage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SalesPage_name_lower_key" ON "SalesPage"(LOWER("name"));
CREATE INDEX "SalesPage_isActive_idx" ON "SalesPage"("isActive");

ALTER TABLE "AgentOrder" ADD COLUMN "salesPageId" TEXT;
ALTER TABLE "SalesOrder" ADD COLUMN "salesPageId" TEXT;

CREATE INDEX "AgentOrder_salesPageId_idx" ON "AgentOrder"("salesPageId");
CREATE INDEX "SalesOrder_salesPageId_idx" ON "SalesOrder"("salesPageId");

ALTER TABLE "AgentOrder" ADD CONSTRAINT "AgentOrder_salesPageId_fkey"
  FOREIGN KEY ("salesPageId") REFERENCES "SalesPage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_salesPageId_fkey"
  FOREIGN KEY ("salesPageId") REFERENCES "SalesPage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
