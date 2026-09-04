import test from "node:test";
import assert from "node:assert/strict";
import { UnrecoverableError } from "bullmq";
import { providerJobFailure } from "./provider-job-failure";

test("transient provider failures remain retryable", () => {
  const error = providerJobFailure({ error: "429", retryable: true });
  assert.equal(error instanceof UnrecoverableError, false);
  assert.equal(error.message, "429");
});

test("permanent provider failures stop BullMQ retries", () => {
  const error = providerJobFailure({ error: "invalid recipient", retryable: false });
  assert.equal(error instanceof UnrecoverableError, true);
});
