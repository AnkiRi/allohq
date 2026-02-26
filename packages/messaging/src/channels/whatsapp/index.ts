import twilio from "twilio";
import { randomUUID } from "node:crypto";
import type { Message, SendResult } from "../../types";

let twilioClient: ReturnType<typeof twilio> | null = null;

function getTwilioClient(): ReturnType<typeof twilio> {
  if (!twilioClient) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) {
      throw new Error(
        "TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables must be set"
      );
    }
    twilioClient = twilio(accountSid, authToken);
  }
  return twilioClient;
}

export async function sendWhatsApp(message: Message): Promise<SendResult> {
  const messageId = randomUUID();

  try {
    const client = getTwilioClient();

    const whatsappNumber = message.from || process.env.TWILIO_WHATSAPP_NUMBER;
    if (!whatsappNumber) {
      return {
        messageId,
        channel: "whatsapp",
        status: "failed",
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
    };
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown WhatsApp sending error";
    return {
      messageId,
      channel: "whatsapp",
      status: "failed",
      error: errorMessage,
    };
  }
}
