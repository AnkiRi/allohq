import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeSentryEvent, shouldCaptureApiError } from "./observability";

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
