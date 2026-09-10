import { providerEmailCostMinor } from "@allohq/pricing";

// Per-message provider send cost (₹), by channel. Email derives from the versioned pricing
// configuration; the other channels remain estimates until their provider contracts are set.
export const MESSAGING_RATES_INR: Record<string, number> = {
  email: providerEmailCostMinor("INR") / 100 / 1_000,
  sms: 0.25, // Indian A2P SMS
  whatsapp: 0.35, // WhatsApp business conversation
  rcs: 0.2,
};

/** Per-message send cost in ₹ for a channel (falls back to email rate for unknown channels). */
export function messagingCostFor(channel: string): number {
  return MESSAGING_RATES_INR[channel] ?? MESSAGING_RATES_INR.email ?? 0;
}
