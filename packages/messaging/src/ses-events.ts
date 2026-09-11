export type SesEventKind = "send" | "delivery" | "delay" | "bounce" | "complaint" | "open" | "click" | "reject" | "rendering_failure";
export interface NormalizedSesEvent { eventId: string; kind: SesEventKind; messageId: string; deliveryTag?: string; occurredAt: Date; permanent?: boolean }

const kinds: Record<string, SesEventKind> = { Send: "send", Delivery: "delivery", DeliveryDelay: "delay", Bounce: "bounce", Complaint: "complaint", Open: "open", Click: "click", Reject: "reject", RenderingFailure: "rendering_failure" };

import { createHash } from "node:crypto";
export function normalizeSesEvent(value: unknown): NormalizedSesEvent {
  if (!value || typeof value !== "object") throw new Error("Invalid SES event");
  const event = value as Record<string, any>;
  const kind = kinds[String(event.eventType)];
  const mail = event.mail as Record<string, any> | undefined;
  if (!kind || !mail?.messageId || !mail?.timestamp) throw new Error("Unsupported SES event");
  const tags = mail.tags as Record<string, string[]> | undefined;
  const canonical = JSON.stringify({ messageId: mail.messageId, eventType: event.eventType, timestamp: mail.timestamp, feedbackId: event.bounce?.feedbackId || event.complaint?.feedbackId || null });
  return { eventId: String(event.eventId || createHash("sha256").update(canonical).digest("hex")), kind, messageId: String(mail.messageId), deliveryTag: tags?.delivery?.[0], occurredAt: new Date(String(mail.timestamp)), permanent: kind === "bounce" ? event.bounce?.bounceType === "Permanent" : undefined };
}

export function parseSnsWrappedSesEvent(body: string, expectedTopicArn = process.env["SES_EVENT_TOPIC_ARN"]): NormalizedSesEvent {
  const envelope = JSON.parse(body) as { Message?: string; TopicArn?: string; Type?: string };
  if (expectedTopicArn && envelope.TopicArn !== expectedTopicArn) throw new Error("Unexpected SNS TopicArn");
  if (envelope.Type && envelope.Type !== "Notification") throw new Error("Unsupported SNS envelope type");
  return normalizeSesEvent(JSON.parse(envelope.Message || body));
}
