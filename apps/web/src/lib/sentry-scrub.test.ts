import assert from "node:assert/strict";
import test from "node:test";
import { scrubSentryEvent } from "./sentry-scrub";

test("Sentry events remove request and customer content", () => {
  const event = scrubSentryEvent({
    type: undefined,
    event_id: "test",
    transaction: "/customer/private-id",
    message: "customer@example.com",
    logentry: { message: "raw email body" },
    user: { email: "customer@example.com" },
    exception: { values: [{ type: "Error", value: "failed for customer@example.com", stacktrace: { frames: [{ filename: "https://joonhq.com/?subs=70000&rev=500000#bill" }] } }] },
    request: {
      url: "https://agent.joonhq.com/path?token=secret",
      query_string: "token=secret",
      cookies: { session: "secret" },
      data: "email body",
      headers: { authorization: "Bearer secret", accept: "application/json" },
    },
    extra: { customerEmail: "customer@example.com", count: 3 },
    contexts: { response: { body: "private" } },
    breadcrumbs: [{ category: "navigation", message: "/private", data: { from: "/one", to: "/two" } }],
  });
  assert.equal(event.user, undefined);
  for (const forbidden of ["transaction", "message", "logentry", "request", "user", "extra", "contexts", "breadcrumbs"]) {
    assert.equal(forbidden in event, false);
  }
  assert.equal(event.exception?.values?.[0]?.value, "Application error");
  assert.equal(event.exception?.values?.[0]?.stacktrace?.frames?.[0]?.filename, "remote-frame");
  assert.equal(JSON.stringify(event).includes("subs=70000"), false);
  assert.equal(JSON.stringify(event).includes("customer@example.com"), false);
});

test("Sentry stack filenames never retain URL path identifiers", () => {
  const event = scrubSentryEvent({
    type: undefined,
    exception: { values: [{ stacktrace: { frames: [
      { filename: "https://agent.joonhq.com/customers/private-customer-123/profile.tsx?token=secret" },
      { filename: "https://agent.joonhq.com/workspaces/private-workspace-456" },
    ] } }] },
  });
  assert.deepEqual(
    event.exception?.values?.[0]?.stacktrace?.frames?.map((frame) => frame.filename),
    ["remote-frame", "remote-frame"],
  );
  assert.equal(JSON.stringify(event).includes("private-customer-123"), false);
});
