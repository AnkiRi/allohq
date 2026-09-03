import { Worker, Queue } from "bullmq";
import {
  prisma,
  getMarketingDeliveryPermission,
} from "@allohq/database";
import { sendEmail, sendSms, sendWhatsApp, sendRcs } from "@allohq/messaging";
import type { Channel } from "@allohq/messaging";
import { renderBrandedEmail } from "@allohq/customer-intelligence";
import type { EmailBlock } from "@allohq/email-builder";
import {
  executeJourneyStep,
  getPersonalisationContext,
  personaliseContent,
} from "@allohq/journey-orchestrator";
import type { WorkflowNode, JourneyStepInput } from "@allohq/journey-orchestrator";
import { getOptimalSendTime } from "@allohq/customer-intelligence";
import { redisConnection, QUEUE_NAMES } from "../config";
import { getUnsubscribeUrl } from "../utils/unsubscribe";
import { isV1ReleaseMode } from "@allohq/release-gate";

// Time-sensitive automation categories that should not be delayed
const TIME_SENSITIVE_CATEGORIES = ["cart_recovery", "abandoned_cart", "shipping_updates"];

// Max send-time delay: 12 hours in ms
const MAX_SEND_TIME_DELAY_MS = 12 * 60 * 60 * 1000;

interface JourneyStepJobData {
  journeyId: string;
  customerId: string;
  storeId: string;
  automationId?: string;
  stepIndex: number;
  nodes: WorkflowNode[];
  sendTimeOptimized?: boolean;
}

const journeyStepQueue = new Queue(QUEUE_NAMES.JOURNEY_STEP, { connection: redisConnection });
const customerStateQueue = new Queue(QUEUE_NAMES.CUSTOMER_STATE, { connection: redisConnection });

