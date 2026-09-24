import assert from "node:assert/strict";
import test from "node:test";
import type { Job } from "bullmq";
import { flushObservability, monitorWorkerFailures, sanitizeSentryEvent, sanitizeSentryTransaction, shouldCaptureWorkerFailure, type FailureObservable } from "./observability";

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

const transaction = (overrides: Record<string, unknown> = {}) => ({
  type: "transaction" as const,
  event_id: "t1",
  start_timestamp: 100,
  timestamp: 101.5,
  environment: "production",
  transaction: "GET /unsubscribe?token=signed-secret-token",
  transaction_info: { source: "url" as const },
  request: { url: "https://agent.joonhq.com/unsubscribe?token=signed-secret-token", headers: { authorization: "Bearer secret", cookie: "__session=secret" } },
  user: { email: "customer@example.com" },
  extra: { payload: "customer@example.com" },
  breadcrumbs: [{ message: "customer@example.com" }],
  sdkProcessingMetadata: { normalizedRequest: { url: "?token=signed-secret-token" } },
  contexts: {
    trace: { trace_id: "a".repeat(32), span_id: "b".repeat(16), op: "http.server", status: "ok", data: { "url.full": "https://agent.joonhq.com/unsubscribe?token=signed-secret-token" } },
    runtime: { name: "node" },
    response: { body: "customer@example.com" },
  },
  spans: [
    { trace_id: "a".repeat(32), span_id: "c".repeat(16), parent_span_id: "b".repeat(16), op: "http.client", description: "GET https://api.shopify.com/customers.json?email=customer@example.com", start_timestamp: 100.1, timestamp: 100.4, status: "ok", data: { "http.query": "email=customer@example.com", "http.request.header.authorization": "secret" } },
    { trace_id: "a".repeat(32), span_id: "d".repeat(16), parent_span_id: "b".repeat(16), op: "db.query", description: "SELECT id FROM \"Customer\" WHERE email = 'customer@example.com'", start_timestamp: 100.5, timestamp: 100.6, data: { "db.statement": "customer@example.com" } },
    { trace_id: "a".repeat(32), span_id: "e".repeat(16), op: "http.server", description: "GET /stores/cm1a2b3c4d5e6f7g8h9i0jklmn/campaigns", start_timestamp: 100.7, timestamp: 100.8, data: {} },
  ],
  tags: { queue: "email-send", job_name: "deliver", customerId: "private" },
  ...overrides,
});

test("worker transactions keep timing and drop request, attributes and customer text", () => {
  const result = sanitizeSentryTransaction(transaction());
  assert.equal(result.type, "transaction");
  assert.equal(result.transaction, "GET /unsubscribe", "query strings, where unsubscribe tokens live, are cut");
  assert.deepEqual([result.start_timestamp, result.timestamp], [100, 101.5]);
  assert.deepEqual(result.contexts, { trace: { trace_id: "a".repeat(32), span_id: "b".repeat(16), parent_span_id: undefined, op: "http.server", status: "ok", origin: undefined } });
  assert.deepEqual(result.spans?.map((span) => span.description), [
    "GET https://api.shopify.com/customers.json",
    "SELECT id FROM \"Customer\" WHERE email = '?'",
    "GET /stores/:id/campaigns",
  ]);
  assert.deepEqual(result.spans?.map((span) => [span.op, span.start_timestamp, span.timestamp]), [["http.client", 100.1, 100.4], ["db.query", 100.5, 100.6], ["http.server", 100.7, 100.8]]);
  assert.ok(result.spans?.every((span) => Object.keys(span.data).length === 0), "span attributes are dropped");
  assert.deepEqual(result.tags, { queue: "email-send", job_name: "deliver" });
  for (const forbidden of ["request", "user", "extra", "breadcrumbs", "sdkProcessingMetadata"]) {
    assert.equal(forbidden in result, false, forbidden);
  }
  const serialized = JSON.stringify(result);
  for (const secret of ["customer@example.com", "signed-secret-token", "secret", "cm1a2b3c4d5e6f7g8h9i0jklmn"]) {
    assert.equal(serialized.includes(secret), false, secret);
  }
});

test("worker transaction names keep readable routes and collapse only opaque ids", () => {
  const name = (value: string) => sanitizeSentryTransaction(transaction({ transaction: value })).transaction;
  assert.equal(name("POST /sending-day-reconciliation"), "POST /sending-day-reconciliation");
  assert.equal(name("GET /campaigns/0b7f3c2e-4a1d-4c55-9a7e-2f1d8c9b6a10/outcomes"), "GET /campaigns/:id/outcomes");
  assert.equal(name("GET /customers.search?batch=1&input=%7B%22q%22%3A%22a%40b.com%22%7D"), "GET /customers.search");
  assert.equal(name("GET /u/customer@example.com"), "GET /u/[email]");
});
