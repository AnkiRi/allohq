/**
 * Retry with exponential backoff and jitter.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
  } = {}
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 500, maxDelayMs = 10000 } = opts;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt >= maxRetries) break;

      // Exponential backoff: baseDelay * 2^attempt + random jitter
      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt) + Math.random() * baseDelayMs,
        maxDelayMs
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
