import assert from "node:assert/strict";
import test from "node:test";
import {
  createUnsubscribeToken,
  verifyUnsubscribeToken,
} from "./unsubscribe";

test("unsubscribe tokens are channel-scoped, signed, and expiring", () => {
  const previous = process.env["UNSUBSCRIBE_SIGNING_SECRET"];
  process.env["UNSUBSCRIBE_SIGNING_SECRET"] =
    "test-secret-that-is-at-least-thirty-two-characters";
  try {
    const now = Date.UTC(2026, 6, 26);
    const token = createUnsubscribeToken("customer_123", "email", now);
    const claims = verifyUnsubscribeToken(token, now);
    assert.equal(claims?.customerId, "customer_123");
    assert.equal(claims?.channel, "email");

    const tampered = `${token.slice(0, -1)}${
      token.endsWith("A") ? "B" : "A"
    }`;
    assert.equal(verifyUnsubscribeToken(tampered, now), null);
    assert.equal(
      verifyUnsubscribeToken(token, now + 4 * 365 * 24 * 60 * 60 * 1000),
      null,
    );
  } finally {
    if (previous === undefined) {
      delete process.env["UNSUBSCRIBE_SIGNING_SECRET"];
    } else {
      process.env["UNSUBSCRIBE_SIGNING_SECRET"] = previous;
    }
  }
});
