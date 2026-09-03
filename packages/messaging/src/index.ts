import { randomUUID } from "node:crypto";
import type { Message, SendResult } from "./types";
import { sendEmail } from "./channels/email";
import { sendSms } from "./channels/sms";
import { sendWhatsApp } from "./channels/whatsapp";
import { sendRcs } from "./channels/rcs";

// ── Re-export types ────────────────────────────────────────────────────────

export type {
  Channel,
  Message,
  MessagingChannel,
  Provider,
  ProviderSendFn,
  SendResult,
} from "./types";
export { getProvider, sendViaProvider } from "./provider";
export type { StoreMessagingConfig } from "./provider";
export {
  createUnsubscribeToken,
  verifyUnsubscribeToken,
  getUnsubscribeUrl,
} from "./unsubscribe";
export type { UnsubscribeChannel } from "./unsubscribe";
export { createSenderDomain, getSenderDomain, requestSenderDomainVerification } from "./sender-domains";
export {
  getDeliveryModeDecision,
  getMessagingSendMode,
} from "./delivery-mode";
export type {
  DeliveryModeDecision,
  MessagingSendMode,
} from "./delivery-mode";

// ── Unified send function ──────────────────────────────────────────────────

export async function send(message: Message): Promise<SendResult> {
  switch (message.channel) {
    case "email":
      return sendEmail(message);
    case "sms":
      return sendSms(message);
    case "whatsapp":
      return sendWhatsApp(message);
    case "rcs":
      return sendRcs(message);
    default: {
      const exhaustive: never = message.channel;
      return {
        messageId: randomUUID(),
        channel: exhaustive,
        status: "failed",
        error: `Unsupported channel: ${exhaustive}`,
      };
    }
  }
}

// ── Re-export channel functions ────────────────────────────────────────────

export { sendEmail } from "./channels/email";
export { sendSms } from "./channels/sms";
export { sendWhatsApp } from "./channels/whatsapp";
export { sendRcs } from "./channels/rcs";

// ── Validation utilities ──────────────────────────────────────────────────

export { isValidE164, normalizePhone, isValidEmail } from "./validation";
