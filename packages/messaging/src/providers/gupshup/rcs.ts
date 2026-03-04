import { randomUUID } from "node:crypto";
import type { Message, SendResult } from "../../types";
import { getGupshupAppConfig } from "./client";

export async function sendRcsGupshup(message: Message): Promise<SendResult> {
  const messageId = randomUUID();

  try {
    const { apiKey, appName } = getGupshupAppConfig();

    const source = process.env.GUPSHUP_RCS_SOURCE;
    if (!source) {
      return {
        messageId,
        channel: "rcs",
        status: "failed",
        provider: "gupshup",
        error: "GUPSHUP_RCS_SOURCE environment variable is not set",
      };
    }

    // Build message payload — rich card if card fields present, text otherwise
    let msgPayload: Record<string, unknown>;

    if (message.cardTitle || message.cardImageUrl) {
      msgPayload = {
        type: "richcard",
        title: message.cardTitle || "",
        description: message.body || "",
        ...(message.cardImageUrl ? { imageUrl: message.cardImageUrl } : {}),
        ...(message.actions
          ? {
              suggestions: message.actions.map((a) => ({
                type: a.type,
                text: a.label,
                postbackData: a.value,
              })),
            }
          : {}),
      };
    } else {
      msgPayload = { type: "text", text: message.body || "" };
    }

    const body = new URLSearchParams({
      channel: "rcs",
      source,
      destination: message.to,
      "src.name": appName,
      message: JSON.stringify(msgPayload),
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
        channel: "rcs",
        status: "sent",
        externalId: data.messageId,
        provider: "gupshup",
      };
    }

    return {
      messageId,
      channel: "rcs",
      status: "failed",
      provider: "gupshup",
      error: data.message || `Gupshup error: ${JSON.stringify(data)}`,
    };
  } catch (err) {
    const errorMessage =
      err instanceof Error
        ? err.message
        : "Unknown Gupshup RCS sending error";
    return {
      messageId,
      channel: "rcs",
      status: "failed",
      provider: "gupshup",
      error: errorMessage,
    };
  }
}
