"use client";

import { Phone, MessageSquare, Mail, Globe } from "lucide-react";

const channelConfig: Record<string, { color: string; icon: typeof Phone }> = {
  whatsapp: { color: "var(--color-success)", icon: Phone },
  sms: { color: "var(--color-info)", icon: MessageSquare },
  email: { color: "var(--color-accent)", icon: Mail },
  widget: { color: "var(--color-warning)", icon: Globe },
};

export function ChannelBadge({ channel }: { channel: string }) {
  const config = channelConfig[channel];
  if (!config) return null;
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-sans px-1.5 py-0.5 rounded"
      style={{ color: config.color, backgroundColor: `color-mix(in srgb, ${config.color} 12%, transparent)` }}
    >
      {channel}
    </span>
  );
}
