"use client";

import { Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";
import {
  ConsoleFrame,
  StreamOutput,
  StreamRow,
  DecisionCard,
  MetricReadout,
} from "@/components/console";
import type {
  OpTagKind,
  DecisionReasonLine,
  DecisionPrediction,
} from "@/components/console";

// ---------------------------------------------------------------------------
// Action shape (autonomy.listActions) — surfaced in operator language.
// ---------------------------------------------------------------------------

interface Action {
  id: string;
  type?: string | null;
  category?: string | null;
  status: string;
  reasoning?: string | null;
  campaignName?: string | null;
  confidenceScore?: number | null;
  urgencyScore?: number | null;
  estimatedRevenue?: number | null;
  expiresAt?: string | null;
  archetype?: string | null;
  targetSegment?: { count?: number | null } | null;
  prediction?: DecisionPrediction | null;
}

// ---------------------------------------------------------------------------
// Helpers — derive tags / reasoning / readouts from an action.
// ---------------------------------------------------------------------------

// Map an autonomy action's category/type/archetype to operator tag(s).
function actionToTags(action: Action): OpTagKind[] {
  const hay =
    `${action.category ?? ""} ${action.type ?? ""} ${action.archetype ?? ""}`.toLowerCase();
  const tags: OpTagKind[] = [];
  if (/win.?back|lapsed|hibernat|lost|churn|recover|reorder|repurchase/.test(hay))
    tags.push("win-back");
  if (/welcome|onboard|first|new/.test(hay)) tags.push("welcome");
  if (/vip|champion|loyal|reward|best/.test(hay)) tags.push("vip");
  if (/apolog|late|pre.?empt|issue|delay|ship/.test(hay)) tags.push("pre-empt");
  if (/fatigue|suppress|hold|cap|frequen/.test(hay)) tags.push("fatigue");
  if (/time|timing|send.?time|schedul|clock/.test(hay)) tags.push("timing");
  if (tags.length === 0) tags.push("memory");
  return tags.slice(0, 2);
}

// First sentence of a reasoning blob, trimmed.
function firstLine(text: string | null | undefined, max = 140): string {
  if (!text) return "";
  const t = text.trim();
  const sentence = t.split(/(?<=[.!?])\s/)[0] ?? t;
  return sentence.length > max ? sentence.slice(0, max) + "…" : sentence;
}

// Remainder of a reasoning blob after the first sentence.
function restLines(text: string | null | undefined, max = 160): string {
  if (!text) return "";
  const t = text.trim();
  const parts = t.split(/(?<=[.!?])\s/);
  const rest = parts.slice(1).join(" ").trim();
  if (!rest) return "";
  return rest.length > max ? rest.slice(0, max) + "…" : rest;
}

// Confidence as a warm mono readout label.
function confidenceLabel(score: number | null | undefined): string {
  const s = score ?? 0;
  if (s >= 80) return `confident · ${s}%`;
  if (s >= 50) return `fairly sure · ${s}%`;
  return `a hunch · ${s}%`;
}

// "expires in …" in warm voice, or null if no expiry.
function expiresIn(expiresAt: string | null | undefined): string | null {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "the moment has passed";
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "expires within the hour";
  if (hours < 24) return `expires in ${hours}h`;
  return `expires in ${Math.floor(hours / 24)}d`;
}

// The one-line decision in allo's warm voice — what allo wants to do.
// When there's no campaign name, the first reasoning sentence becomes the
// headline; buildReasoning() then knows to skip it so it never appears twice.
function decisionLine(action: Action): string {
  if (action.campaignName) return action.campaignName;
  const r = firstLine(action.reasoning, 110);
  if (r) return r;
  return "allo lined up something worth doing";
}

// Build the mono reasoning stream for a decision: what it found, what it held
// back & why, what it drafted — pulled from real fields, warm voice. Never
// repeats the headline (see decisionLine): when the headline IS the first
// reasoning sentence, the stream starts from the rest.
function buildReasoning(action: Action): DecisionReasonLine[] {
  const lines: DecisionReasonLine[] = [];

  // The headline already carries the first sentence when there's no campaign
  // name; only surface it here when the headline is the campaign name instead.
  if (action.campaignName) {
    const found = firstLine(action.reasoning);
    if (found) lines.push({ tick: "ok", text: found });
  }

  // who it's for / what it scanned
  const audience = action.targetSegment?.count;
  if (audience && audience > 0) {
    lines.push({
      tick: "ok",
      text: (
        <>
          for <b>{audience.toLocaleString("en-IN")}</b> customers
          {action.archetype ? <> · {action.archetype}</> : null}
        </>
      ),
    });
  }

  // any deeper reasoning it drafted (the sentences after the first)
  const rest = restLines(action.reasoning);
  if (rest) lines.push({ tick: "ok", text: rest });

  // what it drafted / staged
  if (action.campaignName) {
    lines.push({
      tick: "ok",
      text: (
        <>
          drafted <b>{action.campaignName}</b>, ready for your okay
        </>
      ),
    });
  }

  // confidence + timing as a single mono data line
  const conf = confidenceLabel(action.confidenceScore);
  const exp = expiresIn(action.expiresAt);
  lines.push({
    tick: "hold",
    text: (
      <>
        {conf}
        {exp ? <> · {exp}</> : null}
      </>
    ),
  });

  return lines;
}

// ---------------------------------------------------------------------------
// Decision Queue — allo's queue of decisions, in the operator console.
// ---------------------------------------------------------------------------

export default function ActionsPage() {
  const { toast } = useToast();
  const { data: stores } = trpc.stores.list.useQuery();
  const storeId = stores?.[0]?.id ?? "";

  const { data, isLoading } = (trpc as any).autonomy.listActions.useQuery(
    { storeId, status: "pending", limit: 50 },
    { enabled: !!storeId, refetchInterval: 15000 },
  ) as { data: { actions: Action[]; total: number } | undefined; isLoading: boolean };

  const utils = trpc.useUtils();
  const invalidate = () =>
    (utils as any).autonomy.listActions.invalidate({ storeId });

  const approveMut = (trpc as any).autonomy.approveAction.useMutation({
    onSuccess: (result: { executedType?: string }) => {
      const msg =
        result.executedType === "campaign"
          ? "Done — your campaign's ready in Campaigns."
          : result.executedType === "automation"
          ? "Done — that automation is live."
          : "Approved — allo's on it.";
      toast(msg, "success");
      invalidate();
    },
    onError: (err: { message?: string }) =>
      toast(err.message || "That didn't go through. Give it another try.", "error"),
  }) as { mutate: (input: Record<string, unknown>) => void; isPending: boolean };

  const rejectMut = (trpc as any).autonomy.rejectAction.useMutation({
    onSuccess: () => {
      toast("Passed on it.", "success");
      invalidate();
    },
    onError: (err: { message?: string }) =>
      toast(err.message || "That didn't go through. Give it another try.", "error"),
  }) as { mutate: (input: Record<string, unknown>) => void; isPending: boolean };

  const bulkApproveMut = (trpc as any).autonomy.bulkApprove.useMutation({
    onSuccess: (result: { approved: number }) => {
      toast(`${result.approved} approved and live.`, "success");
      invalidate();
    },
    onError: (err: { message?: string }) =>
      toast(err.message || "That didn't go through. Give it another try.", "error"),
  }) as { mutate: (input: Record<string, unknown>) => void; isPending: boolean };

  const bulkRejectMut = (trpc as any).autonomy.bulkReject.useMutation({
    onSuccess: (result: { rejected: number }) => {
      toast(`${result.rejected} cleared.`, "success");
      invalidate();
    },
    onError: (err: { message?: string }) =>
      toast(err.message || "That didn't go through. Give it another try.", "error"),
  }) as { mutate: (input: Record<string, unknown>) => void; isPending: boolean };

  const pending = (data?.actions ?? []).filter((a) => a.status === "pending");
  const busy = approveMut.isPending || rejectMut.isPending;
  const bulkBusy = bulkApproveMut.isPending || bulkRejectMut.isPending;

  // Status line — total est. ₹ impact across the queue.
  const totalImpact = pending.reduce(
    (sum, a) => sum + (a.estimatedRevenue ?? 0),
    0,
  );

  const handleBulkApprove = () =>
    bulkApproveMut.mutate({ actionIds: pending.map((a) => a.id) });
  const handleBulkReject = () =>
    bulkRejectMut.mutate({
      actionIds: pending.map((a) => a.id),
      reason: "Cleared by operator",
    });

  return (
    <div className="space-y-6 w-full max-w-4xl mx-auto">
      {/* Heading — serif prose, no motion */}
      <div>
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-foreground font-serif">
          Decision queue
        </h1>
        <p className="text-[13.5px] text-muted-foreground mt-1 font-sans leading-relaxed">
          What allo wants to do next — its thinking laid out, yours to approve or
          pass.
        </p>
      </div>

      {/* Console frame — status line + queue summary */}
      <ConsoleFrame title="allo — decisions">
        {/* Status line — mono readouts. The frame's status bar already carries
            the live lamp, so we don't repeat a second pulsing dot here. */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pb-4 mb-4 border-b border-border">
          <MetricReadout label="decisions waiting" value={pending.length} />
          {totalImpact > 0 && (
            <MetricReadout label="est. impact" value={totalImpact} money />
          )}
        </div>

        {/* Operator summary stream — the readouts above hold the numbers, so
            this carries what allo did and how to act, not a restated count. */}
        <StreamOutput aria-label="what's in the queue">
          {isLoading ? (
            <StreamRow tick="step">reading the queue…</StreamRow>
          ) : pending.length > 0 ? (
            <>
              <StreamRow tick="ok">
                allo thought these through and held the rest back
              </StreamRow>
              <StreamRow tick="step">
                approve to put one live, pass to let it go ·{" "}
                <span className="text-[hsl(var(--accent))]">ready</span>
              </StreamRow>
            </>
          ) : (
            <StreamRow tick="hold">the queue is clear</StreamRow>
          )}
        </StreamOutput>

        {/* Operator action — approve / clear all, in mono */}
        {pending.length > 1 && (
          <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border">
            <button
              type="button"
              onClick={handleBulkApprove}
              disabled={bulkBusy}
              className="font-mono text-[12px] rounded-lg px-3 py-1.5 bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))] hover:opacity-90 transition-colors disabled:opacity-50"
            >
              approve all ({pending.length})
            </button>
            <button
              type="button"
              onClick={handleBulkReject}
              disabled={bulkBusy}
              className="font-mono text-[12px] rounded-lg px-3 py-1.5 border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
            >
              pass on all
            </button>
          </div>
        )}
      </ConsoleFrame>

      {/* The decisions — the primary task; the frame above is just the lay of
          the land. A quiet mono label marks where acting begins. */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : pending.length > 0 ? (
        <div className="space-y-3">
          <p className="font-mono text-[11px] text-muted-foreground tracking-tight px-0.5">
            {pending.length === 1
              ? "one decision, yours to make"
              : `${pending.length} decisions, top of the queue first`}
          </p>
          {pending.map((action) => (
            <DecisionCard
              key={action.id}
              tags={actionToTags(action)}
              impact={action.estimatedRevenue ?? null}
              prediction={action.prediction ?? null}
              decision={decisionLine(action)}
              reasoning={buildReasoning(action)}
              busy={busy}
              onApprove={() => approveMut.mutate({ actionId: action.id })}
              onPass={() =>
                rejectMut.mutate({
                  actionId: action.id,
                  reason: "Passed from decision queue",
                })
              }
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="font-sans text-[14px] text-foreground">
            Nothing waiting on you.
          </p>
          <p className="font-sans text-[13px] text-muted-foreground mt-1 leading-relaxed">
            Drafts before sunrise, approvals over coffee — allo will have the
            next decision ready when it&apos;s worth your okay.
          </p>
        </div>
      )}
    </div>
  );
}
