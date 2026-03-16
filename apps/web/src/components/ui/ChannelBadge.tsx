"use client";

import { Phone, MessageSquare, Mail, Globe } from "lucide-react";

const channelConfig: Record<string, { bg: string; text: string; icon: typeof Phone }> = {
  whatsapp: { bg: "bg-green-500/10", text: "text-green-600", icon: Phone },
  sms: { bg: "bg-blue-500/10", text: "text-blue-600", icon: MessageSquare },
  email: { bg: "bg-purple-500/10", text: "text-purple-600", icon: Mail },
  widget: { bg: "bg-amber-500/10", text: "text-amber-600", icon: Globe },
};

export function ChannelBadge({ channel }: { channel: string }) {
  const config = channelConfig[channel];
  if (!config) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded ${config.bg} ${config.text}`}
    >
      {channel}
    </span>
  );
}
