import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { assignmentValue } from "./experiments";

/**
 * What storage does to an assignment value, and whether it can change an arm.
 *
 * Measured, not assumed: writing a double through Prisma keeps sixteen
 * significant digits. At a million candidates, 193,310 of 772,938 stored
 * assignment hashes differed from the exact computed value — the share whose
 * shortest exact decimal needs seventeen digits. The question these tests
 * answer is whether that can tie two candidates or reorder them, because a tie
 * falls through to `customerId COLLATE "C"` and could change who is in the
 * control group at the quota boundary.
 *
 * It cannot, and the reason is a bound rather than a sample. Assignment values
 * are k / 2^48, so two distinct values are always at least 2^-48 apart —
 * 3.5527e-15. Sixteen significant digits gives a grid no coarser than 1e-16,
 * so rounding moves a value by at most 5e-17. That is 35 times smaller than
 * half the gap, everywhere in the range.
 *
 * The margin survives at fifteen significant digits (3.6x) and fails at
 * fourteen (half-ulp 5e-15 against a half-gap of 1.776e-15), so these tests
 * pin the conservative case too.
 */

const TWO48 = 281474976710656;
const HASH_GAP = 1 / TWO48;

/** The value as storage holds it. Sixteen digits is what was measured. */
const storedAt = (value: number, digits: number) => Number(value.toPrecision(digits));
const stored = (value: number) => storedAt(value, 16);

test("the storage grid is finer than the gap between two assignment values", () => {
  // Coarsest case: values in [0.1, 1), where the sixteenth significant digit
  // sits at 1e-16. Nine tenths of all values are in this range.
  const coarsestGrid = 1e-16;
  const worstRoundingError = coarsestGrid / 2;
  assert.ok(
    worstRoundingError < HASH_GAP / 2,
    `rounding may move a value by ${worstRoundingError}, which must stay under half the ${HASH_GAP} gap`
  );
  assert.ok(HASH_GAP / 2 / worstRoundingError > 30, "the margin should be more than thirty-fold");
});

test("no two adjacent assignment values collide or invert after storage", () => {
  // The top of the range first: values nearest 1, where the grid is coarsest
  // relative to the gap. Adjacent integers, so this is the worst case
  // available rather than a sample of typical ones.
  let collisions = 0;
  let inversions = 0;
  for (let k = TWO48 - 200_000; k < TWO48 - 1; k += 1) {
    const low = stored(k / TWO48);
    const high = stored((k + 1) / TWO48);
    if (low === high) collisions += 1;
    if (low > high) inversions += 1;
  }
  assert.equal(collisions, 0, "storage must never make two distinct values equal");
  assert.equal(inversions, 0, "storage must never reverse two values");

  // Then every binade, so no part of the range is untested.
  for (let exponent = 0; exponent < 48; exponent += 1) {
    const base = Math.floor(TWO48 / 2 ** exponent);
    for (let k = Math.max(1, base - 2_000); k < base; k += 1) {
      const low = stored(k / TWO48);
      const high = stored((k + 1) / TWO48);
      assert.notEqual(low, high, `collision at k=${k}`);
      assert.ok(low < high, `inversion at k=${k}`);
    }
  }
});

test("the margin still holds if storage kept only fifteen significant digits", () => {
  for (let k = TWO48 - 50_000; k < TWO48 - 1; k += 1) {
    const low = storedAt(k / TWO48, 15);
    const high = storedAt((k + 1) / TWO48, 15);
    assert.ok(low < high, `fifteen digits inverted or tied at k=${k}`);
  }
});

test("fourteen significant digits would not be safe, which is why the margin is stated", () => {
  // Not a requirement — a demonstration that the bound is load-bearing rather
  // than incidental. If storage precision ever drops this far, arms can move.
  let collisions = 0;
  for (let k = TWO48 - 50_000; k < TWO48 - 1; k += 1) {
    if (storedAt(k / TWO48, 14) === storedAt((k + 1) / TWO48, 14)) collisions += 1;
  }
  assert.ok(collisions > 0, "fourteen digits should collide; if it does not, the bound needs rechecking");
});

test("a control cutoff falls the same way on stored values as on exact ones", () => {
  // A stratum large enough that the quota boundary lands among values that
  // differ only in their last digits.
  const seed = "cutoff-seed";
  const stratum = "champions";
  const ids = Array.from({ length: 20_000 }, (_, index) => {
    const digest = createHash("sha256").update(`cutoff:${index}`).digest("hex");
    return `c${digest.slice(0, 24)}`;
  });
  assert.equal(new Set(ids).size, ids.length, "the fixture must not repeat a customer id");

  const rows = ids.map((customerId) => {
    const exact = assignmentValue(`${seed}:${stratum}`, customerId);
    return { customerId, exact, stored: stored(exact) };
  });
  const byBytes = (a: string, b: string) =>
    Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
  const rankExact = rows
    .slice()
    .sort((a, b) => a.exact - b.exact || byBytes(a.customerId, b.customerId));
  const rankStored = rows
    .slice()
    .sort((a, b) => a.stored - b.stored || byBytes(a.customerId, b.customerId));

  // Every quota from 1 to the full stratum, not just the one this rate gives,
  // so the check does not depend on where the boundary happens to fall.
  for (const quota of [1, 2, 10, 999, 1_000, 3_000, 15_000, 19_999]) {
    const control = new Set(rankStored.slice(0, quota).map((row) => row.customerId));
    for (const row of rankExact.slice(0, quota)) {
      assert.ok(control.has(row.customerId), `quota ${quota} drew a different control group`);
    }
  }
  // And the rankings agree position by position, which is the stronger claim.
  for (let index = 0; index < rows.length; index += 1) {
    assert.equal(rankStored[index]!.customerId, rankExact[index]!.customerId, `rank ${index} differs`);
  }
});

test("storage rounding is what changes the value, and only in the last places", () => {
  // Guards the model these tests rest on: if storage ever kept the value
  // exactly, or mangled it further, this is where that shows up.
  let differing = 0;
  let worstRelative = 0;
  const total = 100_000;
  for (let index = 0; index < total; index += 1) {
    const exact = assignmentValue("precision-seed:champions", `c${index}`);
    const held = stored(exact);
    if (held !== exact) {
      differing += 1;
      worstRelative = Math.max(worstRelative, Math.abs(held - exact) / exact);
    }
  }
  // About a quarter of values need a seventeenth digit; 193,310 of 772,938
  // was measured at a million.
  assert.ok(differing / total > 0.2 && differing / total < 0.3, `${differing} of ${total} differed`);
  assert.ok(worstRelative < 1e-15, `storage moved a value by ${worstRelative}, which is more than rounding`);
});
