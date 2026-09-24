/**
 * Retry a SERIALIZABLE transaction when Postgres asks for it, and only then.
 *
 * Under SERIALIZABLE isolation Postgres may abort a transaction with SQLSTATE
 * 40001 even when it shared no rows with the transaction that caused the
 * abort: predicate locks are tracked per index page, not per row. The
 * documented contract is that the application retries. The approval
 * finalisation transaction ran without one, so five tenants approving at once
 * could abort each other and leave the retry to the whole BullMQ job instead.
 *
 * The unit retried is the ENTIRE transaction. The abort can surface from any
 * statement inside it, so retrying a single statement would leave the others
 * unprotected — and a rolled-back transaction has undone every statement
 * anyway, so replaying all of it is both necessary and safe.
 *
 * Retried: Prisma P2034 (write conflict or deadlock), and a raw query
 * failure (P2010) whose SQLSTATE is 40001 or 40P01. Both are transient by
 * definition: nothing about the request is wrong.
 *
 * Deliberately NOT retried: unique violations, validation errors, a lost
 * approval claim, a transaction timeout (P2028) — which would otherwise
 * silently multiply the configured timeout — and anything unrecognised.
 * Retrying those would only delay the same failure and hide it.
 */

export class SerializationConflictExhaustedError extends Error {
  readonly code = "SERIALIZATION_CONFLICT_EXHAUSTED" as const;
  readonly attempts: number;
  constructor(label: string, attempts: number, cause: unknown) {
    super(`${label}: serialization conflict persisted after ${attempts} attempts`, { cause });
    this.name = "SerializationConflictExhaustedError";
    this.attempts = attempts;
  }
}

const RETRYABLE_SQLSTATES = new Set(["40001", "40P01"]);

export function isSerializationConflict(error: unknown): boolean {
  const candidate = error as { code?: unknown; meta?: { code?: unknown } } | null;
  if (!candidate || typeof candidate !== "object") return false;
  if (candidate.code === "P2034") return true;
  if (candidate.code === "P2010") {
    return RETRYABLE_SQLSTATES.has(String(candidate.meta?.code ?? ""));
  }
  return false;
}

export interface SerializableRetryPolicy {
  /** Total attempts, including the first. */
  maxAttempts: number;
  /** Ceiling of the first backoff window, in ms. */
  baseDelayMs: number;
  /** No single wait exceeds this, however many attempts have failed. */
  maxDelayMs: number;
}

/**
 * The transaction itself takes milliseconds, so conflicts clear quickly and a
 * short, bounded wait is enough. Worst case adds under two seconds, after
 * which the job queue's own retry still stands behind it.
 */
export const APPROVAL_RETRY_POLICY: SerializableRetryPolicy = {
  maxAttempts: 4,
  baseDelayMs: 50,
  maxDelayMs: 1_000,
};

export interface SerializableRetryHooks {
  /** Injected so tests are deterministic; defaults to real timers. */
  sleep?: (ms: number) => Promise<void>;
  /** Injected so tests are deterministic; defaults to Math.random. */
  random?: () => number;
  /** Structured observability. Must never receive customer data. */
  log?: (event: Record<string, unknown>) => void;
}

/**
 * Full jitter: a uniform wait in [0, window), where the window doubles each
 * attempt up to the cap. Tenants that conflicted together therefore retry at
 * different moments instead of colliding again in lockstep.
 */
export function backoffDelayMs(
  failedAttempt: number,
  policy: SerializableRetryPolicy,
  random: () => number,
): number {
  const window = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (failedAttempt - 1));
  return Math.floor(random() * window);
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const defaultLog = (event: Record<string, unknown>) => {
  // One JSON line, ids and counts only. Anything describing a customer would
  // breach the log policy in scripts/dlp-log-policy.test.ts.
  console.warn(JSON.stringify(event));
};

export async function withSerializableRetry<T>(
  label: string,
  context: Record<string, string | number>,
  run: (attempt: number) => Promise<T>,
  policy: SerializableRetryPolicy = APPROVAL_RETRY_POLICY,
  hooks: SerializableRetryHooks = {},
): Promise<T> {
  const sleep = hooks.sleep ?? defaultSleep;
  const random = hooks.random ?? Math.random;
  const log = hooks.log ?? defaultLog;

  for (let attempt = 1; ; attempt += 1) {
    try {
      const result = await run(attempt);
      if (attempt > 1) {
        log({ event: "serializable_retry_recovered", label, ...context, attempts: attempt });
      }
      return result;
    } catch (error) {
      if (!isSerializationConflict(error)) throw error;
      if (attempt >= policy.maxAttempts) {
        log({ event: "serializable_retry_exhausted", label, ...context, attempts: attempt });
        throw new SerializationConflictExhaustedError(label, attempt, error);
      }
      const delayMs = backoffDelayMs(attempt, policy, random);
      log({
        event: "serializable_retry",
        label,
        ...context,
        attempt,
        maxAttempts: policy.maxAttempts,
        delayMs,
      });
      await sleep(delayMs);
    }
  }
}