export const journeyStepperWorker = new Worker<JourneyStepJobData>(
  QUEUE_NAMES.JOURNEY_STEP,
  async (job) => {
    // This is the legacy adaptive-channel journey engine. Merchant-approved
    // email journeys execute through automation-runner, where activation
    // checksums, holdouts and delivery idempotency are enforced.
    if (isV1ReleaseMode()) {
      console.log(`[journey-stepper] Ignoring legacy journey job ${job.id} in email v1`);
      return { status: "blocked_by_v1_boundary" };
    }
    const { journeyId, customerId, storeId, automationId, stepIndex, nodes } = job.data;

    console.log(`Journey step ${stepIndex} for journey ${journeyId}, customer ${customerId}`);

    const input: JourneyStepInput = {
      journeyId,
      customerId,
      storeId,
      automationId,
      stepIndex,
      nodes,
    };

    const result = await executeJourneyStep(input);

    if (result.suppressed) {
      console.log(`Journey ${journeyId} suppressed: ${result.reason}`);
      return { status: "suppressed", reason: result.reason };
    }

    if (!result.executed) {
      console.log(`Journey ${journeyId} step not executed: ${result.reason}`);
      return { status: "skipped", reason: result.reason };
    }

    const node = nodes[stepIndex];
    if (!node) return { status: "error", reason: "Node not found" };

    // Handle wait nodes — re-queue with delay
    if (node.type === "wait") {
      const duration = (node.config["duration"] as number) ?? 1;
      const unit = (node.config["unit"] as string) ?? "hours";
      const delayMs = computeDelay(duration, unit);

      await journeyStepQueue.add(
        `journey-step-${journeyId}-${stepIndex + 1}`,
        {
          journeyId,
          customerId,
          storeId,
          automationId,
          stepIndex: stepIndex + 1,
          nodes,
        },
        { delay: delayMs },
      );

      console.log(`Journey ${journeyId} waiting ${duration} ${unit}`);
      return { status: "waiting", delay: delayMs };
    }

    // Handle condition, silence_check, channel_select — auto-advance
    if (node.type === "condition" || node.type === "silence_check" || node.type === "channel_select") {
      if (stepIndex + 1 < nodes.length) {
        await journeyStepQueue.add(
          `journey-step-${journeyId}-${stepIndex + 1}`,
          { journeyId, customerId, storeId, automationId, stepIndex: stepIndex + 1, nodes },
        );
      }
      return { status: "advanced" };
    }

    // Handle send nodes — execute the actual send
    // Send-time optimization: check if now is a good time for this customer
    if (result.decision && !job.data.sendTimeOptimized) {
      // Determine if this automation is time-sensitive
      let isTimeSensitive = false;
      if (automationId) {
        const automation = await prisma.automation.findUnique({
          where: { id: automationId },
          select: { category: true },
        });
        if (automation?.category && TIME_SENSITIVE_CATEGORIES.includes(automation.category)) {
          isTimeSensitive = true;
        }
      }

      if (!isTimeSensitive) {
        try {
          const sendTime = await getOptimalSendTime(customerId, storeId);
          const currentHour = new Date().getUTCHours();
          const bestHours = sendTime.topHours.map((h) => h.hour);

          // Check if current hour is within the customer's optimal window (+/- 1 hour)
          const isInWindow = bestHours.some(
            (h) => Math.abs(currentHour - h) <= 1 || Math.abs(currentHour - h) >= 23,
          );

          if (!isInWindow && sendTime.confidence >= 0.3) {
            // Calculate delay to next optimal hour
            const nextBestHour = bestHours[0] ?? 10;
            let hoursUntilOptimal = nextBestHour - currentHour;
            if (hoursUntilOptimal <= 0) hoursUntilOptimal += 24;

            const delayMs = Math.min(hoursUntilOptimal * 60 * 60 * 1000, MAX_SEND_TIME_DELAY_MS);

            console.log(
              `Journey ${journeyId}: delaying send by ${hoursUntilOptimal}h for optimal send time (current=${currentHour}, optimal=${nextBestHour}, confidence=${sendTime.confidence})`,
            );

            await journeyStepQueue.add(
              `journey-step-${journeyId}-${stepIndex}-optimized`,
              {
                ...job.data,
                sendTimeOptimized: true,
              },
              { delay: delayMs },
            );

            return { status: "delayed_for_send_time", delay: delayMs, optimalHour: nextBestHour };
          }
        } catch (err: any) {
          // Non-critical: if send-time optimization fails, proceed with immediate send
          console.warn(`Send-time optimization failed for journey ${journeyId}:`, err.message);
        }
      }
    }

    if (result.decision) {
      const channel = result.decision.channel;
      const customer = await prisma.customer.findUnique({
        where: { id: customerId },
        select: { email: true, phone: true, firstName: true, lastName: true },
      });

      if (!customer) {
        console.error(`Customer ${customerId} not found`);
        return { status: "error", reason: "Customer not found" };
      }

      const context = await getPersonalisationContext(customerId, storeId);

      // Look up workspace for MessageLog
      const storeRecord = await prisma.store.findUnique({
        where: { id: storeId },
        select: { workspaceId: true },
      });
      const workspaceId = storeRecord?.workspaceId ?? storeId;
      const permission = await getMarketingDeliveryPermission(
        customerId,
        channel,
      );
      if (!permission.allowed) {
        await prisma.messageLog.create({
          data: {
            workspaceId,
            storeId,
            customerId,
            channel,
            to: channel === "email" ? customer.email : (customer.phone ?? ""),
            automationId,
            status: "suppressed",
            error: `Contact permission: ${
              permission.reason ?? "permission_denied"
            }`,
            metadata: {
              source: "journey",
              journeyId,
              rule: "contact_permission",
              reason: permission.reason ?? null,
              detail: permission.detail ?? null,
            } as any,
          },
        });
        return {
          status: "suppressed",
          reason: permission.reason ?? "permission_denied",
        };
      }

      try {
        let sendResult: { status: string; externalId?: string; provider?: string; error?: string } = { status: "sent" };

        if (channel === "email") {
          sendResult = await sendJourneyEmail(
            customer,
            node,
            context,
            storeId,
            customerId,
          );
        } else {
          const body = personaliseContent(
            (node.config["body"] as string) ?? "",
            context,
          );
          const to = customer.phone;
          if (!to) {
            console.warn(`No ${channel} contact for customer ${customerId}`);
            return { status: "skipped", reason: `No ${channel} contact` };
          }
          sendResult = await sendByChannel(channel, to, body, node);
        }

        // Create MessageLog entry for analytics visibility
        await prisma.messageLog.create({
          data: {
            workspaceId,
            storeId,
            customerId,
            channel,
            to: channel === "email" ? customer.email : (customer.phone ?? ""),
            automationId,
            status: sendResult.status === "sent" ? "sent" : "failed",
            externalId: sendResult.externalId,
            provider: sendResult.provider,
            sentAt: sendResult.status === "sent" ? new Date() : undefined,
            error: sendResult.error,
            metadata: { source: "journey", journeyId } as any,
          },
        });

        if (sendResult.status !== "sent") {
          console.error(
            `Journey ${journeyId} failed to send ${channel}: ${
              sendResult.error ?? "provider failure"
            }`,
          );
          return {
            status: "delivery_failed",
            channel,
            reason: sendResult.error ?? "provider_failure",
          };
        }

        // Log fatigue
        await prisma.customerFatigueLog.create({
          data: {
            customerId,
            storeId,
            channel,
            messageType: "automation",
            automationId,
          },
        });

        // Queue state update
        const eventType = `${channel}_sent` as const;
        await customerStateQueue.add("journey-send", {
          type: eventType,
          customerId,
          storeId,
          timestamp: new Date().toISOString(),
        });

        console.log(`Journey ${journeyId} sent ${channel} to customer ${customerId}`);
      } catch (err: any) {
        console.error(`Journey ${journeyId} send failed:`, err.message);
        return {
          status: "delivery_failed",
          channel,
          reason: err.message,
        };
      }

      // Queue next step
      if (stepIndex + 1 < nodes.length) {
        // Check if next node is a wait — if not, proceed immediately
        const nextNode = nodes[stepIndex + 1];
        if (nextNode?.type === "wait") {
          const duration = (nextNode.config["duration"] as number) ?? 1;
          const unit = (nextNode.config["unit"] as string) ?? "hours";
          const delayMs = computeDelay(duration, unit);
          await journeyStepQueue.add(
            `journey-step-${journeyId}-${stepIndex + 1}`,
            { journeyId, customerId, storeId, automationId, stepIndex: stepIndex + 1, nodes },
            { delay: delayMs },
          );
        } else {
          await journeyStepQueue.add(
            `journey-step-${journeyId}-${stepIndex + 1}`,
            { journeyId, customerId, storeId, automationId, stepIndex: stepIndex + 1, nodes },
          );
        }
      }

      return { status: "sent", channel };
    }

    return { status: "no_action" };
  },
  { connection: redisConnection },
);

