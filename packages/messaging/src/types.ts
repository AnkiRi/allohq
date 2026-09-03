// ── Types ──────────────────────────────────────────────────────────────────

export type Channel = "email" | "sms" | "whatsapp" | "rcs";

export type Provider = "twilio" | "gupshup" | "resend" | "demo";

export type MessagingChannel = "sms" | "whatsapp" | "rcs";

export interface SendResult {
  messageId: string;
  channel: Channel;
  status: "sent" | "failed";
  externalId?: string;
  error?: string;
  provider?: Provider;
  /** Whether a queue retry can plausibly succeed without changing the message. */
  retryable?: boolean;
}

export type ProviderSendFn = (message: Message) => Promise<SendResult>;

export interface Message {
  channel: Channel;
  to: string;
  subject?: string; // email only
  html?: string; // email only
  body?: string; // sms/whatsapp/rcs
  from?: string;
  replyTo?: string;
  // Email headers (e.g., List-Unsubscribe)
  headers?: Record<string, string>;
  // Stable identifier for provider-side exactly-once protection.
  idempotencyKey?: string;
  // RCS specific
  cardTitle?: string;
  cardImageUrl?: string;
  actions?: { type: string; label: string; value: string }[];
  // India DLT compliance (Gupshup SMS)
  dltTemplateId?: string;
}
