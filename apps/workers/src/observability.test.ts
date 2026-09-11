import assert from "node:assert/strict";
import test from "node:test";
import type { Job } from "bullmq";
import { flushObservability, monitorWorkerFailures, sanitizeSentryEvent, shouldCaptureWorkerFailure, type FailureObservable } from "./observability";

test("worker observability excludes job payloads, logs and breadcrumbs", () => {
  const result = sanitizeSentryEvent({
    type: undefined,
    event_id: "e1",
    transaction: "send customer@example.com",
    message: "raw recipient",
    logentry: { message: "raw body" },
    contexts: { job: { payload: { email: "customer@example.com" } } },
    extra: { token: "secret" },
    breadcrumbs: [{ category: "navigation", message: "/private", data: { to: "/secret" } }],
    tags: { queue: "email-send", job_name: "deliver", customerId: "private" },
    exception: { values: [{ type: "ProviderError", value: "failed customer@example.com", stacktrace: { frames: [{ filename: "/srv/app/customer/private.ts?token=x" }] } }] },
  });
  assert.deepEqual(result.tags, { queue: "email-send", job_name: "deliver" });
  assert.equal(result.exception?.values?.[0]?.value, "Worker error");
  assert.equal(result.exception?.values?.[0]?.stacktrace?.frames?.[0]?.filename, "private.ts");
  for (const forbidden of ["transaction", "message", "logentry", "contexts", "extra", "breadcrumbs"]) {
    assert.equal(forbidden in result, false);
  }
  assert.equal(JSON.stringify(result).includes("customer@example.com"), false);
});

test("worker monitoring captures only terminal unexpected failures", () => {
  const retrying = { attemptsMade: 1, opts: { attempts: 3 } } as Job;
  const terminal = { attemptsMade: 3, opts: { attempts: 3 } } as Job;
  assert.equal(shouldCaptureWorkerFailure(retrying, new Error("provider unavailable")), false);
  assert.equal(shouldCaptureWorkerFailure(terminal, new Error("provider unavailable")), true);
  assert.equal(shouldCaptureWorkerFailure(terminal, new Error("Deferred: daily_cap")), false);
  assert.equal(shouldCaptureWorkerFailure(undefined, new Error("poller crashed")), true);
});

test("worker stack URLs retain only a non-identifying basename", () => {
  const result = sanitizeSentryEvent({
    type: undefined,
    exception: { values: [{ stacktrace: { frames: [{ filename: "https://worker.joonhq.com/stores/private-store/jobs/run.ts?token=x" }] } }] },
  });
  assert.equal(result.exception?.values?.[0]?.stacktrace?.frames?.[0]?.filename, "remote-frame");
  assert.equal(JSON.stringify(result).includes("private-store"), false);
});

test("worker monitoring covers every supplied worker, detaches, and flushes safely without a DSN", async () => {
  const attached = new Set<string>();
  const workers = ["send", "shopify-webhook", "automation"].map((name): FailureObservable => ({
    name,
    on(event) { attached.add(`${name}:${event}`); },
    off(event) { attached.delete(`${name}:${event}`); },
  }));
  const stop = monitorWorkerFailures(workers);
  assert.deepEqual([...attached].sort(), ["automation:failed", "send:failed", "shopify-webhook:failed"]);
  stop();
  assert.equal(attached.size, 0);
  const prior = process.env.SENTRY_DSN;
  delete process.env.SENTRY_DSN;
  assert.equal(await flushObservability(), true);
  if (prior) process.env.SENTRY_DSN = prior;
});
