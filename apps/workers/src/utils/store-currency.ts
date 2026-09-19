import { prisma } from "@allohq/database";

const TTL_MS = 5 * 60_000;
const cache = new Map<string, { currency: string | null; until: number }>();

/**
 * Store currency for text workers render for merchants.
 *
 * Several worker summaries hardcoded a dollar sign while the dashboard had
 * already been corrected to use the store's own currency. They each have a
 * storeId but no store row, and they run per event, so the lookup is cached
 * briefly rather than repeated. A store whose currency is unset returns null,
 * and `formatStoreMoney` then prints a bare amount rather than guessing.
 */
export async function storeCurrency(storeId: string): Promise<string | null> {
  const hit = cache.get(storeId);
  if (hit && hit.until > Date.now()) return hit.currency;
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { currency: true },
  });
  const currency = store?.currency ?? null;
  cache.set(storeId, { currency, until: Date.now() + TTL_MS });
  return currency;
}

/** Test seam: drops memoized currencies. */
export function resetStoreCurrencyCache(): void {
  cache.clear();
}
