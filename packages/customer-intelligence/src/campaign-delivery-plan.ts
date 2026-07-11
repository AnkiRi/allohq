// ---------------------------------------------------------------------------
// Per-customer campaign delivery plan (North Star #1 — the CAM acting, not just
// measuring). Pure + deterministic so it's unit-testable and auditable; the
// worker supplies the async signals (best channel, optimal send hour) and this
// decides SKIP (send-less) + the bounded TONE profile used to slot per-customer
// touches (greeting / emoji / sign-off). Deterministic stubs today — labeled an
// ESTIMATE until control data backs the skip. See docs/allo-state.md.
// ---------------------------------------------------------------------------

export type ToneKey = "casual" | "warm" | "formal";

export interface CustomerDeliverySignals {
  segment: string | null;
  totalSpent: number | null;
  orderCount: number | null;
  recencyDays: number | null; // days since last order
  firstName: string | null;
  lastName: string | null;
  hasDiscount: boolean; // is this campaign offering a discount?
}

export interface DeliveryDecision {
  skip: boolean;
  skipReason: string | null;
  toneKey: ToneKey;
  greeting: string;
  emoji: string;
  signoff: string;
  reasoning: string; // plain-language, for the decision-trace / result page
}

/** Bounded tone profile from segment — 3 keys, not per-customer generation. */
function toneFor(segment: string): ToneKey {
  if (/champion|vip|loyal/.test(segment)) return "formal";
  if (/new|promising|potential|prospect/.test(segment)) return "casual";
  return "warm";
}

export function planCustomerDelivery(s: CustomerDeliverySignals): DeliveryDecision {
  const seg = (s.segment ?? "").toLowerCase();
  const first = s.firstName?.trim() || null;
  const last = s.lastName?.trim() || null;

  const toneKey = toneFor(seg);
  let greeting: string, emoji: string, signoff: string;
  if (toneKey === "formal") {
    greeting = last ? `Dear ${last},` : first ? `Dear ${first},` : "Hello,";
    emoji = "";
    signoff = "Warm regards";
  } else if (toneKey === "casual") {
    greeting = first ? `Hey ${first}!` : "Hey there!";
    emoji = "🌿";
    signoff = "Cheers";
  } else {
    greeting = first ? `Hi ${first},` : "Hi there,";
    emoji = "";
    signoff = "Warmly";
  }

  // Send-less moat: don't spend a discount on a loyal customer who just bought and
  // would buy anyway (the seed's "Champions HOLD BACK" story). Conservative on
  // purpose — only this well-justified case skips, so we never silently drop reach.
  let skip = false;
  let skipReason: string | null = null;
  if (s.hasDiscount && /champion|vip|loyal/.test(seg) && s.recencyDays != null && s.recencyDays <= 30) {
    skip = true;
    skipReason = "loyal_recent_buy_anyway";
  }

  const reasoning = skip
    ? `Held back: a recently-active ${s.segment ?? "loyal"} buyer with low predicted incremental lift from a discount they don't need (estimate — until control data backs it).`
    : `Send with ${toneKey} tone.`;

  return { skip, skipReason, toneKey, greeting, emoji, signoff, reasoning };
}
