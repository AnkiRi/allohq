import { UnrecoverableError } from "bullmq";

/**
 * "Not yet", as opposed to "failed".
 *
 * Thrown when a send must wait: the store already has its allowance of sends
 * in flight, the provider-wide pace is spent for this second or window, or the
 * provider answered 429. The delivery is fine; it has to be tried again later.
 * A chunk that meets one moves itself back to "delayed" instead of spending an
 * attempt, which is what previously exhausted all five attempts in about 30
 * seconds and stranded the rest of the chunk.
 */
export class DeliveryPacingError extends Error {
  constructor(readonly reason: string, readonly retryAfterMs: number) {
    super(`Delivery paced (${reason}); retrying in ${Math.round(retryAfterMs)} ms`);
    this.name = "DeliveryPacingError";
  }
}

/** How long a chunk may keep waiting for pacing before it counts as failed and alerts. */
export const PACING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type ChunkOutcome =
  | { outcome: "done"; attempted: number; permanentFailures: number }
  | { outcome: "paced"; error: DeliveryPacingError; attempted: number; permanentFailures: number }
  | { outcome: "failed"; error: unknown; attempted: number; permanentFailures: number };

/**
 * Deliver one chunk with at most `parallel` sends in flight.
 *
 * - The first pacing refusal or ordinary failure stops new sends from
 *   starting; every send already in flight is awaited before this returns. No
 *   send outlives its chunk, so nothing continues unowned after the job has
 *   moved on (previously a failed chunk left its siblings sending in the
 *   background).
 * - A delivery that failed for good (UnrecoverableError: say, an address the
 *   provider rejects) has its outcome recorded by the delivery itself; the rest
 *   of the chunk goes on. One bad address used to fail all hundred.
 * - Deliveries are idempotent by delivery key, so a chunk that is deferred or
 *   retried simply runs again: finished deliveries are skipped.
 */
export async function runDeliveryChunk<T>(
  deliveries: readonly T[],
  deliver: (delivery: T) => Promise<unknown>,
  parallel: number,
): Promise<ChunkOutcome> {
  let cursor = 0;
  let attempted = 0;
  let permanentFailures = 0;
  let stop: unknown = null;
  const lane = async () => {
    while (stop === null && cursor < deliveries.length) {
      const delivery = deliveries[cursor++]!;
      attempted += 1;
      try {
        await deliver(delivery);
      } catch (error) {
        if (error instanceof UnrecoverableError) {
          permanentFailures += 1;
          continue;
        }
        stop ??= error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(parallel, deliveries.length)) }, lane));
  if (stop === null) return { outcome: "done", attempted, permanentFailures };
  if (stop instanceof DeliveryPacingError) return { outcome: "paced", error: stop, attempted, permanentFailures };
  return { outcome: "failed", error: stop, attempted, permanentFailures };
}
