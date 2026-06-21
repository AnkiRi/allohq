// ---------------------------------------------------------------------------
// predictConsequence — Track C: allo COMMITS to a predicted outcome before it
// acts. Every decision carries an expected upside, a NAMED downside/risk, and a
// confidence. The gap between this prediction and the real control-measured
// outcome (Track B) is what trains better predictions over time.
//
// C3 — ARCHITECTURE NOTE (generalizable, not brand-hardcoded):
//   The inputs to predictConsequence are GENERALIZABLE FEATURES — cohort size,
//   channel, segment/category, typical per-customer response rates, the action's
//   own revenue estimate and confidence, and (when available) a calibration
//   factor derived from real predicted-vs-actual history. None of this is keyed
//   to a specific brand or store. That is deliberate: the same feature vector
//   could later feed a model TRAINED on predicted-vs-actual rows ACROSS brands,
//   so a brand-new store with no control data of its own inherits priors from
//   the population. We are NOT building that cross-brand model here — we only
//   keep the seam open by (a) taking features not identities, and (b) accepting
//   an optional `calibration` the caller computes from real outcomes. Swapping
//   the typical-rate constants for learned coefficients is then a local change.
// ---------------------------------------------------------------------------

export type Confidence = "low" | "medium" | "high";

/** GENERALIZABLE feature inputs — no brand/store identity, only behaviour. */
export interface PredictionInput {
  /** How many customers this action would touch (cohort size). */
  cohortSize: number;
  /** The action's own ₹ revenue estimate (already derived upstream). */
  estimatedRevenue: number;
  /** The action's confidence (0–100). */
  confidenceScore: number;
  /** Channel — drives the typical annoyance/unsubscribe baseline. */
  channel?: string | null;
  /** Coarse action family — win-back / welcome / vip / fatigue / timing / etc. */
  category?: string | null;
  /**
   * Optional calibration from REAL predicted-vs-actual history (Track B).
   * When present and trustworthy, predictions are scaled by `accuracyRatio`
   * (actual/predicted) and the basis flips from "estimate" to "calibrated".
   */
  calibration?: {
    /** actual ÷ predicted over the window (e.g. 0.88 = we over-forecast by 12%). */
    accuracyRatio: number;
    /** measured incremental lift % vs control (e.g. 26.6). */
    liftPct: number;
    /** how many real outcomes back this — gates whether we trust it. */
    sampleSize: number;
  } | null;
}

export interface Prediction {
  /** Expected incremental ₹ recovery (calibration-adjusted when available). */
  upsideRevenue: number;
  /** Expected % incremental lift vs a held-out control. */
  liftPct: number;
  /** NAMED downside — % of the cohort likely to unsubscribe / be annoyed. */
  downsideRiskPct: number;
  /** low / medium / high. */
  confidence: Confidence;
  /**
   * "estimate"  — cohort-size + typical-rate based, NOT yet control-backed.
   * "calibrated"— scaled by real predicted-vs-actual history (Track B).
   * HONESTY: must be surfaced verbatim in the UI. Most read "estimate".
   */
  basis: "estimate" | "calibrated";
}

// --- Typical population rates (the "estimate" priors) -----------------------
// These are population-level defaults, NOT per-brand. In a trained world these
// become learned coefficients; today they are honest, conservative constants.

/** Baseline incremental lift vs control we expect before any calibration. */
const TYPICAL_LIFT_PCT = 22; // ~mid of observed retention lift bands

/** Per-channel typical annoyance/unsubscribe rate (% of cohort). */
const CHANNEL_RISK_PCT: Record<string, number> = {
  email: 0.35,
  sms: 0.9,
  whatsapp: 0.6,
  push: 0.5,
};
const DEFAULT_CHANNEL_RISK_PCT = 0.5;

/** Categories that inherently carry more annoyance risk (re-contact pressure). */
const CATEGORY_RISK_MULTIPLIER: Array<{ test: RegExp; mult: number }> = [
  { test: /win.?back|lapsed|hibernat|lost|churn|recover|reorder|repurchase/, mult: 1.3 },
  { test: /fatigue|suppress|hold|cap|frequen/, mult: 0.3 }, // holding back LOWERS risk
  { test: /welcome|onboard|first|new/, mult: 0.7 },
  { test: /vip|champion|loyal|reward|best/, mult: 0.6 },
];

function categoryRiskMultiplier(category?: string | null): number {
  const hay = (category ?? "").toLowerCase();
  for (const { test, mult } of CATEGORY_RISK_MULTIPLIER) {
    if (test.test(hay)) return mult;
  }
  return 1;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Confidence bucketing from the action's own score, lifted when calibrated. */
function deriveConfidence(
  confidenceScore: number,
  cohortSize: number,
  calibrated: boolean,
): Confidence {
  let score = confidenceScore;
  // Real outcome backing earns a confidence bump; a tiny cohort is noisy, so it
  // pulls confidence back down regardless of the action's self-reported score.
  if (calibrated) score += 12;
  if (cohortSize < 25) score -= 15;
  if (score >= 75) return "high";
  if (score >= 45) return "medium";
  return "low";
}

/**
 * Commit to a predicted consequence for an action, from generalizable features.
 * Pure + deterministic so it is trivially testable and (later) trainable.
 */
export function predictConsequence(input: PredictionInput): Prediction {
  const {
    cohortSize,
    estimatedRevenue,
    confidenceScore,
    channel,
    category,
    calibration,
  } = input;

  // Calibration is only trusted with enough real outcomes behind it.
  const MIN_CALIBRATION_SAMPLE = 30;
  const calibrated =
    !!calibration &&
    calibration.sampleSize >= MIN_CALIBRATION_SAMPLE &&
    Number.isFinite(calibration.accuracyRatio) &&
    calibration.accuracyRatio > 0;

  // --- Upside ₹ ----------------------------------------------------------
  // Start from the action's own estimate; when calibrated, correct it by the
  // measured actual/predicted ratio so the committed number reflects reality.
  const ratio = calibrated ? clamp(calibration!.accuracyRatio, 0.3, 2) : 1;
  const upsideRevenue = Math.round(Math.max(0, estimatedRevenue) * ratio);

  // --- Lift % vs control -------------------------------------------------
  // Calibrated: the real measured lift. Estimate: the typical-rate prior,
  // nudged by the action's confidence (more confident → nearer the top band).
  const liftPct = calibrated
    ? Math.round(clamp(calibration!.liftPct, 0, 100))
    : Math.round(
        clamp(TYPICAL_LIFT_PCT * (0.6 + (confidenceScore / 100) * 0.6), 4, 45),
      );

  // --- Downside / named risk --------------------------------------------
  // Channel baseline × category pressure. Never zero — naming a real risk is
  // what makes this judgment, not hype. Slightly higher when we're less sure.
  const channelKey = (channel ?? "email").toLowerCase();
  const base = CHANNEL_RISK_PCT[channelKey] ?? DEFAULT_CHANNEL_RISK_PCT;
  const uncertaintyBump = confidenceScore < 50 ? 1.25 : 1;
  const downsideRiskPct =
    Math.round(
      clamp(base * categoryRiskMultiplier(category) * uncertaintyBump, 0.1, 5) * 10,
    ) / 10;

  const confidence = deriveConfidence(confidenceScore, cohortSize, calibrated);

  return {
    upsideRevenue,
    liftPct,
    downsideRiskPct,
    confidence,
    basis: calibrated ? "calibrated" : "estimate",
  };
}
