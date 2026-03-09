import type { Channel } from "@allohq/messaging";

export type OutreachType =
  | "shipping_update"
  | "restock_alert"
  | "price_drop"
  | "repurchase_reminder";

export interface ProactiveMessageInput {
  storeId: string;
  workspaceId: string;
  customerId: string;
  outreachType: OutreachType;
  referenceId: string; // fulfillmentId, productId, etc.
  channel?: Channel; // override channel selection
  subject?: string; // email subject
  body: string; // message body (text for sms/whatsapp, html for email)
  html?: string; // email html
  metadata?: Record<string, unknown>;
}

export interface ProactiveMessageResult {
  sent: boolean;
  suppressed?: boolean;
  reason?: string;
  messageLogId?: string;
  channel?: Channel;
}
