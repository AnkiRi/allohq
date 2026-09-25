import assert from "node:assert/strict";
import test from "node:test";
import { withProviderRetry } from "./provider-retry";

test("429 and 500 failures retry with backoff", async () => {
  let calls = 0; const sleeps: number[] = [];
  const result = await withProviderRetry(async () => {
    calls++;
    if (calls === 1) throw Object.assign(new Error("rate limited"), { statusCode: 429 });
    if (calls === 2) throw Object.assign(new Error("provider unavailable"), { statusCode: 503 });
    return "sent";
  }, { sleep: async (ms) => { sleeps.push(ms); } });
  assert.equal(result, "sent"); assert.equal(calls, 3); assert.deepEqual(sleeps, [500, 1_000]);
});

test("timeout after acceptance remains one delivery with a stable idempotency key", async () => {
  const accepted = new Map<string, string>(); let calls = 0;
  const provider = async (key: string) => {
    calls++; const existing = accepted.get(key); if (existing) return existing;
    accepted.set(key, "provider-message-1");
    throw Object.assign(new Error("timeout after acceptance"), { code: "ETIMEDOUT" });
  };
  const result = await withProviderRetry(() => provider("campaign:1:customer:1:email:treatment"), { sleep: async () => undefined });
  assert.equal(result, "provider-message-1"); assert.equal(calls, 2); assert.equal(accepted.size, 1);
});

test("permanent validation failures are not retried", async () => {
  let calls = 0;
  await assert.rejects(() => withProviderRetry(async () => { calls++; throw Object.assign(new Error("invalid recipient"), { statusCode: 422 }); }, { sleep: async () => undefined }), /invalid recipient/);
  assert.equal(calls, 1);
});

test("a rate-limit refusal is recognised however the provider spells it", async () => {
  const { isRateLimitError } = await import("./provider-retry");
  assert.equal(isRateLimitError(Object.assign(new Error("slow down"), { statusCode: 429 })), true);
  assert.equal(isRateLimitError(Object.assign(new Error("Too many requests. You can only make 10 requests per second."), { name: "rate_limit_exceeded" })), true);
  assert.equal(isRateLimitError(Object.assign(new Error("provider unavailable"), { statusCode: 503 })), false);
  assert.equal(isRateLimitError(Object.assign(new Error("invalid recipient"), { statusCode: 422 })), false);
});

test("a Resend 429 comes back marked rate-limited, not as an ordinary failure", async () => {
  const { sendTransactionalEmail } = await import("./channels/email");
  const saved = { key: process.env["RESEND_API_KEY"], fetch: globalThis.fetch };
  process.env["RESEND_API_KEY"] = "re_test_rate_limit";
  globalThis.fetch = (async () => new Response(
    JSON.stringify({ statusCode: 429, name: "rate_limit_exceeded", message: "Too many requests. You can only make 10 requests per second." }),
    { status: 429, headers: { "content-type": "application/json" } },
  )) as typeof fetch;
  try {
    const result = await sendTransactionalEmail({ channel: "email", to: "a@example.test", from: "hello@vana.in", subject: "s", text: "t" });
    assert.equal(result.status, "failed");
    assert.equal(result.rateLimited, true);
    assert.equal(result.retryable, true);
  } finally {
    globalThis.fetch = saved.fetch;
    if (saved.key === undefined) delete process.env["RESEND_API_KEY"]; else process.env["RESEND_API_KEY"] = saved.key;
  }
});
