/** Supported messaging channels */
export type Channel = "email" | "sms" | "whatsapp" | "rcs";

/** A message to be sent through a channel */
export interface Message {
  id: string;
  channel: Channel;
  to: string;
  subject?: string;
  body: string;
  metadata: Record<string, string>;
}

/** Result of a send operation */
export interface SendResult {
  messageId: string;
  channel: Channel;
  status: MessageStatus;
  externalId?: string;
  error?: string;
}

/** Status of a message */
export type MessageStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "opened"
  | "clicked"
  | "bounced"
  | "failed";
