"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  Loader2,
  ChevronUp,
  ChevronDown,
  Sparkles,
  AlertCircle,
  X,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

// ---------------------------------------------------------------------------
// Status icon helper
// ---------------------------------------------------------------------------

function StatusIcon({ status }: { status: string }) {
  if (status === "done" || status === "active" || status === "ready") {
    return (
      <div className="w-4 h-4 rounded-full bg-[#1F7A4F]/15 flex items-center justify-center flex-shrink-0">
        <Check className="w-2.5 h-2.5 text-[#1F7A4F]" />
      </div>
    );
  }
  if (status === "running" || status === "generating") {
    return <Loader2 className="w-4 h-4 animate-spin text-[#B89466] flex-shrink-0" />;
  }
  if (status === "error") {
    return <AlertCircle className="w-4 h-4 text-[#1F7A4F] flex-shrink-0" />;
  }
  // pending / draft
  return <div className="w-4 h-4 rounded-full border border-[#EDE7DB] flex-shrink-0" />;
}

// ---------------------------------------------------------------------------
// AgentActivityPanel — persistent floating panel (bottom-right)
// ---------------------------------------------------------------------------

export function AgentActivityPanel({ storeId }: { storeId: string | null }) {
  const [expanded, setExpanded] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  const { data: activation } = (trpc.stores.activationStatus as any).useQuery(
    { storeId: storeId ?? "" },
    {
      enabled: !!storeId && !dismissed,
      refetchInterval: (query: any) => {
        const d = query?.state?.data;
        if (!d) return 3000;
        if (d.isActivating) return 2000;
        if (d.overallProgress < 100) return 3000;
        if (d.isRecentlyActivated) return 10000;
        return false;
      },
    },
  ) as { data: any | undefined };

  // Auto-dismiss 2 minutes after everything is complete
  useEffect(() => {
    if (activation?.overallProgress >= 100 && !activation?.isActivating) {
      const timer = setTimeout(() => setDismissed(true), 120_000);
      return () => clearTimeout(timer);
    }
  }, [activation?.overallProgress, activation?.isActivating]);

  // Don't render if no store, dismissed, or nothing happening
  if (!storeId || dismissed) return null;
  if (!activation) return null;
  if (!activation.isActivating && !activation.isRecentlyActivated && activation.overallProgress >= 100) return null;

  const progress = activation.overallProgress ?? 0;
  const steps = (activation.steps ?? []) as Array<{
    key: string;
    label: string;
    status: string;
    detail?: string;
  }>;
  const automationItems = (activation.automationProgress?.items ?? []) as Array<{
    id: string;
    name: string;
    status: string;
    category: string;
  }>;
  const isComplete = progress >= 100;
  const generating = activation.automationProgress?.generating ?? 0;
  const total = activation.automationProgress?.total ?? 0;

  // Current activity label
  const currentStep = steps.find((s) => s.status === "running");
  const currentActivity = currentStep
    ? currentStep.label
    : generating > 0
      ? `Writing content for ${generating} automation${generating > 1 ? "s" : ""}`
      : isComplete
        ? "All done"
        : "Working on it...";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ duration: 0.3 }}
        className="fixed bottom-4 right-4 z-50 w-[340px] shadow-lg rounded-xl border border-black/[0.08] bg-white/95 backdrop-blur-md overflow-hidden"
      >
        {/* Header — always visible */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setExpanded(!expanded)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setExpanded(!expanded); }}
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-black/[0.02] transition-colors cursor-pointer"
        >
          {/* Activity indicator */}
          <div className="relative flex-shrink-0">
            {isComplete ? (
              <div className="w-8 h-8 rounded-lg bg-[#1F7A4F]/10 flex items-center justify-center">
                <Check className="w-4 h-4 text-[#1F7A4F]" />
              </div>
            ) : (
              <div className="w-8 h-8 rounded-lg bg-[#B89466]/10 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-[#B89466] animate-pulse" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 text-left">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-semibold text-[#2C2C2C] truncate">
                {isComplete ? "joon is ready" : "joon is working..."}
              </span>
              <span className="text-[11px] font-mono text-[#8B8074]">{progress}%</span>
            </div>
            {!expanded && (
              <p className="text-[11px] text-[#8B8074] truncate">{currentActivity}</p>
            )}
          </div>

          {/* Progress ring */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {isComplete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDismissed(true);
                }}
                className="p-1 hover:bg-black/[0.05] rounded transition-colors"
              >
                <X className="w-3.5 h-3.5 text-[#8B8074]" />
              </button>
            )}
            {expanded ? (
              <ChevronDown className="w-4 h-4 text-[#8B8074]" />
            ) : (
              <ChevronUp className="w-4 h-4 text-[#8B8074]" />
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-[2px] bg-black/[0.04]">
          <motion.div
            className={`h-full ${isComplete ? "bg-[#1F7A4F]" : "bg-[#B89466]"}`}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>

        {/* Expanded content */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-4 py-3 space-y-3 max-h-[320px] overflow-y-auto">
                {/* Activation steps */}
                {steps.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-sans uppercase tracking-wider text-[#8B8074]">
                      Setup
                    </span>
                    {steps.map((step) => (
                      <div key={step.key} className="flex items-center gap-2 py-0.5">
                        <StatusIcon status={step.status} />
                        <span
                          className={`text-[12px] font-sans truncate ${
                            step.status === "done"
                              ? "text-[#5C5549]"
                              : step.status === "running"
                                ? "text-[#B89466]"
                                : "text-[#8B8074]"
                          }`}
                        >
                          {step.label}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Automation generation */}
                {automationItems.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-sans uppercase tracking-wider text-[#8B8074]">
                        Automations
                      </span>
                      <span className="text-[10px] font-mono text-[#8B8074]">
                        {total - generating}/{total}
                      </span>
                    </div>
                    {automationItems.map((item) => (
                      <div key={item.id} className="flex items-center gap-2 py-0.5">
                        <StatusIcon status={item.status} />
                        <span
                          className={`text-[12px] font-sans truncate ${
                            item.status === "active" || item.status === "ready"
                              ? "text-[#5C5549]"
                              : item.status === "generating"
                                ? "text-[#B89466]"
                                : "text-[#8B8074]"
                          }`}
                        >
                          {item.name.replace(" Automation", "")}
                        </span>
                        <span
                          className={`text-[10px] font-sans ml-auto flex-shrink-0 ${
                            item.status === "active"
                              ? "text-[#1F7A4F]"
                              : item.status === "generating"
                                ? "text-[#B89466]"
                                : "text-[#8B8074]"
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Summary when done */}
                {isComplete && (
                  <div className="pt-2 border-t border-black/[0.06]">
                    <p className="text-[11px] text-[#8B8074]">
                      {total} automations ready to go
                      {activation.context?.pendingActions > 0 && (
                        <span className="text-[#1F7A4F]">
                          {" "}&middot; {activation.context.pendingActions} waiting for your okay
                        </span>
                      )}
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}
