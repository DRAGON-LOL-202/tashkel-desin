-- نظام أوردرات الفتيات: كل الأعمدة الجديدة على SalesOrder اختيارية/بقيم افتراضية فلا تتأثر الأوردرات القديمة.
CREATE TYPE "AgentOrderStatus" AS ENUM ('DRAFT', 'EXPORTED', 'CANCELLED');

ALTER TABLE "SalesOrder"
  ADD COLUMN "agentId" TEXT,
  ADD COLUMN "source" VARCHAR(16) NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "agentSellPrice" DECIMAL(12,2),
  ADD COLUMN "shippingPrice" DECIMAL(12,2),
  ADD COLUMN "shippedAt" TIMESTAMP(3),
  ADD COLUMN "deliveredAt" TIMESTAMP(3);
CREATE INDEX "SalesOrder_agentId_idx" ON "SalesOrder"("agentId");
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "SalesAgentProfile" (
  "userId" TEXT NOT NULL,
  "prefix" INTEGER NOT NULL,
  "nextSeq" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SalesAgentProfile_pkey" PRIMARY KEY ("userId")
);
CREATE UNIQUE INDEX "SalesAgentProfile_prefix_key" ON "SalesAgentProfile"("prefix");
ALTER TABLE "SalesAgentProfile" ADD CONSTRAINT "SalesAgentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AgentOrder" (
  "id" TEXT NOT NULL,
  "agentId" TEXT NOT NULL,
  "seq" INTEGER NOT NULL,
  "waybill" VARCHAR(20) NOT NULL,
  "date" VARCHAR(10) NOT NULL,
  "customerName" TEXT NOT NULL DEFAULT '',
  "customerPhone" TEXT NOT NULL DEFAULT '',
  "customerAddress" TEXT NOT NULL DEFAULT '',
  "notes" TEXT NOT NULL DEFAULT '',
  "sellPrice" DECIMAL(12,2) NOT NULL,
  "status" "AgentOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "exportedAt" TIMESTAMP(3),
  "exportedById" TEXT,
  "salesOrderId" TEXT,
  "cancelledAt" TIMESTAMP(3),
  "cancelReason" TEXT,
  "cancelledById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgentOrder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AgentOrder_waybill_key" ON "AgentOrder"("waybill");
CREATE UNIQUE INDEX "AgentOrder_salesOrderId_key" ON "AgentOrder"("salesOrderId");
CREATE UNIQUE INDEX "AgentOrder_agentId_seq_key" ON "AgentOrder"("agentId", "seq");
CREATE INDEX "AgentOrder_agentId_status_idx" ON "AgentOrder"("agentId", "status");
ALTER TABLE "AgentOrder" ADD CONSTRAINT "AgentOrder_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AgentOrder" ADD CONSTRAINT "AgentOrder_exportedById_fkey" FOREIGN KEY ("exportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AgentOrder" ADD CONSTRAINT "AgentOrder_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AgentOrder" ADD CONSTRAINT "AgentOrder_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AgentOrderLine" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "productId" TEXT,
  "productName" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "AgentOrderLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AgentOrderLine_orderId_idx" ON "AgentOrderLine"("orderId");
ALTER TABLE "AgentOrderLine" ADD CONSTRAINT "AgentOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "AgentOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentOrderLine" ADD CONSTRAINT "AgentOrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "SalesProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "SalesOrderStatusLog" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "event" VARCHAR(24) NOT NULL,
  "fromValue" TEXT,
  "toValue" TEXT,
  "byId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalesOrderStatusLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SalesOrderStatusLog_orderId_createdAt_idx" ON "SalesOrderStatusLog"("orderId", "createdAt");
ALTER TABLE "SalesOrderStatusLog" ADD CONSTRAINT "SalesOrderStatusLog_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesOrderStatusLog" ADD CONSTRAINT "SalesOrderStatusLog_byId_fkey" FOREIGN KEY ("byId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
