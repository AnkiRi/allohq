import { randomUUID } from "node:crypto";
import type { Message, SendResult } from "../../types";
import { getTwilioClient } from "./client";

export async function sendRcsTwilio(message: Message): Promise<SendResult> {
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
        provider: "twilio",
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
      mediaUrl ? { ...baseParams, mediaUrl } : baseParams
    );

    return {
      messageId,
      channel: "rcs",
      status: "sent",
      externalId: result.sid,
      provider: "twilio",
    };
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown RCS sending error";
    return {
      messageId,
      channel: "rcs",
      status: "failed",
      provider: "twilio",
      error: errorMessage,
    };
  }
}
