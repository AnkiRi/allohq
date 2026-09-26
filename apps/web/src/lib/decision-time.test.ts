import test from "node:test";
import assert from "node:assert/strict";
import { formatDecisionTime } from "./decision-time";

test("decision times are stable in the same timezone as Activity", () => {
  const label = formatDecisionTime("2026-09-17T10:56:00.000Z");
  assert.match(label ?? "", /17 Sept? 2026/);
  assert.match(label ?? "", /16:26 IST/);
});

test("missing or invalid times are not presented as real events", () => {
  assert.equal(formatDecisionTime(null), null);
  assert.equal(formatDecisionTime("not-a-date"), null);
});
