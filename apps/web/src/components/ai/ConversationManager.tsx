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
  CheckCircle,
  AlertTriangle,
  ShoppingBag,
  TrendingDown,
  Shield,
  Sparkles,
  Search,
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
  sentiment: string | null;
  aiBrief: string | null;
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
  aiBrief: string | null;
  sentiment: string | null;
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

type ConversationContext = {
  customer: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    segment: string | null;
    totalSpent: number;
    orderCount: number;
    churnRisk: number;
    ltv: number;
  } | null;
  state: {
    lifecycleStage: string;
    churnRisk: number;
    trustScore: number;
    supportState: string;
    vipLevel: string;
  } | null;
  orders: Array<{
    id: string;
    orderNumber: string;
    status: string;
    totalPrice: number;
    createdAt: string;
  }>;
  supportHistory: { totalConversations: number; resolvedCount: number };
  aiBrief: string | null;
};

type StatusFilter = "all" | "active" | "escalated" | "resolved";

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

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "escalated", label: "Escalated" },
  { value: "resolved", label: "Resolved" },
];

const VIP_COLORS: Record<string, string> = {
  platinum: "bg-purple-500/10 text-purple-500",
  gold: "bg-amber-500/10 text-amber-500",
  silver: "bg-gray-400/10 text-gray-400",
};

// ---------------------------------------------------------------------------
// Context Sidebar
// ---------------------------------------------------------------------------

