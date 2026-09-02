import assert from "node:assert/strict";
import test from "node:test";
import {
  ReleaseBoundaryError,
  SCHEDULE_CAPABILITIES,
  V1_BLOCKED_CAPABILITIES,
  assertCapabilityAllowed,
  assertChannelAllowed,
  isCapabilityAllowed,
  isChannelAllowed,
  isScheduleAllowed,
  isV1ReleaseMode,
} from "./index";

const OFF = "false";

test("the v1 boundary fails closed for absent or malformed values", () => {
  assert.equal(isV1ReleaseMode(undefined), true, "unset must stay restricted");
  assert.equal(isV1ReleaseMode(""), true);
  assert.equal(isV1ReleaseMode("flase"), true, "typo must not open the gate");
  assert.equal(isV1ReleaseMode("0"), true);
  assert.equal(isV1ReleaseMode("true"), true);
  // Only an explicit opt-out disables it.
  assert.equal(isV1ReleaseMode("false"), false);
  assert.equal(isV1ReleaseMode(" FALSE "), false);
});

test("every out-of-scope capability is blocked under v1", () => {
  for (const capability of V1_BLOCKED_CAPABILITIES) {
    assert.equal(
      isCapabilityAllowed(capability, undefined),
      false,
      `${capability} must be blocked when V1_RELEASE_MODE is unset`,
    );
    assert.throws(
      () => assertCapabilityAllowed(capability, "test", undefined),
      ReleaseBoundaryError,
      `${capability} must throw`,
    );
    // ...and permitted again once the boundary is explicitly lifted.
    assert.equal(isCapabilityAllowed(capability, OFF), true);
  }
});

test("v1 is email-only at the send chokepoint", () => {
  assert.equal(isChannelAllowed("email", undefined), true);
  assert.equal(isChannelAllowed("EMAIL", undefined), true);
  for (const channel of ["sms", "whatsapp", "rcs", "push"]) {
    assert.equal(
      isChannelAllowed(channel, undefined),
      false,
      `${channel} must not be sendable under v1`,
    );
    assert.throws(
      () => assertChannelAllowed(channel, "campaign", undefined),
      ReleaseBoundaryError,
    );
  }
});

test("the schedules that generated unapproved work are blocked", () => {
  // Regression guard for 2026-08-10: starting workers produced two campaign
  // drafts and a merchant summary email with no human involved.
  for (const id of [
    "overnight-ops-schedule",
    "opportunity-scan-schedule",
    "daily-revenue-email-schedule",
    "churn-intervention-schedule",
    "abandoned-cart-check-schedule",
    "repurchase-reminder-schedule",
  ]) {
    assert.equal(isScheduleAllowed(id, undefined), false, `${id} must not run`);
  }
});

test("schedules required by the v1 contract keep running", () => {
  // Treatment/control reporting and customer-state upkeep are in scope.
  assert.equal(isScheduleAllowed("outcome-attribution-schedule", undefined), true);
  assert.equal(isScheduleAllowed("privacy-retention-schedule", undefined), true);
  assert.equal(isScheduleAllowed("state-decay-schedule", undefined), true);
});

test("an unclassified schedule fails closed", () => {
  assert.equal(isScheduleAllowed("some-new-schedule", undefined), false);
  assert.equal(isScheduleAllowed("some-new-schedule", OFF), true);
});

test("every classified schedule maps to a real capability", () => {
  for (const [id, capability] of Object.entries(SCHEDULE_CAPABILITIES)) {
    if (capability === null) continue;
    assert.ok(
      V1_BLOCKED_CAPABILITIES.includes(capability),
      `${id} maps to unknown capability ${capability}`,
    );
  }
});
