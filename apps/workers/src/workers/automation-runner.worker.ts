import { Worker, Queue } from "bullmq";
import { prisma } from "@allohq/database";
import { redisConnection, QUEUE_NAMES } from "../config";

interface AutomationTriggerJobData {
  automationId: string;
  customerId: string;
  triggeredBy: string; // event name, schedule, or segment
  currentNodeIndex?: number; // for resuming after wait
}

interface WorkflowNode {
  id: string;
  type: "send_email" | "send_sms" | "send_whatsapp" | "send_rcs" | "wait" | "condition" | "webhook";
  config: Record<string, unknown>;
}

const automationTriggerQueue = new Queue(QUEUE_NAMES.AUTOMATION_TRIGGER, { connection: redisConnection });

/**
 * Automation Runner Worker
 * Executes automation workflow nodes for a specific customer.
 * Walks the DAG: send messages, wait, evaluate conditions.
 */
export const automationRunnerWorker = new Worker<AutomationTriggerJobData>(
  QUEUE_NAMES.AUTOMATION_TRIGGER,
  async (job) => {
    const { automationId, customerId, triggeredBy, currentNodeIndex = 0 } = job.data;

    console.log(`[automation-runner] Running automation ${automationId} for customer ${customerId} from node ${currentNodeIndex}`);

    const automation = await prisma.automation.findUnique({
      where: { id: automationId },
    });

    if (!automation || automation.status !== "active") {
      console.log(`[automation-runner] Automation ${automationId} not active, skipping`);
      return;
    }

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: { rfmScore: true, orders: { take: 1, orderBy: { createdAt: "desc" } } },
    });

    if (!customer) {
      console.log(`[automation-runner] Customer ${customerId} not found, skipping`);
      return;
    }

    const nodes = (automation.nodes as unknown as WorkflowNode[]) ?? [];

    for (let i = currentNodeIndex; i < nodes.length; i++) {
      const node = nodes[i]!;

      switch (node.type) {
        case "send_email": {
          const templateId = node.config.templateId as string;
          if (!templateId) break;

          // Create a message log entry and queue the send
          await prisma.messageLog.create({
            data: {
              workspaceId: automation.workspaceId,
              storeId: automation.storeId,
              channel: "email",
              to: customer.email,
              subject: (node.config.templateName as string) ?? "Email",
              templateId,
              automationId,
              status: "queued",
            },
          });

          console.log(`[automation-runner] Queued email to ${customer.email} (template: ${templateId})`);
          break;
        }

        case "send_sms": {
          const smsTemplateId = node.config.smsTemplateId as string;
          if (!smsTemplateId || !customer.phone) break;

          const smsTemplate = await prisma.smsTemplate.findUnique({
            where: { id: smsTemplateId },
          });
          if (!smsTemplate) break;

          // Variable substitution
          let body = smsTemplate.body;
          body = body.replace(/\{\{first_name\}\}/g, customer.firstName ?? "there");
          body = body.replace(/\{\{last_name\}\}/g, customer.lastName ?? "");

          await prisma.messageLog.create({
            data: {
              workspaceId: automation.workspaceId,
              storeId: automation.storeId,
              channel: "sms",
              to: customer.phone,
              templateId: smsTemplateId,
              automationId,
              status: "queued",
              metadata: { body } as any,
            },
          });

          console.log(`[automation-runner] Queued SMS to ${customer.phone}`);
          break;
        }

        case "send_whatsapp": {
          const waTemplateId = node.config.whatsappTemplateId as string;
          if (!waTemplateId || !customer.phone) break;

          const waTemplate = await prisma.whatsAppTemplate.findUnique({
            where: { id: waTemplateId },
          });
          if (!waTemplate) break;

          let body = waTemplate.body;
          body = body.replace(/\{\{1\}\}/g, customer.firstName ?? "there");

          await prisma.messageLog.create({
            data: {
              workspaceId: automation.workspaceId,
              storeId: automation.storeId,
              channel: "whatsapp",
              to: customer.phone,
              templateId: waTemplateId,
              automationId,
              status: "queued",
              metadata: { body } as any,
            },
          });

          console.log(`[automation-runner] Queued WhatsApp to ${customer.phone}`);
          break;
        }

        case "send_rcs": {
          const rcsTemplateId = node.config.rcsTemplateId as string;
          if (!rcsTemplateId || !customer.phone) break;

          const rcsTemplate = await prisma.rcsTemplate.findUnique({
            where: { id: rcsTemplateId },
          });
          if (!rcsTemplate) break;

          let body = rcsTemplate.body;
          body = body.replace(/\{\{first_name\}\}/g, customer.firstName ?? "there");

          await prisma.messageLog.create({
            data: {
              workspaceId: automation.workspaceId,
              storeId: automation.storeId,
              channel: "rcs",
              to: customer.phone,
              templateId: rcsTemplateId,
              automationId,
              status: "queued",
              metadata: {
                body,
                cardTitle: rcsTemplate.cardTitle,
                cardImageUrl: rcsTemplate.cardImageUrl,
                actions: rcsTemplate.actions,
              } as any,
            },
          });

          console.log(`[automation-runner] Queued RCS to ${customer.phone}`);
          break;
        }

        case "wait": {
          const duration = (node.config.duration as number) ?? 1;
          const unit = (node.config.unit as string) ?? "hours";

          let delayMs: number;
          switch (unit) {
            case "minutes": delayMs = duration * 60 * 1000; break;
            case "hours": delayMs = duration * 60 * 60 * 1000; break;
            case "days": delayMs = duration * 24 * 60 * 60 * 1000; break;
            default: delayMs = duration * 60 * 60 * 1000;
          }

          // Re-queue this job with a delay to continue at the next node
          await automationTriggerQueue.add(
            "automation-continue",
            {
              automationId,
              customerId,
              triggeredBy,
              currentNodeIndex: i + 1,
            },
            { delay: delayMs }
          );

          console.log(`[automation-runner] Waiting ${duration} ${unit} before next node`);
          return; // Stop processing, will resume after delay
        }

        case "condition": {
          const condition = node.config.condition as string;
          let shouldContinue = true;

          switch (condition) {
            case "has_purchased": {
              // Check if customer has ordered since automation started
              const recentOrder = await prisma.order.findFirst({
                where: {
                  customerId,
                  createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
                },
              });
              shouldContinue = !recentOrder; // Continue if NO purchase (keep trying)
              break;
            }
            case "is_vip": {
              shouldContinue = customer.rfmScore?.segment === "Champions" || customer.rfmScore?.segment === "Loyal Customers";
              break;
            }
            default:
              // Unknown condition, continue
              shouldContinue = true;
          }

          if (!shouldContinue) {
            console.log(`[automation-runner] Condition "${condition}" not met, stopping automation for customer ${customerId}`);
            return;
          }
          break;
        }

        case "webhook":
          // TODO: Implement webhook node
          console.log(`[automation-runner] Webhook node skipped (not implemented)`);
          break;
      }
    }

    console.log(`[automation-runner] Completed automation ${automationId} for customer ${customerId}`);
  },
  {
    connection: redisConnection,
    concurrency: 5,
  }
);

automationRunnerWorker.on("completed", (job) => {
  console.log(`[automation-runner] Job ${job.id} completed`);
});

automationRunnerWorker.on("failed", (job, err) => {
  console.error(`[automation-runner] Job ${job?.id} failed:`, err.message);
});