function ContextSidebar({ conversationId }: { conversationId: string }) {
  const { data: ctx } = (trpc.conversations as any).getContext.useQuery(
    { conversationId },
    { enabled: !!conversationId },
  ) as { data: ConversationContext | undefined };

  if (!ctx) {
    return (
      <div className="w-72 border-l border-border p-4">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-foreground/5 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-72 border-l border-border overflow-y-auto">
      {/* Customer Profile Card */}
      {ctx.customer && (
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 mb-2">
            <User className="w-4 h-4 text-[hsl(var(--accent))]" />
            <span className="text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
              Customer
            </span>
          </div>
          <div className="text-sm font-semibold">
            {[ctx.customer.firstName, ctx.customer.lastName].filter(Boolean).join(" ") || ctx.customer.email}
          </div>
          <div className="text-[11px] text-muted-foreground font-mono mt-1">{ctx.customer.email}</div>
          {ctx.customer.phone && (
            <div className="text-[11px] text-muted-foreground font-mono">{ctx.customer.phone}</div>
          )}
          <div className="flex flex-wrap gap-1 mt-2">
            {ctx.customer.segment && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-foreground/5">
                {ctx.customer.segment}
              </span>
            )}
            {ctx.state?.vipLevel && ctx.state.vipLevel !== "standard" && (
              <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-mono font-bold", VIP_COLORS[ctx.state.vipLevel] ?? "bg-foreground/5")}>
                {ctx.state.vipLevel.toUpperCase()}
              </span>
            )}
          </div>
        </div>
      )}

      {/* State Summary */}
      {ctx.state && (
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-4 h-4 text-[hsl(var(--accent))]" />
            <span className="text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
              State
            </span>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground font-mono">Lifecycle</span>
              <span className="font-mono">{ctx.state.lifecycleStage}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground font-mono">Churn Risk</span>
              <span className={cn("font-mono font-bold", ctx.state.churnRisk > 0.5 ? "text-red-500" : ctx.state.churnRisk > 0.3 ? "text-amber-500" : "text-emerald-500")}>
                {(ctx.state.churnRisk * 100).toFixed(0)}%
              </span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground font-mono">Trust Score</span>
              <span className="font-mono">{(ctx.state.trustScore * 100).toFixed(0)}%</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground font-mono">Support</span>
              <span className={cn("font-mono", ctx.state.supportState !== "clear" && "text-amber-500")}>
                {ctx.state.supportState}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Customer Stats */}
      {ctx.customer && (
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-4 h-4 text-[hsl(var(--accent))]" />
            <span className="text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
              Value
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-foreground/3 rounded-lg p-2 text-center">
              <div className="text-[10px] text-muted-foreground font-mono">Spent</div>
              <div className="text-sm font-bold">${ctx.customer.totalSpent.toFixed(0)}</div>
            </div>
            <div className="bg-foreground/3 rounded-lg p-2 text-center">
              <div className="text-[10px] text-muted-foreground font-mono">Orders</div>
              <div className="text-sm font-bold">{ctx.customer.orderCount}</div>
            </div>
            <div className="bg-foreground/3 rounded-lg p-2 text-center">
              <div className="text-[10px] text-muted-foreground font-mono">LTV</div>
              <div className="text-sm font-bold">${ctx.customer.ltv.toFixed(0)}</div>
            </div>
            <div className="bg-foreground/3 rounded-lg p-2 text-center">
              <div className="text-[10px] text-muted-foreground font-mono">Convos</div>
              <div className="text-sm font-bold">{ctx.supportHistory.totalConversations}</div>
            </div>
          </div>
        </div>
      )}

      {/* Recent Orders */}
      {ctx.orders.length > 0 && (
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 mb-2">
            <ShoppingBag className="w-4 h-4 text-[hsl(var(--accent))]" />
            <span className="text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
              Recent Orders
            </span>
          </div>
          <div className="space-y-1.5">
            {ctx.orders.slice(0, 5).map((order) => (
              <div key={order.id} className="flex justify-between items-center text-[11px]">
                <span className="font-mono text-muted-foreground">#{order.orderNumber}</span>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "px-1 py-0.5 rounded text-[9px] font-mono",
                    order.status === "paid" ? "bg-emerald-500/10 text-emerald-500" :
                    order.status === "fulfilled" ? "bg-blue-500/10 text-blue-500" :
                    "bg-foreground/5 text-muted-foreground"
                  )}>
                    {order.status}
                  </span>
                  <span className="font-mono font-bold">${order.totalPrice.toFixed(0)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Brief (when escalated) */}
      {ctx.aiBrief && (
        <div className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-mono font-semibold uppercase tracking-wider text-amber-500">
              AI Brief
            </span>
          </div>
          <div className="text-[11px] leading-relaxed text-muted-foreground whitespace-pre-wrap bg-amber-500/5 rounded-lg p-3 border border-amber-500/10">
            {ctx.aiBrief}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ConversationManager() {
  const { data: stores } = trpc.stores.list.useQuery();
  const storeId = stores?.[0]?.id ?? "";
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const queryStatus = statusFilter === "all" ? undefined : statusFilter;
  const { data: conversations, refetch: refetchList } = (trpc.conversations as any).list.useQuery(
    { storeId, status: queryStatus },
    { enabled: !!storeId, refetchInterval: 15_000 }
  ) as { data: ConversationSummary[] | undefined; refetch: () => void };

  const { data: detail, refetch: refetchDetail } = (trpc.conversations as any).get.useQuery(
    { conversationId: selectedId },
    { enabled: !!selectedId, refetchInterval: 10_000 }
  ) as { data: ConversationDetail | undefined; refetch: () => void };

  const claimMut = (trpc.conversations as any).claim.useMutation({
    onSuccess: () => { refetchList(); refetchDetail(); },
  });

  const releaseMut = (trpc.conversations as any).release.useMutation({
    onSuccess: () => { refetchList(); refetchDetail(); },
  });

  const replyMut = (trpc.conversations as any).reply.useMutation({
    onSuccess: () => {
      setReplyText("");
      refetchDetail();
    },
  });

  const resolveMut = (trpc.conversations as any).resolve.useMutation({
    onSuccess: () => {
      refetchList();
      refetchDetail();
    },
  });

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [detail?.messages]);

  if (!storeId) return null;

  // Filter by search query
  const filteredConversations = conversations?.filter((conv) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const name = customerName(conv.customer).toLowerCase();
    const email = conv.customer?.email?.toLowerCase() ?? "";
    return name.includes(q) || email.includes(q);
  });

  // Count per status
  const allConvs = conversations ?? [];
  const counts = {
    all: allConvs.length,
    active: allConvs.filter((c) => c.status === "active" || c.status === "waiting").length,
    escalated: allConvs.filter((c) => c.status === "escalated").length,
    resolved: allConvs.filter((c) => c.status === "resolved").length,
  };

  // Detail view
  if (selectedId && detail) {
    const isResolved = detail.status === "resolved";

    return (
      <div className="flex h-full">
        {/* Message thread */}
        <div className="flex-1 flex flex-col min-w-0">
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
                {detail.assignedTo && ` · ${detail.assignedTo}`}
                {detail.sentiment && ` · ${detail.sentiment}`}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {!isResolved && (
                <button
                  onClick={() => resolveMut.mutate({ conversationId: selectedId })}
                  disabled={resolveMut.isPending}
                  className="text-[10px] font-mono px-2 py-1 rounded bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 flex items-center gap-1"
                >
                  <CheckCircle className="w-3 h-3" /> Resolve
                </button>
              )}
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
          </div>

          {/* Status indicator */}
          {detail.status === "escalated" && (
            <div className="mx-4 mt-2 px-3 py-2 rounded-lg bg-red-500/5 border border-red-500/10 flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
              <span className="text-[11px] font-mono text-red-500">
                Escalated — Needs merchant attention
              </span>
            </div>
          )}

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
                  {msg.role === "customer" ? "Customer" : (msg.metadata as any)?.sentBy === "merchant" ? "Merchant" : "AI Agent"} · {timeAgo(msg.createdAt)}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Reply input (only when claimed and not resolved) */}
          {detail.assignedTo && !isResolved && (
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

        {/* Context Sidebar */}
        <ContextSidebar conversationId={selectedId} />
      </div>
    );
  }

  // List view
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border space-y-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-[hsl(var(--accent))]" />
          <span className="font-semibold text-sm">Conversations</span>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full text-[11px] font-mono pl-8 pr-3 py-1.5 rounded-lg border border-border bg-background outline-none focus:border-[hsl(var(--accent))]"
          />
        </div>

        {/* Status filter tabs */}
        <div className="flex gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={cn(
                "px-2.5 py-1 rounded-md text-[10px] font-mono transition-colors",
                statusFilter === f.value
                  ? "bg-foreground text-background"
                  : "bg-foreground/5 text-muted-foreground hover:bg-foreground/10"
              )}
            >
              {f.label}
              {counts[f.value] > 0 && (
                <span className="ml-1 opacity-60">{counts[f.value]}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!filteredConversations?.length && (
          <div className="text-center py-8 text-muted-foreground text-xs font-mono">
            {searchQuery ? "No conversations match your search." : "No conversations."}
          </div>
        )}
        {filteredConversations?.map((conv) => (
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
            {conv.status === "escalated" && conv.aiBrief && (
              <div className="mt-1 pl-5 text-[10px] font-mono text-amber-500 truncate flex items-center gap-1">
                <Sparkles className="w-3 h-3 flex-shrink-0" />
                {conv.aiBrief.slice(0, 80)}...
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
                    : conv.status === "resolved"
                    ? "bg-blue-500/10 text-blue-500"
                    : "bg-foreground/5 text-muted-foreground"
                )}
              >
                {conv.status}
              </span>
              {conv.sentiment && (
                <span className={cn(
                  "text-[10px] font-mono px-1.5 py-0.5 rounded",
                  conv.sentiment === "negative" ? "bg-red-500/10 text-red-500" :
                  conv.sentiment === "positive" ? "bg-emerald-500/10 text-emerald-500" :
                  "bg-foreground/5 text-muted-foreground"
                )}>
                  {conv.sentiment}
                </span>
              )}
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
