import { Worker, Queue } from "bullmq";
import { prisma } from "@allohq/database";
import { sendEmail, sendSms, sendWhatsApp, sendRcs } from "@allohq/messaging";
import type { Channel } from "@allohq/messaging";
import { renderToHtml } from "@allohq/email-builder";
import type { EmailBlock } from "@allohq/email-builder";
import {
  executeJourneyStep,
  getPersonalisationContext,
  personaliseContent,
} from "@allohq/journey-orchestrator";
import type { WorkflowNode, JourneyStepInput } from "@allohq/journey-orchestrator";
import { redisConnection, QUEUE_NAMES } from "../config";
import { getUnsubscribeUrl } from "../utils/unsubscribe";

interface JourneyStepJobData {
  journeyId: string;
  customerId: string;
  storeId: string;
  automationId?: string;
  stepIndex: number;
  nodes: WorkflowNode[];
}

const journeyStepQueue = new Queue(QUEUE_NAMES.JOURNEY_STEP, { connection: redisConnection });
const customerStateQueue = new Queue(QUEUE_NAMES.CUSTOMER_STATE, { connection: redisConnection });

export const journeyStepperWorker = new Worker<JourneyStepJobData>(
  QUEUE_NAMES.JOURNEY_STEP,
  async (job) => {
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

      try {
        if (channel === "email") {
          await sendJourneyEmail(
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
          await sendByChannel(channel, to, body, node);
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
  _storeId: string,
  customerId: string,
) {
  const templateId = node.config["templateId"] as string | undefined;
  let html: string;
  let subject = personaliseContent(
    (node.config["subject"] as string) ?? "A message for you",
    context,
  );

  if (templateId) {
    const template = await prisma.emailTemplate.findUnique({
      where: { id: templateId },
      select: { blocks: true, subject: true },
    });
    if (template) {
      subject = personaliseContent(template.subject ?? subject, context);
      const blocks = (template.blocks ?? []) as unknown as EmailBlock[];
      html = renderToHtml(blocks, { variables: {} });
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
) {
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
