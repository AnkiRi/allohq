import { randomUUID } from "node:crypto";
import type { Message, SendResult } from "../../types";
import { getTwilioClient } from "./client";

export async function sendWhatsAppTwilio(
  message: Message
): Promise<SendResult> {
  const messageId = randomUUID();

  try {
    const client = getTwilioClient();

    const whatsappNumber = message.from || process.env.TWILIO_WHATSAPP_NUMBER;
    if (!whatsappNumber) {
      return {
        messageId,
        channel: "whatsapp",
        status: "failed",
        provider: "twilio",
        error:
          "No from number provided and TWILIO_WHATSAPP_NUMBER environment variable is not set",
      };
    }

    // Twilio WhatsApp requires "whatsapp:" prefix on both from and to numbers
    const fromFormatted = whatsappNumber.startsWith("whatsapp:")
      ? whatsappNumber
      : `whatsapp:${whatsappNumber}`;
    const toFormatted = message.to.startsWith("whatsapp:")
      ? message.to
      : `whatsapp:${message.to}`;

    const result = await client.messages.create({
      to: toFormatted,
      from: fromFormatted,
      body: message.body || "",
    });

    return {
      messageId,
      channel: "whatsapp",
      status: "sent",
      externalId: result.sid,
      provider: "twilio",
    };
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown WhatsApp sending error";
    return {
      messageId,
      channel: "whatsapp",
      status: "failed",
      provider: "twilio",
      error: errorMessage,
    };
  }
}
