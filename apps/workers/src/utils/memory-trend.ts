/**
 * The trend of one per-cycle memory series from the preparation soak.
 *
 * One post-GC number after one run says nothing about a leak: the heap is a
 * little bigger or smaller for many ordinary reasons (JIT code, caches filling,
 * the allocator keeping pages). A leak is memory that keeps growing, cycle
 * after cycle, after warm-up. So the series is judged in three parts:
 *
 *  - warm-up cycles are excluded: caches and compiled code fill there;
 *  - the slope is Theil–Sen (the median of all pairwise slopes), so one noisy
 *    cycle cannot manufacture or hide a trend;
 *  - "sustained" needs BOTH a material total rise across the steady state AND
 *    a slope that is still above threshold in its second half. Memory that
 *    rises and then levels off is reported as a plateau, not a leak;
 *  - "material" is measured against the series' own noise as well as the
 *    fixed threshold: resident memory can swing tens of megabytes between
 *    cycles, and a rise no bigger than that swing is not evidence of anything.
 */
export type TrendVerdict = "flat" | "grew then plateaued" | "sustained growth";

export interface TrendThresholds {
  /** Bytes per cycle. */
  slopePerCycle: number;
  /** Bytes, last steady quarter's median minus the first's. */
  rise: number;
}

export interface Trend {
  verdict: TrendVerdict;
  steadyCycles: number;
  slopePerCycle: number;
  lateSlopePerCycle: number;
  rise: number;
  firstQuarterMedian: number;
  lastQuarterMedian: number;
  /**
   * Typical cycle-to-cycle variation: the median absolute deviation of
   * consecutive differences, divided by √2. A steady trend or a single step
   * barely moves it, so it measures jitter rather than growth.
   */
  noise: number;
  /** The rise a verdict needed: the fixed threshold or four times the noise, whichever is larger. */
  materialRise: number;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) throw new Error("median of nothing");
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** Theil–Sen slope of `values` against their index. */
export function theilSenSlope(values: readonly number[]): number {
  const slopes: number[] = [];
  for (let i = 0; i < values.length; i += 1) {
    for (let j = i + 1; j < values.length; j += 1) slopes.push((values[j]! - values[i]!) / (j - i));
  }
  return slopes.length ? median(slopes) : 0;
}

export function memoryTrend(series: readonly number[], warmup: number, thresholds: TrendThresholds): Trend {
  const steady = series.slice(warmup);
  if (steady.length < 8) {
    throw new Error(`a trend needs at least 8 steady-state cycles; got ${steady.length} after ${warmup} warm-up`);
  }
  const slopePerCycle = theilSenSlope(steady);
  const lateSlopePerCycle = theilSenSlope(steady.slice(Math.floor(steady.length / 2)));
  const quarter = Math.max(2, Math.floor(steady.length / 4));
  const firstQuarterMedian = median(steady.slice(0, quarter));
  const lastQuarterMedian = median(steady.slice(-quarter));
  const rise = lastQuarterMedian - firstQuarterMedian;
  const steps = steady.slice(1).map((value, index) => value - steady[index]!);
  const typicalStep = median(steps);
  const noise = median(steps.map((step) => Math.abs(step - typicalStep))) / Math.SQRT2;
  const materialRise = Math.max(thresholds.rise, 4 * noise);

  const verdict: TrendVerdict =
    rise > materialRise && lateSlopePerCycle > thresholds.slopePerCycle
      ? "sustained growth"
      : rise > materialRise
        ? "grew then plateaued"
        : "flat";
  return { verdict, steadyCycles: steady.length, slopePerCycle, lateSlopePerCycle, rise, firstQuarterMedian, lastQuarterMedian, noise, materialRise };
}
