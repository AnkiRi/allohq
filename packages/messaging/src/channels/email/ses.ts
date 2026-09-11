import { createHash, randomUUID } from "node:crypto";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import type { EmailDeliveryClass } from "../../delivery-mode";
import { htmlToPlainText } from "../../plain-text";
import type { Message, SendResult } from "../../types";
import type { EmailProvider } from "./provider";

export const sesSafeTag = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 32);

export class SesEmailProvider implements EmailProvider {
  readonly name = "ses" as const;
  constructor(private readonly client = new SESv2Client({ region: process.env["AWS_SES_REGION"] || "ap-south-1" })) {}

  async send(message: Message, deliveryClass: EmailDeliveryClass): Promise<SendResult> {
    const messageId = randomUUID();
    const from = message.from || process.env["SES_FROM_EMAIL"];
    if (!from) return { messageId, channel: "email", status: "failed", provider: "ses", error: "SES_FROM_EMAIL is not configured", retryable: false };
    if (!message.storeId) return { messageId, channel: "email", status: "failed", provider: "ses", error: "storeId is required for SES tenant isolation", retryable: false };
    const suffix = sesSafeTag(message.storeId).slice(0, 12);
    const region = process.env["AWS_SES_REGION"] || "ap-south-1";
    const account = process.env["AWS_ACCOUNT_ID"];
    const address = from.match(/<([^>]+)>/)?.[1] || from;
    const identity = address.split("@")[1];
    if (!identity || !/^\d{12}$/.test(account || "")) return { messageId, channel: "email", status: "failed", provider: "ses", error: "SES sender identity/account configuration is invalid", retryable: false };
    try {
      const response = await this.client.send(new SendEmailCommand({
        FromEmailAddress: from,
        FromEmailAddressIdentityArn: `arn:aws:ses:${region}:${account}:identity/${identity}`,
        Destination: { ToAddresses: [message.to] },
        ReplyToAddresses: message.replyTo ? [message.replyTo] : undefined,
        TenantName: `joon-${suffix}`,
        ConfigurationSetName: `joon-${message.emailStream ?? (deliveryClass === "transactional" ? "triggered" : "broadcast")}-${suffix}`,
        Content: { Simple: { Subject: { Data: message.subject || "(No Subject)", Charset: "UTF-8" }, Body: { Html: { Data: message.html || message.body || "", Charset: "UTF-8" }, Text: { Data: message.text || htmlToPlainText(message.html || message.body || ""), Charset: "UTF-8" } }, Headers: Object.entries(message.headers || {}).map(([Name, Value]) => ({ Name, Value })) } },
        EmailTags: [
          { Name: "delivery", Value: sesSafeTag(message.idempotencyKey || messageId) },
          { Name: "store", Value: sesSafeTag(message.storeId || "unknown") },
          { Name: "stream", Value: message.emailStream ?? (deliveryClass === "transactional" ? "triggered" : "broadcast") },
          ...(message.campaignId ? [{ Name: "campaign", Value: sesSafeTag(message.campaignId) }] : []),
          ...(message.automationId ? [{ Name: "automation", Value: sesSafeTag(message.automationId) }] : []),
        ],
      }));
      return { messageId, channel: "email", status: "sent", provider: "ses", externalId: response.MessageId };
    } catch (error) {
      return { messageId, channel: "email", status: "failed", provider: "ses", retryable: false, error: `SES_AMBIGUOUS: provider acceptance is unknown; do not retry automatically. ${error instanceof Error ? error.message : "Unknown SES error"}` };
    }
  }
}