journeyStepperWorker.on("completed", (job) => {
  console.log(`Journey step job ${job.id} completed`);
});

journeyStepperWorker.on("failed", (job, err) => {
  console.error(`Journey step job ${job?.id} failed:`, err.message);
});

// ---- Helpers ----

function computeDelay(duration: number, unit: string): number {
  switch (unit) {
    case "minutes": return duration * 60 * 1000;
    case "hours": return duration * 60 * 60 * 1000;
    case "days": return duration * 24 * 60 * 60 * 1000;
    default: return duration * 60 * 60 * 1000;
  }
}

async function sendJourneyEmail(
  customer: { email: string; firstName: string | null; lastName: string | null },
  node: WorkflowNode,
  context: Awaited<ReturnType<typeof getPersonalisationContext>>,
  storeId: string,
  customerId: string,
): Promise<{ status: string; externalId?: string; provider?: string; error?: string }> {
  const templateId = node.config["templateId"] as string | undefined;
  let html: string;
  let subject = personaliseContent(
    (node.config["subject"] as string) ?? "A message for you",
    context,
  );

  // Brand styling is applied automatically by renderBrandedEmail (loads the
  // store's BrandProfile + BrandVisualProfile and derives its BrandKit).

  if (templateId) {
    const template = await prisma.emailTemplate.findUnique({
      where: { id: templateId },
      select: { blocks: true, subject: true },
    });
    if (template) {
      // The step's subject (node.config.subject) is a per-send OVERRIDE; fall
      // back to the email's OWN subject when no override was set. (Previously the
      // template's subject always overwrote the override.)
      const override = (node.config["subject"] as string) || "";
      subject = personaliseContent(override || template.subject || subject, context);
      const blocks = (template.blocks ?? []) as unknown as EmailBlock[];
      html = await renderBrandedEmail({
        storeId,
        blocks,
        subject,
        variables: { first_name: context.firstName ?? "there" },
      });
    } else {
      html = personaliseContent((node.config["html"] as string) ?? "<p>Hello</p>", context);
    }
  } else {
    html = personaliseContent((node.config["html"] as string) ?? "<p>Hello</p>", context);
  }

  const unsubscribeUrl = getUnsubscribeUrl(customerId);

  return sendEmail({
    channel: "email",
    to: customer.email,
    subject,
    html,
    headers: {
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
}

async function sendByChannel(
  channel: Channel,
  to: string,
  body: string,
  _node: WorkflowNode,
): Promise<{ status: string; externalId?: string; provider?: string; error?: string }> {
  switch (channel) {
    case "sms":
      return sendSms({ channel: "sms", to, body }, null);
    case "whatsapp":
      return sendWhatsApp({ channel: "whatsapp", to, body }, null);
    case "rcs":
      return sendRcs({ channel: "rcs", to, body }, null);
    default:
      throw new Error(`Unsupported channel: ${channel}`);
  }
}
