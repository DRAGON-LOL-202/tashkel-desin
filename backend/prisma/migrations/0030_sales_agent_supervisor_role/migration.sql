-- Add SALES_AGENT_SUPERVISOR role and composite index for fast draft-queue queries
ALTER TYPE "Role" ADD VALUE 'SALES_AGENT_SUPERVISOR';
CREATE INDEX "AgentOrder_status_date_idx" ON "AgentOrder"("status", "date");
