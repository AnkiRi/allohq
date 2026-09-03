export interface ProviderErrorLike extends Error { status?: number; statusCode?: number; code?: string }

export function isTransientProviderError(error: unknown): boolean {
  const value = error as Partial<ProviderErrorLike> | null;
  const status = Number(value?.statusCode ?? value?.status);
  if (status === 429 || status >= 500) return true;
  const signal = `${value?.name ?? ""} ${value?.code ?? ""} ${value?.message ?? ""}`.toLowerCase();
  return ["timeout", "timed out", "econnreset", "etimedout", "rate_limit", "too many requests", "internal_server", "service_unavailable"].some((part) => signal.includes(part));
}

export async function withProviderRetry<T>(operation: () => Promise<T>, options: { maxRetries?: number; sleep?: (ms: number) => Promise<void> } = {}): Promise<T> {
  const maxRetries = options.maxRetries ?? 2;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try { return await operation(); }
    catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt >= maxRetries || !isTransientProviderError(error)) throw lastError;
      await sleep(500 * 2 ** attempt);
    }
  }
  throw lastError ?? new Error("Provider operation failed");
}
