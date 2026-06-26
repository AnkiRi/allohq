"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

// ---------------------------------------------------------------------------
// useActivationChecklist — client-driven, capped, always-finishing setup feed.
//
// The backend `activationStatus` query can be slow or loop indefinitely. So the
// perceived progress is driven entirely on a short client timer that ALWAYS
// advances pending → generating → done and lands on a completion state inside a
// believable window (~30–45s). Real backend status is blended in only to *pull
// forward* completion (never to stall it). Under prefers-reduced-motion the
// steps still resolve to done — just instantly, with no intermediate
// "generating" animation beat.
// ---------------------------------------------------------------------------

export type ChecklistStatus = "pending" | "generating" | "done";

export interface ChecklistStep {
  key: string;
  /** Operator-voice label, e.g. "Score RFM segments". */
  label: string;
  status: ChecklistStatus;
  /** Short mono detail shown once done, e.g. "1,284 scanned". */
  detail?: string;
}

interface StepSpec {
  key: string;
  label: string;
  /** ms this step spends in `generating` before resolving to `done`. */
  duration: number;
}

// Varied, real-sounding setup steps. Total generating time ≈ 33s; with the
// 0.9s gap between steps the whole feed lands around ~40s, then completes.
const STEP_SPECS: StepSpec[] = [
  { key: "classify", label: "Classify store category", duration: 2600 },
  { key: "scan", label: "Scan customers", duration: 3400 },
  { key: "rfm", label: "Score RFM segments", duration: 3600 },
  { key: "voice", label: "Analyze brand voice", duration: 3000 },
  { key: "winback", label: "Draft Win-Back automation", duration: 3400 },
  { key: "cart", label: "Set up Cart Recovery", duration: 3200 },
  { key: "postpurchase", label: "Set up Post-Purchase", duration: 3000 },
  { key: "briefing", label: "Generate first briefing", duration: 3200 },
  { key: "baseline", label: "Capture revenue baseline", duration: 2600 },
  { key: "recommend", label: "Prepare recommendations", duration: 3200 },
];

/** Gap between one step finishing and the next starting. */
const STEP_GAP = 700;
/** Hard ceiling on the whole animated sequence regardless of timers. */
const HARD_CAP_MS = 45_000;

export interface ActivationChecklistResult {
  steps: ChecklistStep[];
  doneCount: number;
  total: number;
  /** 0–100, derived from doneCount + partial credit for the running step. */
  progress: number;
  /** True once every step is done. */
  complete: boolean;
  /** Index of the step currently generating, or -1 when none / complete. */
  activeIndex: number;
}

/**
 * Drives the capped checklist. Pass `backendComplete` (e.g. real activation
 * finished / overallProgress >= 100) to let a fast backend finish the feed
 * early — it can only ever speed completion up, never stall it.
 *
 * `details` optionally supplies real mono details per step key (counts, ₹),
 * shown once that step is done.
 */
export function useActivationChecklist(opts?: {
  backendComplete?: boolean;
  details?: Partial<Record<string, string>>;
}): ActivationChecklistResult {
  const reduce = useReducedMotion();
  const backendComplete = opts?.backendComplete ?? false;
  const details = opts?.details;

  // currentIndex = the step index currently in `generating`. When it reaches
  // STEP_SPECS.length the whole feed is complete.
  const [currentIndex, setCurrentIndex] = useState(0);
  const startRef = useRef<number>(Date.now());

  // Reduced motion: resolve everything immediately, no timers.
  useEffect(() => {
    if (reduce) {
      setCurrentIndex(STEP_SPECS.length);
    }
  }, [reduce]);

  // Backend says it's done → fast-forward to complete.
  useEffect(() => {
    if (backendComplete) setCurrentIndex(STEP_SPECS.length);
  }, [backendComplete]);

  // Advance one step at a time on a capped timer.
  useEffect(() => {
    if (reduce) return;
    if (currentIndex >= STEP_SPECS.length) return;

    // Hard cap: if we've blown past the ceiling, jump straight to complete.
    if (Date.now() - startRef.current > HARD_CAP_MS) {
      setCurrentIndex(STEP_SPECS.length);
      return;
    }

    const spec = STEP_SPECS[currentIndex]!;
    const t = setTimeout(
      () => setCurrentIndex((i) => i + 1),
      spec.duration + STEP_GAP,
    );
    return () => clearTimeout(t);
  }, [currentIndex, reduce]);

  return useMemo(() => {
    const steps: ChecklistStep[] = STEP_SPECS.map((spec, i) => {
      let status: ChecklistStatus;
      if (i < currentIndex) status = "done";
      else if (i === currentIndex) status = "generating";
      else status = "pending";
      return {
        key: spec.key,
        label: spec.label,
        status,
        detail: status === "done" ? details?.[spec.key] : undefined,
      };
    });

    const total = STEP_SPECS.length;
    const doneCount = Math.min(currentIndex, total);
    const complete = doneCount >= total;
    // Partial credit for the running step so the bar always moves.
    const partial = complete ? 0 : 0.45;
    const progress = Math.round(((doneCount + partial) / total) * 100);
    const activeIndex = complete ? -1 : currentIndex;

    return { steps, doneCount, total, progress, complete, activeIndex };
  }, [currentIndex, details]);
}
