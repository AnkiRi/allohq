import assert from "node:assert/strict";
import test from "node:test";
import { privacyRetentionCutoffs } from "./privacy-retention-policy";

test("retention cutoffs are deterministic and ordered", () => {
  const now = new Date("2026-09-02T00:00:00.000Z");
  const cutoffs = privacyRetentionCutoffs(now);
  assert.equal(cutoffs.scrubBefore.toISOString(), "2026-08-03T00:00:00.000Z");
  assert.equal(cutoffs.providerEventDeleteBefore.toISOString(), "2026-06-04T00:00:00.000Z");
  assert.equal(cutoffs.deleteBefore.toISOString(), "2025-09-02T00:00:00.000Z");
});
