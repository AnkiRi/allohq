import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { ShopifyIdTokenError, verifyShopifyIdToken } from "./shopify-id-token";

const secret = "test-secret-that-is-long-enough-for-hmac";
const apiKey = "shopify-client-id";
const now = 2_000_000_000;

function sign(overrides: Record<string, unknown> = {}, algorithm = "HS256") {
  const header = Buffer.from(JSON.stringify({ alg: algorithm, typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: "https://example-shop.myshopify.com/admin",
    dest: "https://example-shop.myshopify.com",
    aud: apiKey,
    sub: "123456789",
    exp: now + 60,
    nbf: now - 5,
    iat: now - 5,
    sid: "session-id",
    ...overrides,
  })).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

test("accepts a valid App Bridge ID token", () => {
  const identity = verifyShopifyIdToken(sign(), {
    apiKey,
    apiSecret: secret,
    nowSeconds: now,
  });
  assert.equal(identity.shopDomain, "example-shop.myshopify.com");
  assert.equal(identity.staffSubject, "123456789");
  assert.equal(identity.sessionId, "session-id");
});

test("rejects signature, algorithm, time, audience, and shop mismatches", () => {
  const verify = (token: string) => verifyShopifyIdToken(token, {
    apiKey,
    apiSecret: secret,
    nowSeconds: now,
  });

  assert.throws(() => verify(`${sign()}tampered`), ShopifyIdTokenError);
  assert.throws(() => verify(sign({}, "none")), /algorithm/);
  assert.throws(() => verify(sign({ exp: now - 30 })), /expired/);
  assert.throws(() => verify(sign({ nbf: now + 30 })), /not active/);
  assert.throws(() => verify(sign({ aud: "another-app" })), /audience/);
  assert.throws(
    () => verify(sign({ dest: "https://other-shop.myshopify.com" })),
    /shops differ/,
  );
  assert.throws(
    () => verify(sign({ iss: "https://example-shop.evil.test/admin", dest: "https://example-shop.evil.test" })),
    /myshopify/,
  );
});
