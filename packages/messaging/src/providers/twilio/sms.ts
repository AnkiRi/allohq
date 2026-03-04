import { randomUUID } from "node:crypto";
import type { Message, SendResult } from "../../types";
import { getTwilioClient } from "./client";

export async function sendSmsTwilio(message: Message): Promise<SendResult> {
  const messageId = randomUUID();

  try {
    const client = getTwilioClient();

    const fromNumber = message.from || process.env.TWILIO_PHONE_NUMBER;
    if (!fromNumber) {
      return {
        messageId,
        channel: "sms",
        status: "failed",
        provider: "twilio",
        error:
          "No from number provided and TWILIO_PHONE_NUMBER environment variable is not set",
      };
    }

    const result = await client.messages.create({
      to: message.to,
      from: fromNumber,
      body: message.body || "",
    });

    return {
      messageId,
      channel: "sms",
      status: "sent",
      externalId: result.sid,
      provider: "twilio",
    };
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown SMS sending error";
    return {
      messageId,
      channel: "sms",
      status: "failed",
      provider: "twilio",
      error: errorMessage,
    };
  }
}
