import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

/**
 * The control selection ranks candidates in Postgres with
 *   ORDER BY "assignmentHash" ASC, "customerId" COLLATE "C" ASC
 * while the in-memory reference ranking in `@allohq/customer-state` breaks ties
 * with `localeCompare`. `COLLATE "C"` is byte order by definition, so parity
 * between the two depends on `localeCompare` agreeing with byte order for the
 * ids this table actually holds.
 *
 * `Customer.id` is `@default(cuid())` — a lowercase alphanumeric string — and
 * for that alphabet the two orderings agree. These tests pin that rather than
 * assuming it, and pin the shapes where it would stop being true.
 */

const CUID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Deterministic cuid-shaped id, so the test does not depend on Math.random. */
function cuidShaped(index: number): string {
  const digest = createHash("sha256").update(`ordering:${index}`).digest();
  let id = "c";
  for (let i = 0; i < 24; i += 1) id += CUID_ALPHABET[digest[i]! % CUID_ALPHABET.length];
  return id;
}

const byBytes = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const byLocale = (a: string, b: string) => a.localeCompare(b);

test("localeCompare and byte order agree for cuid-shaped customer ids", () => {
  const ids = Array.from({ length: 5_000 }, (_, index) => cuidShaped(index));
  assert.equal(new Set(ids).size, ids.length, "fixture ids must be distinct");

  const locale = [...ids].sort(byLocale);
  const bytes = [...ids].sort(byBytes);
  assert.deepEqual(locale, bytes);
});

test("pairwise comparison agrees for every cuid alphabet character", () => {
  for (const left of CUID_ALPHABET) {
    for (const right of CUID_ALPHABET) {
      const a = `c${left}`;
      const b = `c${right}`;
      assert.equal(
        Math.sign(byLocale(a, b)),
        Math.sign(byBytes(a, b)),
        `${a} vs ${b} ordered differently by locale and bytes`
      );
    }
  }
});

test("the agreement is specific to the cuid alphabet", () => {
  // Documented limit, not a defect: if customer ids ever stop being cuids and
  // carry punctuation or uppercase, the C collation and localeCompare diverge
  // and the SQL selection would have to change its tiebreak to match.
  const mixed = ["a_b", "a-1", "aB", "aa"];
  assert.notDeepEqual([...mixed].sort(byLocale), [...mixed].sort(byBytes));
});
