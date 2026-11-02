-- المبيعات العامة: منتجات ثابتة (بوكسات) وأوردرات يومية تخصم مكوناتها من المخزون
CREATE TYPE "SalesOrderStatus" AS ENUM ('REGISTERED', 'EXECUTED', 'SHIPPED', 'DELIVERED', 'RETURNED');

CREATE TABLE "SalesProduct" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "notes" TEXT NOT NULL DEFAULT '',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SalesProduct_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SalesProduct_isActive_idx" ON "SalesProduct"("isActive");

CREATE TABLE "SalesProductComponent" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "quantity" DECIMAL(14,3) NOT NULL,
  CONSTRAINT "SalesProductComponent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SalesProductComponent_productId_itemId_key" ON "SalesProductComponent"("productId", "itemId");
CREATE INDEX "SalesProductComponent_itemId_idx" ON "SalesProductComponent"("itemId");

CREATE TABLE "SalesOrder" (
  "id" TEXT NOT NULL,
  "date" VARCHAR(10) NOT NULL,
  "waybill" TEXT NOT NULL DEFAULT '',
  "closerName" TEXT NOT NULL DEFAULT '',
  "status" "SalesOrderStatus" NOT NULL DEFAULT 'REGISTERED',
  "stockDeducted" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT NOT NULL DEFAULT '',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SalesOrder_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SalesOrder_date_idx" ON "SalesOrder"("date");
CREATE INDEX "SalesOrder_status_idx" ON "SalesOrder"("status");
CREATE INDEX "SalesOrder_waybill_idx" ON "SalesOrder"("waybill");

CREATE TABLE "SalesOrderLine" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "productId" TEXT,
  "productName" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalesOrderLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SalesOrderLine_orderId_idx" ON "SalesOrderLine"("orderId");

CREATE TABLE "SalesOrderComponent" (
  "id" TEXT NOT NULL,
  "lineId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "quantity" DECIMAL(14,3) NOT NULL,
  "unitCostSnapshot" DECIMAL(14,2),
  "unitSellSnapshot" DECIMAL(14,2),
  CONSTRAINT "SalesOrderComponent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SalesOrderComponent_lineId_idx" ON "SalesOrderComponent"("lineId");
CREATE INDEX "SalesOrderComponent_itemId_idx" ON "SalesOrderComponent"("itemId");

ALTER TABLE "SalesProductComponent" ADD CONSTRAINT "SalesProductComponent_productId_fkey" FOREIGN KEY ("productId") REFERENCES "SalesProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesProductComponent" ADD CONSTRAINT "SalesProductComponent_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesOrderLine" ADD CONSTRAINT "SalesOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesOrderLine" ADD CONSTRAINT "SalesOrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "SalesProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesOrderComponent" ADD CONSTRAINT "SalesOrderComponent_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "SalesOrderLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesOrderComponent" ADD CONSTRAINT "SalesOrderComponent_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- لا يسمح بكمية مكوّن صفرية أو سالبة، ولا بكمية بند أقل من 1
ALTER TABLE "SalesProductComponent" ADD CONSTRAINT "SalesProductComponent_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "SalesOrderComponent" ADD CONSTRAINT "SalesOrderComponent_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "SalesOrderLine" ADD CONSTRAINT "SalesOrderLine_quantity_positive" CHECK ("quantity" >= 1);
