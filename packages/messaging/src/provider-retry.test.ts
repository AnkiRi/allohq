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
