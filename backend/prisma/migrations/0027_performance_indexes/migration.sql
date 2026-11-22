-- فهارس الأداء للمفاتيح الأجنبية واستعلامات التصفية/الفرز المتكررة في الجداول المتنامية
CREATE INDEX IF NOT EXISTS "Task_createdById_idx" ON "Task"("createdById");
CREATE INDEX IF NOT EXISTS "TaskTimeLog_userId_idx" ON "TaskTimeLog"("userId");
CREATE INDEX IF NOT EXISTS "TaskComment_userId_idx" ON "TaskComment"("userId");
CREATE INDEX IF NOT EXISTS "Feedback_date_idx" ON "Feedback"("date");
CREATE INDEX IF NOT EXISTS "Feedback_createdAt_id_idx" ON "Feedback"("createdAt", "id");
CREATE INDEX IF NOT EXISTS "Goal_createdById_idx" ON "Goal"("createdById");
CREATE INDEX IF NOT EXISTS "CalendarEvent_createdById_idx" ON "CalendarEvent"("createdById");
CREATE INDEX IF NOT EXISTS "InventoryMovement_createdById_createdAt_idx" ON "InventoryMovement"("createdById", "createdAt");
CREATE INDEX IF NOT EXISTS "SalesOrder_status_date_idx" ON "SalesOrder"("status", "date");
CREATE INDEX IF NOT EXISTS "SalesOrder_agentId_date_idx" ON "SalesOrder"("agentId", "date");
CREATE INDEX IF NOT EXISTS "SalesOrder_createdById_idx" ON "SalesOrder"("createdById");
CREATE INDEX IF NOT EXISTS "SalesOrderLine_productId_idx" ON "SalesOrderLine"("productId");
CREATE INDEX IF NOT EXISTS "AgentOrder_agentId_date_seq_idx" ON "AgentOrder"("agentId", "date", "seq");
CREATE INDEX IF NOT EXISTS "AgentOrderLine_productId_idx" ON "AgentOrderLine"("productId");
CREATE INDEX IF NOT EXISTS "SalesOrderStatusLog_byId_idx" ON "SalesOrderStatusLog"("byId");
