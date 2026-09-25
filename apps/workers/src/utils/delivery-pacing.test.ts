import assert from "node:assert/strict";
import test from "node:test";
import { UnrecoverableError } from "bullmq";
import { DeliveryPacingError, runDeliveryChunk } from "./delivery-pacing";

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("never more sends in flight than the store allows", async () => {
  let inFlight = 0;
  let peak = 0;
  const result = await runDeliveryChunk(Array.from({ length: 40 }, (_, i) => i), async () => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await tick(2);
    inFlight -= 1;
  }, 2);
  assert.equal(result.outcome, "done");
  assert.equal(result.attempted, 40);
  assert.equal(peak, 2);
});

test("a pacing refusal stops new sends and waits for the ones in flight before returning", async () => {
  const events: string[] = [];
  const result = await runDeliveryChunk(Array.from({ length: 20 }, (_, i) => i), async (i) => {
    events.push(`start ${i}`);
    if (i === 3) throw new DeliveryPacingError("store_concurrency", 500);
    await tick(i === 2 ? 30 : 1);
    events.push(`end ${i}`);
  }, 3);
  assert.equal(result.outcome, "paced");
  assert.equal((result as { error: DeliveryPacingError }).error.retryAfterMs, 500);
  // Delivery 2 was in flight when 3 was refused: it finished before the chunk
  // returned, so nothing keeps sending after the job has been deferred.
  assert.ok(events.includes("end 2"), "the in-flight send completed inside the chunk");
  assert.ok(result.attempted < 20, "no send starts after the refusal");
  const lastStart = Math.max(...events.filter((e) => e.startsWith("start")).map((e) => Number(e.split(" ")[1])));
  assert.ok(lastStart <= 5, `sends stopped starting promptly (last started ${lastStart})`);
});

test("one recipient's permanent failure does not fail the other ninety-nine", async () => {
  const delivered: number[] = [];
  const result = await runDeliveryChunk(Array.from({ length: 100 }, (_, i) => i), async (i) => {
    if (i === 17) throw new UnrecoverableError("invalid recipient");
    delivered.push(i);
  }, 2);
  assert.equal(result.outcome, "done");
  assert.equal(result.permanentFailures, 1);
  assert.equal(delivered.length, 99);
});

test("an ordinary failure fails the chunk, but only after every started send has settled", async () => {
  let settled = 0;
  let started = 0;
  const result = await runDeliveryChunk(Array.from({ length: 30 }, (_, i) => i), async (i) => {
    started += 1;
    if (i === 1) throw new Error("provider unavailable");
    await tick(10);
    settled += 1;
  }, 2);
  assert.equal(result.outcome, "failed");
  assert.equal(settled, started - 1, "every send that started finished before the chunk reported failure");
});
