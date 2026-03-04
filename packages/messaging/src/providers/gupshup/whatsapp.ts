import { randomUUID } from "node:crypto";
import type { Message, SendResult } from "../../types";
import { getGupshupAppConfig } from "./client";

export async function sendWhatsAppGupshup(
  message: Message
): Promise<SendResult> {
  const messageId = randomUUID();

  try {
    const { apiKey, appName } = getGupshupAppConfig();

    const source = process.env.GUPSHUP_WHATSAPP_SOURCE;
    if (!source) {
      return {
        messageId,
        channel: "whatsapp",
        status: "failed",
        provider: "gupshup",
        error:
          "GUPSHUP_WHATSAPP_SOURCE environment variable is not set",
      };
    }

    // Strip "whatsapp:" prefix if present (Twilio convention)
    const destination = message.to.replace(/^whatsapp:/, "");

    const body = new URLSearchParams({
      channel: "whatsapp",
      source,
      destination,
      "src.name": appName,
      message: JSON.stringify({ type: "text", text: message.body || "" }),
    });

    const response = await fetch("https://api.gupshup.io/wa/api/v1/msg", {
      method: "POST",
      headers: {
        apikey: apiKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    const data = (await response.json()) as {
      status: string;
      messageId?: string;
      message?: string;
    };

    if (data.status === "submitted") {
      return {
        messageId,
        channel: "whatsapp",
        status: "sent",
        externalId: data.messageId,
        provider: "gupshup",
      };
    }

    return {
      messageId,
      channel: "whatsapp",
      status: "failed",
      provider: "gupshup",
      error: data.message || `Gupshup error: ${JSON.stringify(data)}`,
    };
  } catch (err) {
    const errorMessage =
      err instanceof Error
        ? err.message
        : "Unknown Gupshup WhatsApp sending error";
    return {
      messageId,
      channel: "whatsapp",
      status: "failed",
      provider: "gupshup",
      error: errorMessage,
    };
  }
}
