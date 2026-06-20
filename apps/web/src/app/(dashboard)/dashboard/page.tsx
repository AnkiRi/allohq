"use client";

import { useState } from "react";
import {
  Store,
  Loader2,
} from "lucide-react";
import { motion } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { useUser } from "@clerk/nextjs";
import { useToast } from "@/components/ui/Toast";
import { useAlloAI } from "@/components/ai/AlloAIPanel";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import {
  ConsoleFrame,
  CommandLine,
  StreamOutput,
  StreamRow,
  DecisionCard,
  MetricReadout,
  formatINR,
} from "@/components/console";
import type { OpTagKind } from "@/components/console";

// ---------------------------------------------------------------------------
// Connect Store — inline Shopify OAuth (preserved, on the terminal surface)
// ---------------------------------------------------------------------------

function ConnectStorePrompt() {
  const [domain, setDomain] = useState("");
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);

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
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <ConsoleFrame title="allo — connect" className="max-w-md w-full">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-[hsl(var(--accent))]/10 flex items-center justify-center mx-auto mb-5">
            <Store className="w-7 h-7 text-[hsl(var(--accent))]" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground font-serif mb-2">
            Connect your store
          </h1>
          <p className="text-sm text-muted-foreground font-sans mb-6 leading-relaxed">
            Connect your Shopify store and allo gets to work — learning your
            brand, grouping your customers, and setting up retention that runs on
            its own.
          </p>
          <div className="max-w-sm mx-auto space-y-3">
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
                className="flex-1 px-4 py-2.5 text-sm font-mono rounded-l-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[hsl(var(--accent))] transition-colors"
              />
              <span className="px-3 py-2.5 text-sm font-mono text-muted-foreground bg-muted border border-l-0 border-border rounded-r-lg">
                .myshopify.com
              </span>
            </div>
            {error && (
              <p className="text-xs text-[var(--color-urgent)] font-sans">{error}</p>
            )}
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="w-full flex items-center justify-center gap-2 px-6 py-2.5 bg-foreground text-background text-sm font-medium rounded-xl hover:opacity-90 transition-all disabled:opacity-50"
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

// ---------------------------------------------------------------------------
// Dashboard Page — the operator console
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { user } = useUser();
  const { toast } = useToast();
  const { openPanel, setInput: setAIInput } = useAlloAI();
  const rawFirst = user?.firstName || "there";
  const firstName = rawFirst.charAt(0).toUpperCase() + rawFirst.slice(1);
  const greeting = getGreeting();

  const { data: stats } = trpc.dashboard.stats.useQuery();
  const { data: stores, isLoading: storesLoading } = trpc.stores.list.useQuery();
  const storeId = stores?.[0]?.id ?? "";
  const store = stores?.[0];
  const onboardingDone = !!store?.onboardingCompletedAt;
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
      toast("Approved — allo's on it.", "success");
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

  // ---- Command line → existing AI panel goal flow (same path Cmd+K uses) ----
  const handleCommand = (value: string) => {
    openPanel();
    // Prefill + focus the AI panel input so the operator's goal runs through the
    // existing chat/agent flow. Matches the CommandPalette prefill timing.
    setTimeout(() => setAIInput(value), 150);
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

  // --- Loading ---
  if (storesLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // --- State 1: No store (preserved) ---
  if (!storeId) {
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
    <div className="space-y-6 w-full max-w-4xl mx-auto">
      {/* Heading — prose, no motion */}
      <div>
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-foreground font-serif">
          {greeting}, {firstName}
        </h1>
        <p className="text-[13.5px] text-muted-foreground mt-1 font-sans leading-relaxed">
          Tell allo what you want done — it scans, reasons, and queues the work
          for your okay.
        </p>
      </div>

      {/* 1. Command line */}
      <CommandLine
        placeholder={[
          "win back my lapsed buyers before diwali",
          "who's slipping away?",
          "draft a Diwali win-back",
          "reward my best customers",
        ]}
        onSubmit={handleCommand}
      />

      {/* 2 + 3. Reasoning stream + status line, in the console frame */}
      <ConsoleFrame title="allo — operator">
        {/* Status line — mono readouts */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pb-4 mb-4 border-b border-border">
          <span className="inline-flex items-center gap-1.5 font-mono text-[12px]">
            <span
              aria-hidden="true"
              className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--accent))] animate-pulse"
            />
            <span className="text-[hsl(var(--accent))]">live</span>
          </span>
          <MetricReadout label="customers" value={totalCustomers} />
          <MetricReadout label="revenue · 30d" value={revenue30d} money />
          <MetricReadout label="at risk" value={atRisk} />
          <MetricReadout label="AI cost" value={aiCostLabel} />
        </div>

        {/* Reasoning / activity stream — real data, warm voice */}
        <StreamOutput aria-label="what allo has been doing">
          {hasSyncedData ? (
            <StreamRow tick="ok">
              scanned <b>{totalCustomers.toLocaleString("en-IN")}</b> customers
              {segmentDist && segmentDist.length > 0 ? (
                <>
                  {" "}
                  across <b>{segmentDist.length}</b> segments
                </>
              ) : null}
            </StreamRow>
          ) : (
            <StreamRow tick="step">
              pulling in your store data — this usually takes a minute
            </StreamRow>
          )}

          {lapsed && lapsed.customerCount > 0 && (
            <StreamRow tick="ok">
              flagged <b>{lapsed.customerCount.toLocaleString("en-IN")}</b> lapsed
              · <b>{formatINR(lapsed.totalRevenue)}</b> of past revenue to win back
            </StreamRow>
          )}

          {heldBack > 0 && (
            <StreamRow tick="hold">
              held back <b>{heldBack}</b> — they&apos;d already heard from us
              recently
            </StreamRow>
          )}

          {hasBrand && (
            <StreamRow tick="ok">
              writing in <b>{brandProfile?.brandName ?? "your"}</b> voice
            </StreamRow>
          )}

          {automationCount > 0 && (
            <StreamRow tick="ok">
              built <b>{automationCount}</b> automations — <b>{activeCount}</b>{" "}
              running on their own
              {readyCount > 0 ? (
                <>
                  , <b>{readyCount}</b> ready for your okay
                </>
              ) : null}
            </StreamRow>
          )}

          {draftedCount > 0 ? (
            <StreamRow tick="ok">
              drafted <b>{draftedCount}</b> · {pendingActions.length} queued for
              your approval ·{" "}
              <span className="text-[hsl(var(--accent))]">ready</span>
            </StreamRow>
          ) : (
            <StreamRow tick="step">
              looking for the next thing worth doing
            </StreamRow>
          )}

          {(missionControl?.summary || latestBriefing?.content?.summary) && (
            <StreamRow tick="ok">
              {firstLine(
                missionControl?.summary ?? latestBriefing?.content?.summary,
                140,
              )}
            </StreamRow>
          )}
        </StreamOutput>
      </ConsoleFrame>

      {/* 4. Pending decisions */}
      <div>
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
              You&apos;re all caught up.
            </p>
            <p className="font-sans text-[12.5px] text-muted-foreground mt-1 leading-relaxed">
              Nothing needs you right now — allo will surface the next thing the
              moment it&apos;s worth doing.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
