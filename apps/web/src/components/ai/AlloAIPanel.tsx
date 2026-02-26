"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  createContext,
  useContext,
  useImperativeHandle,
  forwardRef,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Maximize2,
  Minimize2,
  Send,
  Loader2,
  ArrowRight,
  Search,
  Plus,
  Trash2,
  Pencil,
  MessageSquare,
} from "lucide-react";
import { cn } from "@allohq/ui";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ---------------------------------------------------------------------------
// Context — lets TopBar & Cmd+K open/focus the panel
// ---------------------------------------------------------------------------

type AlloAIPanelContextType = {
  openPanel: () => void;
  focusInput: () => void;
};

const AlloAIPanelContext = createContext<AlloAIPanelContextType>({
  openPanel: () => {},
  focusInput: () => {},
});

export const useAlloAI = () => useContext(AlloAIPanelContext);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PanelState = "open" | "collapsed" | "expanded";

interface InsightCard {
  label: string;
  value: string;
  description?: string;
  variant: "accent" | "success" | "warning";
  stats?: { label: string; value: string }[];
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  insightCard?: InsightCard;
  highlights?: { label: string; value: string }[];
  actionLinks?: { label: string; href: string }[];
  isLoading?: boolean;
}


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

let msgCounter = 0;
function nextId() {
  return `msg-${Date.now()}-${++msgCounter}`;
}

function derivePageContext(pathname: string): string {
  const segment = pathname.split("/").filter(Boolean).pop();
  return segment || "dashboard";
}

// ---------------------------------------------------------------------------
// Dynamic suggestion pills based on store state
// ---------------------------------------------------------------------------

type PanelInsights = {
  store: { domain: string; lastSyncAt: string | null } | null;
  metrics: {
    totalCustomers: number;
    revenueThisMonth: number;
    revenueLastMonth: number;
    revenueTrend: number;
    totalAutomations: number;
    activeAutomations: number;
  };
  segmentAlerts: {
    atRiskCount: number;
    championsCount: number;
    newCustomersCount: number;
    lostCount: number;
  };
  churnAlert: { highRiskCount: number; avgChurnProbability: number };
  storeState: {
    hasStore: boolean;
    hasSyncedData: boolean;
    hasBrandProfile: boolean;
    hasAutomations: boolean;
    hasActiveAutomations: boolean;
    hasCampaigns: boolean;
  };
  topAutomation: { name: string; status: string; category: string } | null;
};

type Pill = { label: string; instruction: string | null; href?: string };

function getSuggestions(insights: PanelInsights | undefined, pageContext: string): Pill[] {
  if (!insights) return [];

  // Don't show any suggestions until data is synced — user must complete checklist first
  if (!insights.storeState.hasSyncedData) return [];

  const pills: Pill[] = [];

  if (!insights.storeState.hasBrandProfile) {
    pills.push({ label: "Analyze brand voice", instruction: "Analyze my brand voice" });
  }
  if (!insights.storeState.hasAutomations) {
    pills.push({ label: "Launch AI Agent", instruction: null, href: "/automations" });
  }
  if (insights.segmentAlerts.atRiskCount > 0) {
    pills.push({ label: "Create win-back flow", instruction: "Create a win-back automation for at-risk customers" });
  }
  if (insights.segmentAlerts.championsCount > 0) {
    pills.push({ label: "Reward VIP customers", instruction: "Create a VIP reward campaign for champions segment" });
  }
  if (insights.storeState.hasAutomations && !insights.storeState.hasCampaigns) {
    pills.push({ label: "Send first campaign", instruction: "Create a promotional email campaign" });
  }
  if (insights.churnAlert.highRiskCount > 5) {
    pills.push({ label: "Show at-risk customers", instruction: null, href: "/customers" });
  }

  // Page-context-specific pills
  if (pageContext === "campaigns" || pageContext === "templates") {
    pills.push({ label: "Create email template", instruction: "Create a promotional email template" });
  }
  if (pageContext === "segments" || pageContext === "customers") {
    pills.push({ label: "Find high spenders", instruction: "Find customers who spent over $200 in the last 90 days" });
  }

  pills.push({ label: "Analyze last 30 days", instruction: "Analyze my customer data from the last 30 days" });

  return pills.slice(0, 4);
}

// ---------------------------------------------------------------------------
// Build welcome messages from real data
// ---------------------------------------------------------------------------

