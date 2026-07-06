// Statistical confidence on measured lift. The lift is a difference of two per-customer means
// (treatment − control); this adds a confidence interval, a significance test, and an
// underpowered flag so we never report noise as a confident number ("bill on PROVEN lift"),
// and so the CAM can WEIGHT each experiment's trace by how trustworthy its lift is (a lift on
// 5,000 customers should outweigh one on 60). Classical stats, no LLM. Lives beside
// experiments.ts because it operates on experiment (control-group) outcomes.

export interface GroupStat {
  n: number; // observed customers in the arm
  mean: number; // per-customer outcome (₹)
  variance: number; // sample variance of the per-customer outcome
}

export interface LiftStats {
  lift: number; // treatment.mean − control.mean
  stdErr: number; // Welch standard error of the difference
  ciLow: number; // 95% CI lower bound
  ciHigh: number; // 95% CI upper bound
  z: number; // lift / stdErr
  pValue: number; // two-sided
  significant: boolean; // CI excludes 0 AND both arms powered
  underpowered: boolean; // either arm below the minimum observed count
  confidence: number; // 0–1 weight for CAM trace weighting (0 when underpowered)
}

// Standard normal CDF via the Abramowitz-Stegun erf approximation (max error ~1.5e-7).
function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp(-(x * x) / 2);
  const p =
    d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

/**
 * Sample variance from SQL aggregates: (Σx² − n·mean²) / (n − 1).
 * Returns 0 when n < 2 (undefined variance).
 */
export function varianceFromAggregates(sumSquares: number, n: number, mean: number): number {
  if (n < 2) return 0;
  return Math.max(0, (sumSquares - n * mean * mean) / (n - 1));
}

export function computeLiftStats(
  treatment: GroupStat,
  control: GroupStat,
  minObservedPerArm = 30,
): LiftStats {
  const lift = treatment.mean - control.mean;
  const stdErr = Math.sqrt(
    treatment.variance / Math.max(treatment.n, 1) + control.variance / Math.max(control.n, 1),
  );
  const z = stdErr > 0 ? lift / stdErr : 0;
  const pValue = stdErr > 0 ? 2 * (1 - normalCdf(Math.abs(z))) : 1;
  const ciLow = lift - 1.96 * stdErr;
  const ciHigh = lift + 1.96 * stdErr;

  const underpowered = treatment.n < minObservedPerArm || control.n < minObservedPerArm;
  // Significant = the 95% CI does not straddle zero, and we have enough samples to trust it.
  const significant = !underpowered && stdErr > 0 && (ciLow > 0 || ciHigh < 0);
  // Confidence for CAM weighting: (1 − p), zeroed out when underpowered so noisy small
  // experiments don't pull the model around.
  const confidence = underpowered ? 0 : Math.max(0, Math.min(1, 1 - pValue));

  return { lift, stdErr, ciLow, ciHigh, z, pValue, significant, underpowered, confidence };
}
