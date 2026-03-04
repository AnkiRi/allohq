"use client";

import { AgentCanvas } from "@/components/ai/AgentCanvas";

export default function AgentPage() {
  return (
    <div className="h-[calc(100vh-80px)] rounded-xl border border-border bg-background/60 backdrop-blur-sm overflow-hidden">
      <AgentCanvas />
    </div>
  );
}
