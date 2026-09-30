import assert from "node:assert/strict";
import test from "node:test";
import { median, memoryTrend, theilSenSlope } from "./memory-trend";

const MB = 1024 * 1024;
const thresholds = { slopePerCycle: 64 * 1024, rise: 4 * MB };

/** Deterministic noise, so a failure here is reproducible. */
function noise(seed: number) {
  let state = seed;
  return (amplitude: number) => {
    state = (state * 1_103_515_245 + 12_345) % 2 ** 31;
    return ((state / 2 ** 31) * 2 - 1) * amplitude;
  };
}

const series = (cycles: number, at: (cycle: number) => number, amplitude = 2 * MB, seed = 7) => {
  const jitter = noise(seed);
  return Array.from({ length: cycles }, (_, cycle) => 200 * MB + at(cycle) + jitter(amplitude));
};

test("median and Theil–Sen are the robust estimators they claim to be", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(theilSenSlope([0, 1, 2, 3, 4]), 1);
  assert.equal(theilSenSlope([0, 1, 2, 1000, 4, 5]), 1, "one wild point does not move the slope");
});

test("ordinary cycle-to-cycle variation is flat, not a leak", () => {
  const trend = memoryTrend(series(60, () => 0), 10, thresholds);
  assert.equal(trend.verdict, "flat");
  assert.ok(Math.abs(trend.slopePerCycle) < thresholds.slopePerCycle);
});

test("steady per-cycle growth is sustained growth", () => {
  const trend = memoryTrend(series(60, (cycle) => cycle * 1 * MB), 10, thresholds);
  assert.equal(trend.verdict, "sustained growth");
  assert.ok(Math.abs(trend.slopePerCycle - MB) < 0.2 * MB, `slope ${trend.slopePerCycle}`);
});

test("growth confined to warm-up is excluded once warm-up is separated", () => {
  const warming = (cycle: number) => Math.min(cycle, 10) * 5 * MB;
  assert.equal(memoryTrend(series(60, warming), 10, thresholds).verdict, "flat");
  // Counting warm-up as steady state is exactly the mistake the split avoids.
  assert.notEqual(memoryTrend(series(60, warming), 0, thresholds).verdict, "flat");
});

test("a rise that levels off is a plateau, not sustained growth", () => {
  const step = (cycle: number) => (cycle < 30 ? 0 : 20 * MB);
  assert.equal(memoryTrend(series(60, step, 1 * MB), 10, thresholds).verdict, "grew then plateaued");
});

test("resident-memory-sized swings are not read as growth", () => {
  // RSS measured on a laptop swung by ±40 MB and more between cycles with no
  // trend at all. The noise floor, not a fixed number, decides what is material.
  const rss = { slopePerCycle: 1 * MB, rise: 32 * MB };
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const trend = memoryTrend(series(60, () => 0, 150 * MB, seed), 10, rss);
    assert.notEqual(trend.verdict, "sustained growth", `seed ${seed}: rise ${trend.rise / MB} MB, noise ${trend.noise / MB} MB`);
    assert.ok(trend.materialRise > rss.rise, "a noisy series raises the bar above the fixed threshold");
  }
  // ...while real growth still clears that raised bar.
  assert.equal(memoryTrend(series(60, (cycle) => cycle * 8 * MB, 150 * MB), 10, rss).verdict, "sustained growth");
});

test("one spike does not make a trend", () => {
  const spike = series(60, () => 0);
  spike[40] = spike[40]! + 300 * MB;
  assert.equal(memoryTrend(spike, 10, thresholds).verdict, "flat");
});

test("too few steady cycles is refused rather than guessed at", () => {
  assert.throws(() => memoryTrend(series(12, () => 0), 10, thresholds), /at least 8 steady-state cycles/);
});
