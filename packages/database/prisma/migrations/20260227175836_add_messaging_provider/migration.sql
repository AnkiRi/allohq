-- AlterTable
ALTER TABLE "message_logs" ADD COLUMN     "provider" TEXT;

-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "messagingConfig" JSONB;
