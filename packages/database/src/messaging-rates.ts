// Per-message provider send cost (₹), by channel. Estimates for Indian D2C senders — tune to
// the real provider contract per brand later. Drives brand-level messaging P&L in the cost
// console, alongside inference (token) cost. Lives in @allohq/database so the send worker, the
// seed, and the API all read one source of truth.
export const MESSAGING_RATES_INR: Record<string, number> = {
  email: 0.1, // transactional/marketing email (Resend / SES tier)
  sms: 0.25, // Indian A2P SMS
  whatsapp: 0.35, // WhatsApp business conversation
  rcs: 0.2,
};

/** Per-message send cost in ₹ for a channel (falls back to email rate for unknown channels). */
export function messagingCostFor(channel: string): number {
  return MESSAGING_RATES_INR[channel] ?? MESSAGING_RATES_INR.email ?? 0.1;
}
