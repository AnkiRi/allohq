// Human-findable display names for the template library.
//
// Templates are often saved with automation-coupled, machine-style names
// ("cross_sell_collection_sms", "welcome_series_allo_test_5"). The library should
// read as reusable CONTENT — by PURPOSE + CHANNEL ("Win-back — email", "Cart
// reminder — SMS") — not by the automation that spawned them. These helpers derive
// a clean display name + purpose from the raw name WITHOUT a schema migration; the
// internal name/id is untouched.

const PURPOSE_RULES: [RegExp, string][] = [
  [/win[-_ ]?back|lapsed|re[-_ ]?engage|reactivat|churn/i, "Win-back"],
  [/welcome|onboard/i, "Welcome"],
  [/cart|abandon|checkout/i, "Cart reminder"],
  [/back[-_ ]?in[-_ ]?stock|restock/i, "Back in stock"],
  [/cross[-_ ]?sell/i, "Cross-sell"],
  [/up[-_ ]?sell/i, "Upsell"],
  [/replenish|reorder|refill|subscri/i, "Replenishment"],
  [/post[-_ ]?purchase|order[-_ ]?follow|thank[-_ ]?you|thanks/i, "Post-purchase"],
  [/review|feedback|rating/i, "Review request"],
  [/birthday|anniversar/i, "Birthday"],
  [/launch|new[-_ ]?(product|arrival|collection)|drop/i, "New launch"],
  [/vip|loyal|reward/i, "VIP / loyalty"],
  [/browse/i, "Browse reminder"],
  [/sale|promo|discount|offer|deal/i, "Promotion"],
];

export type TemplateChannel = "email" | "sms" | "whatsapp" | "rcs";

const CHANNEL_LABEL: Record<string, string> = {
  email: "email",
  sms: "SMS",
  whatsapp: "WhatsApp",
  rcs: "RCS",
};

/** Strip channel/store/test suffixes and title-case what's left, as a fallback. */
function titleCaseFallback(name: string): string {
  const cleaned = name
    .replace(/[_-]?joon[_-]?test[_-]?\d+$/i, "")
    .replace(/[_-]?(sms|email|whatsapp|wa|rcs)$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
  return cleaned || "Email";
}

/** The reusable PURPOSE of a template ("Win-back", "Cart reminder", …). */
export function templatePurpose(name: string): string {
  return PURPOSE_RULES.find(([re]) => re.test(name))?.[1] ?? titleCaseFallback(name);
}

/** Clean, findable display name: "Win-back — email". */
export function templateDisplayName(name: string, channel: string = "email"): string {
  const ch = CHANNEL_LABEL[channel] ?? channel;
  return `${templatePurpose(name)} — ${ch}`;
}

/** The distinct purposes present in a set of templates, for a filter UI. */
export function distinctPurposes(names: string[]): string[] {
  return Array.from(new Set(names.map((n) => templatePurpose(n)))).sort();
}
