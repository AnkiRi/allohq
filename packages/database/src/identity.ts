/**
 * Cross-brand Identity helpers (additive).
 *
 * Normalization is the keying logic for the Identity layer: the SAME person
 * reached on the SAME email or phone across two different stores normalizes to
 * the SAME key, and therefore links to ONE Identity. Nothing in single-brand
 * behavior reads these yet — they exist for the cross-brand future and the
 * idempotent backfill (scripts/backfill-identities.ts).
 */

/**
 * Normalize an email for cross-brand identity keying.
 * Lowercases and trims. Returns null for empty/blank input.
 */
export function normalizeEmail(
  email: string | null | undefined,
): string | null {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

/**
 * Normalize a phone number for cross-brand identity keying.
 * Strips all non-digits, then keeps the last 10 digits (the national number),
 * which collapses E.164 / country-code / formatting variants of the same line
 * to one stable key. Returns null when fewer than 10 digits are present.
 */
export function normalizePhone(
  phone: string | null | undefined,
): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.slice(-10);
}
