"use client";

import { ConversationManager } from "@/components/ai/ConversationManager";

export default function ConversationsPage() {
  return (
    <div className="h-[calc(100vh-80px)] rounded-xl border border-border bg-background/60 backdrop-blur-sm overflow-hidden">
      <ConversationManager />
    </div>
  );
}
