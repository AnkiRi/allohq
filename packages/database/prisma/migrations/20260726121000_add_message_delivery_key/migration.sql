ALTER TABLE "message_logs" ADD COLUMN "deliveryKey" TEXT;
CREATE UNIQUE INDEX "message_logs_deliveryKey_key"
  ON "message_logs"("deliveryKey");
