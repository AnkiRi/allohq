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

export async function sendRcs(message: Message): Promise<SendResult> {
  const messageId = randomUUID();

  try {
    const client = getTwilioClient();

    const rcsNumber =
      message.from ||
      process.env.TWILIO_RCS_NUMBER ||
      process.env.TWILIO_PHONE_NUMBER;
    if (!rcsNumber) {
      return {
        messageId,
        channel: "rcs",
        status: "failed",
        error:
          "No from number provided and neither TWILIO_RCS_NUMBER nor TWILIO_PHONE_NUMBER environment variable is set",
      };
    }

    // Determine body: include card title if present
    let body = message.body || "";
    if (message.cardTitle) {
      body = message.cardTitle + (message.body ? `\n\n${message.body}` : "");
    }

    // Build create options with proper typing
    const baseParams = {
      to: message.to,
      from: rcsNumber,
      body,
    };

    // RCS rich card support via Twilio Content API
    // If a card image is provided, include it as media
    const mediaUrl =
      message.cardImageUrl ? [message.cardImageUrl] : undefined;

    const result = await client.messages.create(
      mediaUrl
        ? { ...baseParams, mediaUrl }
        : baseParams
    );

    return {
      messageId,
      channel: "rcs",
      status: "sent",
      externalId: result.sid,
    };
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown RCS sending error";
    return {
      messageId,
      channel: "rcs",
      status: "failed",
      error: errorMessage,
    };
  }
}
