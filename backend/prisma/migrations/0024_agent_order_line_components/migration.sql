-- تعديل محتويات البوكس داخل أوردر الفتاة: جدول جديد فقط، لا تغيير على الجداول القديمة.
-- الأسطر القديمة بلا صفوف هنا ستُقرأ من المنتج الثابت (توافق رجعي).
CREATE TABLE "AgentOrderLineComponent" (
  "id" TEXT NOT NULL,
  "lineId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "quantity" DECIMAL(14,3) NOT NULL,
  CONSTRAINT "AgentOrderLineComponent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AgentOrderLineComponent_lineId_itemId_key" ON "AgentOrderLineComponent"("lineId", "itemId");
CREATE INDEX "AgentOrderLineComponent_itemId_idx" ON "AgentOrderLineComponent"("itemId");
ALTER TABLE "AgentOrderLineComponent" ADD CONSTRAINT "AgentOrderLineComponent_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "AgentOrderLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentOrderLineComponent" ADD CONSTRAINT "AgentOrderLineComponent_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
