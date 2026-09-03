import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import test from "node:test";
import {
  decryptSecret,
  encryptSecret,
  isEncryptedSecret,
} from "@allohq/database";
import {
  exchangeCodeForToken,
  exchangeIdTokenForOfflineToken,
  normalizeShopDomain,
  refreshOfflineAccessToken,
  verifyOAuthHmac,
} from "./oauth";
import { verifyWebhookHmac } from "./webhooks";
import { ShopifyClient } from "./client";
import { createDiscount } from "./admin/discounts";

test("OAuth HMAC accepts the canonical query and rejects tampering", () => {
  const secret = "test-shopify-secret";
  const params = new URLSearchParams({
    code: "temporary-code",
    shop: "example.myshopify.com",
    state: "csrf-state",
    timestamp: "1785043200",
  });
  const message = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  params.set(
    "hmac",
    createHmac("sha256", secret).update(message).digest("hex"),
  );

  assert.equal(verifyOAuthHmac(params, secret), true);
  params.set("shop", "attacker.myshopify.com");
  assert.equal(verifyOAuthHmac(params, secret), false);
});

test("shop domains are normalized and non-Shopify hosts are rejected", () => {
  assert.equal(
    normalizeShopDomain("https://Example-Store.myshopify.com/admin"),
    "example-store.myshopify.com",
  );
  assert.throws(() => normalizeShopDomain("example.com"));
  assert.throws(() => normalizeShopDomain("example.myshopify.com.attacker.test"));
});

test("webhook HMAC uses the raw request body", () => {
  const body = JSON.stringify({ id: 123, email: "buyer@example.com" });
  const secret = "webhook-secret";
  const hmac = createHmac("sha256", secret).update(body).digest("base64");

  assert.equal(
    verifyWebhookHmac({ rawBody: body, hmacHeader: hmac, apiSecret: secret }),
    true,
  );
  assert.equal(
    verifyWebhookHmac({
      rawBody: `${body} `,
      hmacHeader: hmac,
      apiSecret: secret,
    }),
    false,
  );
});

test("store credentials encrypt with authenticated encryption", () => {
  const previous = process.env["DATA_ENCRYPTION_KEY"];
  process.env["DATA_ENCRYPTION_KEY"] = randomBytes(32).toString("base64");

  try {
    const plaintext = "shpat_design_partner_token";
    const encrypted = encryptSecret(plaintext);
    assert.equal(isEncryptedSecret(encrypted), true);
    assert.notEqual(encrypted, plaintext);
    assert.equal(decryptSecret(encrypted), plaintext);

    const tampered = `${encrypted.slice(0, -1)}${encrypted.endsWith("A") ? "B" : "A"}`;
    assert.throws(() => decryptSecret(tampered));
  } finally {
    if (previous === undefined) delete process.env["DATA_ENCRYPTION_KEY"];
    else process.env["DATA_ENCRYPTION_KEY"] = previous;
  }
});

test("OAuth requests expiring offline tokens and parses rotation metadata", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody = "";
  globalThis.fetch = async (_input, init) => {
    requestBody = String(init?.body);
    return new Response(JSON.stringify({
      access_token: "shpat_access",
      refresh_token: "shprt_refresh",
      expires_in: 3600,
      refresh_token_expires_in: 7_776_000,
      scope: "read_orders,read_customers",
    }), { status: 200 });
  };

  try {
    const token = await exchangeCodeForToken({
      shopDomain: "example.myshopify.com",
      apiKey: "key",
      apiSecret: "secret",
      code: "temporary",
    });
    assert.equal(new URLSearchParams(requestBody).get("expiring"), "1");
    assert.equal(token.accessToken, "shpat_access");
    assert.equal(token.refreshTokenExpiresIn, 7_776_000);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("refresh uses Shopify's rotating refresh-token grant", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody = "";
  globalThis.fetch = async (_input, init) => {
    requestBody = String(init?.body);
    return new Response(JSON.stringify({
      access_token: "shpat_rotated",
      refresh_token: "shprt_rotated",
      expires_in: 3600,
      refresh_token_expires_in: 7_776_000,
      scope: "read_orders",
    }), { status: 200 });
  };

  try {
    const token = await refreshOfflineAccessToken({
      shopDomain: "example.myshopify.com",
      apiKey: "key",
      apiSecret: "secret",
      refreshToken: "shprt_old",
    });
    const body = new URLSearchParams(requestBody);
    assert.equal(body.get("grant_type"), "refresh_token");
    assert.equal(body.get("refresh_token"), "shprt_old");
    assert.equal(token.refreshToken, "shprt_rotated");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("embedded token exchange requests an expiring offline token", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody = "";
  globalThis.fetch = async (_input, init) => {
    requestBody = String(init?.body);
    return new Response(JSON.stringify({
      access_token: "shpat_embedded",
      refresh_token: "shprt_embedded",
      expires_in: 3600,
      refresh_token_expires_in: 7_776_000,
      scope: "read_orders",
    }), { status: 200 });
  };

  try {
    await exchangeIdTokenForOfflineToken({
      shopDomain: "example.myshopify.com",
      apiKey: "key",
      apiSecret: "secret",
      idToken: "fresh-id-token",
    });
    const body = new URLSearchParams(requestBody);
    assert.equal(body.get("grant_type"), "urn:ietf:params:oauth:grant-type:token-exchange");
    assert.equal(body.get("subject_token"), "fresh-id-token");
    assert.equal(body.get("requested_token_type"), "urn:shopify:params:oauth:token-type:offline-access-token");
    assert.equal(body.get("expiring"), "1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("discount creation uses Admin GraphQL and percentage fractions", async () => {
  const originalFetch = globalThis.fetch;
  let requestJson: Record<string, unknown> = {};
  globalThis.fetch = async (_input, init) => {
    requestJson = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({
      data: {
        discountCodeBasicCreate: {
          codeDiscountNode: {
            id: "gid://shopify/DiscountCodeNode/1057856785",
            codeDiscount: {
              title: "Joon: VIP",
              startsAt: "2026-07-26T00:00:00.000Z",
              endsAt: null,
              codes: {
                nodes: [{
                  id: "gid://shopify/DiscountRedeemCode/2057856785",
                  code: "VIP20",
                }],
              },
            },
          },
          userErrors: [],
        },
      },
    }), { status: 200 });
  };

  try {
    const result = await createDiscount(
      new ShopifyClient("example.myshopify.com", "plaintext-test-token"),
      {
        code: "VIP20",
        valueType: "percentage",
        value: 20,
        title: "Joon: VIP",
      },
    );
    const variables = requestJson["variables"] as {
      input: {
        customerGets: { value: { percentage: number } };
      };
    };
    assert.equal(variables.input.customerGets.value.percentage, 0.2);
    assert.equal(result.discountCode.code, "VIP20");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