function buildWelcomeMessages(insights: PanelInsights): Message[] {
  const messages: Message[] = [];
  const now = new Date();

  // If no store connected yet
  if (!insights.storeState.hasStore) {
    messages.push({
      id: "welcome-no-store",
      role: "assistant",
      content: "Welcome to Allo AI! Connect your Shopify store from the dashboard to get started. I'll be ready to help once your store is set up.",
      timestamp: now,
    });
    return messages;
  }

  // If store connected but data not synced yet
  if (!insights.storeState.hasSyncedData) {
    messages.push({
      id: "welcome-syncing",
      role: "assistant",
      content: "Your store is connected — great! Complete the setup checklist on your dashboard to sync your customer data. Once that's done, I'll have full context to help you with retention strategies, customer insights, and campaign creation.",
      timestamp: now,
      insightCard: {
        label: "Setup",
        value: "Complete your checklist",
        description: "Sync data → Analyze brand → Launch AI agent",
        variant: "accent",
      },
    });
    return messages;
  }

  // Main greeting — only when data is ready
  messages.push({
    id: "welcome-greeting",
    role: "assistant",
    content: "Welcome back! Here's what's happening with your store:",
    timestamp: now,
  });

  // Revenue trend
  if (insights.metrics.revenueThisMonth > 0 || insights.metrics.revenueLastMonth > 0) {
    const trend = insights.metrics.revenueTrend;
    const direction = trend > 0 ? "up" : trend < 0 ? "down" : "flat";
    messages.push({
      id: "welcome-revenue",
      role: "assistant",
      content: direction === "flat"
        ? `Revenue is steady this month at ${formatCurrency(insights.metrics.revenueThisMonth)}.`
        : `Revenue is ${direction} ${Math.abs(trend)}% this month.`,
      timestamp: now,
      insightCard: {
        label: "Revenue",
        value: "",
        variant: trend >= 0 ? "success" : "warning",
        stats: [
          { label: "This month", value: formatCurrency(insights.metrics.revenueThisMonth) },
          { label: "Last month", value: formatCurrency(insights.metrics.revenueLastMonth) },
          { label: "Trend", value: `${trend >= 0 ? "+" : ""}${trend}%` },
        ],
      },
    });
  }

  // At-risk alert
  if (insights.segmentAlerts.atRiskCount > 0) {
    messages.push({
      id: "welcome-at-risk",
      role: "assistant",
      content: `${insights.segmentAlerts.atRiskCount} customers are in the "At Risk" segment — they haven't purchased recently. I can create a win-back automation for them.`,
      timestamp: now,
      insightCard: {
        label: "Attention",
        value: `${insights.segmentAlerts.atRiskCount} at-risk customers`,
        description: "These customers may churn without re-engagement.",
        variant: "warning",
      },
    });
  }

  // Churn alert
  if (insights.churnAlert.highRiskCount > 0 && insights.segmentAlerts.atRiskCount === 0) {
    messages.push({
      id: "welcome-churn",
      role: "assistant",
      content: `${insights.churnAlert.highRiskCount} customers have a high churn probability (avg ${insights.churnAlert.avgChurnProbability}%).`,
      timestamp: now,
      insightCard: {
        label: "Churn Risk",
        value: `${insights.churnAlert.highRiskCount} high-risk customers`,
        variant: "warning",
      },
    });
  }

  // Top automation
  if (insights.topAutomation) {
    messages.push({
      id: "welcome-automation",
      role: "assistant",
      content: `Your "${insights.topAutomation.name}" automation is ${insights.topAutomation.status}.`,
      timestamp: now,
      insightCard: {
        label: "Automation",
        value: insights.topAutomation.name,
        description: `Status: ${insights.topAutomation.status} · Category: ${insights.topAutomation.category || "General"}`,
        variant: "success",
      },
    });
  }

  // Brand profile nudge
  if (!insights.storeState.hasBrandProfile && insights.storeState.hasSyncedData) {
    messages.push({
      id: "welcome-brand",
      role: "assistant",
      content: "I haven't analyzed your brand voice yet. Want me to? It helps me generate better content for your campaigns and automations.",
      timestamp: now,
    });
  }

  return messages;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function InsightCardView({ card }: { card: InsightCard }) {
  const colorMap = {
    accent: {
      bg: "bg-[hsl(var(--accent-bg))]",
      border: "border-border",
      text: "text-[hsl(var(--accent))]",
    },
    success: {
      bg: "bg-[hsl(var(--success-bg))]",
      border: "border-[hsl(var(--success)/0.2)]",
      text: "text-[hsl(var(--success))]",
    },
    warning: {
      bg: "bg-[hsl(var(--accent-bg))]",
      border: "border-border",
      text: "text-[hsl(var(--accent))]",
    },
  };
  const colors = colorMap[card.variant];

  return (
    <div className={cn("rounded-xl p-3.5 border mt-2.5 mb-1", colors.bg, colors.border)}>
      <div className={cn("font-mono text-[10px] uppercase tracking-wider mb-1.5", colors.text)}>
        {card.label}
      </div>
      {card.value && (
        <div className="font-mono text-[14px] font-semibold text-foreground">{card.value}</div>
      )}
      {card.description && (
        <div className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed font-sans">
          {card.description}
        </div>
      )}
      {card.stats && (
        <div className="flex gap-5 mt-2">
          {card.stats.map((stat) => (
            <div key={stat.label}>
              <div className={cn("font-mono text-lg font-bold", colors.text)}>{stat.value}</div>
              <div className="font-mono text-[10px] text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message, onNavigate }: { message: Message; onNavigate?: (href: string) => void }) {

  if (message.isLoading) {
    return (
      <div className="flex gap-2.5">
        <div className="w-6 h-6 rounded-lg bg-[hsl(var(--accent-bg))] flex items-center justify-center flex-shrink-0 mt-0.5">
          <Sparkles className="w-3 h-3 text-[hsl(var(--accent))]" />
        </div>
        <div className="flex items-center gap-2 py-1">
          <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin" />
          <span className="text-[12px] font-mono text-muted-foreground">{message.content}</span>
        </div>
      </div>
    );
  }

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] px-3.5 py-2.5 rounded-xl bg-foreground text-background">
          <div className="text-[13px] leading-[1.6] font-sans">{message.content}</div>
          <div className="font-mono text-[10px] text-background/40 mt-1">
            {timeAgo(message.timestamp)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2.5">
      <div className="w-6 h-6 rounded-lg bg-[hsl(var(--accent-bg))] flex items-center justify-center flex-shrink-0 mt-0.5">
        <Sparkles className="w-3 h-3 text-[hsl(var(--accent))]" />
      </div>
      <div className="flex-1 min-w-0">
        {/* Highlight metric cards */}
        {message.highlights && message.highlights.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {message.highlights.map((h) => (
              <div
                key={h.label}
                className="flex-1 min-w-[80px] rounded-xl bg-[hsl(var(--accent-bg))] border border-border px-3 py-2.5"
              >
                <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {h.label}
                </div>
                <div className="font-mono text-[15px] font-bold text-[hsl(var(--accent))] mt-0.5">
                  {h.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Markdown-rendered content */}
        <div className="allo-ai-prose text-[13px] leading-[1.65] text-foreground font-sans">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h2: ({ children }) => (
                <h2 className="text-[14px] font-semibold font-mono text-foreground mt-3 mb-1.5 first:mt-0">
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3 className="text-[13px] font-semibold font-mono text-foreground mt-2.5 mb-1 first:mt-0">
                  {children}
                </h3>
              ),
              p: ({ children }) => (
                <p className="mb-2 last:mb-0">{children}</p>
              ),
              strong: ({ children }) => (
                <strong className="font-semibold text-foreground">{children}</strong>
              ),
              ul: ({ children }) => (
                <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>
              ),
              li: ({ children }) => (
                <li className="text-[13px]">{children}</li>
              ),
              table: ({ children }) => (
                <div className="overflow-x-auto my-2.5 rounded-lg border border-border">
                  <table className="w-full text-[12px] font-mono">{children}</table>
                </div>
              ),
              thead: ({ children }) => (
                <thead className="bg-muted/60">{children}</thead>
              ),
              th: ({ children }) => (
                <th className="px-3 py-2 text-left font-semibold text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                  {children}
                </th>
              ),
              td: ({ children }) => (
                <td className="px-3 py-2 text-foreground border-b border-border/50">
                  {children}
                </td>
              ),
              tr: ({ children }) => (
                <tr className="hover:bg-muted/30 transition-colors">{children}</tr>
              ),
              code: ({ children, className }) => {
                const isInline = !className;
                return isInline ? (
                  <code className="px-1.5 py-0.5 rounded-md bg-muted text-[12px] font-mono text-[hsl(var(--accent))]">
                    {children}
                  </code>
                ) : (
                  <code className="block p-3 rounded-lg bg-muted text-[12px] font-mono overflow-x-auto mb-2">
                    {children}
                  </code>
                );
              },
              blockquote: ({ children }) => (
                <blockquote className="border-l-2 border-[hsl(var(--accent))] pl-3 my-2 text-muted-foreground italic">
                  {children}
                </blockquote>
              ),
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>

        {message.insightCard && <InsightCardView card={message.insightCard} />}
        {message.actionLinks && message.actionLinks.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {message.actionLinks.map((link) => (
              <button
                key={link.href}
                onClick={() => onNavigate?.(link.href)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[hsl(var(--accent-bg))] border border-border text-[hsl(var(--accent))] font-mono text-[11px] hover:border-primary/50 transition-colors"
              >
                {link.label}
                <ArrowRight className="w-3 h-3" />
              </button>
            ))}
          </div>
        )}
        <div className="font-mono text-[10px] text-muted-foreground/50 mt-1">
          {timeAgo(message.timestamp)}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel component
// ---------------------------------------------------------------------------

export interface AlloAIPanelHandle {
  open: () => void;
  focusInput: () => void;
}

export const AlloAIPanel = forwardRef<AlloAIPanelHandle>(function AlloAIPanel(_, ref) {
  const { toast } = useToast();
  const router = useRouter();
  const utils = trpc.useUtils();
  const pathname = usePathname();
  const pageContext = derivePageContext(pathname);

  const [panelState, setPanelState] = useState<PanelState>("open");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [welcomeBuilt, setWelcomeBuilt] = useState(false);
  const [currentChatId, setCurrentChatId] = useState<string | undefined>();
  const [currentChatTitle, setCurrentChatTitle] = useState<string | undefined>();
  const [showChatSwitcher, setShowChatSwitcher] = useState(false);
  const [chatSearch, setChatSearch] = useState("");
  const [editingHeaderTitle, setEditingHeaderTitle] = useState(false);
  const [headerTitleDraft, setHeaderTitleDraft] = useState("");
  const [dynamicSuggestions, setDynamicSuggestions] = useState<string[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Get storeId
  const { data: stores } = trpc.stores.list.useQuery();
  const storeId = stores?.[0]?.id ?? "";

  // Fetch real insights
  const { data: insights } = (trpc.ai as any).panelInsights.useQuery(
    { storeId },
    { enabled: !!storeId, refetchInterval: 60_000 },
  ) as { data: PanelInsights | undefined };

  // Chat history — always fetch so dropdown opens instantly
  const { data: chatHistory, refetch: refetchHistory } = (trpc.ai as any).listChats.useQuery(
    { storeId, limit: 30 },
    { enabled: !!storeId, staleTime: 30_000 },
  ) as { data: { chats: { id: string; title: string; updatedAt: string; messageCount: number; lastMessage: string }[]; nextCursor?: string } | undefined; refetch: () => void };

  const deleteChatMut = (trpc.ai as any).deleteChat.useMutation({
    onSuccess: () => refetchHistory(),
  }) as { mutate: (input: { chatId: string }) => void };

  const renameChatMut = (trpc.ai as any).renameChat.useMutation({
    onSuccess: () => refetchHistory(),
  }) as { mutateAsync: (input: { chatId: string; title: string }) => Promise<{ success: boolean }>; isPending: boolean };

  // Inline rename state
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  // Track which storeId the welcome was built for
  const welcomeStoreRef = useRef<string>("");

  // Build welcome messages from real data — reset when store changes
  useEffect(() => {
    if (!storeId) {
      // Store disconnected — clear everything
      setMessages([]);
      setWelcomeBuilt(false);
      welcomeStoreRef.current = "";
      return;
    }

    // Store changed — rebuild
    if (storeId !== welcomeStoreRef.current) {
      setWelcomeBuilt(false);
      welcomeStoreRef.current = storeId;
    }

    if (insights && !welcomeBuilt) {
      setMessages(buildWelcomeMessages(insights));
      setWelcomeBuilt(true);
    }
  }, [insights, welcomeBuilt, storeId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Click-outside + Escape to dismiss chat switcher
  const switcherRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showChatSwitcher) return;
    const handleClick = (e: MouseEvent) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setShowChatSwitcher(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowChatSwitcher(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [showChatSwitcher]);

  // Expose open/focus to parent via ref
  useImperativeHandle(ref, () => ({
    open() {
      if (panelState === "collapsed") setPanelState("open");
    },
    focusInput() {
      if (panelState === "collapsed") setPanelState("open");
      setTimeout(() => inputRef.current?.focus(), 100);
    },
  }));

  // AI chat mutation — real conversational AI with full store context
  type ChatResult = {
    chatId: string;
    reply: string;
    highlights: { label: string; value: string }[];
    suggestedFollowUps: string[];
    action: {
      intent: string;
      success: boolean;
      summary: string;
      created: {
        automationId?: string;
        campaignId?: string;
        templateIds?: string[];
        segmentId?: string;
      };
    } | null;
    model: string;
  };

  const chatMut = (trpc.ai as any).chat.useMutation({
    onSuccess: (data: ChatResult) => {
      setIsProcessing(false);
      // Track chat id and title
      if (!currentChatId) {
        // New chat — derive title from the last user message
        const lastUserMsg = messages.filter((m) => m.role === "user").pop();
        setCurrentChatTitle(lastUserMsg?.content.slice(0, 40) || "New chat");
      }
      setCurrentChatId(data.chatId);
      refetchHistory();

      // Update dynamic suggestions from AI response
      if (data.suggestedFollowUps?.length) {
        setDynamicSuggestions(data.suggestedFollowUps);
      } else {
        setDynamicSuggestions([]);
      }

      // Build action links from action result
      const actionLinks: { label: string; href: string }[] = [];
      if (data.action?.created.automationId) {
        actionLinks.push({ label: "View Automation", href: `/automations/${data.action.created.automationId}` });
      }
      if (data.action?.created.campaignId) {
        actionLinks.push({ label: "View Campaign", href: "/campaigns" });
      }
      if (data.action?.created.templateIds?.length && !data.action?.created.automationId) {
        actionLinks.push({ label: "View Template", href: `/templates/${data.action.created.templateIds[0]}/edit` });
      }
      if (data.action?.created.segmentId) {
        actionLinks.push({ label: "View Segment", href: "/segments" });
      }

      // Build insight card from action if one was executed
      let insightCard: InsightCard | undefined;
      if (data.action?.success) {
        const stats: { label: string; value: string }[] = [];
        if (data.action.created.automationId) stats.push({ label: "Automation", value: "Created" });
        if (data.action.created.campaignId) stats.push({ label: "Campaign", value: "Created" });
        if (data.action.created.templateIds?.length) stats.push({ label: "Templates", value: `${data.action.created.templateIds.length}` });
        if (data.action.created.segmentId) stats.push({ label: "Segment", value: "Created" });
        if (stats.length > 0) {
          insightCard = {
            label: data.action.intent.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
            value: "",
            variant: "success",
            stats,
          };
        }
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.isLoading
            ? {
                ...m,
                isLoading: false,
                content: data.reply,
                highlights: data.highlights?.length ? data.highlights : undefined,
                insightCard,
                actionLinks: actionLinks.length > 0 ? actionLinks : undefined,
              }
            : m,
        ),
      );

      if (data.action?.success) {
        toast(data.action.summary, "success");
      }
    },
    onError: (err: { message?: string }) => {
      setIsProcessing(false);
      setMessages((prev) =>
        prev.map((m) =>
          m.isLoading
            ? {
                ...m,
                isLoading: false,
                content: err.message ?? "Something went wrong. Please try again.",
              }
            : m,
        ),
      );
      toast(err.message ?? "Chat failed", "error");
    },
  }) as { mutate: (input: { storeId: string; message: string; chatId?: string; history: { role: "user" | "assistant"; content: string }[] }) => void };

  const sendMessage = useCallback(
    (text: string) => {
      if (!text.trim() || isProcessing || !storeId) return;

      const userMsg: Message = {
        id: nextId(),
        role: "user",
        content: text.trim(),
        timestamp: new Date(),
      };
      const loadingMsg: Message = {
        id: nextId(),
        role: "assistant",
        content: "Thinking...",
        timestamp: new Date(),
        isLoading: true,
      };

      // Build conversation history from non-welcome messages
      const history = messages
        .filter((m) => !m.id.startsWith("welcome-") && !m.isLoading)
        .map((m) => ({ role: m.role, content: m.content }));

      setMessages((prev) => [...prev, userMsg, loadingMsg]);
      setInput("");
      setIsProcessing(true);
      setDynamicSuggestions([]);

      chatMut.mutate({
        storeId,
        chatId: currentChatId,
        message: text.trim(),
        history,
      });
    },
    [isProcessing, storeId, messages, currentChatId],
  );

  const handleSubmit = useCallback(() => {
    sendMessage(input);
  }, [input, sendMessage]);

  const handleNavigate = useCallback((href: string) => {
    setPanelState("collapsed");
    router.push(href);
  }, [router]);

  const handlePillClick = (pill: Pill) => {
    if (pill.href && !pill.instruction) {
      setPanelState("collapsed");
      router.push(pill.href);
      return;
    }
    if (pill.instruction) {
      sendMessage(pill.instruction);
    }
  };

  const startNewChat = useCallback(() => {
    setCurrentChatId(undefined);
    setCurrentChatTitle(undefined);
    setDynamicSuggestions([]);
    setShowChatSwitcher(false);
    if (insights) {
      setMessages(buildWelcomeMessages(insights));
    } else {
      setMessages([]);
    }
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [insights]);

  const loadChat = useCallback(async (chatId: string) => {
    setShowChatSwitcher(false);
    setCurrentChatId(chatId);
    setDynamicSuggestions([]);

    try {
      const chat = await (utils.ai as any).getChat.fetch({ chatId }) as { title?: string; messages?: { id: string; role: string; content: string; highlights: { label: string; value: string }[] | null; createdAt: string }[] };
      if (chat?.messages) {
        setCurrentChatTitle(chat.title || "Chat");
        setMessages(chat.messages.map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          highlights: m.highlights ?? undefined,
          timestamp: new Date(m.createdAt),
        })));
      }
    } catch {
      toast("Failed to load chat", "error");
    }
  }, [utils, toast]);

  const dataReady = !!insights?.storeState.hasSyncedData;
  const suggestions = getSuggestions(insights, pageContext);
  const activeSuggestions = dynamicSuggestions.length > 0 ? dynamicSuggestions : null;

  const toggle = () => {
    setPanelState(panelState === "collapsed" ? "open" : "collapsed");
  };

  const toggleExpand = () => {
    setPanelState(panelState === "expanded" ? "open" : "expanded");
  };

  return (
    <>
      {/* Main panel */}
      <aside
        className={cn(
          "flex flex-col border-l transition-all duration-[400ms] ease-[cubic-bezier(0.4,0,0.2,1)] relative",
          panelState === "open" && "w-[380px] flex-shrink-0 bg-[hsl(var(--ai-panel-bg))] border-border",
          panelState === "collapsed" && "w-0 border-l-0 overflow-hidden",
          panelState === "expanded" &&
            "fixed top-14 right-0 bottom-0 w-[60%] z-50 bg-[hsl(var(--ai-panel-bg))] border-border shadow-[-20px_0_60px_rgba(0,0,0,0.08)]",
        )}
      >
        {/* Toggle button */}
        <button
          onClick={toggle}
          className="absolute top-3 -left-10 w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors z-10"
          title={panelState === "collapsed" ? "Open AI Panel" : "Close AI Panel"}
        >
          {panelState === "collapsed" ? (
            <ChevronLeft className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>

        {/* Expand button */}
        <button
          onClick={toggleExpand}
          className="absolute top-3 right-3 w-7 h-7 rounded-md bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors z-10"
          title={panelState === "expanded" ? "Collapse panel" : "Expand to full view"}
        >
          {panelState === "expanded" ? (
            <Minimize2 className="w-3.5 h-3.5" />
          ) : (
            <Maximize2 className="w-3.5 h-3.5" />
          )}
        </button>

        {/* Header with chat switcher */}
        <div className="relative" ref={switcherRef}>
          <div className="px-5 py-4 border-b border-border flex items-center gap-2.5">
            <div
              className={cn(
                "w-2 h-2 rounded-full flex-shrink-0",
                isProcessing ? "bg-primary animate-pulse" : storeId ? "bg-[hsl(var(--success))]" : "bg-muted-foreground",
              )}
            />
            {/* Chat switcher trigger + rename */}
            {editingHeaderTitle && currentChatId ? (
              <div className="flex-1 min-w-0">
                <input
                  value={headerTitleDraft}
                  onChange={(e) => setHeaderTitleDraft(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === "Enter" && headerTitleDraft.trim()) {
                      await renameChatMut.mutateAsync({ chatId: currentChatId, title: headerTitleDraft.trim() });
                      setCurrentChatTitle(headerTitleDraft.trim());
                      setEditingHeaderTitle(false);
                    }
                    if (e.key === "Escape") setEditingHeaderTitle(false);
                  }}
                  onBlur={async () => {
                    if (headerTitleDraft.trim() && headerTitleDraft.trim() !== currentChatTitle) {
                      await renameChatMut.mutateAsync({ chatId: currentChatId, title: headerTitleDraft.trim() });
                      setCurrentChatTitle(headerTitleDraft.trim());
                    }
                    setEditingHeaderTitle(false);
                  }}
                  className="w-full px-2 py-1 bg-background border border-foreground/30 rounded-lg text-[13px] font-mono font-bold text-foreground focus:outline-none focus:border-foreground"
                  autoFocus
                />
              </div>
            ) : (
              <button
                onClick={() => setShowChatSwitcher(!showChatSwitcher)}
                className={cn(
                  "flex-1 text-left flex items-center gap-2 min-w-0 px-2.5 py-1.5 rounded-lg border transition-all",
                  showChatSwitcher
                    ? "border-foreground/20 bg-muted"
                    : "border-border hover:border-foreground/20 hover:bg-muted/50",
                )}
              >
                <MessageSquare className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-mono font-bold text-foreground truncate">
                    {currentChatTitle || "Allo AI"}
                  </div>
                  {chatHistory?.chats && chatHistory.chats.length > 0 && (
                    <div className="text-[10px] font-mono text-muted-foreground truncate">
                      {chatHistory.chats.length} conversation{chatHistory.chats.length !== 1 ? "s" : ""}
                    </div>
                  )}
                </div>
                <ChevronDown className={cn(
                  "w-3.5 h-3.5 text-muted-foreground transition-transform flex-shrink-0",
                  showChatSwitcher && "rotate-180",
                )} />
              </button>
            )}
            {/* Rename button */}
            {currentChatId && currentChatTitle && !editingHeaderTitle && (
              <button
                onClick={() => {
                  setShowChatSwitcher(false);
                  setHeaderTitleDraft(currentChatTitle);
                  setEditingHeaderTitle(true);
                }}
                className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0"
                title="Rename chat"
              >
                <Pencil className="w-3 h-3" />
              </button>
            )}
            {/* New chat button */}
            <button
              onClick={startNewChat}
              className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0"
              title="New chat"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Chat switcher dropdown */}
          {showChatSwitcher && (
            <div className="absolute top-full left-0 right-0 z-50 bg-[hsl(var(--ai-panel-bg))] border-b border-border shadow-[0_8px_30px_rgba(0,0,0,0.12)] max-h-[400px] flex flex-col">
              {/* Search */}
              <div className="px-3 py-2 border-b border-border">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                  <input
                    value={chatSearch}
                    onChange={(e) => setChatSearch(e.target.value)}
                    placeholder="Search chats..."
                    className="w-full pl-7 pr-3 py-1.5 bg-muted border border-border rounded-lg text-[11px] font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground/30"
                    autoFocus
                  />
                </div>
              </div>

              {/* New conversation option */}
              <button
                onClick={() => { startNewChat(); }}
                className={cn(
                  "flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-muted transition-colors border-b border-border/50",
                  !currentChatId && "bg-muted",
                )}
              >
                <Plus className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className="text-[12px] font-mono font-medium text-foreground">New conversation</span>
              </button>

              {/* Chat list */}
              <div className="flex-1 overflow-y-auto">
                {(() => {
                  const chats = chatHistory?.chats ?? [];
                  const filtered = chatSearch.trim()
                    ? chats.filter((c) => c.title.toLowerCase().includes(chatSearch.toLowerCase()))
                    : chats;

                  if (filtered.length === 0) {
                    return (
                      <div className="text-center py-6">
                        <MessageSquare className="w-4 h-4 text-muted-foreground/30 mx-auto mb-1.5" />
                        <p className="text-[11px] text-muted-foreground font-mono">
                          {chatSearch.trim() ? "No matching chats" : "No previous chats"}
                        </p>
                      </div>
                    );
                  }

                  return filtered.map((chat) => (
                    <div
                      key={chat.id}
                      className={cn(
                        "group flex items-start gap-2.5 px-4 py-2.5 cursor-pointer hover:bg-muted transition-colors",
                        currentChatId === chat.id && "bg-muted border-l-2 border-foreground",
                      )}
                      onClick={() => { if (editingChatId !== chat.id) loadChat(chat.id); }}
                    >
                      <div className="flex-1 min-w-0">
                        {editingChatId === chat.id ? (
                          <input
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onKeyDown={async (e) => {
                              if (e.key === "Enter" && editingTitle.trim()) {
                                await renameChatMut.mutateAsync({ chatId: chat.id, title: editingTitle.trim() });
                                if (currentChatId === chat.id) setCurrentChatTitle(editingTitle.trim());
                                setEditingChatId(null);
                              }
                              if (e.key === "Escape") setEditingChatId(null);
                            }}
                            onBlur={async () => {
                              if (editingTitle.trim() && editingTitle.trim() !== chat.title) {
                                await renameChatMut.mutateAsync({ chatId: chat.id, title: editingTitle.trim() });
                                if (currentChatId === chat.id) setCurrentChatTitle(editingTitle.trim());
                              }
                              setEditingChatId(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full px-1.5 py-0.5 -ml-1.5 bg-background border border-foreground/30 rounded text-[12px] font-mono font-medium text-foreground focus:outline-none focus:border-foreground"
                            autoFocus
                          />
                        ) : (
                          <div className="text-[12px] font-mono font-medium text-foreground truncate">
                            {chat.title}
                          </div>
                        )}
                        <div className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate">
                          {chat.lastMessage}
                        </div>
                        <div className="text-[9px] text-muted-foreground/50 font-mono mt-0.5">
                          {timeAgo(new Date(chat.updatedAt))} · {chat.messageCount} msg
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 flex-shrink-0 mt-0.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingChatId(chat.id);
                            setEditingTitle(chat.title);
                          }}
                          className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
                          title="Rename chat"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteChatMut.mutate({ chatId: chat.id });
                            if (currentChatId === chat.id) startNewChat();
                          }}
                          className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground/40 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                          title="Delete chat"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          )}
        </div>

        {/* Messages area — always visible */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} onNavigate={handleNavigate} />
          ))}

          {/* Dynamic suggestion pills from AI response */}
          {!isProcessing && activeSuggestions && (
            <div className="pl-[34px]">
              <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
                Follow up
              </div>
              <div className="flex flex-wrap gap-1.5">
                {activeSuggestions.map((text) => (
                  <button
                    key={text}
                    onClick={() => sendMessage(text)}
                    className="px-3 py-1.5 rounded-full bg-[hsl(var(--accent-bg))] border border-border text-[hsl(var(--accent))] font-mono text-[11px] hover:border-primary/50 transition-colors text-left"
                  >
                    {text}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Static suggestion pills — fallback when no dynamic suggestions */}
          {!isProcessing && !activeSuggestions && suggestions.length > 0 && (
            <div className="pl-[34px]">
              <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
                Suggested actions
              </div>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((pill) => (
                  <button
                    key={pill.label}
                    onClick={() => handlePillClick(pill)}
                    className="px-3 py-1.5 rounded-full bg-[hsl(var(--accent-bg))] border border-border text-[hsl(var(--accent))] font-mono text-[11px] hover:border-primary/50 transition-colors"
                  >
                    {pill.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="px-5 py-4 border-t border-border">
          <div className="relative">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) handleSubmit();
              }}
              placeholder={!storeId ? "Connect a store to start..." : !dataReady ? "Complete setup checklist first..." : "Ask Allo anything..."}
              disabled={isProcessing || !storeId || !dataReady}
              className="w-full pl-4 pr-10 py-2.5 rounded-xl bg-muted border border-border text-[13px] font-sans text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground focus:shadow-[0_0_0_1px_hsl(var(--foreground))] transition-colors disabled:opacity-50"
            />
            <button
              onClick={handleSubmit}
              disabled={isProcessing || !input.trim() || !storeId || !dataReady}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-primary hover:bg-[hsl(var(--accent-bg))] transition-colors disabled:opacity-30"
            >
              {isProcessing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </aside>

      {/* Floating button when collapsed */}
      {panelState === "collapsed" && (
        <button
          onClick={() => {
            setPanelState("open");
            setTimeout(() => inputRef.current?.focus(), 200);
          }}
          className="fixed bottom-6 right-6 w-12 h-12 rounded-[14px] bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:scale-110 transition-transform z-[60]"
          title="Open Allo AI"
        >
          <Sparkles className="w-5 h-5" />
        </button>
      )}
    </>
  );
});

// ---------------------------------------------------------------------------
// Provider — wraps layout so TopBar can call openPanel / focusInput
// ---------------------------------------------------------------------------

const PanelRefContext = createContext<React.RefObject<AlloAIPanelHandle | null> | null>(null);

export function AlloAIPanelProvider({ children }: { children: React.ReactNode }) {
  const panelRef = useRef<AlloAIPanelHandle>(null);

  const value: AlloAIPanelContextType = {
    openPanel: () => panelRef.current?.open(),
    focusInput: () => panelRef.current?.focusInput(),
  };

  return (
    <AlloAIPanelContext.Provider value={value}>
      <PanelRefContext.Provider value={panelRef}>
        {children}
      </PanelRefContext.Provider>
    </AlloAIPanelContext.Provider>
  );
}

/** Renders the panel — place this inside AlloAIPanelProvider where the panel should appear */
export function AlloAIPanelSlot() {
  const panelRef = useContext(PanelRefContext);
  return <AlloAIPanel ref={panelRef} />;
}
