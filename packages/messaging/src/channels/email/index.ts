import { Resend } from "resend";
import { randomUUID } from "node:crypto";
import type { Message, SendResult } from "../../types";
import { getDeliveryModeDecision } from "../../delivery-mode";
import { isTransientProviderError, withProviderRetry } from "../../provider-retry";
import { htmlToPlainText } from "../../plain-text";

let resendClient: Resend | null = null;

function getResendClient(): Resend {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY environment variable is not set");
    }
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

export async function sendEmail(message: Message): Promise<SendResult> {
  const messageId = randomUUID();
  const delivery = getDeliveryModeDecision(message.to, "email");
  if (!delivery.allowed) {
    return {
      messageId,
      channel: "email",
      status: "failed",
      error: `Messaging ${delivery.reason} (mode: ${delivery.mode})`,
      provider: "resend",
    };
  }

  try {
    const client = getResendClient();

    const fromEmail =
      message.from || process.env.RESEND_FROM_EMAIL || "noreply@example.com";

    const payload = {
      from: fromEmail,
      to: message.to,
      subject: message.subject || "(No Subject)",
      html: message.html || message.body || "",
      text: message.text || htmlToPlainText(message.html || message.body || ""),
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
      ...(message.headers ? { headers: message.headers } : {}),
    };
    const { data } = await withProviderRetry(async () => {
      const response = await (message.idempotencyKey
        ? client.emails.send(payload, {
            idempotencyKey: message.idempotencyKey,
          })
        : client.emails.send(payload));
      if (response.error) {
        throw Object.assign(new Error(response.error.message || "Unknown Resend error"), { name: response.error.name });
      }
      return response;
    });

    return {
      messageId,
      channel: "email",
      status: "sent",
      externalId: data?.id,
      provider: "resend",
    };
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown email sending error";
    return {
      messageId,
      channel: "email",
      status: "failed",
      error: errorMessage,
      provider: "resend",
      retryable: isTransientProviderError(err),
    };
  }
}
