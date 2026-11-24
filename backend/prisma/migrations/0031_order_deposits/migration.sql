-- Add deposit (girl prepayment) on AgentOrder & SalesOrder, and extraDeposit (accountant additional prepayment) on SalesOrder
ALTER TABLE "AgentOrder" ADD COLUMN "deposit" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "SalesOrder" ADD COLUMN "deposit" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "SalesOrder" ADD COLUMN "extraDeposit" DECIMAL(12,2) NOT NULL DEFAULT 0;
