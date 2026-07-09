"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Loader2, ChevronRight } from "lucide-react";
import {
  ConsoleFrame,
  StreamOutput,
  StreamRow,
} from "@/components/console";
import {
  useActivationChecklist,
  type ChecklistStep,
} from "@/components/dashboard/useActivationChecklist";

// ---------------------------------------------------------------------------
// Demo welcome — staged activation playthrough.
//
// Plays the SAME capped activation animation a real store sees after sync, but
// purely client-side: it drives `useActivationChecklist` directly with no
// Shopify sync and no tRPC connect/sync call (no real work, no token spend).
// Lands on "what joon found" using the seeded Vana Naturals figures, then
// routes to /dashboard. A sessionStorage marker makes it play once per session
// — re-entry goes straight to /dashboard.
// ---------------------------------------------------------------------------

const PLAYED_KEY = "allo_demo_welcome_played";

// Seeded Vana Naturals details, blended into the checklist where they fit.
// These match the demo workspace the API routes to; they only label completed
// steps and never drive any query.
const VANA_DETAILS: Partial<Record<string, string>> = {
  classify: "plant-based wellness",
  scan: "1,284 scanned",
  rfm: "6 segments",
  voice: "Vana Naturals voice",
  winback: "3 automations drafted",
};

const VANA_SEGMENTS = [
  { name: "Champions", count: 142 },
  { name: "Loyal", count: 318 },
  { name: "At Risk", count: 96 },
  { name: "Hibernating", count: 211 },
];

export default function DemoWelcomePage() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [redirecting, setRedirecting] = useState(false);

  // Play-once-per-session: if already played, skip straight to the dashboard.
  const [skip, setSkip] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(PLAYED_KEY) === "1") {
      setSkip(true);
      router.replace("/dashboard");
    }
  }, [router]);

  const { steps, doneCount, total, progress, complete } = useActivationChecklist({
    details: VANA_DETAILS,
  });

  // On completion, mark played and hand off to the dashboard after a short beat
  // so the operator reads "what joon found" before the transition.
  useEffect(() => {
    if (!complete || skip) return;
    if (typeof window !== "undefined") {
      sessionStorage.setItem(PLAYED_KEY, "1");
    }
    const t = setTimeout(() => {
      setRedirecting(true);
      router.replace("/dashboard");
    }, reduce ? 600 : 2600);
    return () => clearTimeout(t);
  }, [complete, skip, reduce, router]);

  if (skip) return null;

  return (
    <div className="w-full max-w-2xl mx-auto">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="mb-6">
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-foreground font-serif">
            {complete ? "Meet Vana Naturals" : "Setting up your demo store"}
          </h1>
          <p className="text-[13.5px] text-muted-foreground mt-1 font-sans leading-relaxed">
            {complete
              ? "This is joon running a real D2C brand's retention. Have a look around, nothing here touches a live store."
              : "Watching joon do exactly what it does on day one: read the brand, group the customers, draft the work."}
          </p>
        </div>

        <ConsoleFrame title="joon activating · Vana Naturals">
          {/* Header */}
          <div className="flex items-center gap-2.5 pb-4 mb-4 border-b border-border">
            <div className="w-8 h-8 rounded-lg bg-[hsl(var(--accent-bg))] flex items-center justify-center shrink-0">
              {complete ? (
                <Check className="w-4 h-4 text-[hsl(var(--accent))]" />
              ) : (
                <Loader2 className="w-4 h-4 text-[hsl(var(--accent))] animate-spin" />
              )}
            </div>
            <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
              <span>
                {doneCount} of {total} done
              </span>
              {!complete && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <span>
                    about {Math.max(5, Math.ceil((total - doneCount) * 4))}s left
                  </span>
                </>
              )}
            </div>
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

          {/* What joon found */}
          {complete && (
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mt-4 pt-4 border-t border-border"
            >
              <div className="flex flex-wrap gap-2 mb-3">
                {VANA_SEGMENTS.map((seg) => (
                  <span
                    key={seg.name}
                    className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                  >
                    {seg.name}: {seg.count}
                  </span>
                ))}
              </div>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className="text-[12px] font-mono text-muted-foreground">
                  1,284 customers segmented · 3 automations drafted
                </span>
                <button
                  onClick={() => {
                    setRedirecting(true);
                    router.replace("/dashboard");
                  }}
                  className="inline-flex items-center gap-1 text-[12px] font-sans text-[hsl(var(--accent))] hover:opacity-80 transition-opacity"
                >
                  {redirecting ? "Opening…" : "Open the console"}
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          )}
        </ConsoleFrame>
      </motion.div>
    </div>
  );
}

// Operator-voice checklist row, terminal stream styling (matches
// ActivationProgress' row).
function ChecklistRow({ step }: { step: ChecklistStep }) {
  const tick =
    step.status === "done" ? "ok" : step.status === "generating" ? "step" : "hold";
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
