-- Phase 3B: MessageLog for real sending
-- Phase 3C: GeneratedImage for AI image generation

-- MessageLog table
CREATE TABLE "message_logs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT,
    "templateId" TEXT,
    "campaignId" TEXT,
    "automationId" TEXT,
    "externalId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "error" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "message_logs_workspaceId_idx" ON "message_logs"("workspaceId");
CREATE INDEX "message_logs_campaignId_idx" ON "message_logs"("campaignId");
CREATE INDEX "message_logs_automationId_idx" ON "message_logs"("automationId");
CREATE INDEX "message_logs_externalId_idx" ON "message_logs"("externalId");
CREATE INDEX "message_logs_channel_status_idx" ON "message_logs"("channel", "status");

ALTER TABLE "message_logs" ADD CONSTRAINT "message_logs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- GeneratedImage table
CREATE TABLE "generated_images" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generated_images_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "generated_images_workspaceId_idx" ON "generated_images"("workspaceId");
CREATE INDEX "generated_images_prompt_idx" ON "generated_images"("prompt");

ALTER TABLE "generated_images" ADD CONSTRAINT "generated_images_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
