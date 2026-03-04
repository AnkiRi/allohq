import { randomUUID } from "node:crypto";
import type { Message, SendResult } from "../../types";
import { getGupshupSmsConfig } from "./client";

export async function sendSmsGupshup(message: Message): Promise<SendResult> {
  const messageId = randomUUID();

  try {
    const { userid, password } = getGupshupSmsConfig();

    const params = new URLSearchParams({
      method: "SendMessage",
      send_to: message.to,
      msg: message.body || "",
      msg_type: "TEXT",
      userid,
      auth_scheme: "plain",
      password,
      v: "1.1",
      format: "text",
    });

    // India DLT compliance — required for transactional/promotional SMS in India
    if (message.dltTemplateId) {
      params.set("dltTemplateId", message.dltTemplateId);
    }

    const response = await fetch(
      `https://enterprise.smsgupshup.com/GatewayAPI/rest?${params.toString()}`
    );
    const text = await response.text();

    // Gupshup returns pipe-delimited: "success|phone|messageId" or "error|phone|message"
    const parts = text.trim().split("|");
    const resultStatus = parts[0]?.toLowerCase();

    if (resultStatus === "success") {
      return {
        messageId,
        channel: "sms",
        status: "sent",
        externalId: parts[2]?.trim(),
        provider: "gupshup",
      };
    }

    return {
      messageId,
      channel: "sms",
      status: "failed",
      provider: "gupshup",
      error: parts.slice(2).join("|").trim() || `Gupshup error: ${text}`,
    };
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown Gupshup SMS sending error";
    return {
      messageId,
      channel: "sms",
      status: "failed",
      provider: "gupshup",
      error: errorMessage,
    };
  }
}
