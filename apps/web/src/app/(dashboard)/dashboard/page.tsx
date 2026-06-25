"use client";

import { useState, useEffect } from "react";
import {
  Store,
  Loader2,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { useUser } from "@clerk/nextjs";
import { useDemo } from "@/lib/useDemo";
import { useToast } from "@/components/ui/Toast";
import { useAlloAI } from "@/components/ai/AlloAIPanel";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { DemoOnboarding } from "@/components/dashboard/DemoOnboarding";
import {
  ConsoleFrame,
  CommandLine,
  StreamOutput,
  StreamRow,
  DecisionCard,
  DecisionDetail,
  MetricReadout,
  formatINR,
} from "@/components/console";
import type { OpTagKind, DecisionDetailData } from "@/components/console";
import {
  ReasoningReveal,
  ATTENTION_STORIES,
  type ReasoningStory,
  type ReasoningLine,
} from "@/components/console/ReasoningReveal";

// ---------------------------------------------------------------------------
// Connect Store — inline Shopify OAuth (preserved, on the terminal surface)
// ---------------------------------------------------------------------------

function ConnectStorePrompt() {
  const [domain, setDomain] = useState("");
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const reduce = useReducedMotion();

  const handleConnect = () => {
    const d = domain.trim();
    if (!d) {
      setError("Enter your store name to continue.");
      return;
    }
    const fullDomain = d.includes(".myshopify.com") ? d : `${d}.myshopify.com`;
    if (!/^[a-zA-Z0-9-]+\.myshopify\.com$/.test(fullDomain)) {
      setError("That doesn't look like a valid store address.");
      return;
    }
    setConnecting(true);
    window.location.href = `/api/shopify/auth?shop=${fullDomain}`;
  };

  return (
    <motion.div
      className="flex items-center justify-center min-h-[60vh]"
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
    >
      <ConsoleFrame title="allo · start" className="max-w-md w-full">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-[hsl(var(--accent))]/10 flex items-center justify-center mx-auto mb-5">
            <Store className="w-7 h-7 text-[hsl(var(--accent))]" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground font-serif mb-2">
            Connect your store
          </h1>
          <p className="text-sm text-muted-foreground font-sans mb-6 leading-relaxed">
            Connect your Shopify store and allo reads your customers and orders,
            learns your brand, and stands up your retention, all on your own
            data.
          </p>

          {/* Connect your own Shopify store — the real path */}
          <div className="max-w-sm mx-auto">
            <div className="space-y-2.5">
              <div className="flex items-center">
                <input
                  type="text"
                  placeholder="your-store"
                  value={domain}
                  onChange={(e) => {
                    setDomain(e.target.value);
                    setError("");
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                  className="flex-1 min-w-0 px-3 py-2 text-[13px] font-mono rounded-l-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[hsl(var(--accent))] transition-colors"
                />
                <span className="px-2.5 py-2 text-[13px] font-mono text-muted-foreground bg-muted border border-l-0 border-border rounded-r-lg whitespace-nowrap">
                  .myshopify.com
                </span>
              </div>
              {error && (
                <p className="text-xs text-[var(--color-urgent)] font-sans text-left">
                  {error}
                </p>
              )}
              <button
                onClick={handleConnect}
                disabled={connecting}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))] text-sm font-medium rounded-xl hover:opacity-90 transition-all disabled:opacity-50"
              >
                {connecting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Store className="w-4 h-4" />
                )}
                {connecting ? "Connecting…" : "Connect store"}
              </button>
            </div>
          </div>
        </div>
      </ConsoleFrame>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

// Map an autonomy action's category/type to an operator tag.
function actionToTags(action: {
  category?: string | null;
  type?: string | null;
}): OpTagKind[] {
  const hay = `${action.category ?? ""} ${action.type ?? ""}`.toLowerCase();
  const tags: OpTagKind[] = [];
  if (/win.?back|lapsed|hibernat|lost|churn|recover|reorder|repurchase/.test(hay))
    tags.push("win-back");
  if (/welcome|onboard|new/.test(hay)) tags.push("welcome");
  if (/vip|champion|loyal|reward/.test(hay)) tags.push("vip");
  if (/apolog|late|pre.?empt|issue|delay/.test(hay)) tags.push("pre-empt");
  if (/time|timing|send.?time|schedule/.test(hay)) tags.push("timing");
  if (tags.length === 0) tags.push("memory");
  return tags.slice(0, 2);
}

// First sentence of a reasoning blob, trimmed.
function firstLine(text: string | null | undefined, max = 120): string {
  if (!text) return "";
  const t = text.trim();
  const sentence = t.split(/(?<=[.!?])\s/)[0] ?? t;
  return sentence.length > max ? sentence.slice(0, max) + "…" : sentence;
}

// Build the "view" detail for a real pending action: who it's for, the drafted
// message (subject + rendered email preview), the predicted consequence, and
// the reasoning — the actual thing, before you approve it.
function actionToDetail(action: {
  campaignName?: string | null;
  reasoning?: string | null;
  channel?: string | null;
  subjectLine?: string | null;
  htmlPreview?: string | null;
  estimatedRevenue?: number | null;
  targetSegment?: { name: string; count: number } | null;
  category?: string | null;
  type?: string | null;
  prediction?: DecisionDetailData["prediction"];
}): DecisionDetailData {
  const reasoning = firstLine(action.reasoning, 240);
  return {
    title:
      action.campaignName ||
      firstLine(action.reasoning, 80) ||
      "allo lined up an action for you",
    tags: actionToTags(action),
    channel: action.channel ?? null,
    segment: action.targetSegment ?? null,
    impact: action.estimatedRevenue ?? null,
    subjectLine: action.subjectLine ?? null,
    bodyHtml: action.htmlPreview ?? null,
    reasoning: reasoning ? [{ tick: "ok", text: reasoning }] : undefined,
    prediction: action.prediction ?? null,
    disclaimer:
      action.prediction?.basis === "estimate"
        ? "Figures representative while control measurement is wired up."
        : undefined,
  };
}

// ---------------------------------------------------------------------------
// DemoReasoning — staged reasoning stream for a typed goal in demo mode.
//
// In demo we never fire the live agent (trpc.ai.chat → a real LLM, real token
// spend). Instead we surface a staged reasoning stream against the seeded Vana
// figures already loaded on the page, using the same console primitives the
// operator already sees. The rows reveal on a short client timer so it reads
// like allo thinking, then lands on a "queued for your okay" line. Reduced
// motion shows every row at once.
// ---------------------------------------------------------------------------

function DemoReasoning({
  goal,
  atRisk,
  lapsed,
  onDismiss,
}: {
  goal: string;
  atRisk: number;
  lapsed: { customerCount: number; totalRevenue: number } | null;
  onDismiss: () => void;
}) {
  const reduce = useReducedMotion();

  const lines: { tick: "ok" | "step" | "hold"; node: React.ReactNode }[] = [
    { tick: "ok", node: <>read your goal: <b>{firstLine(goal, 80)}</b></> },
    {
      tick: "ok",
      node: (
        <>
          allo noticed <b>{(lapsed?.customerCount ?? atRisk).toLocaleString("en-IN")}</b>{" "}
          who fit
          {lapsed && lapsed.totalRevenue > 0 ? (
            <> · <b>{formatINR(lapsed.totalRevenue)}</b> of past revenue in play</>
          ) : null}
        </>
      ),
    },
    { tick: "hold", node: <>held back a few <b>as control</b> so we can prove the lift</> },
    { tick: "ok", node: <>drafting copy in <b>Vana Naturals</b> voice</> },
    {
      tick: "step",
      node: (
        <>
          <span className="text-[hsl(var(--accent))]">ready</span> · queued for
          your okay below
        </>
      ),
    },
  ];
  const total = lines.length;

  // Reveal rows one at a time so it reads like allo thinking. Reduced motion
  // shows every row at once. No network — purely a client timer.
  const [visible, setVisible] = useState(reduce ? total : 1);
  useEffect(() => {
    if (reduce) {
      setVisible(total);
      return;
    }
    const id = setInterval(() => {
      setVisible((n) => {
        if (n >= total) {
          clearInterval(id);
          return n;
        }
        return n + 1;
      });
    }, 650);
    return () => clearInterval(id);
  }, [reduce, total]);

  return (
    <ConsoleFrame title="allo · reasoning" className="mt-8">
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-border">
        <span className="font-mono text-[11px] text-muted-foreground">
          staged · no live send
        </span>
        <button
          onClick={onDismiss}
          className="font-mono text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          clear
        </button>
      </div>
      <StreamOutput aria-label="allo reasoning">
        {lines.slice(0, visible).map((l, i) => (
          <StreamRow key={i} tick={l.tick}>
            {l.node}
          </StreamRow>
        ))}
      </StreamOutput>
    </ConsoleFrame>
  );
}

// ---------------------------------------------------------------------------
// Dashboard Page — the operator console
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { user } = useUser();
  const { toast } = useToast();
  const { openPanel, submit: submitAI } = useAlloAI();
  const demo = useDemo();
  // Demo onboarding arc — show once per browser session (skippable).
  const [arcSeen, setArcSeen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return sessionStorage.getItem("allo_demo_arc") === "1";
    } catch {
      return false;
    }
  });
  const rawFirst = user?.firstName || "there";
  const firstName = rawFirst.charAt(0).toUpperCase() + rawFirst.slice(1);
  const greeting = getGreeting();

  const { data: stats } = trpc.dashboard.stats.useQuery();
  const { data: stores, isLoading: storesLoading } = trpc.stores.list.useQuery();
  const storeId = stores?.[0]?.id ?? "";
  const store = stores?.[0];
  // Demo (Vana) is always pre-onboarded — skip the wizard and let the data
  // queries (gated on onboardingDone) run, so the console fills instead of
  // hanging on "loading" after entering the demo.
  const onboardingDone = demo || !!store?.onboardingCompletedAt;
  const [justCompletedOnboarding, setJustCompletedOnboarding] = useState(false);

  const { data: latestBriefing } = (trpc as any).briefings.latest.useQuery(
    { storeId },
    { enabled: !!storeId && onboardingDone },
  ) as { data: any | undefined };

  const { data: missionControl } = (trpc as any).briefings.missionControl.useQuery(
    { storeId },
    { enabled: !!storeId && onboardingDone, refetchInterval: 60000 },
  ) as { data: any | undefined };

  const { data: programs } = (trpc.automations.list as any).useQuery(
    storeId ? { storeId } : undefined,
    { enabled: !!storeId && onboardingDone, refetchInterval: 15000 },
  ) as {
    data:
      | {
          id: string;
          name: string;
          description: string | null;
          programType: string;
          status: string;
        }[]
      | undefined;
  };

  const { data: tokenUsage } = (trpc.dashboard.tokenUsage as any).useQuery(
    undefined,
    {
      enabled: onboardingDone,
      refetchInterval: 15000,
    },
  ) as {
    data:
      | {
          totalInputTokens: number;
          totalOutputTokens: number;
          totalCalls: number;
          totalCost: number;
        }
      | undefined;
  };

  trpc.segments.list.useQuery(undefined, { enabled: onboardingDone });

  const { data: customerStats } = (trpc.customers.stats as any).useQuery(
    undefined,
    { enabled: onboardingDone },
  ) as {
    data:
      | {
          totalCustomers: number;
          acceptsMarketing: number;
          marketingRate: number;
          totalRevenue: number;
          avgOrderValue: number;
        }
      | undefined;
  };

  const { data: segmentDist } = (trpc.segments.distribution as any).useQuery(
    undefined,
    { enabled: onboardingDone },
  ) as {
    data:
      | {
          segment: string;
          customerCount: number;
          totalRevenue: number;
          avgOrderValue: number;
        }[]
      | undefined;
  };

  // Baseline query kept running (feeds first-load comparisons elsewhere); its
  // value isn't read in the console shape.
  (trpc as any).briefings.baseline.useQuery(
    { storeId },
    { enabled: !!storeId && onboardingDone },
  ) as {
    data:
      | {
          metrics?: {
            totalCustomers?: number;
            totalRevenue?: number;
            avgOrderValue?: number;
          };
          capturedAt?: string;
        }
      | undefined;
  };

  const { data: brandProfile } = (trpc.ai.brandProfile as any).useQuery(
    { storeId },
    { enabled: !!storeId && onboardingDone },
  ) as { data: any | undefined };

  const { data: brandStatus } = (trpc.ai.brandProfileStatus as any).useQuery(
    { storeId },
    { enabled: !!storeId && onboardingDone },
  ) as { data: { exists: boolean } | undefined };

  const { data: recentActions } = (trpc.autonomy.listActions as any).useQuery(
    { storeId, limit: 10 },
    { enabled: !!storeId && onboardingDone, refetchInterval: 5000 },
  ) as {
    data:
      | {
          actions: {
            id: string;
            type: string;
            category: string | null;
            status: string;
            reasoning: string | null;
            createdAt: string;
            confidenceScore: number | null;
            estimatedRevenue?: number | null;
            campaignName?: string | null;
          }[];
          total: number;
        }
      | undefined;
  };

  // Time-series (kept — feeds deltas/trends consumed by the briefing voice)
  trpc.dashboard.timeSeries.useQuery(
    { metric: "revenue", days: "30" },
    { enabled: onboardingDone },
  );
  trpc.dashboard.timeSeries.useQuery(
    { metric: "customers", days: "30" },
    { enabled: onboardingDone },
  );
  trpc.dashboard.timeSeries.useQuery(
    { metric: "orders", days: "30" },
    { enabled: onboardingDone },
  );

  const { data: roiData } = (trpc.analytics.roi as any).useQuery(
    { storeId, days: 30 },
    { enabled: !!storeId && onboardingDone },
  ) as {
    data:
      | {
          aiTokenCost: number;
          aiAttributedRevenue: number;
          roi: number;
          campaignsSent: number;
          automationsSent: number;
        }
      | undefined;
  };

  const { data: revenueAttribution } = (
    trpc.dashboard.revenueAttribution as any
  ).useQuery(
    { storeId },
    { enabled: !!storeId && onboardingDone, refetchInterval: 60000 },
  ) as {
    data:
      | {
          today: { revenue: number; orders: number };
          week: { revenue: number; orders: number };
          month: { revenue: number; orders: number };
          total: { revenue: number; orders: number };
        }
      | undefined;
  };

  const utils = trpc.useUtils();

  const handleOnboardingComplete = () => {
    setJustCompletedOnboarding(true);
    utils.stores.list.invalidate();
  };

  // Approve / pass mutations (same as the actions queue)
  const approveMut = (trpc as any).autonomy.approveAction.useMutation({
    onSuccess: () => {
      toast("Approved. allo's on it.", "success");
      (utils as any).autonomy.listActions.invalidate({ storeId });
    },
    onError: (err: { message?: string }) =>
      toast(err.message || "That didn't go through. Give it another try.", "error"),
  }) as { mutate: (input: Record<string, unknown>) => void; isPending: boolean };

  const rejectMut = (trpc as any).autonomy.rejectAction.useMutation({
    onSuccess: () => {
      toast("Passed on it.", "success");
      (utils as any).autonomy.listActions.invalidate({ storeId });
    },
    onError: (err: { message?: string }) =>
      toast(err.message || "That didn't go through. Give it another try.", "error"),
  }) as { mutate: (input: Record<string, unknown>) => void; isPending: boolean };

  // Demo: the goal the operator typed, surfaced as a staged reasoning stream
  // instead of firing the live agent (no LLM / token spend).
  const [demoGoal, setDemoGoal] = useState<string | null>(null);

  // The decision currently open in the "view" detail modal (real or demo), with
  // its approve/pass handlers so the modal can act on it.
  const [viewing, setViewing] = useState<{
    data: DecisionDetailData;
    onApprove?: () => void;
    onPass?: () => void;
  } | null>(null);

  // ---- Command line → goal flow ----
  const handleCommand = (value: string) => {
    // The Home field is a SHORTCUT into the one conversation: open it AND submit
    // the goal in a single action — a single Enter carries the text in and fires
    // it (no second Enter). Works for the demo (live chat: scoped, ephemeral,
    // cost-capped) and real users alike — one input, one conversation.
    openPanel();
    setTimeout(() => submitAI(value), 150);
  };

  // ---- Derived values ----
  const aiCost = tokenUsage?.totalCost ?? 0;
  const hasSyncedData = (stats?.totalCustomers ?? 0) > 0;
  const hasBrand = brandStatus?.exists ?? false;
  const automationCount =
    programs?.filter((p) => p.status !== "recommended").length ?? 0;
  const activeCount = programs?.filter((p) => p.status === "active").length ?? 0;
  const readyCount = programs?.filter((p) => p.status === "ready").length ?? 0;

  const totalCustomers = stats?.totalCustomers ?? customerStats?.totalCustomers ?? 0;
  const atRisk =
    segmentDist?.find(
      (s) => s.segment === "At Risk" || s.segment === "Hibernating",
    )?.customerCount ?? 0;
  const lapsed =
    segmentDist?.find((s) => s.segment === "Lost" || s.segment === "Hibernating") ?? null;

  const revenue30d =
    revenueAttribution?.month?.revenue ?? roiData?.aiAttributedRevenue ?? 0;

  const allActions = recentActions?.actions ?? [];
  const pendingActions = allActions.filter((a) => a.status === "pending");
  const draftedCount = allActions.filter((a) =>
    ["pending", "approved", "executed", "auto_executed"].includes(a.status),
  ).length;
  // Decisions allo held back (fatigue / suppression) read off rejected/expired.
  const heldBack = allActions.filter((a) =>
    ["rejected", "expired"].includes(a.status),
  ).length;

  const aiCostLabel = aiCost > 0 ? (aiCost < 0.01 ? "$<0.01" : `$${aiCost.toFixed(2)}`) : "$0.00";

  // --- Home reasoning story — feeds the SHARED ReasoningReveal (same component
  // the landing hero uses, so the two surfaces can't drift). Built from real
  // page data: lead = the briefing headline / latest goal; lines = allo's recent
  // reasoning in the landing's vocabulary (scanned N · held back M as control ·
  // drafted X · ready · expected recovery ₹…). Falls back to ATTENTION_STORIES
  // when there's no real reasoning yet (drafts before sunrise register).
  const briefingHeadline = firstLine(
    missionControl?.summary ?? latestBriefing?.content?.summary,
    90,
  );
  const homeLead =
    briefingHeadline ||
    (lapsed && lapsed.customerCount > 0
      ? "win back the buyers who've gone quiet"
      : "");
  const homeLines: ReasoningLine[] = [];
  if (hasSyncedData) {
    homeLines.push({
      text:
        `allo scanned ${totalCustomers.toLocaleString("en-IN")} customers` +
        (segmentDist && segmentDist.length > 0
          ? ` across ${segmentDist.length} segments`
          : ""),
    });
  }
  if (lapsed && lapsed.customerCount > 0) {
    homeLines.push({
      text: `allo noticed ${lapsed.customerCount.toLocaleString("en-IN")} who've gone quiet · ${formatINR(lapsed.totalRevenue)} of past revenue`,
    });
  }
  if (heldBack > 0) {
    homeLines.push({ text: `held back ${heldBack} as control`, beat: true });
  }
  if (hasBrand) {
    homeLines.push({
      text: `writing in ${brandProfile?.brandName ?? "your"} voice`,
    });
  }
  if (automationCount > 0) {
    homeLines.push({
      text:
        `built ${automationCount} automations · ${activeCount} running on their own` +
        (readyCount > 0 ? ` · ${readyCount} ready for your okay` : ""),
    });
  }
  if (draftedCount > 0) {
    homeLines.push({
      text:
        pendingActions.length > 0
          ? `drafted ${draftedCount} · ready · ${pendingActions.length} queued for your okay`
          : `drafted ${draftedCount} · ready`,
      arrow: true,
    });
  }
  // Show allo's REAL activity as a SINGLE story (plays once, then rests — never
  // the canned landing reel on a loop). Only fall back to ATTENTION_STORIES when
  // there's genuinely no real activity yet (e.g. a brand-new store mid-sync).
  const homeStories: ReasoningStory[] =
    homeLines.length > 0
      ? [
          {
            lead:
              homeLead ||
              `where ${brandProfile?.brandName ?? "things"} stand right now`,
            lines: homeLines,
          },
        ]
      : ATTENTION_STORIES;

  // Demo: the typed goal resolves into a real, viewable drafted decision —
  // rendered with the SAME DecisionCard the live app uses (seeded but tailored
  // to the goal + Vana's figures, so it reads as allo's work, not a script).
  const demoDecision: DecisionDetailData | null =
    demo && demoGoal
      ? (() => {
          const count = lapsed?.customerCount ?? atRisk ?? 187;
          const recovery =
            lapsed && lapsed.totalRevenue > 0
              ? Math.round(lapsed.totalRevenue * 0.28)
              : 120000;
          return {
            title: `A win-back for ${count.toLocaleString("en-IN")} lapsed Vana buyers`,
            tags: ["win-back"] as OpTagKind[],
            channel: "whatsapp",
            segment: { name: "lapsed · last spring's buyers", count },
            impact: recovery,
            subjectLine: "A little nudge from Vana Naturals",
            bodyText:
              "Hi {first_name},\n\nIt's been a few months since your last order, and we kept your spot. Your Triphala routine is ready whenever you are.\n\nHere's 15% to pick up where you left off: VANA15\n\nWarmly,\nThe Vana Naturals team",
            reasoning: [
              { tick: "ok", text: `read your goal: ${firstLine(demoGoal, 80)}` },
              {
                tick: "ok",
                text: `matched ${count.toLocaleString("en-IN")} lapsed · last spring's buyers`,
              },
              { tick: "hold", text: "held back 22 as control so we can prove the lift" },
              { tick: "ok", text: "drafted in Vana Naturals voice" },
            ],
            prediction: {
              upsideRevenue: recovery,
              liftPct: 14,
              downsideRiskPct: 0.7,
              confidence: "medium" as const,
              basis: "estimate" as const,
            },
            disclaimer:
              "Figures representative while control measurement is wired up.",
          };
        })()
      : null;

  // --- Loading ---
  if (storesLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // --- State 1: No store (preserved) ---
  // In demo, the tRPC client sends `x-allo-demo: 1` and the API routes to the
  // seeded Vana workspace, so storeId resolves — this prompt won't show. Guard
  // explicitly so a storeless visitor only ever sees the demo entry CTA here,
  // never a dead-end.
  // Demo first-entry: the staged "watch allo come alive" arc (once per session,
  // skippable). Staged over the seeded Vana data — no real sync / Shopify call.
  if (demo && !arcSeen) {
    return (
      <DemoOnboarding
        onDone={() => {
          try {
            sessionStorage.setItem("allo_demo_arc", "1");
          } catch {
            /* ignore */
          }
          setArcSeen(true);
        }}
      />
    );
  }

  if (!storeId && !demo) {
    return <ConnectStorePrompt />;
  }

  // --- State 2: Onboarding not done (preserved) ---
  if (!onboardingDone && !justCompletedOnboarding) {
    return (
      <OnboardingWizard storeId={storeId} onComplete={handleOnboardingComplete} />
    );
  }

  // --- State 3: Operator console ---
  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* The ask: heading + command line read as one prompt unit */}
      <div className="space-y-4">
        {/* Heading — prose, no motion */}
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-foreground font-serif">
            {greeting}, {firstName}
          </h1>
          <p className="text-[13.5px] text-muted-foreground mt-1 font-sans leading-relaxed">
            Tell allo what you want done. It scans, reasons, and queues the work
            for your okay.
          </p>
        </div>

        {/* 1. Command line */}
        <CommandLine
          placeholder={[
            "Tell allo what you want: e.g. win back my lapsed buyers before Diwali",
            "Who's slipping away?",
            "Draft a Diwali win-back for me",
            "Look after my best customers",
          ]}
          onSubmit={handleCommand}
        />
      </div>

      {/* Demo: staged reasoning for the typed goal, then the actual drafted
          decision it produced (real DecisionCard, view + approve), so the demo
          clearly DOES something rather than fizzling under the input. */}
      {demo && demoGoal && (
        <>
          <DemoReasoning
            key={demoGoal}
            goal={demoGoal}
            atRisk={atRisk}
            lapsed={lapsed}
            onDismiss={() => setDemoGoal(null)}
          />
          {demoDecision && (
            <div className="mt-4">
              <DecisionCard
                tags={demoDecision.tags}
                impact={demoDecision.impact}
                decision={demoDecision.title}
                reasoning={[{ tick: "ok", text: "drafted, ready for your okay" }]}
                onView={() =>
                  setViewing({
                    data: demoDecision,
                    onApprove: () => {
                      toast(
                        "In the demo, allo holds the send. Connect your store to ship it for real.",
                        "success",
                      );
                      setViewing(null);
                    },
                    onPass: () => {
                      setDemoGoal(null);
                      setViewing(null);
                    },
                  })
                }
                onApprove={() =>
                  toast(
                    "In the demo, allo holds the send. Connect your store to ship it for real.",
                    "success",
                  )
                }
                onPass={() => setDemoGoal(null)}
              />
            </div>
          )}
        </>
      )}

      {/* The response: console + decisions, given room to breathe */}
      {/* 2 + 3. Reasoning stream + status line, in the console frame */}
      <ConsoleFrame title="allo · operator" className="mt-8">
        {/* Status line — mono readouts; the live lamp rides the first readout */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pb-4 mb-4 border-b border-border">
          <MetricReadout label="customers" value={totalCustomers} live />
          <MetricReadout label="revenue · 30d" value={revenue30d} money />
          <MetricReadout label="at risk" value={atRisk} />
          <MetricReadout label="AI cost" value={aiCostLabel} />
        </div>

        {/* Reasoning reveal — the ONE shared component the landing hero uses,
            fed from this page's real data (falls back to ATTENTION_STORIES when
            there's no real reasoning yet). Same reveal, so the two can't drift. */}
        {hasSyncedData ? (
          <ReasoningReveal stories={homeStories} />
        ) : (
          <StreamOutput aria-label="what allo has been doing">
            <StreamRow tick="step">
              pulling in your store data, this usually takes a minute
            </StreamRow>
          </StreamOutput>
        )}
      </ConsoleFrame>

      {/* 4. Pending decisions */}
      <div className="mt-8">
        <h2 className="font-mono text-[12px] text-muted-foreground mb-3 lowercase tracking-tight">
          decisions waiting on you
          {pendingActions.length > 0 ? ` · ${pendingActions.length}` : ""}
        </h2>

        {pendingActions.length > 0 ? (
          <div className="space-y-3">
            {pendingActions.map((action) => {
              const reasoning = firstLine(action.reasoning, 160);
              return (
                <DecisionCard
                  key={action.id}
                  tags={actionToTags(action)}
                  impact={action.estimatedRevenue ?? null}
                  decision={
                    action.campaignName ||
                    reasoning ||
                    "allo lined up an action for you"
                  }
                  reasoning={
                    action.campaignName && reasoning
                      ? [{ tick: "ok", text: reasoning }]
                      : undefined
                  }
                  busy={approveMut.isPending || rejectMut.isPending}
                  onView={() =>
                    setViewing({
                      data: actionToDetail(action),
                      onApprove: () => {
                        approveMut.mutate({ actionId: action.id });
                        setViewing(null);
                      },
                      onPass: () => {
                        rejectMut.mutate({
                          actionId: action.id,
                          reason: "Passed from dashboard",
                        });
                        setViewing(null);
                      },
                    })
                  }
                  onApprove={() => approveMut.mutate({ actionId: action.id })}
                  onPass={() =>
                    rejectMut.mutate({
                      actionId: action.id,
                      reason: "Passed from dashboard",
                    })
                  }
                />
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="font-sans text-[13.5px] text-foreground">
              Nothing waiting on you.
            </p>
            <p className="font-sans text-[12.5px] text-muted-foreground mt-1 leading-relaxed">
              Drafts before sunrise, approvals over coffee. allo will have the
              next decision ready when it&apos;s worth your okay.
            </p>
          </div>
        )}
      </div>

      {/* View detail — opens the actual draft + predicted consequence before
          you approve. Works for real pending actions and the demo decision. */}
      {viewing && (
        <DecisionDetail
          data={viewing.data}
          busy={approveMut.isPending || rejectMut.isPending}
          onApprove={viewing.onApprove}
          onPass={viewing.onPass}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}
