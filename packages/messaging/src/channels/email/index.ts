import { Resend } from "resend";
import { randomUUID } from "node:crypto";
import type { Message, SendResult } from "../../types";

/** Simple retry for transient API failures */
async function withEmailRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt >= maxRetries) break;
      await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
    }
  }
  throw lastError;
}

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

  try {
    const client = getResendClient();

    const fromEmail =
      message.from || process.env.RESEND_FROM_EMAIL || "noreply@example.com";

    const { data, error } = await withEmailRetry(() =>
      client.emails.send({
        from: fromEmail,
        to: message.to,
        subject: message.subject || "(No Subject)",
        html: message.html || message.body || "",
        ...(message.replyTo ? { replyTo: message.replyTo } : {}),
        ...(message.headers ? { headers: message.headers } : {}),
      })
    );

    if (error) {
      return {
        messageId,
        channel: "email",
        status: "failed",
        error: error.message || "Unknown Resend error",
      };
    }

    return {
      messageId,
      channel: "email",
      status: "sent",
      externalId: data?.id,
    };
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown email sending error";
    return {
      messageId,
      channel: "email",
      status: "failed",
      error: errorMessage,
    };
  }
}
