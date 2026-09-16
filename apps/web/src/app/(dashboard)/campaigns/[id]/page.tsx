"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { ArrowLeft, Send, Mail, Users, MousePointerClick, XCircle, CheckCircle, Loader2, Eye, Maximize2, Minimize2, Trash2, ShoppingBag, TrendingUp, CalendarClock, Pencil, AlertTriangle } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";
import { DecisionTracePanel } from "@/components/campaigns/DecisionTracePanel";
import { useAlloAI } from "@/components/ai/AlloAIPanel";

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = params.id as string;
  const { toast } = useToast();
  const { submitCampaignAlternative } = useAlloAI();

  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [showRecentOverride, setShowRecentOverride] = useState(false);
  const [selectedRecentIds, setSelectedRecentIds] = useState<string[]>([]);
  const [overrideReason, setOverrideReason] = useState("");
  const [alternativeSubmitting, setAlternativeSubmitting] = useState(false);
  const [showTimingOverride, setShowTimingOverride] = useState(false);
  const [showApproval, setShowApproval] = useState(false);
  const { data: campaign, isLoading } = (trpc.campaigns.getById as any).useQuery(
    { id: campaignId },
    { refetchInterval: (query: { state: { data?: { status?: string } } }) => ["scheduled", "sending"].includes(query.state.data?.status ?? "") ? 5_000 : false },
  );
  // The nested causal-statistics payload exceeds TypeScript's practical tRPC
  // inference depth in this already-large page; the server procedure remains typed.
  const { data: stats } = (trpc.campaigns.stats as any).useQuery({ id: campaignId });
  const { data: dryRun, isLoading: dryRunLoading, refetch: refetchDryRun } = trpc.campaigns.dryRun.useQuery(
    { id: campaignId },
    { enabled: campaign?.status === "draft" || campaign?.status === "scheduled" },
  );

  // Render preview from blocks if template has no pre-rendered HTML
  const templateBlocks = campaign?.template && !campaign.template.html
    ? ((campaign.template as any).blocks as any[] | undefined)
    : undefined;
  const renderMut = trpc.templates.renderPreview.useMutation();
  useEffect(() => {
    if (templateBlocks && templateBlocks.length > 0 && !renderMut.data && !renderMut.isPending) {
      renderMut.mutate({ blocks: templateBlocks });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateBlocks]);
  const utils = trpc.useUtils();
  const sendMut = trpc.campaigns.sendNow.useMutation({
    onSuccess: (_result, variables) => {
      setShowApproval(false);
      utils.campaigns.getById.invalidate({ id: campaignId });
      utils.campaigns.stats.invalidate({ id: campaignId });
      toast(
        variables.timing === "now"
          ? "Delivery approved. Joon is sending the frozen audience now."
          : "Delivery approved. Joon is preparing the frozen audience and timing plan.",
        "success",
      );
    },
    onError: () => toast("We couldn't send that. Mind trying again?", "error"),
  });
  const deliverNowMut = (trpc.campaigns.deliverNow as any).useMutation({
    onSuccess: async ({ promoted }: { promoted: number }) => {
      await Promise.all([
        utils.campaigns.getById.invalidate({ id: campaignId }),
        utils.campaigns.stats.invalidate({ id: campaignId }),
      ]);
      toast(`${promoted} ${promoted === 1 ? "email is" : "emails are"} being sent now.`, "success");
    },
    onError: (error: { message?: string }) => toast(error.message || "We couldn't start delivery now.", "error"),
  });
  const reviseMut = (trpc.campaigns.reviseScheduled as any).useMutation({
    onSuccess: ({ id, templateId }: { id: string; templateId: string | null }) => {
      toast("Scheduled delivery cancelled. Your editable revision is ready.", "info");
      router.push(templateId ? `/templates/${templateId}/edit?campaignId=${id}` : `/campaigns/${id}`);
    },
    onError: (error: { message?: string }) => toast(error.message || "We couldn't open an editable revision.", "error"),
  });
  const cancelMut = trpc.campaigns.cancel.useMutation({
    onSuccess: () => {
      utils.campaigns.getById.invalidate({ id: campaignId });
      toast("Campaign cancelled.", "info");
    },
    onError: () => toast("We couldn't cancel that. Mind trying again?", "error"),
  });
  const deleteMut = trpc.campaigns.delete.useMutation({
    onSuccess: () => {
      utils.campaigns.list.invalidate();
      toast("Draft deleted.", "info");
      router.push("/campaigns");
    },
    onError: () => toast("We couldn't delete that. Mind trying again?", "error"),
  });
  const includeLeftAloneMut = trpc.campaigns.includeLeftAloneCustomers.useMutation({
    onSuccess: () => {
      utils.campaigns.dryRun.invalidate({ id: campaignId });
      toast("They'll be reconsidered for this campaign.", "success");
    },
    onError: () => toast("We couldn't change that audience. Mind trying again?", "error"),
  });
  const overrideRecentPurchaseMut = trpc.campaigns.overrideRecentPurchase.useMutation({
    onSuccess: async ({ included }) => {
      await Promise.all([
        refetchDryRun(),
        utils.campaigns.getById.invalidate({ id: campaignId }),
      ]);
      setShowRecentOverride(false);
      setSelectedRecentIds([]);
      setOverrideReason("");
      toast(`${included} recent ${included === 1 ? "buyer is" : "buyers are"} back in consideration.`, "success");
    },
    onError: (error) => toast(error.message || "We couldn't record that override.", "error"),
  });

  useEffect(() => {
    if (!showRecentOverride || !dryRun?.recentPurchaseCustomers) return;
    setSelectedRecentIds(dryRun.recentPurchaseCustomers.map((customer) => customer.id));
  }, [showRecentOverride, dryRun?.recentPurchaseCustomers]);

  useEffect(() => {
    if (!alternativeSubmitting || dryRun?.linkedAlternative) return;
    const startedAt = Date.now();
    const timer = window.setInterval(async () => {
      const result = await refetchDryRun();
      if (result.data?.linkedAlternative) {
        setAlternativeSubmitting(false);
        window.clearInterval(timer);
      } else if (Date.now() - startedAt > 30_000) {
        setAlternativeSubmitting(false);
        window.clearInterval(timer);
      }
    }, 1_500);
    return () => window.clearInterval(timer);
  }, [alternativeSubmitting, dryRun?.linkedAlternative, refetchDryRun]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 gap-2">
        <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
        <span className="text-[13px] text-muted-foreground">Loading your campaign…</span>
      </div>
    );
  }

  if (!campaign) {
    return <div className="text-[13px] text-muted-foreground font-sans">We couldn't find this campaign.</div>;
  }

  const causal = stats?.holdout.stats as null | undefined | {
    lift?: number;
    ciLow?: number;
    ciHigh?: number;
    significant?: boolean;
    underpowered?: boolean;
    confidence?: number;
    nTreatment?: number;
    nControl?: number;
  };
  const moneyCurrency = stats?.currency === "INR" ? "INR" : "USD";
  const money = (value: number) => new Intl.NumberFormat(moneyCurrency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency: moneyCurrency,
    maximumFractionDigits: 0,
  }).format(value);
  const dryRunCurrency = dryRun?.currency === "INR" ? "INR" : moneyCurrency;
  const dryRunMoney = (value: number) => new Intl.NumberFormat(dryRunCurrency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency: dryRunCurrency,
    maximumFractionDigits: 2,
  }).format(value);
  const proposal = (campaign.agentProposal ?? {}) as Record<string, any>;
  const dispatch = (proposal.dispatch ?? {}) as Record<string, any>;
  const delivery = ((campaign as any).deliveryPlan ?? dispatch.delivery ?? {}) as {
    earliestAt?: string | null;
    latestAt?: string | null;
    reason?: string;
    timingSource?: "customer" | "store" | "default";
    merchantOverride?: boolean;
    consequence?: string;
  };
  const awaitingDelivery = campaign.status === "scheduled" || (
    campaign.status === "sending" &&
    (stats?.recipientCount ?? 0) === 0 &&
    Number(dispatch.scheduled ?? campaign.recipientCount ?? 0) > 0 &&
    !delivery.merchantOverride
  );
  const formatDeliveryTime = (value?: string | null) => value
    ? new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      }).format(new Date(value))
    : null;
  const earliestLabel = formatDeliveryTime(delivery.earliestAt);
  const latestLabel = formatDeliveryTime(delivery.latestAt);
  const deliveryWindow = earliestLabel && latestLabel && earliestLabel !== latestLabel
    ? `${earliestLabel} – ${latestLabel}`
    : earliestLabel ?? "Waiting for the planned delivery time";
  const exclusionCopy: Record<string, { label: string; explanation: string }> = {
    invalid_email: { label: "Invalid email", explanation: "The stored email address cannot receive mail." },
    no_consent: { label: "No email consent", explanation: "This customer has not subscribed to marketing email." },
    unsubscribed: { label: "Unsubscribed", explanation: "This customer opted out of marketing email." },
    complaint: { label: "Complaint suppression", explanation: "A previous complaint permanently blocks marketing delivery." },
    hard_bounce: { label: "Previous hard bounce", explanation: "A previous hard bounce blocks another delivery attempt." },
    manual_suppression: { label: "Manually suppressed", explanation: "This customer is on the store’s suppression list." },
    already_processed: { label: "Already processed", explanation: "This campaign already created a delivery record for this customer." },
    fatigue: { label: "Fatigue limit", explanation: "They have reached the store’s weekly or monthly email limit." },
    collision: { label: "Recent campaign", explanation: "They received another campaign within the 48-hour spacing window." },
    cooldown: { label: "Customer cooldown", explanation: "A redeemed offer or recent support issue is still inside its cooldown." },
    support_state: { label: "Active support issue", explanation: "Joon avoids marketing while this customer needs support." },
    recent_purchase: { label: "Recent purchase", explanation: "Joon is leaving this recent buyer alone for this campaign." },
    store_paused: { label: "Store delivery paused", explanation: "Email delivery is paused for this store." },
    global_paused: { label: "Delivery globally disabled", explanation: "Joon’s global delivery safety gate is active." },
  };
  const excludedCustomerRows = dryRun
    ? Object.entries(dryRun.exclusionSamples).flatMap(([reason, customers]) =>
        (customers ?? []).map((customer) => ({
          ...customer,
          reason,
          ...(exclusionCopy[reason] ?? {
            label: reason.replaceAll("_", " "),
            explanation: "A current audience or delivery rule excludes this customer.",
          }),
        })),
      )
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/campaigns" className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </Link>
          <div>
            <h1 className="text-[18px] tracking-[-0.5px] font-semibold text-foreground font-serif">{campaign.name}</h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">{campaign.template?.subject}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {campaign.status === "sent" && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))] border border-[hsl(var(--success)/0.25)] rounded-lg text-xs font-sans font-bold">
              <CheckCircle className="w-3.5 h-3.5" />
              Sent
            </span>
          )}
          {campaign.status === "partially_sent" && (
            <span className="flex items-center gap-1.5 rounded-lg border border-warning/30 bg-warning/10 px-3 py-1.5 text-xs font-bold text-warning">
              <AlertTriangle className="h-3.5 w-3.5" />
              Partially sent
            </span>
          )}
          {campaign.status === "failed" && (
            <span className="flex items-center gap-1.5 rounded-lg border border-[var(--color-urgent)]/30 bg-[var(--color-urgent)]/10 px-3 py-1.5 text-xs font-bold text-[var(--color-urgent)]">
              <XCircle className="h-3.5 w-3.5" />
              Delivery failed
            </span>
          )}
          {awaitingDelivery && (
            <span className="flex items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-1.5 text-xs font-bold text-foreground">
              <CalendarClock className="h-3.5 w-3.5" />
              Scheduled
            </span>
          )}
          {campaign.status === "sending" && !awaitingDelivery && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-warning)]/10 text-warning border border-[var(--color-warning)]/25 rounded-lg text-xs font-sans font-bold">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Sending now…
            </span>
          )}
          {awaitingDelivery && (
            <>
              <button
                onClick={() => reviseMut.mutate({ id: campaignId })}
                disabled={reviseMut.isPending || deliverNowMut.isPending}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-[border-color,transform] duration-150 hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97] disabled:opacity-50"
              >
                {reviseMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />}
                Edit campaign
              </button>
              <button
                onClick={() => setShowTimingOverride(true)}
                disabled={deliverNowMut.isPending || reviseMut.isPending}
                className="flex items-center gap-2 rounded-lg bg-secondary px-4 py-2 text-xs font-medium text-secondary-foreground transition-[background-color,transform] duration-150 hover:bg-secondary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97] disabled:opacity-50"
              >
                {deliverNowMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                {deliverNowMut.isPending ? "Starting delivery…" : "Send now instead"}
              </button>
            </>
          )}
          {campaign.status === "draft" && (
            <button
              onClick={() => setShowApproval(true)}
              disabled={sendMut.isPending || dryRun?.deliveryGate?.blocked}
              title={dryRun?.deliveryGate?.blocked ? dryRun.deliveryGate.reason ?? "Delivery is disabled" : undefined}
              className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-xs font-sans hover:bg-secondary/90 disabled:opacity-50 transition-all"
            >
              {sendMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {sendMut.isPending ? "Approving…" : dryRun?.deliveryGate?.blocked ? "Delivery disabled" : "Approve delivery"}
            </button>
          )}
          {campaign.status === "scheduled" && !awaitingDelivery && (
            <button
              onClick={() => cancelMut.mutate({ id: campaignId })}
              disabled={cancelMut.isPending}
              className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-xs font-sans text-foreground hover:border-primary/50 disabled:opacity-50 transition-all"
            >
              <XCircle className="w-3.5 h-3.5" />
              {cancelMut.isPending ? "Cancelling…" : "Cancel"}
            </button>
          )}
          {campaign.status === "draft" && (
            <button
              onClick={() => {
                if (window.confirm(`Delete the draft "${campaign.name}"? This can't be undone.`)) {
                  deleteMut.mutate({ id: campaignId });
                }
              }}
              disabled={deleteMut.isPending}
              className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-xs font-sans text-muted-foreground hover:border-[var(--color-urgent)] hover:text-[var(--color-urgent)] disabled:opacity-50 transition-all"
            >
              {deleteMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              {deleteMut.isPending ? "Deleting…" : "Delete"}
            </button>
          )}
        </div>
      </div>

      <Dialog.Root open={showApproval} onOpenChange={setShowApproval}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 motion-reduce:animate-none" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl bg-card p-6 shadow-[0_18px_50px_rgba(0,0,0,0.24)] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 motion-reduce:animate-none">
            <Dialog.Title className="text-[16px] font-semibold text-foreground">Approve this campaign for delivery</Dialog.Title>
            <Dialog.Description className="mt-1 max-w-md text-[12px] leading-5 text-muted-foreground">
              Approval freezes the email, audience and control assignment. Choose whether Joon should plan the timing or deliver immediately.
            </Dialog.Description>
            <div className="mt-5 space-y-3">
              <button
                type="button"
                onClick={() => sendMut.mutate({ id: campaignId, timing: "joon" })}
                disabled={sendMut.isPending}
                className="w-full rounded-xl border border-foreground bg-background px-4 py-4 text-left transition-[background-color,transform] duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99] disabled:opacity-50"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="text-[13px] font-semibold text-foreground">Use Joon’s timing</span>
                  <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-bold text-secondary-foreground">Recommended</span>
                </span>
                <span className="mt-1 block text-[11px] leading-5 text-muted-foreground">
                  Joon will use customer engagement, store patterns and quiet hours. You will see every planned time and can still override it before delivery.
                </span>
              </button>
              <button
                type="button"
                onClick={() => sendMut.mutate({ id: campaignId, timing: "now" })}
                disabled={sendMut.isPending}
                className="w-full rounded-xl border border-border bg-background px-4 py-4 text-left transition-[border-color,transform] duration-150 hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99] disabled:opacity-50"
              >
                <span className="text-[13px] font-semibold text-foreground">Deliver immediately</span>
                <span className="mt-1 block text-[11px] leading-5 text-muted-foreground">
                  Overrides Joon’s timing and quiet-hours recommendation for this campaign only. Consent, suppression, sender-domain and allowlist checks still run.
                </span>
              </button>
            </div>
            <div className="mt-5 flex justify-end">
              <Dialog.Close asChild>
                <button className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-[border-color,transform] duration-150 hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]">
                  Keep editing
                </button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {awaitingDelivery && (
        <section className="rounded-xl border border-border bg-card px-5 py-5 sm:px-6" aria-labelledby="delivery-plan-title">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
              <CalendarClock className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2 id="delivery-plan-title" className="text-[15px] font-semibold text-foreground">Scheduled for {deliveryWindow}</h2>
              <p className="mt-1 max-w-3xl text-[12px] leading-5 text-muted-foreground">
                {delivery.reason ?? "Joon is waiting for the planned delivery time. The approved audience, control group and email remain frozen until delivery begins."}
              </p>
              <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                Edit creates a fresh draft and keeps this approved version in the audit trail. “Send now instead” overrides timing only; consent, suppression, sender-domain and recipient allowlist checks still run.
              </p>
            </div>
          </div>
        </section>
      )}

      <Dialog.Root open={showTimingOverride} onOpenChange={setShowTimingOverride}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 motion-reduce:animate-none" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-card p-6 shadow-[0_18px_50px_rgba(0,0,0,0.24)] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 motion-reduce:animate-none">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div>
                <Dialog.Title className="text-[16px] font-semibold text-foreground">Send before Joon’s recommended time?</Dialog.Title>
                <Dialog.Description className="mt-1 text-[12px] leading-5 text-muted-foreground">
                  The campaign is scheduled for {deliveryWindow}.
                </Dialog.Description>
              </div>
            </div>
            <div className="mt-5 space-y-3 rounded-lg bg-muted/60 px-4 py-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Why Joon waited</div>
                <p className="mt-1 text-[12px] leading-5 text-foreground">{delivery.reason ?? "Joon selected this time from the available delivery policy and engagement evidence."}</p>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">What may change</div>
                <p className="mt-1 text-[12px] leading-5 text-foreground">{delivery.consequence ?? "Sending earlier may reduce opens because it ignores the recommended engagement window."}</p>
              </div>
            </div>
            <p className="mt-4 text-[11px] leading-5 text-muted-foreground">
              This overrides timing only. Consent, suppression, verified-domain and recipient allowlist checks still run immediately before delivery.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Dialog.Close asChild>
                <button className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-[border-color,transform] duration-150 hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]">
                  Keep scheduled
                </button>
              </Dialog.Close>
              <button
                onClick={() => deliverNowMut.mutate({ id: campaignId }, { onSuccess: () => setShowTimingOverride(false) })}
                disabled={deliverNowMut.isPending}
                className="flex items-center gap-2 rounded-lg bg-secondary px-4 py-2 text-xs font-medium text-secondary-foreground transition-[background-color,transform] duration-150 hover:bg-secondary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97] disabled:opacity-50"
              >
                {deliverNowMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                {deliverNowMut.isPending ? "Starting delivery…" : "Override and send now"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
        {[
          { icon: Mail, label: "TREATED", value: stats?.holdout.treatmentAssigned.toLocaleString() ?? "0" },
          { icon: Users, label: "CONTROL", value: stats?.holdout.controlAssigned.toLocaleString() ?? "0" },
          { icon: Mail, label: "OPENED", value: stats ? `${(stats.openRate * 100).toFixed(1)}%` : "0%" },
          { icon: MousePointerClick, label: "CLICKED", value: stats ? `${(stats.clickRate * 100).toFixed(1)}%` : "0%" },
          { icon: XCircle, label: "BOUNCED", value: stats?.bounceCount.toLocaleString() ?? "0" },
          { icon: ShoppingBag, label: "ATTRIBUTED ORDERS", value: stats?.attributedOrders.toLocaleString() ?? "0" },
          { icon: TrendingUp, label: "ATTRIBUTED REVENUE", value: money(stats?.attributedRevenue ?? 0) },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="border border-border rounded-xl p-5 bg-card hover:border-foreground hover:shadow-[0_0_0_1px_hsl(var(--foreground))] transition-all group"
          >
            <kpi.icon className="w-5 h-5 text-muted-foreground/50 mb-3 group-hover:text-foreground transition-colors" />
            <div className="text-[10px] text-muted-foreground font-sans uppercase font-bold tracking-[1px] mb-1">{kpi.label}</div>
            <div className="text-[28px] tabular-nums font-bold text-foreground font-mono">{kpi.value}</div>
          </div>
        ))}
      </div>

      {stats?.holdout.experimentId && (
        <section className="border border-border rounded-xl bg-card px-5 py-5 sm:px-6" aria-labelledby="holdout-result-title">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-2xl">
              <h2 id="holdout-result-title" className="text-[15px] font-semibold text-foreground">Incremental result versus holdout</h2>
              <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
                Attributed revenue is last-touch reporting. This result is different: it compares campaign candidates randomly assigned to treatment and control.
              </p>
            </div>
            <span className={`w-fit rounded-full px-2.5 py-1 text-[10px] font-bold ${causal && !causal.underpowered ? "bg-[hsl(var(--success)/0.14)] text-[hsl(var(--success))]" : "bg-muted text-muted-foreground"}`}>
              {causal ? (causal.underpowered ? "DIRECTIONAL" : causal.significant ? "MEASURED" : "NO PROVEN LIFT") : "WINDOW OPEN"}
            </span>
          </div>

          <div className="mt-5 flex flex-wrap gap-x-10 gap-y-4 border-t border-border pt-4">
            <div>
              <div className="text-[11px] text-muted-foreground">Treatment / control</div>
              <div className="mt-1 font-mono text-[18px] font-bold">{stats.holdout.treatmentAssigned} / {stats.holdout.controlAssigned}</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">Revenue difference per treated customer</div>
              <div className="mt-1 font-mono text-[18px] font-bold">{causal ? money(causal.lift ?? 0) : "Measuring…"}</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">95% confidence interval</div>
              <div className="mt-1 font-mono text-[18px] font-bold">{causal ? `${money(causal.ciLow ?? 0)} to ${money(causal.ciHigh ?? 0)}` : "Available after 7 days"}</div>
            </div>
          </div>
          <p className="mt-4 text-[11px] leading-5 text-muted-foreground">
            {causal?.underpowered
              ? `Directional only: ${causal.nControl ?? 0} closed control observations and ${causal.nTreatment ?? 0} treatment observations. Joon does not call this proven lift yet.`
              : causal
                ? "The full seven-day outcome window has closed. Non-buyers remain in the denominator at zero, so this includes conversion-rate differences—not only buyers’ order values."
                : "The cohort is frozen. Purchases are recorded for both arms, including full-price orders from held-out customers."}
          </p>
        </section>
      )}

      {/* Campaign details */}
      <div className="border border-border rounded-xl p-6 bg-card">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-px h-6 bg-secondary" />
          <h2 className="text-[13px] font-bold text-foreground font-serif">Details</h2>
        </div>
        <div className="grid grid-cols-3 gap-x-8 gap-y-2">
          {[
            { label: "Status", value: campaign.status.toUpperCase() },
            { label: "Template", value: campaign.template?.name },
            { label: "Segment", value: campaign.segment?.name ?? "All Subscribers" },
            { label: "Store", value: campaign.store.shopDomain },
            { label: "Scheduled", value: campaign.scheduledAt ? new Date(campaign.scheduledAt).toLocaleString() : "\u2014" },
            { label: "Sent At", value: campaign.sentAt ? new Date(campaign.sentAt).toLocaleString() : "\u2014" },
          ].map((item) => (
            <div key={item.label} className="flex justify-between py-1.5 border-b border-border">
              <span className="text-[11px] text-muted-foreground font-sans">{item.label}</span>
              <span className="text-[11px] font-bold text-foreground font-sans">{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      {(campaign.status === "draft" || campaign.status === "scheduled") && (
        <div className="border border-border rounded-xl p-6 bg-card">
          <div className="flex items-start justify-between gap-6 mb-5">
            <div>
              <p className="text-[10px] uppercase tracking-[1px] font-bold text-muted-foreground">Pre-send safety check</p>
              <h2 className="text-[16px] font-semibold font-serif mt-1">Who will actually receive this</h2>
              <p className="text-[11px] text-muted-foreground mt-1">A dry run only. No email provider has been called.</p>
            </div>
            {dryRunLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          </div>
          {dryRun && (
            <>
              {dryRun.deliveryGate?.blocked && (
                <div className="mb-5 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-warning">
                    Delivery safely disabled
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {dryRun.deliveryGate.reason}. The audience below is a planning estimate;
                    no email can leave Joon while this gate is active.
                  </p>
                </div>
              )}
              <div className="mb-5 rounded-xl border border-border bg-background/50 p-4">
                <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Audience plan</div>
                <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {[
                    ["You asked for", dryRun.requestedAudienceCount ?? dryRun.requested],
                    ["Found in store", dryRun.requested],
                    ["Not in store", dryRun.audienceShortfall],
                    ["Campaign candidates", dryRun.eligibleBeforeHoldout],
                    ["Random control", dryRun.estimatedControl],
                    ["Would receive", dryRun.estimatedTreatment],
                  ].map(([label, value]) => (
                    <div key={String(label)}>
                      <div className="text-[10px] text-muted-foreground">{label}</div>
                      <div className="mt-0.5 font-mono text-lg font-bold">{Number(value).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
                <p className="mt-3 border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
                  {dryRun.requestedAudienceCount != null && dryRun.audienceShortfall > 0
                    ? `This store has ${dryRun.requested} of the ${dryRun.requestedAudienceCount} customers requested. `
                    : ""}
                  {dryRun.otherLeftAlone > 0
                    ? `${dryRun.otherLeftAlone} ${dryRun.otherLeftAlone === 1 ? "customer is" : "customers are"} not receiving this campaign for the reasons below. `
                    : ""}
                  From {dryRun.eligibleBeforeHoldout} campaign {dryRun.eligibleBeforeHoldout === 1 ? "candidate" : "candidates"}, {dryRun.estimatedControl} {dryRun.estimatedControl === 1 ? "is" : "are"} randomly assigned to control and {dryRun.estimatedTreatment} would receive the email.
                </p>
              </div>
              {dryRun.otherLeftAlone > 0 && (
                <div className="mb-5 rounded-xl border border-border bg-background/50 p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="text-[12px] font-semibold text-foreground">Not receiving this campaign</div>
                    <div className="font-mono text-[11px] font-bold text-muted-foreground">{dryRun.otherLeftAlone}</div>
                  </div>
                  <div className="mt-3 divide-y divide-border">
                    {excludedCustomerRows.map((customer) => {
                      const name = [customer.firstName, customer.lastName].filter(Boolean).join(" ") || customer.email;
                      return (
                        <div key={`${customer.reason}-${customer.id}`} className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] sm:gap-5">
                          <div className="min-w-0">
                            <div className="truncate text-[11px] font-medium text-foreground">{name}</div>
                            {name !== customer.email && <div className="truncate text-[10px] text-muted-foreground">{customer.email}</div>}
                          </div>
                          <div>
                            <div className="text-[11px] font-medium text-foreground">{customer.label}</div>
                            <div className="mt-0.5 text-[10px] leading-4 text-muted-foreground">{customer.explanation}</div>
                          </div>
                        </div>
                      );
                    })}
                    {excludedCustomerRows.length < dryRun.otherLeftAlone && (
                      <div className="pt-3 text-[10px] text-muted-foreground">
                        Showing {excludedCustomerRows.length} examples. The frozen approval record keeps the complete counts by reason.
                      </div>
                    )}
                  </div>
                </div>
              )}
              {dryRun.offer.appliedDiscountPercent > 0 && (
                <div className="mb-5 rounded-lg border border-border bg-background/50 px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Offer</div>
                      <p className="mt-1 text-[13px] font-medium text-foreground">
                        {dryRun.offer.appliedDiscountPercent}% off · code {dryRun.offer.discountCode ?? "generated at approval"}
                      </p>
                    </div>
                    <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] text-muted-foreground">
                      {dryRun.offer.shopifyStatus === "created" ? "Created in Shopify" : "Created in Shopify when sending begins"}
                    </span>
                  </div>
                  {dryRun.offer.adjustedByGuardrail && (
                    <p className="mt-2 text-[11px] text-warning">
                      You asked for {dryRun.offer.requestedDiscountPercent}%. Your store guardrail allows at most {dryRun.offer.appliedDiscountPercent}%, so Joon used {dryRun.offer.appliedDiscountPercent}% and kept the draft within policy.
                    </p>
                  )}
                </div>
              )}
              {dryRun.previewAssignments.length > 0 && (
                <details className="mb-5 rounded-lg border border-border bg-background/50">
                  <summary className="cursor-pointer px-4 py-3 text-[11px] font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    See the estimated treatment and control customers
                  </summary>
                  <div className="grid gap-4 border-t border-border px-4 py-3 sm:grid-cols-2">
                    {(["TREATMENT", "CONTROL"] as const).map((arm) => {
                      const customers = dryRun.previewAssignments.filter((customer) => customer.arm === arm);
                      return (
                        <div key={arm}>
                          <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                            {arm === "TREATMENT" ? "Would receive this campaign" : "Random control · no email"} · {customers.length}
                          </div>
                          <div className="mt-2 space-y-1">
                            {customers.length > 0 ? customers.map((customer) => (
                              <div key={customer.id} className="truncate text-[11px] text-foreground">
                                {[customer.firstName, customer.lastName].filter(Boolean).join(" ") || customer.email}
                              </div>
                            )) : (
                              <div className="text-[11px] text-muted-foreground">None for this audience size.</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
                    Preview only. These exact assignments freeze when you approve.
                  </p>
                </details>
              )}
              {dryRun.measurement.warning && (
                <div className="mb-5 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-warning">
                    {dryRun.measurement.tier === "empty"
                      ? "No campaign candidates"
                      : dryRun.measurement.tier === "unmeasured"
                        ? "Unmeasured small cohort"
                        : "Directional measurement"}
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">{dryRun.measurement.warning}</p>
                </div>
              )}
              {dryRun.recentPurchaseOverrideCount > 0 && (
                <div className="mb-5 rounded-lg border border-secondary/35 bg-secondary/5 px-4 py-3">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-foreground">
                    Merchant override recorded
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    You asked Joon to reconsider {dryRun.recentPurchaseOverrideCount} recent {dryRun.recentPurchaseOverrideCount === 1 ? "buyer" : "buyers"} for this campaign. They are included in the candidate pool, while consent and delivery safeguards still apply.
                  </p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-x-8 gap-y-1">
                {Object.entries(dryRun.exclusions).filter(([, count]) => count > 0).map(([reason, count]) => (
                  <div key={reason} className="flex justify-between py-2 border-b border-border text-[11px]">
                    <span className="text-muted-foreground">{reason.replaceAll("_", " ")}</span>
                    <span className="font-mono font-bold">-{count}</span>
                  </div>
                ))}
              </div>
              {dryRun.exclusions.recent_purchase > 0 && dryRun.marginRisk.discountPercent > 0 && (
                <div className="mt-5 rounded-xl border border-border bg-background/50 p-4">
                  <div className="text-[13px] font-semibold text-foreground">
                    Joon protected {dryRun.exclusions.recent_purchase} recent {dryRun.exclusions.recent_purchase === 1 ? "buyer" : "buyers"} from this discount
                  </div>
                  <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-muted-foreground">
                    They have already purchased inside the seven-day discount window. Sending them {dryRun.marginRisk.discountPercent}%
                    off now could give away margin without changing their decision. Try a
                    full-price new-product message, or choose customers whose last purchase is older.
                  </p>
                  {(dryRun.exclusionSamples.recent_purchase?.length ?? 0) > 0 && (
                    <p className="mt-3 text-[11px] text-foreground">
                      Examples: {(dryRun.exclusionSamples.recent_purchase ?? []).map((customer) =>
                        [customer.firstName, customer.lastName].filter(Boolean).join(" ") || customer.email
                      ).join(", ")}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {dryRun.linkedAlternative ? (
                      <Link
                        href={`/campaigns/${dryRun.linkedAlternative.id}`}
                        className="rounded-lg border border-border px-3 py-2 text-[11px] font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        Open full-price alternative
                      </Link>
                    ) : (
                      <button
                        type="button"
                        disabled={alternativeSubmitting}
                        onClick={() => {
                          setAlternativeSubmitting(true);
                          submitCampaignAlternative(
                            `Create a full-price alternative to “${campaign.name}” for the ${dryRun.exclusions.recent_purchase} recent buyers Joon left alone. Keep the same occasion, products, and brand voice, and let me review the draft before anything is sent.`,
                            {
                              sourceCampaignId: campaignId,
                              customerIds: dryRun.recentPurchaseCustomers.map((customer) => customer.id),
                              forceNoDiscount: true,
                            },
                          );
                        }}
                        className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[11px] font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60"
                      >
                        {alternativeSubmitting && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
                        {alternativeSubmitting ? "Creating alternative…" : "Draft a full-price alternative"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowRecentOverride((value) => !value)}
                      className="rounded-lg px-3 py-2 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {showRecentOverride ? "Cancel override" : "Override Joon's decision"}
                    </button>
                  </div>
                  {showRecentOverride && (
                    <div className="mt-4 border-t border-border pt-4">
                      <p className="text-[11px] font-medium text-foreground">
                        Choose who to reconsider for this campaign
                      </p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {dryRun.recentPurchaseCustomers.map((customer) => {
                          const checked = selectedRecentIds.includes(customer.id);
                          const name = [customer.firstName, customer.lastName].filter(Boolean).join(" ") || customer.email;
                          return (
                            <label key={customer.id} className="flex items-center gap-2 text-[11px] text-foreground">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  setSelectedRecentIds((current) =>
                                    checked
                                      ? current.filter((id) => id !== customer.id)
                                      : [...current, customer.id]
                                  )
                                }
                                className="h-4 w-4 rounded border-border accent-current"
                              />
                              <span className="truncate">{name}</span>
                            </label>
                          );
                        })}
                      </div>
                      <label className="mt-4 block text-[11px] font-medium text-foreground" htmlFor="recent-purchase-override-reason">
                        Why should Joon include them?
                      </label>
                      <textarea
                        id="recent-purchase-override-reason"
                        value={overrideReason}
                        onChange={(event) => setOverrideReason(event.target.value)}
                        rows={2}
                        placeholder="For example: this is a promised festival offer for our VIP customers."
                        className="mt-1 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                      <button
                        type="button"
                        disabled={selectedRecentIds.length === 0 || overrideReason.trim().length < 5 || overrideRecentPurchaseMut.isPending}
                        onClick={() =>
                          overrideRecentPurchaseMut.mutate({
                            id: campaignId,
                            customerIds: selectedRecentIds,
                            reason: overrideReason.trim(),
                          })
                        }
                        className="mt-3 rounded-lg bg-secondary px-3 py-2 text-[11px] font-medium text-secondary-foreground hover:bg-secondary/90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {overrideRecentPurchaseMut.isPending
                          ? "Recording override…"
                          : `Include ${selectedRecentIds.length || "selected"} anyway`}
                      </button>
                      <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                        Joon keeps the recent-purchase evidence, records your reason, and recalculates the control group. Consent and delivery safeguards still apply.
                      </p>
                    </div>
                  )}
                </div>
              )}
              {dryRun.leftAloneSamples.length > 0 && (
                <div className="mt-5 rounded-xl border border-border bg-background/50 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wide text-foreground">
                        Deliberately left alone
                      </div>
                      <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-muted-foreground">
                        Joon found evidence that these customers may not need this campaign. You can
                        include them here, or make a separate full-price message for them.
                      </p>
                    </div>
                    <Link
                      href="/campaigns/new"
                      className="shrink-0 rounded-lg border border-border px-3 py-2 text-[11px] font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Create separate campaign
                    </Link>
                  </div>
                  <div className="mt-3 divide-y divide-border">
                    {dryRun.leftAloneSamples.map((customer) => (
                      <div key={customer.id} className="flex items-center justify-between gap-4 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-[12px] font-medium text-foreground">
                            {[customer.firstName, customer.lastName].filter(Boolean).join(" ") ||
                              customer.email}
                          </p>
                          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                            {customer.decision.reasonText}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={includeLeftAloneMut.isPending}
                          onClick={() =>
                            includeLeftAloneMut.mutate({ id: campaignId, customerIds: [customer.id] })
                          }
                          className="shrink-0 rounded-lg border border-border px-3 py-2 text-[11px] font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          Include here
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-4 pt-4 border-t border-border flex justify-between text-[11px]">
                <span className="text-muted-foreground">Sender</span>
                <span className="font-medium">
                  {dryRun.sender ?? "Sending address not configured"} · {dryRun.senderDomain?.status ?? "domain not configured"}
                </span>
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">The eligible customer set and complete treatment/control assignment freeze when you approve. Consent, suppression, pauses and delivery limits are checked again immediately before every email.</p>
              {dryRun.marginRisk.discountPercent > 0 && dryRun.marginRisk.recentBuyers > 0 && (
                <div className="mt-4 rounded-xl border border-warning/30 bg-warning/5 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-warning">Margin worth reviewing</div>
                  <p className="mt-1 text-[13px] font-medium">
                    {dryRun.marginRisk.recentBuyers} currently eligible {dryRun.marginRisk.recentBuyers === 1 ? "customer has" : "customers have"} already purchased in the last 7 days.
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    They placed {dryRun.marginRisk.recentOrders} orders worth {dryRunMoney(dryRun.marginRisk.observedRecentSubtotal)}. If equivalent baskets used this {dryRun.marginRisk.discountPercent}% offer, discount exposure would be about {dryRunMoney(dryRun.marginRisk.illustrativeDiscountExposure)}.
                  </p>
                  <p className="mt-2 text-[10px] text-muted-foreground">This is an illustration from observed orders—not a prediction that these customers will purchase again.</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* How joon decided — the moat, made legible */}
      <DecisionTracePanel
        campaignId={campaignId}
        preview={
          dryRun
            ? {
                treatmentCount: dryRun.estimatedTreatment,
                controlCount: dryRun.estimatedControl,
                controlRate: dryRun.measurement.holdoutRate,
              }
            : undefined
        }
      />

      {/* Email preview — full width */}
      <div className="border border-border rounded-xl bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-px h-6 bg-secondary" />
            <h2 className="text-[13px] font-bold text-foreground font-serif">Email preview</h2>
          </div>
          <div className="flex items-center gap-3">
            {(campaign.template?.html || renderMut.data?.html) && (
              <button
                onClick={() => setPreviewExpanded((v) => !v)}
                className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-sans text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted transition-all"
              >
                {previewExpanded ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                {previewExpanded ? "Collapse" : "Full Preview"}
              </button>
            )}
            {campaign.templateId && (
              <Link
                href={`/templates/${campaign.templateId}/edit`}
                className="text-[10px] font-sans text-muted-foreground hover:text-foreground transition-colors"
              >
                Edit template &rarr;
              </Link>
            )}
          </div>
        </div>
        <div className="flex justify-center bg-muted/50 p-6">
          {(campaign.template?.html || renderMut.data?.html) ? (
            <div className="border border-border rounded-lg overflow-hidden bg-card shadow-sm" style={{ width: 620 }}>
              <iframe
                srcDoc={campaign.template?.html ?? renderMut.data?.html}
                className={`w-full transition-all duration-300 ${previewExpanded ? "h-[1200px]" : "h-[700px]"}`}
                title="Email preview"
                sandbox="allow-same-origin"
                style={{ pointerEvents: previewExpanded ? "auto" : "none" }}
              />
            </div>
          ) : renderMut.isPending ? (
            <div className="flex items-center justify-center py-16 w-full">
              <Loader2 className="w-4 h-4 text-muted-foreground animate-spin mr-2" />
              <span className="text-[11px] font-sans text-muted-foreground">Putting the preview together…</span>
            </div>
          ) : campaign.templateId ? (
            <Link
              href={`/templates/${campaign.templateId}/edit`}
              className="block p-8 bg-card rounded-lg border border-border hover:border-muted-foreground/50 transition-all text-center w-full max-w-md"
            >
              <Eye className="w-6 h-6 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-[11px] text-muted-foreground">{campaign.template?.name ?? "Email Template"}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Open it to take a look or make changes</p>
            </Link>
          ) : (
            <div className="p-8 text-center w-full">
              <Mail className="w-6 h-6 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-[10px] text-muted-foreground">No template attached yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
