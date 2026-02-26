-- CreateTable
CREATE TABLE "ai_chats" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_chats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_chat_messages" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "highlights" JSONB,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_chats_workspaceId_updatedAt_idx" ON "ai_chats"("workspaceId", "updatedAt");

-- CreateIndex
CREATE INDEX "ai_chats_storeId_idx" ON "ai_chats"("storeId");

-- CreateIndex
CREATE INDEX "ai_chat_messages_chatId_createdAt_idx" ON "ai_chat_messages"("chatId", "createdAt");

-- AddForeignKey
ALTER TABLE "ai_chats" ADD CONSTRAINT "ai_chats_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_chats" ADD CONSTRAINT "ai_chats_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_chat_messages" ADD CONSTRAINT "ai_chat_messages_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "ai_chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;
