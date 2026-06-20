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
  PanelLeftClose,
  PanelLeftOpen,
  X,
  Send,
  Loader2,
  ArrowRight,
  Search,
  Plus,
  Trash2,
  Pencil,
  MessageSquare,
  Check,
  PartyPopper,
  Brain,
  ShoppingCart,
  TrendingDown,
  Package,
  RefreshCw,
  Eye,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@allohq/ui";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";
import { useMobileSidebar } from "@/components/layout/MobileSidebarContext";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion, AnimatePresence } from "framer-motion";
import { CampaignPreviewCard } from "./CampaignPreviewCard";

// ---------------------------------------------------------------------------
// Context — lets TopBar & Cmd+K open/focus the panel
// ---------------------------------------------------------------------------

type AlloAIPanelContextType = {
  openPanel: () => void;
  focusInput: () => void;
  setInput: (text: string) => void;
};

const AlloAIPanelContext = createContext<AlloAIPanelContextType>({
  openPanel: () => {},
  focusInput: () => {},
  setInput: () => {},
});

export const useAlloAI = () => useContext(AlloAIPanelContext);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PanelState = "open" | "collapsed" | "expanded" | "fullscreen";

interface InsightCard {
  label: string;
  value: string;
  description?: string;
  variant: "accent" | "success" | "warning";
  stats?: { label: string; value: string }[];
}

interface CampaignPreviewData {
  previewHtml: string;
  subject: string;
  campaignName: string;
  draftCampaignId: string;
  estimatedRecipients?: number;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  insightCard?: InsightCard;
  highlights?: { label: string; value: string }[];
  actionLinks?: { label: string; href: string }[];
  toolCalls?: string[];
  isLoading?: boolean;
  campaignPreview?: CampaignPreviewData;
}


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
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
// Rotating placeholder
// ---------------------------------------------------------------------------

const PLACEHOLDERS = [
  "Ask allo anything...",
  "What should I focus on today?",
  "Help me create a campaign for...",
  "Who's at risk of slipping away?",
  "How did last week go?",
];

function useRotatingPlaceholder(enabled: boolean) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % PLACEHOLDERS.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [enabled]);
  return PLACEHOLDERS[index] ?? PLACEHOLDERS[0]!;
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
  recoveryOpportunities?: {
    abandonedCarts: { count: number; totalValue: number };
    cartRecovery: { count: number; estimatedRevenue: number };
    priceDrop: { count: number; estimatedRevenue: number };
    restock: { count: number; estimatedRevenue: number };
    repurchase: { count: number; estimatedRevenue: number };
    totalEstimatedRevenue: number;
    totalOpportunities: number;
  };
};

type Pill = { label: string; instruction: string | null; href?: string };

function getDynamicSuggestions(insights: PanelInsights | undefined, pageContext: string): Pill[] {
  if (!insights) return [];
  if (!insights.storeState.hasSyncedData) return [];

  const pills: Pill[] = [];

  // Context-aware suggestions
  if (pageContext === "dashboard") {
    if (insights.segmentAlerts.atRiskCount > 0) {
      pills.push({ label: `${insights.segmentAlerts.atRiskCount} customers at churn risk`, instruction: "Show me at-risk customers and create a win-back campaign" });
    }
    if (!insights.storeState.hasCampaigns) {
      pills.push({ label: "It's been quiet — let's reach out", instruction: "Create a promotional email campaign" });
    }
    if (insights.segmentAlerts.championsCount > 0) {
      pills.push({ label: `Reward ${insights.segmentAlerts.championsCount} VIP customers`, instruction: "Create a VIP reward campaign for champion customers" });
    }
    pills.push({ label: "How did last week go?", instruction: "Analyze my store performance from the last 7 days" });
    // Recovery opportunity pills
    if (insights.recoveryOpportunities && insights.recoveryOpportunities.abandonedCarts.count > 0) {
      pills.push({
        label: `Recover ${insights.recoveryOpportunities.abandonedCarts.count} abandoned carts`,
        instruction: `I see ${insights.recoveryOpportunities.abandonedCarts.count} abandoned carts worth ${new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(insights.recoveryOpportunities.abandonedCarts.totalValue)}. Send recovery emails for all of them.`,
      });
    }
  } else if (pageContext === "customers") {
    pills.push({ label: "Who's at risk of slipping away?", instruction: "Show me customers who are at risk of churning" });
    pills.push({ label: "Find your top spenders", instruction: "Find customers who spent over ₹200 in the last 90 days" });
  } else if (pageContext === "campaigns" || pageContext === "templates") {
    pills.push({ label: "Help me create a campaign", instruction: "Create a new email campaign" });
    pills.push({ label: "Draft an email template", instruction: "Create a promotional email template" });
  } else if (pageContext === "automations") {
    pills.push({ label: "Turn on what I'd recommend", instruction: "Show me all recommended automations and activate them" });
  } else if (pageContext === "analytics") {
    pills.push({ label: "How's this month vs last?", instruction: "Compare this month's performance to last month" });
    pills.push({ label: "Where's revenue coming from?", instruction: "Show me a breakdown of revenue by channel" });
  } else if (pageContext === "segments") {
    pills.push({ label: "How have segments shifted?", instruction: "Show me how customer segments have shifted recently" });
  }

  if (!insights.storeState.hasBrandProfile) {
    pills.push({ label: "Learn my brand voice", instruction: "Analyze my brand voice" });
  }

  pills.push({ label: "Look back over the last 30 days", instruction: "Analyze my customer data from the last 30 days" });

  return pills.slice(0, 4);
}

// ---------------------------------------------------------------------------
// Build briefing-style welcome message
// ---------------------------------------------------------------------------

