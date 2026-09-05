import test from "node:test";
import assert from "node:assert/strict";
import { upliftReadiness } from "./uplift-readiness";
test("uplift cannot graduate from data volume alone into live decisions", () => {
  assert.equal(upliftReadiness({ examples: 100, controls: 15, campaigns: 2, lifecycleCoverage: 1 }), "ledger_only");
  assert.equal(upliftReadiness({ examples: 2_000, controls: 300, campaigns: 10, lifecycleCoverage: .5 }), "store_shadow");
  assert.equal(upliftReadiness({ examples: 10_000, controls: 1_500, campaigns: 20, lifecycleCoverage: .8 }), "prospective_candidate");
});
