import assert from "node:assert/strict";
import test from "node:test";
import { nextSesWarmupDelay, nextSesWarmupResume } from "./ses-warmup-defer";

test("all SES flows defer warmup overflow to the next UTC delivery day", () => {
  const now = new Date("2026-09-11T12:00:00Z");
  assert.equal(nextSesWarmupResume(now).toISOString(), "2026-09-12T00:05:00.000Z");
  assert.equal(nextSesWarmupDelay(now), 43_500_000);
});