function buildBriefingMessage(insights: PanelInsights, briefingData: any): Message[] {
  const messages: Message[] = [];
  const now = new Date();

  if (!insights.storeState.hasStore) {
    messages.push({
      id: "welcome-no-store",
      role: "assistant",
      content: "Hi, I'm allo. Connect your Shopify store from the dashboard and I'll get to work — I'll be right here once you're set up.",
      timestamp: now,
    });
    return messages;
  }

  if (!insights.storeState.hasSyncedData) {
    messages.push({
      id: "welcome-syncing",
      role: "assistant",
      content: "Your store is connected — I'm pulling in your data now. This usually takes a minute or two, and you'll see progress here as I get going.",
      timestamp: now,
    });
    return messages;
  }

  if (!insights.storeState.hasAutomations && !insights.storeState.hasActiveAutomations) {
    messages.push({
      id: "welcome-activating",
      role: "assistant",
      content: "Your data is in. I'm setting things up now — building your first automations and looking for opportunities. You can follow along above.",
      timestamp: now,
    });
    return messages;
  }

  // Build conversational briefing
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const parts: string[] = [];
  parts.push(`${greeting}. Here's where things stand:`);
  parts.push("");

  // Revenue & orders
  if (insights.metrics.revenueThisMonth > 0) {
    const trend = insights.metrics.revenueTrend;
    const trendText = trend > 0 ? `up ${trend}%` : trend < 0 ? `down ${Math.abs(trend)}%` : "steady";
    parts.push(`Revenue this month: ${formatCurrency(insights.metrics.revenueThisMonth)} (${trendText} vs last month)`);
  }

  // Customers
  if (insights.metrics.totalCustomers > 0) {
    parts.push(`${insights.metrics.totalCustomers.toLocaleString("en-IN")} total customers`);
  }

  // Alerts
  if (insights.segmentAlerts.atRiskCount > 0) {
    parts.push(`${insights.segmentAlerts.atRiskCount} customers at risk of churning`);
  }

  // Automations
  if (insights.metrics.totalAutomations > 0) {
    parts.push(`${insights.metrics.activeAutomations} of ${insights.metrics.totalAutomations} automations active`);
  }

  // Recovery opportunities
  if (insights.recoveryOpportunities && insights.recoveryOpportunities.totalOpportunities > 0) {
    const ro = insights.recoveryOpportunities;
    const opportunityParts: string[] = [];
    if (ro.abandonedCarts.count > 0) {
      opportunityParts.push(`${ro.abandonedCarts.count} abandoned cart${ro.abandonedCarts.count > 1 ? "s" : ""} worth ${formatCurrency(ro.abandonedCarts.totalValue)}`);
    }
    if (ro.priceDrop.count > 0) {
      opportunityParts.push(`${ro.priceDrop.count} price drop alert${ro.priceDrop.count > 1 ? "s" : ""}`);
    }
    if (ro.restock.count > 0) {
      opportunityParts.push(`${ro.restock.count} restock alert${ro.restock.count > 1 ? "s" : ""}`);
    }
    if (ro.repurchase.count > 0) {
      opportunityParts.push(`${ro.repurchase.count} repurchase reminder${ro.repurchase.count > 1 ? "s" : ""}`);
    }
    if (opportunityParts.length > 0) {
      parts.push("");
      parts.push(`**Revenue to recover:** I'm seeing ${opportunityParts.join(", ")}. Want me to reach out for you?`);
    }
  }

  // Briefing content if available
  if (briefingData?.content) {
    const bc = briefingData.content as any;
    if (bc.summary) {
      parts.push("");
      parts.push(bc.summary);
    }
  }

  parts.push("");
  parts.push("What would you like to focus on?");

  messages.push({
    id: "welcome-briefing",
    role: "assistant",
    content: parts.join("\n"),
    timestamp: now,
  });

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
      text: "text-[var(--color-accent)]",
    },
    success: {
      bg: "bg-[hsl(var(--success-bg))]",
      border: "border-[hsl(var(--success)/0.2)]",
      text: "text-[var(--color-success)]",
    },
    warning: {
      bg: "bg-[hsl(var(--accent-bg))]",
      border: "border-border",
      text: "text-[var(--color-warning)]",
    },
  };
  const colors = colorMap[card.variant];

  return (
    <div className={cn("rounded-xl p-3.5 border mt-2.5 mb-1", colors.bg, colors.border)}>
      <div className={cn("font-sans text-[10px] uppercase tracking-wider mb-1.5", colors.text)}>
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
              <div className="font-sans text-[10px] text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recovery Opportunity Cards — proactive revenue recovery surface
// ---------------------------------------------------------------------------

type RecoveryCardType = "cart_recovery" | "price_drop_alert" | "restock_alert" | "repurchase_reminder";

const RECOVERY_CARD_CONFIG: Record<RecoveryCardType, {
  icon: typeof ShoppingCart;
  label: string;
  accentColor: string;
  accentBg: string;
  accentBorder: string;
  description: (count: number) => string;
}> = {
  cart_recovery: {
    icon: ShoppingCart,
    label: "Abandoned carts",
    accentColor: "text-amber-500",
    accentBg: "bg-amber-500/10",
    accentBorder: "border-amber-500/20",
    description: (count) => `${count} cart${count !== 1 ? "s" : ""} left behind. I've drafted recovery emails — ready when you are.`,
  },
  price_drop_alert: {
    icon: TrendingDown,
    label: "Price drops",
    accentColor: "text-blue-500",
    accentBg: "bg-blue-500/10",
    accentBorder: "border-blue-500/20",
    description: (count) => `${count} product${count !== 1 ? "s" : ""} dropped in price — let's tell the customers who were watching.`,
  },
  restock_alert: {
    icon: Package,
    label: "Back in stock",
    accentColor: "text-emerald-500",
    accentBg: "bg-emerald-500/10",
    accentBorder: "border-emerald-500/20",
    description: (count) => `${count} product${count !== 1 ? "s" : ""} back in stock — let's let waiting customers know.`,
  },
  repurchase_reminder: {
    icon: RefreshCw,
    label: "Time to reorder",
    accentColor: "text-purple-500",
    accentBg: "bg-purple-500/10",
    accentBorder: "border-purple-500/20",
    description: (count) => `${count} customer${count !== 1 ? "s" : ""} due for a refill — a gentle nudge could bring them back.`,
  },
};

function RecoveryOpportunityCards({
  storeId,
  onApproveAll,
  onReview,
}: {
  storeId: string;
  onApproveAll: (type: RecoveryCardType, actionIds: string[]) => void;
  onReview: (type: RecoveryCardType) => void;
}) {
  const { data, isLoading } = (trpc.dashboard as any).recoveryOpportunities.useQuery(
    { storeId },
    { enabled: !!storeId, refetchInterval: 30_000 },
  ) as {
    data: {
      abandonedCarts: { count: number; totalValue: number };
      opportunities: {
        id: string;
        type: string;
        estimatedRevenue: number | null;
        createdAt: string;
        payload: unknown;
        reasoning: string;
      }[];
    } | undefined;
    isLoading: boolean;
  };

  const [approvingType, setApprovingType] = useState<string | null>(null);
  const bulkApproveMut = (trpc.autonomy as any).bulkApprove.useMutation({
    onSuccess: () => setApprovingType(null),
    onError: () => setApprovingType(null),
  }) as { mutate: (input: { actionIds: string[] }) => void; isPending: boolean };

  if (isLoading || !data) return null;

  // Group opportunities by type
  const grouped = new Map<RecoveryCardType, { ids: string[]; count: number; totalRevenue: number }>();

  // Add abandoned carts as cart_recovery if they exist
  if (data.abandonedCarts.count > 0) {
    grouped.set("cart_recovery", {
      ids: [],
      count: data.abandonedCarts.count,
      totalRevenue: data.abandonedCarts.totalValue,
    });
  }

  for (const opp of data.opportunities) {
    const type = opp.type as RecoveryCardType;
    const existing = grouped.get(type);
    if (existing) {
      existing.ids.push(opp.id);
      existing.count += 1;
      existing.totalRevenue += opp.estimatedRevenue ?? 0;
    } else {
      grouped.set(type, {
        ids: [opp.id],
        count: 1,
        totalRevenue: opp.estimatedRevenue ?? 0,
      });
    }
  }

  if (grouped.size === 0) return null;

  const entries = Array.from(grouped.entries());

  return (
    <div className="space-y-2 mb-3">
      <div className="font-sans text-[10px] text-muted-foreground uppercase tracking-wider">
        Revenue to recover
      </div>
      <AnimatePresence mode="popLayout">
        {entries.map(([type, info], i) => {
          const config = RECOVERY_CARD_CONFIG[type];
          if (!config) return null;
          const Icon = config.icon;

          return (
            <motion.div
              key={type}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8, transition: { duration: 0.2 } }}
              transition={{ delay: i * 0.08, duration: 0.35, ease: "easeOut" }}
              className={cn(
                "rounded-xl border p-3",
                config.accentBg,
                config.accentBorder,
              )}
            >
              <div className="flex items-start gap-2.5">
                <div className={cn(
                  "w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0",
                  config.accentBg,
                )}>
                  <Icon className={cn("w-3.5 h-3.5", config.accentColor)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className={cn("font-sans text-[10px] uppercase tracking-wider", config.accentColor)}>
                      {config.label}
                    </div>
                    {info.totalRevenue > 0 && (
                      <div className="font-mono text-[11px] font-bold text-foreground">
                        {formatCurrency(info.totalRevenue)}
                      </div>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed font-sans">
                    {config.description(info.count)}
                  </div>
                  <div className="flex gap-1.5 mt-2">
                    {info.ids.length > 0 && (
                      <button
                        onClick={() => {
                          setApprovingType(type);
                          onApproveAll(type, info.ids);
                          bulkApproveMut.mutate({ actionIds: info.ids });
                        }}
                        disabled={approvingType === type}
                        className={cn(
                          "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-sans font-medium transition-all",
                          approvingType === type
                            ? "bg-muted text-muted-foreground"
                            : cn("text-white", type === "cart_recovery" ? "bg-amber-500 hover:bg-amber-600" : type === "price_drop_alert" ? "bg-blue-500 hover:bg-blue-600" : type === "restock_alert" ? "bg-emerald-500 hover:bg-emerald-600" : "bg-purple-500 hover:bg-purple-600"),
                        )}
                      >
                        {approvingType === type ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-3 h-3" />
                        )}
                        {approvingType === type ? "Sending..." : "Send all"}
                      </button>
                    )}
                    <button
                      onClick={() => onReview(type)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border text-[10px] font-sans text-foreground hover:bg-muted transition-colors"
                    >
                      <Eye className="w-3 h-3" />
                      Review
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

const AGENT_STEPS = [
  { icon: "🔍", text: "Looking through your store data..." },
  { icon: "📊", text: "Reading your customer segments..." },
  { icon: "🧠", text: "Thinking through the best approach..." },
  { icon: "🛠", text: "Pulling together what I need..." },
  { icon: "✍️", text: "Writing this up for you..." },
  { icon: "🔄", text: "Making sense of the results..." },
  { icon: "📝", text: "Putting your answer together..." },
];

function AgentActivityIndicator() {
  const [stepIdx, setStepIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed((e) => e + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // Progress through steps at varying intervals
    const stepTimings = [2, 4, 6, 9, 12, 16, 20]; // cumulative seconds for each step
    const newIdx = stepTimings.findIndex((t) => elapsed < t);
    const idx = newIdx === -1 ? AGENT_STEPS.length - 1 : newIdx;
    setStepIdx(idx);

    // Mark previous steps as completed
    const completed = stepTimings
      .map((t, i) => (elapsed >= t ? i : -1))
      .filter((i) => i >= 0);
    setCompletedSteps(completed);
  }, [elapsed]);

  const currentStep = AGENT_STEPS[stepIdx] ?? AGENT_STEPS[AGENT_STEPS.length - 1]!;

  return (
    <div className="flex gap-2.5">
      <div className="w-6 h-6 rounded-lg bg-[hsl(var(--accent-bg))] flex items-center justify-center flex-shrink-0 mt-0.5">
        <Sparkles className="w-3 h-3 text-[var(--color-warning)] animate-spin" style={{ animationDuration: "3s" }} />
      </div>
      <div className="flex-1 min-w-0 border-l-2 border-[var(--color-warning)]/30 pl-3">
        {/* Completed steps */}
        <div className="space-y-1 mb-1.5">
          {completedSteps.map((idx) => {
            const step = AGENT_STEPS[idx];
            if (!step) return null;
            return (
              <div key={idx} className="flex items-center gap-2 text-[11px] font-sans text-muted-foreground/60">
                <Check className="w-3 h-3 text-[var(--color-success)]" />
                <span>{step.text.replace("...", "")}</span>
              </div>
            );
          })}
        </div>

        {/* Current step */}
        <div className="flex items-center gap-2 py-0.5">
          <div className="flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-warning)] animate-[warm-pulse_1.5s_ease-in-out_infinite]" />
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-warning)] animate-[warm-pulse_1.5s_ease-in-out_infinite_0.3s]" />
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-warning)] animate-[warm-pulse_1.5s_ease-in-out_infinite_0.6s]" />
          </div>
          <span className="text-[12px] font-sans text-[var(--color-warning)]">
            {currentStep.text}
          </span>
        </div>

        {/* Timer */}
        <div className="text-[10px] font-mono text-muted-foreground/40 mt-1">
          {elapsed}s elapsed
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message, onNavigate, onApproveCampaign, onEditCampaign }: { message: Message; onNavigate?: (href: string) => void; onApproveCampaign?: (campaignId: string) => void; onEditCampaign?: (campaignId: string) => void }) {

  if (message.isLoading) {
    return <AgentActivityIndicator />;
  }

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] px-3.5 py-2.5 rounded-xl rounded-br-sm bg-foreground text-background">
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
        <Sparkles className="w-3 h-3 text-[var(--color-accent)]" />
      </div>
      <div className="flex-1 min-w-0 border-l-2 border-[var(--color-accent)]/20 pl-3 rounded-xl rounded-bl-sm">
        {/* Tool calls indicator */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {message.toolCalls.map((tool, i) => (
              <span
                key={`${tool}-${i}`}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--color-success)]/10 border border-[var(--color-success)]/20 text-[10px] font-mono text-[var(--color-success)]"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)]" />
                {tool.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        )}
        {/* Highlight metric cards */}
        {message.highlights && message.highlights.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {message.highlights.map((h) => (
              <div
                key={h.label}
                className="flex-1 min-w-[80px] rounded-xl bg-[hsl(var(--accent-bg))] border border-border px-3 py-2.5"
              >
                <div className="font-sans text-[10px] uppercase tracking-wider text-muted-foreground">
                  {h.label}
                </div>
                <div className="font-mono text-[15px] font-bold text-[var(--color-accent)] mt-0.5">
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
                <h2 className="text-[14px] font-semibold font-serif text-foreground mt-3 mb-1.5 first:mt-0">
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3 className="text-[13px] font-semibold font-serif text-foreground mt-2.5 mb-1 first:mt-0">
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
                  <code className="px-1.5 py-0.5 rounded-md bg-muted text-[12px] font-mono text-[var(--color-accent)]">
                    {children}
                  </code>
                ) : (
                  <code className="block p-3 rounded-lg bg-muted text-[12px] font-mono overflow-x-auto mb-2">
                    {children}
                  </code>
                );
              },
              blockquote: ({ children }) => (
                <blockquote className="border-l-2 border-[var(--color-accent)] pl-3 my-2 text-muted-foreground italic">
                  {children}
                </blockquote>
              ),
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>

        {message.insightCard && <InsightCardView card={message.insightCard} />}
        {message.campaignPreview && (
          <CampaignPreviewCard
            previewHtml={message.campaignPreview.previewHtml}
            subject={message.campaignPreview.subject}
            campaignName={message.campaignPreview.campaignName}
            draftCampaignId={message.campaignPreview.draftCampaignId}
            estimatedRecipients={message.campaignPreview.estimatedRecipients}
            onApprove={(id) => onApproveCampaign?.(id)}
            onEdit={(id) => onEditCampaign?.(id)}
          />
        )}
        {message.actionLinks && message.actionLinks.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {message.actionLinks.map((link) => (
              <button
                key={link.href}
                onClick={() => onNavigate?.(link.href)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-[hsl(var(--accent-bg))] border border-border text-[var(--color-accent)] font-sans text-[11px] hover:border-[var(--color-accent)]/50 transition-colors"
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
// Activation Progress Panel — replaces chat during store activation
// ---------------------------------------------------------------------------

type ActivationData = {
  isActivating: boolean;
  isRecentlyActivated: boolean;
  activatedAt: string | null;
  overallProgress: number;
  steps: { key: string; label: string; status: string; detail?: string }[];
  automationProgress?: {
    items: { id: string; name: string; status: string; category: string }[];
    total: number;
    generating: number;
  };
  context?: { pendingActions: number };
};

function ActivationStatusIcon({ status }: { status: string }) {
  if (status === "done" || status === "active" || status === "ready") {
    return (
      <div className="w-5 h-5 rounded-full bg-[var(--color-success)]/15 flex items-center justify-center flex-shrink-0">
        <Check className="w-3 h-3 text-[var(--color-success)]" />
      </div>
    );
  }
  if (status === "running" || status === "generating") {
    return <Loader2 className="w-5 h-5 animate-spin text-[var(--color-warning)] flex-shrink-0" />;
  }
  // pending / queued
  return <div className="w-5 h-5 rounded-full border border-border flex-shrink-0" />;
}

const ACTIVATION_LOG_MESSAGES: Record<string, string[]> = {
  generating: [
    "Mapping out when this should trigger",
    "Building the email sequence with the right timing",
    "Writing subject lines and body copy",
    "Setting up variants to test",
    "Choosing who this should reach",
  ],
  analysis: [
    "Looking through your product catalog",
    "Working out customer lifetime value",
    "Spotting who's at risk of slipping away",
    "Grouping your customers into segments",
    "Learning your brand voice from your store",
  ],
};

function ActivationProgressPanel({ activation }: { activation: ActivationData }) {
  const steps = activation.steps ?? [];
  const items = activation.automationProgress?.items ?? [];
  const total = activation.automationProgress?.total ?? 0;
  const generating = activation.automationProgress?.generating ?? 0;
  const doneCount = steps.filter((s) => s.status === "done").length + (total - generating);
  const totalTasks = steps.length + total;

  // Elapsed timer
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Activity log — accumulates messages over time
  const [logEntries, setLogEntries] = useState<{ time: number; text: string }[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const lastLogTimeRef = useRef(0);

  useEffect(() => {
    // Add a new log entry every 3-5 seconds
    if (elapsed - lastLogTimeRef.current < 3) return;
    lastLogTimeRef.current = elapsed;

    const generatingItem = items.find((i) => i.status === "generating");
    const runningStep = steps.find((s) => s.status === "running");

    let pool: string[];
    if (generatingItem) {
      const name = generatingItem.name.replace(" Automation", "");
      pool = [
        ...(ACTIVATION_LOG_MESSAGES.generating ?? []).map((m) => `${name}: ${m}`),
        `${name}: Finding the best times to send`,
        `${name}: Matching the tone to your brand`,
      ];
    } else if (runningStep) {
      pool = ACTIVATION_LOG_MESSAGES.analysis ?? [];
    } else {
      pool = ["Putting the finishing touches on things...", "Double-checking everything looks right..."];
    }

    const usedTexts = new Set(logEntries.map((e) => e.text));
    const available = pool.filter((m) => !usedTexts.has(m));
    const msg = available.length > 0
      ? available[Math.floor(Math.random() * available.length)]!
      : pool[Math.floor(Math.random() * pool.length)]!;

    setLogEntries((prev) => [...prev.slice(-15), { time: elapsed, text: msg }]);
  }, [elapsed, items, steps]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll log
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [logEntries]);

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-[var(--color-warning)]/10 flex items-center justify-center">
          <Brain className="w-4 h-4 text-[var(--color-warning)] animate-pulse" />
        </div>
        <div className="flex-1">
          <div className="text-[14px] font-serif font-semibold text-foreground">
            Setting things up for you
          </div>
          <div className="flex items-center gap-3 text-[11px] font-mono text-muted-foreground">
            <span>{doneCount} of {totalTasks} done</span>
            <span className="text-muted-foreground/40">•</span>
            <span>{fmtTime(elapsed)} elapsed</span>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-[var(--color-warning)] rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${activation.overallProgress}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>

      {/* Automations + Analysis in compact view */}
      <div className="space-y-1">
        {items.map((item) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2.5 py-1"
          >
            <ActivationStatusIcon status={item.status} />
            <span className={cn(
              "text-[12px] font-sans flex-1 truncate",
              (item.status === "active" || item.status === "ready") ? "text-foreground" :
              item.status === "generating" ? "text-[var(--color-warning)]" :
              "text-muted-foreground"
            )}>
              {item.name.replace(" Automation", "")}
            </span>
            <span className={cn(
              "text-[10px] font-sans capitalize flex-shrink-0",
              item.status === "active" ? "text-[var(--color-success)]" :
              item.status === "ready" ? "text-[var(--color-accent)]" :
              item.status === "generating" ? "text-[var(--color-warning)]" :
              "text-muted-foreground"
            )}>
              {item.status === "active" ? "Active" :
               item.status === "ready" ? "Ready" :
               item.status}
            </span>
          </motion.div>
        ))}
        {steps.map((step) => (
          <div key={step.key} className="flex items-center gap-2.5 py-1">
            <ActivationStatusIcon status={step.status} />
            <span className={cn(
              "text-[12px] font-sans truncate",
              step.status === "done" ? "text-foreground" :
              step.status === "running" ? "text-[var(--color-warning)]" :
              "text-muted-foreground"
            )}>
              {step.label}
            </span>
          </div>
        ))}
      </div>

      {/* Live activity log */}
      {logEntries.length > 0 && (
        <div>
          <div className="text-[10px] font-sans uppercase tracking-wider text-muted-foreground/60 mb-1.5">
            Live activity
          </div>
          <div
            ref={logRef}
            className="max-h-[180px] overflow-y-auto space-y-0.5 border-l-2 border-[var(--color-warning)]/20 pl-3"
          >
            {logEntries.map((entry, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="flex items-start gap-2 py-0.5"
              >
                <span className="text-[9px] font-mono text-muted-foreground/40 w-8 flex-shrink-0 pt-px">
                  {fmtTime(entry.time)}
                </span>
                <span className={cn(
                  "text-[11px] font-sans",
                  i === logEntries.length - 1
                    ? "text-[var(--color-warning)]"
                    : "text-muted-foreground/60"
                )}>
                  {entry.text}
                </span>
              </motion.div>
            ))}
            {/* Blinking cursor on latest */}
            <div className="flex items-center gap-2 py-0.5">
              <span className="text-[9px] font-mono text-muted-foreground/40 w-8 flex-shrink-0">{fmtTime(elapsed)}</span>
              <span className="w-1.5 h-3 bg-[var(--color-warning)] animate-[warm-pulse_1s_ease-in-out_infinite]" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CompletionSummary({
  activation,
  onDismiss,
  onAction,
}: {
  activation: ActivationData;
  onDismiss: () => void;
  onAction: (action: string) => void;
}) {
  const items = activation.automationProgress?.items ?? [];
  const activeItems = items.filter((i) => i.status === "active");
  const reviewItems = items.filter((i) => i.status === "ready" || i.status === "draft");
  const pendingActions = activation.context?.pendingActions ?? 0;

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-[var(--color-success)]/10 flex items-center justify-center">
          <PartyPopper className="w-4 h-4 text-[var(--color-success)]" />
        </div>
        <div>
          <div className="text-[14px] font-serif font-semibold text-foreground">
            All set — I&apos;m up and running
          </div>
          <div className="text-[11px] font-sans text-muted-foreground">
            Here&apos;s what I set up for you
          </div>
        </div>
      </div>

      {/* Active automations */}
      {activeItems.length > 0 && (
        <div>
          <div className="text-[10px] font-sans uppercase tracking-wider text-[var(--color-success)] mb-2">
            Live now
          </div>
          <div className="space-y-1.5">
            {activeItems.map((item) => (
              <div key={item.id} className="flex items-center gap-2 py-1">
                <Check className="w-3.5 h-3.5 text-[var(--color-success)] flex-shrink-0" />
                <span className="text-[12px] font-sans text-foreground">
                  {item.name.replace(" Automation", "")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Review items */}
      {reviewItems.length > 0 && (
        <div>
          <div className="text-[10px] font-sans uppercase tracking-wider text-[var(--color-accent)] mb-2">
            Waiting for your okay
          </div>
          <div className="space-y-2">
            {reviewItems.map((item) => (
              <div key={item.id} className="rounded-xl border border-border p-3">
                <div className="text-[12px] font-sans font-medium text-foreground mb-2">
                  {item.name.replace(" Automation", "")}
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => onAction(`Approve the ${item.name.replace(" Automation", "")} automation`)}
                    className="px-2.5 py-1 rounded-lg bg-[var(--color-success)] text-white text-[10px] font-sans font-medium hover:opacity-90 transition-opacity"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => onAction(`Show me details about the ${item.name.replace(" Automation", "")} automation`)}
                    className="px-2.5 py-1 rounded-lg border border-border text-[10px] font-sans text-foreground hover:bg-muted transition-colors"
                  >
                    Preview
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending actions note */}
      {pendingActions > 0 && (
        <div className="text-[11px] font-sans text-muted-foreground">
          {pendingActions} action{pendingActions > 1 ? "s are" : " is"} waiting in your queue for a look.
        </div>
      )}

      {/* Next step buttons */}
      <div className="space-y-2 pt-2 border-t border-border">
        <div className="text-[11px] font-sans text-muted-foreground mb-2">
          Where would you like to start?
        </div>
        <div className="flex flex-wrap gap-1.5">
          {reviewItems.length > 0 && (
            <button
              onClick={() => onAction("Approve all pending automations")}
              className="px-3 py-1.5 rounded-full bg-[hsl(var(--accent-bg))] border border-border text-[var(--color-accent)] font-sans text-[11px] hover:border-[var(--color-accent)]/50 transition-all"
            >
              Approve everything
            </button>
          )}
          <button
            onClick={() => onAction("What should I focus on today?")}
            className="px-3 py-1.5 rounded-full bg-[hsl(var(--accent-bg))] border border-border text-[var(--color-accent)] font-sans text-[11px] hover:border-[var(--color-accent)]/50 transition-all"
          >
            What should I focus on?
          </button>
          <button
            onClick={onDismiss}
            className="px-3 py-1.5 rounded-full border border-border text-foreground font-sans text-[11px] hover:bg-muted transition-all"
          >
            Start chatting
          </button>
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
  setInput: (text: string) => void;
}

export interface AlloAIPanelProps {
  /** When true the panel fills its parent container, hides toggle/expand chrome, and stays permanently open. */
  embedded?: boolean;
}

export const AlloAIPanel = forwardRef<AlloAIPanelHandle, AlloAIPanelProps>(function AlloAIPanel({ embedded }, ref) {
  const { toast } = useToast();
  const router = useRouter();
  const utils = trpc.useUtils();
  const pathname = usePathname();
  const pageContext = derivePageContext(pathname);
  const isDashboard = pathname === "/dashboard";

  const [panelState, setPanelState] = useState<PanelState>("open");
  const [panelWidth, setPanelWidth] = useState(380);
  const [isResizing, setIsResizing] = useState(false);
  const { collapsed: sidebarCollapsed, toggleCollapsed: toggleSidebar } = useMobileSidebar();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [welcomeBuilt, setWelcomeBuilt] = useState(false);
  const [currentChatId, setCurrentChatIdRaw] = useState<string | undefined>();
  const [currentChatTitle, setCurrentChatTitle] = useState<string | undefined>();

  // Hydrate from sessionStorage after mount (avoids SSR mismatch)
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const savedId = sessionStorage.getItem("allo-chat-id") || undefined;
    const savedTitle = sessionStorage.getItem("allo-chat-title") || undefined;
    if (savedId) {
      setCurrentChatIdRaw(savedId);
      setCurrentChatTitle(savedTitle);
    }
  }, []);

  // Sync chatId to sessionStorage so it persists across tab navigation
  const setCurrentChatId = useCallback((id: string | undefined) => {
    setCurrentChatIdRaw(id);
    if (id) {
      sessionStorage.setItem("allo-chat-id", id);
    } else {
      sessionStorage.removeItem("allo-chat-id");
    }
  }, []);

  // Sync title to sessionStorage
  const setCurrentChatTitlePersist = useCallback((title: string | undefined) => {
    setCurrentChatTitle(title);
    if (title) {
      sessionStorage.setItem("allo-chat-title", title);
    } else {
      sessionStorage.removeItem("allo-chat-title");
    }
  }, []);
  const [showChatSwitcher, setShowChatSwitcher] = useState(false);
  const [chatSearch, setChatSearch] = useState("");
  const [editingHeaderTitle, setEditingHeaderTitle] = useState(false);
  const [headerTitleDraft, setHeaderTitleDraft] = useState("");
  const [dynamicSuggestions, setDynamicSuggestions] = useState<string[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // On dashboard, panel defaults open but can be collapsed
  // In embedded mode, always open — no collapsing
  const effectiveState = embedded ? "open" : panelState;

  // Get storeId
  const { data: stores } = trpc.stores.list.useQuery(undefined, { refetchOnWindowFocus: false });
  const storeId = stores?.[0]?.id ?? "";

  // Fetch real insights
  const { data: insights } = (trpc.ai as any).panelInsights.useQuery(
    { storeId },
    { enabled: !!storeId, refetchInterval: 60_000 },
  ) as { data: PanelInsights | undefined };

  // Fetch latest briefing for dashboard greeting
  const { data: latestBriefing } = (trpc as any).briefings.latest.useQuery(
    { storeId },
    { enabled: !!storeId },
  ) as { data: any | undefined };

  // Fetch contextual page greeting for non-dashboard pages
  const { data: pageContextData } = (trpc as any).briefings.pageContext.useQuery(
    { storeId, page: pageContext },
    { enabled: !!storeId && !isDashboard && !!insights?.storeState.hasSyncedData, staleTime: 60_000 },
  ) as { data: { greeting: string; suggestions: { label: string; message: string }[] } | undefined };

  // Fetch agent status for status indicator (Fix 5D)
  const { data: agentStatus } = (trpc.stores as any).agentStatus.useQuery(
    { storeId },
    { enabled: !!storeId, refetchInterval: 5000 },
  ) as { data: { isWorking: boolean; activeJobs: string[]; pendingActions: number } | undefined };

  // Activation state — shows progress panel instead of chat during activation
  const [activationDismissed, setActivationDismissed] = useState(false);
  const prevStoreRef = useRef<string>("");

  // Reset activation dismissed when store changes (e.g. reconnect)
  if (storeId && storeId !== prevStoreRef.current) {
    prevStoreRef.current = storeId;
    if (activationDismissed) setActivationDismissed(false);
  }

  const { data: activationData } = (trpc.stores.activationStatus as any).useQuery(
    { storeId },
    {
      enabled: !!storeId && !activationDismissed,
      refetchInterval: (query: any) => {
        const d = query?.state?.data;
        if (!d) return 3000;
        if (d.isActivating) return 2000;
        if (d.overallProgress < 100) return 2000;
        if (d.automationProgress?.generating > 0) return 2000;
        if (d.isRecentlyActivated) return 5000;
        return false;
      },
    },
  ) as { data: ActivationData | undefined };

  // Broader activation detection:
  // "in progress" = onboarding done but activation not done, OR automations still generating
  const isActivationInProgress = !!(
    activationData &&
    (activationData.isActivating || // worker hasn't finished
     (activationData.overallProgress < 100) || // progress < 100%
     (activationData.automationProgress && activationData.automationProgress.generating > 0)) // automations still generating
  );
  // "just completed" = recently activated AND all automations done generating
  const activationJustCompleted = !!(
    activationData &&
    activationData.isRecentlyActivated &&
    !isActivationInProgress
  );
  // Show activation view when: in progress, or just completed (until dismissed)
  const showActivationView = !activationDismissed && activationData && (isActivationInProgress || activationJustCompleted);
  // Only disable chat when automations are actively being generated (not paused/ready)
  const agentBusy = !!(activationData && activationData.automationProgress && activationData.automationProgress.generating > 0);

  // Fetch smart suggested actions (Fix 7)
  const { data: smartSuggestions } = (trpc as any).briefings.suggestedActions.useQuery(
    { storeId },
    { enabled: !!storeId && !!insights?.storeState.hasSyncedData, staleTime: 30_000 },
  ) as { data: Array<{ label: string; message: string; priority: number }> | undefined };

  // Chat history
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

  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const welcomeStoreRef = useRef<string>("");

  // Track whether user has sent messages (ref to avoid dep cycle)
  const hasUserMessagesRef = useRef(false);
  useEffect(() => {
    hasUserMessagesRef.current = messages.some((m) => m.role === "user");
  }, [messages]);

  // Build welcome messages — briefing-style on dashboard, contextual on other pages
  const welcomePageRef = useRef<string>("");
  useEffect(() => {
    if (!storeId) {
      setMessages([]);
      setWelcomeBuilt(false);
      welcomeStoreRef.current = "";
      welcomePageRef.current = "";
      return;
    }

    if (storeId !== welcomeStoreRef.current) {
      setWelcomeBuilt(false);
      welcomeStoreRef.current = storeId;
      welcomePageRef.current = "";
    }

    // On page change, rebuild welcome only if no active chat and no user messages
    if (pageContext !== welcomePageRef.current && !currentChatId && !hasUserMessagesRef.current) {
      setWelcomeBuilt(false);
      welcomePageRef.current = pageContext;
    }

    if (insights && !welcomeBuilt && !currentChatId && !hasUserMessagesRef.current) {
      if (isDashboard) {
        setMessages(buildBriefingMessage(insights, latestBriefing));
      } else if (pageContextData) {
        // Contextual greeting for non-dashboard pages
        setMessages([{
          id: "welcome-context",
          role: "assistant",
          content: pageContextData.greeting,
          timestamp: new Date(),
        }]);
      } else {
        setMessages(buildBriefingMessage(insights, latestBriefing));
      }
      setWelcomeBuilt(true);
    }
  }, [insights, welcomeBuilt, storeId, latestBriefing, pageContext, isDashboard, pageContextData, currentChatId]);

  // Restore persisted chat on mount (soft navigation — sessionStorage survives)
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || !currentChatId || messages.some((m) => m.role === "user")) return;
    restoredRef.current = true;

    (async () => {
      try {
        const chat = await (utils.ai as any).getChat.fetch({ chatId: currentChatId }) as {
          title?: string;
          messages?: { id: string; role: string; content: string; highlights: { label: string; value: string }[] | null; createdAt: string }[];
        };
        if (chat?.messages && chat.messages.length > 0) {
          setCurrentChatTitlePersist(chat.title || "Chat");
          setMessages(chat.messages.map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
            highlights: m.highlights ?? undefined,
            timestamp: new Date(m.createdAt),
          })));
          setWelcomeBuilt(true);
        } else {
          // Chat not found or empty — clear persisted state
          setCurrentChatId(undefined);
          setCurrentChatTitlePersist(undefined);
        }
      } catch {
        // Chat load failed — start fresh
        setCurrentChatId(undefined);
        setCurrentChatTitlePersist(undefined);
      }
    })();
  }, [currentChatId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Click-outside for chat switcher
  const switcherRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showChatSwitcher) return;
    const handleClick = (e: MouseEvent) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setShowChatSwitcher(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowChatSwitcher(false);
        if (panelState === "fullscreen") setPanelState("open");
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [showChatSwitcher]);

  // ESC key exits fullscreen mode
  useEffect(() => {
    if (panelState !== "fullscreen") return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setPanelState("open");
      }
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [panelState]);

  useImperativeHandle(ref, () => ({
    open() {
      if (panelState === "collapsed") setPanelState("open");
    },
    focusInput() {
      if (panelState === "collapsed") setPanelState("open");
      setTimeout(() => inputRef.current?.focus(), 100);
    },
    setInput(text: string) {
      if (panelState === "collapsed") setPanelState("open");
      setInput(text);
      setTimeout(() => inputRef.current?.focus(), 100);
    },
  }));

  // AI chat mutation
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
    toolCalls?: string[];
    campaignPreview?: CampaignPreviewData;
  };

  const chatMut = (trpc.ai as any).chat.useMutation({
    onSuccess: (data: ChatResult) => {
      setIsProcessing(false);
      if (!currentChatId) {
        const lastUserMsg = messages.filter((m) => m.role === "user").pop();
        setCurrentChatTitlePersist(lastUserMsg?.content.slice(0, 40) || "New chat");
      }
      setCurrentChatId(data.chatId);
      refetchHistory();

      if (data.suggestedFollowUps?.length) {
        setDynamicSuggestions(data.suggestedFollowUps);
      } else {
        setDynamicSuggestions([]);
      }

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

      // Also extract action links from tool call names when agent used tools directly
      if (data.toolCalls?.includes("get_automation_details") || data.toolCalls?.includes("modify_automation")) {
        // Extract automation ID from reply if present (agent often includes it)
        const autoIdMatch = data.reply.match(/automations?\/([a-z0-9-]+)/i) ?? data.reply.match(/automationId["\s:]+([a-z0-9-]+)/i);
        if (autoIdMatch) {
          actionLinks.push({ label: "View Automation", href: `/automations/${autoIdMatch[1]}` });
        } else if (!actionLinks.some((l) => l.href.startsWith("/automations"))) {
          actionLinks.push({ label: "View Automations", href: "/automations" });
        }
      }

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
                toolCalls: data.toolCalls?.length ? data.toolCalls : undefined,
                campaignPreview: data.campaignPreview ?? undefined,
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
                content: err.message ?? "Sorry, something went wrong on my end. Mind trying that again?",
              }
            : m,
        ),
      );
      toast(err.message ?? "Sorry, I couldn't get through that one. Try again?", "error");
    },
  }) as { mutate: (input: { storeId: string; message: string; chatId?: string; history: { role: "user" | "assistant"; content: string }[] }) => void };

  // Campaign approve/reject mutation
  const executeChatActionMut = (trpc.ai as any).executeChatAction.useMutation({
    onSuccess: (data: { success: boolean; status: string }) => {
      if (data.success && data.status === "sending") {
        toast("Approved — your campaign is on its way.", "success");
      } else if (data.success && data.status === "cancelled") {
        toast("No problem — I've called that one off.", "success");
      }
    },
    onError: (err: { message?: string }) => {
      toast(err.message ?? "That didn't go through. Mind trying again?", "error");
    },
  }) as { mutate: (input: { actionType: "approve_campaign" | "reject_campaign"; campaignId: string }) => void };

  const handleApproveCampaign = useCallback(
    (campaignId: string) => {
      executeChatActionMut.mutate({ actionType: "approve_campaign", campaignId });
    },
    [],
  );

  const handleEditCampaign = useCallback(
    (_campaignId: string) => {
      router.push("/campaigns");
    },
    [router],
  );

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
    if (!embedded && !isDashboard) setPanelState("collapsed");
    router.push(href);
  }, [router, isDashboard, embedded]);

  const handlePillClick = (pill: Pill) => {
    if (pill.href && !pill.instruction) {
      if (!embedded && !isDashboard) setPanelState("collapsed");
      router.push(pill.href);
      return;
    }
    if (pill.instruction) {
      sendMessage(pill.instruction);
    }
  };

  const startNewChat = useCallback(() => {
    setCurrentChatId(undefined);
    setCurrentChatTitlePersist(undefined);
    setDynamicSuggestions([]);
    setShowChatSwitcher(false);
    setWelcomeBuilt(false);
    if (insights) {
      if (!isDashboard && pageContextData) {
        setMessages([{
          id: "welcome-context",
          role: "assistant",
          content: pageContextData.greeting,
          timestamp: new Date(),
        }]);
      } else {
        setMessages(buildBriefingMessage(insights, latestBriefing));
      }
      setWelcomeBuilt(true);
    } else {
      setMessages([]);
    }
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [insights, latestBriefing, isDashboard, pageContextData]);

  const loadChat = useCallback(async (chatId: string) => {
    setShowChatSwitcher(false);
    setCurrentChatId(chatId);
    setDynamicSuggestions([]);

    try {
      const chat = await (utils.ai as any).getChat.fetch({ chatId }) as { title?: string; messages?: { id: string; role: string; content: string; highlights: { label: string; value: string }[] | null; createdAt: string }[] };
      if (chat?.messages) {
        setCurrentChatTitlePersist(chat.title || "Chat");
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
  // Use smart suggestions (Fix 7), then page context, then fallback to dynamic
  const smartPills: Pill[] = (smartSuggestions && isDashboard)
    ? smartSuggestions.map((s) => ({ label: s.label, instruction: s.message }))
    : [];
  const contextSuggestions: Pill[] = (!isDashboard && pageContextData?.suggestions)
    ? pageContextData.suggestions.map((s) => ({ label: s.label, instruction: s.message }))
    : [];
  const suggestions = smartPills.length > 0 ? smartPills : contextSuggestions.length > 0 ? contextSuggestions : getDynamicSuggestions(insights, pageContext);
  const activeSuggestions = dynamicSuggestions.length > 0 ? dynamicSuggestions : null;
  const placeholder = useRotatingPlaceholder(dataReady && !isProcessing);

  const toggle = () => {
    setPanelState(panelState === "collapsed" ? "open" : "collapsed");
  };

  const toggleExpand = () => {
    if (panelState === "expanded" || panelState === "fullscreen") {
      setPanelState("open");
    } else {
      setPanelState("expanded");
    }
  };

  const goFullscreen = () => {
    setPanelState(panelState === "fullscreen" ? "open" : "fullscreen");
  };

  // Drag-to-resize handler
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    if (panelState !== "open") return;
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = panelWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      // Panel is on the right, so dragging left = wider
      const delta = startX - moveEvent.clientX;
      const newWidth = Math.min(Math.max(startWidth + delta, 320), 800);
      setPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [panelState, panelWidth]);

  return (
    <>
      {/* Fullscreen backdrop */}
      {effectiveState === "fullscreen" && !embedded && (
        <div
          className="fixed inset-0 bg-black/40 z-[59] backdrop-blur-sm"
          onClick={goFullscreen}
        />
      )}

      {/* Main panel */}
      <aside
        style={!embedded && effectiveState === "open" ? { width: `${panelWidth}px` } : undefined}
        className={cn(
          "flex flex-col relative",
          !isResizing && "transition-all duration-[400ms] ease-[cubic-bezier(0.4,0,0.2,1)]",
          embedded
            ? "w-full h-full ai-panel-bg border-0"
            : cn(
                "border-l",
                effectiveState === "open" && "flex-shrink-0 ai-panel-bg border-border",
                effectiveState === "collapsed" && "w-0 border-l-0 overflow-hidden",
                effectiveState === "expanded" &&
                  "fixed top-14 right-0 bottom-0 w-[60%] z-50 ai-panel-bg border-border shadow-[-20px_0_60px_rgba(0,0,0,0.08)]",
                effectiveState === "fullscreen" &&
                  "fixed inset-4 z-[60] rounded-2xl ai-panel-bg border-border shadow-2xl",
              ),
          isProcessing && "animate-[ai-thinking-glow_2s_ease-in-out_infinite]",
        )}
      >
        {/* Resize handle — only in open (docked) mode */}
        {!embedded && effectiveState === "open" && (
          <div
            onMouseDown={handleResizeStart}
            className="absolute top-0 -left-1 bottom-0 w-2 cursor-col-resize z-20 group flex items-center"
            title="Drag to resize"
          >
            <div className="w-1 h-8 rounded-full bg-border opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        )}

        {/* Toggle button — hidden in embedded mode */}
        {!embedded && effectiveState !== "fullscreen" && (
          <button
            onClick={toggle}
            className="absolute top-3 -left-10 w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors z-10"
            title={effectiveState === "collapsed" ? "Open allo" : "Close allo"}
          >
            {effectiveState === "collapsed" ? (
              <ChevronLeft className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        )}

        {/* Panel controls — hidden in embedded mode */}
        {!embedded && effectiveState !== "collapsed" && (
          <div className="absolute top-3 right-3 flex items-center gap-1 z-10">
            {/* Sidebar collapse toggle */}
            {effectiveState === "open" && (
              <button
                onClick={toggleSidebar}
                className="w-7 h-7 rounded-md bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {sidebarCollapsed ? (
                  <PanelLeftOpen className="w-3.5 h-3.5" />
                ) : (
                  <PanelLeftClose className="w-3.5 h-3.5" />
                )}
              </button>
            )}
            {/* Expand button */}
            <button
              onClick={toggleExpand}
              className="w-7 h-7 rounded-md bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title={effectiveState === "expanded" || effectiveState === "fullscreen" ? "Collapse panel" : "Expand panel"}
            >
              {effectiveState === "expanded" || effectiveState === "fullscreen" ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>
            {/* Fullscreen button */}
            {effectiveState !== "fullscreen" && (
              <button
                onClick={goFullscreen}
                className="w-7 h-7 rounded-md bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Pop out to fullscreen"
              >
                <Maximize2 className="w-3.5 h-3.5 rotate-45" />
              </button>
            )}
            {effectiveState === "fullscreen" && (
              <button
                onClick={goFullscreen}
                className="w-7 h-7 rounded-md bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Exit fullscreen"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Header */}
        <div className="relative" ref={switcherRef}>
          <div className="aurora-hero-dark px-5 py-4 border-b border-border flex items-center gap-2.5">
            <div
              className={cn(
                "w-2 h-2 rounded-full flex-shrink-0",
                isProcessing ? "bg-[var(--color-warning)] animate-pulse" :
                isActivationInProgress ? "bg-[var(--color-warning)] animate-pulse" :
                agentStatus?.isWorking ? "bg-[var(--color-warning)] animate-pulse" :
                storeId ? "bg-[var(--color-success)]" : "bg-muted-foreground",
              )}
            />
            {editingHeaderTitle && currentChatId ? (
              <div className="flex-1 min-w-0">
                <input
                  value={headerTitleDraft}
                  onChange={(e) => setHeaderTitleDraft(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === "Enter" && headerTitleDraft.trim()) {
                      await renameChatMut.mutateAsync({ chatId: currentChatId, title: headerTitleDraft.trim() });
                      setCurrentChatTitlePersist(headerTitleDraft.trim());
                      setEditingHeaderTitle(false);
                    }
                    if (e.key === "Escape") setEditingHeaderTitle(false);
                  }}
                  onBlur={async () => {
                    if (headerTitleDraft.trim() && headerTitleDraft.trim() !== currentChatTitle) {
                      await renameChatMut.mutateAsync({ chatId: currentChatId, title: headerTitleDraft.trim() });
                      setCurrentChatTitlePersist(headerTitleDraft.trim());
                    }
                    setEditingHeaderTitle(false);
                  }}
                  className="w-full px-2 py-1 bg-background border border-foreground/30 rounded-lg text-[13px] font-sans font-bold text-foreground focus:outline-none focus:border-foreground"
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
                    : "border-transparent hover:border-foreground/10 hover:bg-muted/50",
                )}
              >
                <MessageSquare className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-serif font-bold text-foreground truncate">
                    {currentChatTitle || "allo"}
                  </div>
                  {storeId && (
                    <div className="text-[10px] font-sans text-muted-foreground truncate">
                      {isProcessing ? "On it..." :
                       isActivationInProgress ? "Setting things up..." :
                       agentStatus?.isWorking ? `Working on ${agentStatus.activeJobs.length} thing${agentStatus.activeJobs.length > 1 ? "s" : ""}...` :
                       agentStatus?.pendingActions ? `${agentStatus.pendingActions} thing${agentStatus.pendingActions > 1 ? "s" : ""} waiting for you` :
                       "Here and watching over things"}
                    </div>
                  )}
                </div>
                <ChevronDown className={cn(
                  "w-3.5 h-3.5 text-muted-foreground transition-transform flex-shrink-0",
                  showChatSwitcher && "rotate-180",
                )} />
              </button>
            )}
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
            <div className="absolute top-full left-0 right-0 z-50 ai-panel-bg border-b border-border shadow-[0_8px_30px_rgba(0,0,0,0.12)] max-h-[400px] flex flex-col">
              <div className="px-3 py-2 border-b border-border">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                  <input
                    value={chatSearch}
                    onChange={(e) => setChatSearch(e.target.value)}
                    placeholder="Search chats..."
                    className="w-full pl-7 pr-3 py-1.5 bg-muted border border-border rounded-lg text-[11px] font-sans text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground/30"
                    autoFocus
                  />
                </div>
              </div>
              <button
                onClick={() => { startNewChat(); }}
                className={cn(
                  "flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-muted transition-colors border-b border-border/50",
                  !currentChatId && "bg-muted",
                )}
              >
                <Plus className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className="text-[12px] font-sans font-medium text-foreground">New conversation</span>
              </button>
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
                        <p className="text-[11px] text-muted-foreground font-sans">
                          {chatSearch.trim() ? "Nothing matches that yet" : "No conversations yet — say hi to get started"}
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
                                if (currentChatId === chat.id) setCurrentChatTitlePersist(editingTitle.trim());
                                setEditingChatId(null);
                              }
                              if (e.key === "Escape") setEditingChatId(null);
                            }}
                            onBlur={async () => {
                              if (editingTitle.trim() && editingTitle.trim() !== chat.title) {
                                await renameChatMut.mutateAsync({ chatId: chat.id, title: editingTitle.trim() });
                                if (currentChatId === chat.id) setCurrentChatTitlePersist(editingTitle.trim());
                              }
                              setEditingChatId(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full px-1.5 py-0.5 -ml-1.5 bg-background border border-foreground/30 rounded text-[12px] font-sans font-medium text-foreground focus:outline-none focus:border-foreground"
                            autoFocus
                          />
                        ) : (
                          <div className="text-[12px] font-sans font-medium text-foreground truncate">
                            {chat.title}
                          </div>
                        )}
                        <div className="text-[10px] text-muted-foreground font-sans mt-0.5 truncate">
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
                          className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground/40 hover:text-[var(--color-urgent)] hover:bg-[var(--color-urgent)]/10 transition-colors"
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

        {/* Content area — activation progress OR completion OR chat */}
        {showActivationView && isActivationInProgress && activationData ? (
          <>
            <ActivationProgressPanel activation={activationData} />
            {/* Disabled input during activation */}
            <div className="px-5 py-4 border-t border-border">
              <div className="relative">
                <input
                  disabled
                  value=""
                  readOnly
                  placeholder="allo is setting things up..."
                  className="w-full pl-4 pr-10 py-3 rounded-[20px] bg-muted/80 border border-border text-[13px] font-sans text-foreground placeholder:text-muted-foreground/60 disabled:opacity-50"
                />
              </div>
            </div>
          </>
        ) : showActivationView && activationJustCompleted && activationData ? (
          <>
            <CompletionSummary
              activation={activationData}
              onDismiss={() => setActivationDismissed(true)}
              onAction={(action) => {
                setActivationDismissed(true);
                setTimeout(() => sendMessage(action), 100);
              }}
            />
          </>
        ) : (
          <>
            {/* Messages area */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Recovery Opportunity Cards — proactive revenue recovery */}
              {storeId && dataReady && !currentChatId && (
                <RecoveryOpportunityCards
                  storeId={storeId}
                  onApproveAll={(type, actionIds) => {
                    toast(`On it — sending ${actionIds.length} ${type.replace(/_/g, " ")} message${actionIds.length > 1 ? "s" : ""}.`, "success");
                  }}
                  onReview={(type) => {
                    const filterMap: Record<string, string> = {
                      cart_recovery: "cart_recovery",
                      price_drop_alert: "price_drop_alert",
                      restock_alert: "restock_alert",
                      repurchase_reminder: "repurchase_reminder",
                    };
                    handleNavigate(`/actions?type=${filterMap[type] ?? type}`);
                  }}
                />
              )}
              {messages.map((msg, i) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03, duration: 0.3 }}
                >
                  <MessageBubble message={msg} onNavigate={handleNavigate} onApproveCampaign={handleApproveCampaign} onEditCampaign={handleEditCampaign} />
                </motion.div>
              ))}

              {/* Dynamic suggestion pills from AI response */}
              {!isProcessing && activeSuggestions && (
                <div className="pl-[34px]">
                  <div className="font-sans text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
                    Follow up
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {activeSuggestions.map((text) => (
                      <button
                        key={text}
                        onClick={() => sendMessage(text)}
                        className="px-3 py-1.5 rounded-full bg-[hsl(var(--accent-bg))] border border-border text-[var(--color-accent)] font-sans text-[11px] hover:border-[var(--color-accent)]/50 hover:shadow-[0_0_8px_rgba(196,112,77,0.15)] transition-all text-left"
                      >
                        {text}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Static suggestion pills */}
              {!isProcessing && !activeSuggestions && suggestions.length > 0 && (
                <div className="pl-[34px]">
                  <div className="font-sans text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
                    Suggested
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {suggestions.map((pill) => (
                      <button
                        key={pill.label}
                        onClick={() => handlePillClick(pill)}
                        className="px-3 py-1.5 rounded-full bg-[hsl(var(--accent-bg))] border border-border text-[var(--color-accent)] font-sans text-[11px] hover:border-[var(--color-accent)]/50 hover:shadow-[0_0_8px_rgba(196,112,77,0.15)] transition-all"
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
                  placeholder={!storeId ? "Connect a store and we'll get started..." : agentBusy ? "allo is setting things up..." : !dataReady ? "Getting your store ready..." : placeholder}
                  disabled={isProcessing || !storeId || !dataReady || agentBusy}
                  className="w-full pl-4 pr-10 py-3 rounded-[20px] bg-muted/80 border border-border text-[13px] font-sans text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-[var(--color-accent)] focus:shadow-[0_0_0_1px_var(--color-accent)] transition-all disabled:opacity-50"
                />
                <button
                  onClick={handleSubmit}
                  disabled={isProcessing || !input.trim() || !storeId || !dataReady || agentBusy}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-[var(--color-accent)] hover:bg-[hsl(var(--accent-bg))] transition-colors disabled:opacity-30"
                >
                  {isProcessing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </aside>

      {/* Floating button when collapsed — hidden in embedded mode */}
      {!embedded && effectiveState === "collapsed" && (
        <button
          onClick={() => {
            setPanelState("open");
            setTimeout(() => inputRef.current?.focus(), 200);
          }}
          className="fixed bottom-6 right-6 w-12 h-12 rounded-[14px] bg-[var(--color-accent)] text-white flex items-center justify-center shadow-lg hover:scale-110 transition-transform z-[60]"
          title="Open allo"
        >
          <Sparkles className="w-5 h-5" />
        </button>
      )}
    </>
  );
});

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const PanelRefContext = createContext<React.RefObject<AlloAIPanelHandle | null> | null>(null);

export function AlloAIPanelProvider({ children }: { children: React.ReactNode }) {
  const panelRef = useRef<AlloAIPanelHandle>(null);

  const value: AlloAIPanelContextType = {
    openPanel: () => panelRef.current?.open(),
    focusInput: () => panelRef.current?.focusInput(),
    setInput: (text: string) => panelRef.current?.setInput(text),
  };

  return (
    <AlloAIPanelContext.Provider value={value}>
      <PanelRefContext.Provider value={panelRef}>
        {children}
      </PanelRefContext.Provider>
    </AlloAIPanelContext.Provider>
  );
}

export function AlloAIPanelSlot() {
  const panelRef = useContext(PanelRefContext);
  return <AlloAIPanel ref={panelRef} />;
}

/** Standalone embedded version — fills parent container, no toggle/expand chrome. */
export function AlloAIPanelEmbedded() {
  return <AlloAIPanel embedded />;
}
