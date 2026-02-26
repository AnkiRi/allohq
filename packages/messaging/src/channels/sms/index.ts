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

export async function sendSms(message: Message): Promise<SendResult> {
  const messageId = randomUUID();

  try {
    const client = getTwilioClient();

    const fromNumber = message.from || process.env.TWILIO_PHONE_NUMBER;
    if (!fromNumber) {
      return {
        messageId,
        channel: "sms",
        status: "failed",
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
    };
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown SMS sending error";
    return {
      messageId,
      channel: "sms",
      status: "failed",
      error: errorMessage,
    };
  }
}
