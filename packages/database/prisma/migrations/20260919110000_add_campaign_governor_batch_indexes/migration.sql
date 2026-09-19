CREATE INDEX "orders_storeId_customerId_createdAt_idx"
  ON "orders"("storeId", "customerId", "createdAt");

CREATE INDEX "message_logs_storeId_customerId_sentAt_idx"
  ON "message_logs"("storeId", "customerId", "sentAt");

CREATE INDEX "conversations_storeId_customerId_status_updatedAt_idx"
  ON "conversations"("storeId", "customerId", "status", "updatedAt");
