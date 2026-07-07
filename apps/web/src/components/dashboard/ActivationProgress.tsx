"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, Loader2, ChevronRight } from "lucide-react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { StreamOutput, StreamRow } from "@/components/console";
import { useActivationChecklist, type ChecklistStep } from "./useActivationChecklist";

// ---------------------------------------------------------------------------
// ActivationProgress — post-onboarding setup feed.
//
// Progression is driven by a capped client timer (`useActivationChecklist`) so
// it ALWAYS advances and finishes inside ~40s, never showing "0 of 0 done" and
// never looping the same phrase. Real backend status only pulls completion
// forward. Terminal/emerald console aesthetic, reduced-motion safe.
// ---------------------------------------------------------------------------

export function ActivationProgress({
  storeId,
  onDismiss,
}: {
  storeId: string;
  onDismiss?: () => void;
}) {
  const { data: activation } = (trpc.stores.activationStatus as any).useQuery(
    { storeId },
    {
      enabled: !!storeId,
      refetchInterval: (query: any) => {
        const d = query?.state?.data;
        if (d?.isActivating) return 2000;
        if (d?.isRecentlyActivated) return 5000;
        return false;
      },
    },
  ) as { data: any | undefined };

  const [dismissed, setDismissed] = useState(false);

  const ctx = activation?.context ?? {};
  const segments = ctx.segments ?? [];

  // Real backend details, blended into the client checklist where we have them.
  const details: Partial<Record<string, string>> = {};
  if (ctx.customerCount > 0) details.scan = `${ctx.customerCount.toLocaleString("en-IN")} scanned`;
  if (segments.length > 0) details.rfm = `${segments.length} segments`;
  if (ctx.automationCount > 0) details.winback = `${ctx.automationCount} automations drafted`;

  // Backend done? Pull the feed forward. Otherwise the client timer paces it.
  const backendComplete = !!(
    activation &&
    !activation.isActivating &&
    (activation.steps?.length
      ? activation.steps.every((s: any) => s.status === "done")
      : false)
  );

  const checklist = useActivationChecklist({ backendComplete, details });
  const { steps, doneCount, total, progress, complete } = checklist;

  // Auto-dismiss 60s after the feed completes.
  useEffect(() => {
    if (!complete) return;
    const timer = setTimeout(() => {
      setDismissed(true);
      onDismiss?.();
    }, 60_000);
    return () => clearTimeout(timer);
  }, [complete, onDismiss]);

  if (!activation) return null;
  if (dismissed) return null;
  // Only show while activating or recently activated (within the backend window).
  if (!activation.isActivating && !activation.isRecentlyActivated && !complete) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.4 }}
      className="rounded-xl border border-border bg-card p-5 mb-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-[hsl(var(--accent-bg))] flex items-center justify-center shrink-0">
            {complete ? (
              <Check className="w-4 h-4 text-[hsl(var(--accent))]" />
            ) : (
              <Loader2 className="w-4 h-4 text-[hsl(var(--accent))] animate-spin" />
            )}
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-serif font-semibold text-foreground">
              {complete ? "All set. Here's what joon found" : "joon is setting things up"}
            </h2>
            <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground mt-0.5">
              <span>{doneCount} of {total} done</span>
              {!complete && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <span>about {Math.max(5, Math.ceil((total - doneCount) * 4))}s left</span>
                </>
              )}
            </div>
          </div>
        </div>
        {complete && onDismiss && (
          <button
            onClick={() => { setDismissed(true); onDismiss(); }}
            className="text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            dismiss
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-muted rounded-full overflow-hidden mb-4">
        <motion.div
          className="h-full bg-[hsl(var(--accent))] rounded-full"
          initial={false}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>

      {/* Checklist — terminal stream */}
      <StreamOutput aria-label="setup progress" className="space-y-1.5">
        {steps.map((step) => (
          <ChecklistRow key={step.key} step={step} />
        ))}
      </StreamOutput>

      {/* Summary when done */}
      {complete && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-4 pt-4 border-t border-border"
        >
          {segments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {segments.map((seg: any) => (
                <span
                  key={seg.name}
                  className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                >
                  {seg.name}: {seg.count}
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-[12px] font-mono text-muted-foreground">
              {ctx.automationCount > 0 && (
                <span>{ctx.automationCount} automations created</span>
              )}
              {ctx.customerCount > 0 && (
                <span>{ctx.customerCount.toLocaleString("en-IN")} customers segmented</span>
              )}
            </div>
            {ctx.pendingActions > 0 && (
              <Link
                href="/actions"
                className="flex items-center gap-1 text-[12px] font-sans text-[hsl(var(--accent))] hover:opacity-80 transition-opacity"
              >
                {ctx.pendingActions} actions need your approval
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------

function ChecklistRow({ step }: { step: ChecklistStep }) {
  const tick = step.status === "done" ? "ok" : step.status === "generating" ? "step" : "hold";
  return (
    <StreamRow tick={tick}>
      <span className="inline-flex items-center gap-2 flex-wrap">
        <span
          className={
            step.status === "done"
              ? "text-foreground"
              : step.status === "generating"
                ? "text-[hsl(var(--accent))]"
                : "text-muted-foreground"
          }
        >
          {step.label}
          {step.status === "generating" && <span className="animate-pulse">…</span>}
        </span>
        {step.status === "done" && step.detail && (
          <span className="text-[11px] text-muted-foreground/70">· {step.detail}</span>
        )}
      </span>
    </StreamRow>
  );
}
