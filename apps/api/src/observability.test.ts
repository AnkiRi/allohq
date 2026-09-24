import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeSentryEvent, sanitizeSentryTransaction, shouldCaptureApiError } from "./observability";

test("API observability keeps only diagnostic allowlist fields", () => {
  const result = sanitizeSentryEvent({
    type: undefined,
    event_id: "e1",
    transaction: "/customers/private-id",
    message: "customer@example.com",
    logentry: { message: "raw email body" },
    request: { url: "https://api/private?token=x", data: { email: "customer@example.com" } },
    user: { email: "customer@example.com" },
    breadcrumbs: [{ category: "navigation", data: { from: "/private", to: "/secret" } }],
    tags: { route: "campaigns.sendNow", customerId: "private" },
    exception: { values: [{ type: "Error", value: "token=x", stacktrace: { frames: [{ filename: "https://agent.joonhq.com/store/private-id?rev=500000#bill", lineno: 2 }] } }] },
  });
  assert.deepEqual(result.tags, { route: "campaigns.sendNow" });
  assert.equal(result.exception?.values?.[0]?.value, "Application error");
  assert.equal(result.exception?.values?.[0]?.stacktrace?.frames?.[0]?.filename, "remote-frame");
  assert.equal(JSON.stringify(result).includes("/store/"), false);
  assert.equal(JSON.stringify(result).includes("rev=500000"), false);
  for (const forbidden of ["transaction", "message", "logentry", "request", "user", "breadcrumbs"]) {
    assert.equal(forbidden in result, false);
  }
  assert.equal(JSON.stringify(result).includes("customer@example.com"), false);
});

test("API captures only unexpected server errors", () => {
  assert.equal(shouldCaptureApiError("BAD_REQUEST", 400), false);
  assert.equal(shouldCaptureApiError("UNAUTHORIZED", 401), false);
  assert.equal(shouldCaptureApiError("INTERNAL_SERVER_ERROR", 500), true);
  assert.equal(shouldCaptureApiError(undefined, 503), true);
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
  tags: { route: "customers.search", service: "api", customerId: "private" },
  ...overrides,
});

test("API transactions keep timing and drop request, attributes and customer text", () => {
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
  assert.deepEqual(result.tags, { route: "customers.search", service: "api" });
  for (const forbidden of ["request", "user", "extra", "breadcrumbs", "sdkProcessingMetadata"]) {
    assert.equal(forbidden in result, false, forbidden);
  }
  const serialized = JSON.stringify(result);
  for (const secret of ["customer@example.com", "signed-secret-token", "secret", "cm1a2b3c4d5e6f7g8h9i0jklmn"]) {
    assert.equal(serialized.includes(secret), false, secret);
  }
});

test("API transaction names keep readable routes and collapse only opaque ids", () => {
  const name = (value: string) => sanitizeSentryTransaction(transaction({ transaction: value })).transaction;
  assert.equal(name("POST /sending-day-reconciliation"), "POST /sending-day-reconciliation");
  assert.equal(name("GET /campaigns/0b7f3c2e-4a1d-4c55-9a7e-2f1d8c9b6a10/outcomes"), "GET /campaigns/:id/outcomes");
  assert.equal(name("GET /customers.search?batch=1&input=%7B%22q%22%3A%22a%40b.com%22%7D"), "GET /customers.search");
  assert.equal(name("GET /u/customer@example.com"), "GET /u/[email]");
});
