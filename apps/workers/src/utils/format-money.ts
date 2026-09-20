/**
 * Store money for merchant and customer facing text produced by workers.
 *
 * Personalization variables used to be built as `$${amount.toFixed(2)}`, so an
 * Indian store's `{{ltv}}` would render as `$4000.00`. The variable is reachable
 * — `campaign-factory.ts` puts `{{ltv}}` in a "Total Spent" row — but no sent
 * message has been shown to have carried it, and delivery remains allowlisted,
 * so this is a latent defect rather than a delivered one. The web dashboard
 * already formats in the store's own currency; workers had no shared helper and
 * drifted to a hardcoded dollar sign.
 *
 * An unrecognised currency never invents a symbol: it falls back to the plain
 * amount, or the ISO code plus the amount, rather than guessing dollars.
 */
export function formatStoreMoney(amount: number, currency: string | null | undefined): string {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const code = (currency ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return safeAmount.toFixed(2);
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safeAmount);
  } catch {
    return `${code} ${safeAmount.toFixed(2)}`;
  }
}
