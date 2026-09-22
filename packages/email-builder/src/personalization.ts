/**
 * Personalization tokens, and what happens when there is nothing to put in them.
 *
 * The renderer used to fall back to the tag itself:
 *
 *     variables[key] ?? `{{${key}}}`
 *
 * so a token the send worker does not supply — a typo like `{{firstname}}`, or
 * a field Joon never had, like `{{city}}` — reached a real customer's inbox as
 * the literal text "{{firstname}}". A merge tag is the one thing in an email
 * that must never be visible.
 *
 * So: a token resolves to its value, or to a fallback, or to nothing. Never to
 * itself. The catalogue below is the set the send worker actually populates,
 * which keeps the picker honest — Joon does not offer a token it cannot fill.
 */

export type PersonalizationToken = {
  /** The key as it appears between braces. */
  key: string;
  /** What a merchant calls it. */
  label: string;
  /** Used when the customer has no value. Chosen so the sentence still reads. */
  defaultFallback: string;
  /** Shown in the Studio so a merchant can see the shape before sending. */
  sample: string;
  group: "customer" | "order" | "store";
};

/**
 * Only tokens the delivery worker populates. Adding one here without adding it
 * there would promise personalization that silently renders as the fallback
 * for every recipient.
 */
export const PERSONALIZATION_TOKENS: readonly PersonalizationToken[] = [
  { key: "first_name", label: "First name", defaultFallback: "there", sample: "Priya", group: "customer" },
  { key: "last_name", label: "Last name", defaultFallback: "", sample: "Sharma", group: "customer" },
  { key: "email", label: "Email address", defaultFallback: "", sample: "priya@example.com", group: "customer" },
  { key: "segment", label: "Segment", defaultFallback: "customers", sample: "Loyal", group: "customer" },
  { key: "order_count", label: "Orders placed", defaultFallback: "0", sample: "4", group: "order" },
  { key: "ltv", label: "Lifetime value", defaultFallback: "", sample: "₹12,400", group: "order" },
  { key: "avg_order_value", label: "Average order value", defaultFallback: "", sample: "₹3,100", group: "order" },
  { key: "last_order_date", label: "Last order date", defaultFallback: "", sample: "12 Aug 2026", group: "order" },
  { key: "days_since_purchase", label: "Days since last order", defaultFallback: "", sample: "38", group: "order" },
  { key: "discount_code", label: "Approved discount code", defaultFallback: "", sample: "WINTER15", group: "store" },
  { key: "unsubscribe_url", label: "Unsubscribe link", defaultFallback: "", sample: "https://…", group: "store" },
];

const BY_KEY = new Map(PERSONALIZATION_TOKENS.map((token) => [token.key, token]));

export function isKnownToken(key: string): boolean {
  return BY_KEY.has(key);
}

export function personalizationToken(key: string): PersonalizationToken | undefined {
  return BY_KEY.get(key);
}

/** `{{key}}` or `{{key|fallback}}`. A fallback may not contain `}`. */
const TOKEN_PATTERN = /\{\{\s*(\w[\w.]*)\s*(?:\|([^}]*))?\}\}/g;

export type TokenUse = { key: string; fallback: string | null; known: boolean };

/** Every token in a piece of text, in order, with whatever fallback it carries. */
export function findTokens(text: string): TokenUse[] {
  const uses: TokenUse[] = [];
  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const key = match[1]!;
    uses.push({
      key,
      fallback: match[2] === undefined ? null : match[2].trim(),
      known: BY_KEY.has(key),
    });
  }
  return uses;
}

/**
 * Replace every token with a value.
 *
 * Resolution order: the customer's value, then the fallback written in the
 * tag, then the token's default fallback, then empty. A token NEVER renders as
 * itself, whether or not it is known.
 *
 * In `preview` mode a known token with no value shows its fallback, so the
 * merchant sees exactly what a customer without that value will see.
 */
export function resolvePersonalization(
  text: string,
  variables: Record<string, string>,
  options: { preview?: boolean } = {},
): string {
  return text.replace(TOKEN_PATTERN, (_match, rawKey: string, rawFallback?: string) => {
    const key = rawKey;
    const written = rawFallback === undefined ? null : rawFallback.trim();
    const value = variables[key];
    if (value !== undefined && value !== "") return value;
    if (written !== null && written !== "") return written;
    const token = BY_KEY.get(key);
    if (token && token.defaultFallback) return token.defaultFallback;
    void options;
    return "";
  });
}

/** The literal text a merchant inserts from the picker. */
export function tokenText(key: string, fallback?: string): string {
  const resolved = fallback ?? BY_KEY.get(key)?.defaultFallback ?? "";
  return resolved ? `{{${key}|${resolved}}}` : `{{${key}}}`;
}
