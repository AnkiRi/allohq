import type { EmailDeliveryClass } from "../../delivery-mode";
import type { Message, SendResult } from "../../types";

export interface EmailProvider {
  readonly name: "resend" | "ses";
  send(message: Message, deliveryClass: EmailDeliveryClass): Promise<SendResult>;
}

export function selectedEmailProvider(env = process.env): "resend" | "ses" {
  return env["EMAIL_PROVIDER"] === "ses" ? "ses" : "resend";
}
