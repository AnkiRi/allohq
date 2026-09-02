import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  bearerToken,
  issueWidgetVisitorToken,
  verifyWidgetVisitorToken,
} from "./widget-visitor-token";

const previous = process.env["WIDGET_VISITOR_SIGNING_SECRET"];
before(() => {
  process.env["WIDGET_VISITOR_SIGNING_SECRET"] = "test-secret-with-more-than-thirty-two-bytes";
});
after(() => {
  if (previous === undefined) delete process.env["WIDGET_VISITOR_SIGNING_SECRET"];
  else process.env["WIDGET_VISITOR_SIGNING_SECRET"] = previous;
});

test("token is bound to store, origin, visitor and expiry", () => {
  const now = Date.UTC(2026, 8, 2);
  const { token } = issueWidgetVisitorToken(
    { storeId: "store_1", origin: "https://brand.test", visitorId: "visitor_1" },
    now,
    60,
  );
  assert.equal(
    verifyWidgetVisitorToken(token, { storeId: "store_1", origin: "https://brand.test" }, now)?.visitorId,
    "visitor_1",
  );
  assert.equal(verifyWidgetVisitorToken(token, { storeId: "store_2", origin: "https://brand.test" }, now), null);
  assert.equal(verifyWidgetVisitorToken(token, { storeId: "store_1", origin: "https://other.test" }, now), null);
  assert.equal(verifyWidgetVisitorToken(token, { storeId: "store_1", origin: "https://brand.test" }, now + 61_000), null);
});

test("tampering and malformed authorization are rejected", () => {
  const { token } = issueWidgetVisitorToken({
    storeId: "store_1",
    origin: "https://brand.test",
    visitorId: "visitor_1",
  });
  assert.equal(verifyWidgetVisitorToken(`${token}x`, { storeId: "store_1", origin: "https://brand.test" }), null);
  assert.equal(bearerToken(`Bearer ${token}`), token);
  assert.equal(bearerToken(`Basic ${token}`), null);
});
