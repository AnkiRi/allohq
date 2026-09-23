import test from "node:test";
import assert from "node:assert/strict";
import {
  APPROVAL_RETRY_POLICY,
  SerializationConflictExhaustedError,
  backoffDelayMs,
  isSerializationConflict,
  withSerializableRetry,
} from "./serializable-retry";
import { CampaignApprovalConflictError } from "./approval-finalize";

/**
 * The retry wraps a whole SERIALIZABLE transaction. These pin down exactly
 * which failures earn a replay, how long it waits, and what a caller sees
 * when the conflict never clears.
 */
const prismaError = (code: string, meta?: Record<string, unknown>) =>
  Object.assign(new Error(`prisma ${code}`), { code, ...(meta ? { meta } : {}) });

const P2034 = () =>
  prismaError("P2034");

function harness() {
  const waits: number[] = [];
  const events: Array<Record<string, unknown>> = [];
  return {
    waits,
    events,
    hooks: {
      sleep: async (ms: number) => { waits.push(ms); },
      random: () => 0.5,
      log: (event: Record<string, unknown>) => { events.push(event); },
    },
  };
}

// --- what counts as retryable -------------------------------------------------

test("a write conflict or deadlock is retryable", () => {
  assert.equal(isSerializationConflict(P2034()), true);
});

test("a raw 40001 or 40P01 is retryable, other raw failures are not", () => {
  assert.equal(isSerializationConflict(prismaError("P2010", { code: "40001" })), true);
  assert.equal(isSerializationConflict(prismaError("P2010", { code: "40P01" })), true);
  assert.equal(isSerializationConflict(prismaError("P2010", { code: "23505" })), false);
});

test("real errors are never mistaken for a conflict", () => {
  // Unique violation, timeout, validation, a lost claim, a plain bug.
  for (const error of [
    prismaError("P2002"),
    prismaError("P2028"),
    prismaError("P2025"),
    new CampaignApprovalConflictError("c1"),
    new TypeError("undefined is not a function"),
    null,
    "a string",
  ]) {
    assert.equal(isSerializationConflict(error), false, String((error as Error)?.message ?? error));
  }
});

// --- the whole transaction is the unit ----------------------------------------

test("one conflict: the whole transaction runs again and succeeds", async () => {
  const { hooks, waits, events } = harness();
  const attempts: number[] = [];
  const result = await withSerializableRetry(
    "approval_finalize",
    { campaignId: "c1" },
    async (attempt) => {
      attempts.push(attempt);
      if (attempt === 1) throw P2034();
      return "committed";
    },
    APPROVAL_RETRY_POLICY,
    hooks,
  );
  assert.equal(result, "committed");
  assert.deepEqual(attempts, [1, 2], "the entire callback ran twice, not one statement");
  assert.equal(waits.length, 1);
  assert.equal(events[0]?.event, "serializable_retry");
  assert.equal(events.at(-1)?.event, "serializable_retry_recovered");
  assert.equal(events.at(-1)?.attempts, 2);
});

test("a non-retryable failure is thrown at once, unchanged, with no wait", async () => {
  for (const failure of [prismaError("P2002"), prismaError("P2028"), new CampaignApprovalConflictError("c1")]) {
    const { hooks, waits, events } = harness();
    let calls = 0;
    await assert.rejects(
      withSerializableRetry("approval_finalize", { campaignId: "c1" }, async () => {
        calls += 1;
        throw failure;
      }, APPROVAL_RETRY_POLICY, hooks),
      (error) => error === failure,
    );
    assert.equal(calls, 1, `${(failure as Error).message} must not be retried`);
    assert.equal(waits.length, 0);
    assert.equal(events.length, 0);
  }
});

test("a conflict that never clears fails loudly after the bound", async () => {
  const { hooks, waits, events } = harness();
  let calls = 0;
  const last = P2034();
  await assert.rejects(
    withSerializableRetry("approval_finalize", { campaignId: "c1" }, async () => {
      calls += 1;
      throw calls === APPROVAL_RETRY_POLICY.maxAttempts ? last : P2034();
    }, APPROVAL_RETRY_POLICY, hooks),
    (error) => {
      assert.ok(error instanceof SerializationConflictExhaustedError);
      assert.equal(error.attempts, APPROVAL_RETRY_POLICY.maxAttempts);
      assert.equal(error.cause, last, "the final underlying error is preserved");
      assert.match(error.message, /approval_finalize/);
      return true;
    },
  );
  assert.equal(calls, APPROVAL_RETRY_POLICY.maxAttempts);
  assert.equal(waits.length, APPROVAL_RETRY_POLICY.maxAttempts - 1, "no wait after the last attempt");
  assert.equal(events.at(-1)?.event, "serializable_retry_exhausted");
});

// --- backoff -------------------------------------------------------------------

test("the backoff window doubles, is capped, and is jittered", () => {
  const policy = { maxAttempts: 10, baseDelayMs: 50, maxDelayMs: 1_000 };
  const top = () => 0.999999;
  assert.equal(backoffDelayMs(1, policy, top), 49);
  assert.equal(backoffDelayMs(2, policy, top), 99);
  assert.equal(backoffDelayMs(3, policy, top), 199);
  assert.equal(backoffDelayMs(8, policy, top), 999, "capped at maxDelayMs");
  assert.equal(backoffDelayMs(3, policy, () => 0), 0, "full jitter reaches zero");
});

test("conflicting callers do not retry in lockstep", () => {
  // Two tenants that failed together must be able to draw different waits,
  // or they simply collide again on the next attempt.
  const policy = APPROVAL_RETRY_POLICY;
  const draws = [0.1, 0.9].map((r) => backoffDelayMs(2, policy, () => r));
  assert.notEqual(draws[0], draws[1]);
});

test("the approval policy's worst case stays small", () => {
  const policy = APPROVAL_RETRY_POLICY;
  let worst = 0;
  for (let attempt = 1; attempt < policy.maxAttempts; attempt += 1) {
    worst += Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (attempt - 1));
  }
  assert.ok(policy.maxAttempts >= 3 && policy.maxAttempts <= 6, "a small, bounded number of attempts");
  assert.ok(worst < 2_000, `worst-case added wait ${worst} ms`);
});

// --- observability carries no customer data -------------------------------------

test("retry events carry ids and counts, nothing describing a customer", async () => {
  const { hooks, events } = harness();
  await assert.rejects(
    withSerializableRetry("approval_finalize", { campaignId: "c1" }, async () => {
      throw P2034();
    }, APPROVAL_RETRY_POLICY, hooks),
  );
  const allowed = new Set(["event", "label", "campaignId", "attempt", "attempts", "maxAttempts", "delayMs"]);
  for (const event of events) {
    for (const key of Object.keys(event)) {
      assert.ok(allowed.has(key), `unexpected field "${key}" in a retry event`);
    }
    assert.doesNotMatch(JSON.stringify(event), /@|email|phone/i);
  }
});
