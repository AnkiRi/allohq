"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  Loader2,
  Sparkles,
  Zap,
  Brain,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";

// ---------------------------------------------------------------------------
// Friendly step labels for the activation log
// ---------------------------------------------------------------------------

const STEP_DISPLAY: Record<string, { icon: typeof Sparkles; label: string }> = {
  create_automations: { icon: Zap, label: "Setting up automations to match your preferences" },
  scan_opportunities: { icon: Brain, label: "Looking for campaign opportunities" },
  generate_briefing: { icon: Sparkles, label: "Writing your first daily briefing" },
  finalize: { icon: Check, label: "Putting the finishing touches on everything" },
};

// ---------------------------------------------------------------------------
// ActivationProgress
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

  // Auto-dismiss 60s after activation completes
  useEffect(() => {
    if (activation?.completedAt && !activation?.isActivating) {
      const timer = setTimeout(() => {
        setDismissed(true);
        onDismiss?.();
      }, 60_000);
      return () => clearTimeout(timer);
    }
  }, [activation?.completedAt, activation?.isActivating, onDismiss]);

  if (!activation) return null;
  if (dismissed) return null;

  // Only show if activating or recently activated (within 30min)
  if (!activation.isActivating && !activation.isRecentlyActivated) return null;

  const steps = activation.steps as Array<{
    key: string;
    label: string;
    status: string;
    detail?: string;
  }>;
  const allDone = steps.length > 0 && steps.every((s) => s.status === "done");
  const ctx = activation.context ?? {};
  const segments = ctx.segments ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.4 }}
      className="glass-card-static rounded-xl border-l-[3px] border-l-[#1F7A4F] p-6 mb-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#1F7A4F]/10 flex items-center justify-center">
            <Sparkles className={`w-4 h-4 text-[#1F7A4F] ${!allDone ? "animate-pulse" : ""}`} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-[#2C2C2C]">
              {allDone ? "allo is ready and working for you" : "allo is getting everything set up..."}
            </h2>
            {!allDone && (
              <p className="text-[11px] text-[#8B8074] mt-0.5">This only takes about 30 seconds</p>
            )}
          </div>
        </div>
        {allDone && onDismiss && (
          <button
            onClick={() => { setDismissed(true); onDismiss(); }}
            className="text-[11px] font-sans text-[#8B8074] hover:text-[#2C2C2C] transition-colors"
          >
            Dismiss
          </button>
        )}
      </div>

      {/* Steps */}
      <div className="space-y-2">
        <AnimatePresence mode="popLayout">
          {steps.map((step, i) => {
            const display = STEP_DISPLAY[step.key];
            const label = display?.label ?? step.label;

            return (
              <motion.div
                key={step.key}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1, duration: 0.3 }}
                className="flex items-start gap-3 py-1"
              >
                {step.status === "done" ? (
                  <div className="w-5 h-5 rounded-full bg-[#1F7A4F]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check className="w-3 h-3 text-[#1F7A4F]" />
                  </div>
                ) : step.status === "running" ? (
                  <Loader2 className="w-5 h-5 animate-spin text-[#B89466] flex-shrink-0 mt-0.5" />
                ) : step.status === "error" ? (
                  <AlertCircle className="w-5 h-5 text-[#1F7A4F] flex-shrink-0 mt-0.5" />
                ) : (
                  <div className="w-5 h-5 rounded-full border border-[#EDE7DB] flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <span className={`text-[13px] font-sans ${step.status === "done" ? "text-[#2C2C2C]" : step.status === "running" ? "text-[#B89466]" : "text-[#8B8074]"}`}>
                    {label}
                  </span>
                  {step.status === "done" && step.detail && (
                    <p className="text-[11px] text-[#8B8074] mt-0.5">{step.detail}</p>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Summary when done */}
      {allDone && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-4 pt-4 border-t border-black/[0.06]"
        >
          {/* Segment summary */}
          {segments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {segments.map((seg: any) => (
                <span key={seg.name} className="text-[11px] font-sans px-2 py-0.5 rounded-full bg-black/[0.04] text-[#5C5549]">
                  {seg.name}: {seg.count}
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-[12px] font-sans text-[#8B8074]">
              {ctx.automationCount > 0 && (
                <span>{ctx.automationCount} automations created</span>
              )}
              {ctx.customerCount > 0 && (
                <span>{ctx.customerCount} customers segmented</span>
              )}
            </div>
            {ctx.pendingActions > 0 && (
              <Link
                href="/actions"
                className="flex items-center gap-1 text-[12px] font-sans text-[#1F7A4F] hover:text-[#1F7A4F]/80 transition-colors"
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
