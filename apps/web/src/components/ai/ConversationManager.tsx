"use client";

import { useState, useRef, useEffect } from "react";
import {
  MessageSquare,
  Phone,
  Mail,
  Globe,
  User,
  Send,
  ArrowLeft,
  UserCheck,
  UserX,
} from "lucide-react";
import { cn } from "@allohq/ui";
import { trpc } from "../../lib/trpc";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ConversationSummary = {
  id: string;
  channel: string;
  status: string;
  assignedTo: string | null;
  customer: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    phone: string | null;
  } | null;
  lastMessage: { content: string; role: string; createdAt: string } | null;
  messageCount: number;
  updatedAt: string;
};

type ConversationDetail = {
  id: string;
  channel: string;
  status: string;
  assignedTo: string | null;
  customer: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    phone: string | null;
  } | null;
  messages: Array<{
    id: string;
    role: string;
    content: string;
    contentType: string;
    metadata: unknown;
    createdAt: string;
  }>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function channelIcon(channel: string) {
  switch (channel) {
    case "whatsapp":
      return <Phone className="w-3.5 h-3.5 text-green-500" />;
    case "sms":
      return <MessageSquare className="w-3.5 h-3.5 text-blue-500" />;
    case "email":
      return <Mail className="w-3.5 h-3.5 text-purple-500" />;
    default:
      return <Globe className="w-3.5 h-3.5 text-gray-500" />;
  }
}

function customerName(customer: ConversationSummary["customer"]) {
  if (!customer) return "Anonymous";
  const name = [customer.firstName, customer.lastName].filter(Boolean).join(" ");
  return name || customer.email || "Anonymous";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ConversationManager() {
  const { data: stores } = trpc.stores.list.useQuery();
  const storeId = stores?.[0]?.id ?? "";
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: conversations, refetch: refetchList } = (trpc.ai as any).listConversations.useQuery(
    { storeId },
    { enabled: !!storeId, refetchInterval: 15_000 }
  ) as { data: ConversationSummary[] | undefined; refetch: () => void };

  const { data: detail, refetch: refetchDetail } = (trpc.ai as any).getConversation.useQuery(
    { conversationId: selectedId },
    { enabled: !!selectedId, refetchInterval: 10_000 }
  ) as { data: ConversationDetail | undefined; refetch: () => void };

  const claimMut = (trpc.ai as any).claimConversation.useMutation({
    onSuccess: () => { refetchList(); refetchDetail(); },
  });

  const releaseMut = (trpc.ai as any).releaseConversation.useMutation({
    onSuccess: () => { refetchList(); refetchDetail(); },
  });

  const replyMut = (trpc.ai as any).sendConversationReply.useMutation({
    onSuccess: () => {
      setReplyText("");
      refetchDetail();
    },
  });

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [detail?.messages]);

  if (!storeId) return null;

  const escalatedCount = conversations?.filter((c) => c.status === "escalated").length ?? 0;

  // Detail view
  if (selectedId && detail) {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <button onClick={() => setSelectedId(null)} className="p-1 hover:bg-foreground/5 rounded">
            <ArrowLeft className="w-4 h-4" />
          </button>
          {channelIcon(detail.channel)}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate">{customerName(detail.customer)}</div>
            <div className="text-[10px] font-mono text-muted-foreground">
              {detail.channel} · {detail.status}
              {detail.assignedTo && ` · Assigned: ${detail.assignedTo}`}
            </div>
          </div>
          {detail.assignedTo ? (
            <button
              onClick={() => releaseMut.mutate({ conversationId: selectedId })}
              className="text-[10px] font-mono px-2 py-1 rounded bg-foreground/5 hover:bg-foreground/10 flex items-center gap-1"
            >
              <UserX className="w-3 h-3" /> Release
            </button>
          ) : (
            <button
              onClick={() => claimMut.mutate({ conversationId: selectedId })}
              className="text-[10px] font-mono px-2 py-1 rounded bg-[hsl(var(--accent-bg))] text-[hsl(var(--accent))] hover:opacity-80 flex items-center gap-1"
            >
              <UserCheck className="w-3 h-3" /> Claim
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {detail.messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "max-w-[85%] px-3 py-2 rounded-xl text-[13px] leading-relaxed",
                msg.role === "customer"
                  ? "ml-auto bg-foreground text-background rounded-br-sm"
                  : "bg-muted rounded-bl-sm"
              )}
            >
              {msg.content}
              <div
                className={cn(
                  "text-[10px] font-mono mt-1",
                  msg.role === "customer" ? "text-background/40" : "text-muted-foreground"
                )}
              >
                {msg.role === "customer" ? "Customer" : "Agent"} · {timeAgo(msg.createdAt)}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Reply input (only when claimed) */}
        {detail.assignedTo && (
          <div className="p-3 border-t border-border flex gap-2">
            <input
              type="text"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && replyText.trim()) {
                  replyMut.mutate({ conversationId: selectedId, message: replyText.trim() });
                }
              }}
              placeholder="Type a reply..."
              className="flex-1 text-sm px-3 py-2 rounded-lg border border-border bg-background outline-none focus:border-[hsl(var(--accent))]"
            />
            <button
              onClick={() => {
                if (replyText.trim()) {
                  replyMut.mutate({ conversationId: selectedId, message: replyText.trim() });
                }
              }}
              disabled={!replyText.trim()}
              className="p-2 rounded-lg bg-foreground text-background disabled:opacity-40"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    );
  }

  // List view
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <MessageSquare className="w-4 h-4 text-[hsl(var(--accent))]" />
        <span className="font-semibold text-sm">Conversations</span>
        {escalatedCount > 0 && (
          <span className="ml-auto px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 text-[10px] font-mono font-bold">
            {escalatedCount} escalated
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {!conversations?.length && (
          <div className="text-center py-8 text-muted-foreground text-xs font-mono">
            No active conversations.
          </div>
        )}
        {conversations?.map((conv) => (
          <button
            key={conv.id}
            onClick={() => setSelectedId(conv.id)}
            className={cn(
              "w-full text-left px-4 py-3 border-b border-border hover:bg-foreground/3 transition-colors",
              conv.status === "escalated" && "bg-red-500/3"
            )}
          >
            <div className="flex items-center gap-2">
              {channelIcon(conv.channel)}
              <span className="text-sm font-medium flex-1 truncate">
                {customerName(conv.customer)}
              </span>
              <span className="text-[10px] font-mono text-muted-foreground">
                {timeAgo(conv.updatedAt)}
              </span>
            </div>
            {conv.lastMessage && (
              <div className="text-xs text-muted-foreground mt-1 truncate pl-5">
                {conv.lastMessage.role === "customer" ? "Customer: " : "Agent: "}
                {conv.lastMessage.content.slice(0, 60)}
              </div>
            )}
            <div className="flex items-center gap-2 mt-1 pl-5">
              <span
                className={cn(
                  "text-[10px] font-mono px-1.5 py-0.5 rounded",
                  conv.status === "escalated"
                    ? "bg-red-500/10 text-red-500"
                    : conv.status === "active"
                    ? "bg-emerald-500/10 text-emerald-500"
                    : "bg-foreground/5 text-muted-foreground"
                )}
              >
                {conv.status}
              </span>
              {conv.assignedTo && (
                <span className="text-[10px] font-mono text-muted-foreground flex items-center gap-0.5">
                  <User className="w-3 h-3" /> {conv.assignedTo}
                </span>
              )}
              <span className="text-[10px] font-mono text-muted-foreground ml-auto">
                {conv.messageCount} msgs
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
