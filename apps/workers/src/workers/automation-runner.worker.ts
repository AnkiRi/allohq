import { Worker, Queue } from "bullmq";
import {
  prisma,
  getMarketingDeliveryPermission,
} from "@allohq/database";
import { renderBrandedEmail } from "@allohq/customer-intelligence";
import type { EmailBlock, ProductData } from "@allohq/email-builder";
import { sendEmail, sendSms, sendWhatsApp, sendRcs, isValidE164, normalizePhone } from "@allohq/messaging";
import type { StoreMessagingConfig } from "@allohq/messaging";
import { checkAllRules } from "@allohq/communication-governor";
import { redisConnection, QUEUE_NAMES } from "../config";
import { getUnsubscribeUrl } from "../utils/unsubscribe";
import { assertV1EmailAutomation } from "@allohq/release-gate";
import {
  automationActivationChecksum,
  loadAutomationActivationSnapshot,
} from "@allohq/campaign-engine";
import { assignArm, getOrCreateExperiment } from "@allohq/customer-state";

interface AutomationTriggerJobData {
  automationId: string;
  customerId: string;
  triggeredBy: string; // event name, schedule, or segment
  currentNodeIndex?: number; // for resuming after wait
  executionId?: string; // stable across wait/resume jobs for delivery idempotency
  eventInstanceId?: string; // Shopify/customer-event id for repeat-safe triggers
}

interface WorkflowNode {
  id: string;
  type: "send_email" | "send_sms" | "send_whatsapp" | "send_rcs" | "wait" | "condition" | "webhook";
  config: Record<string, unknown>;
}

const automationTriggerQueue = new Queue(QUEUE_NAMES.AUTOMATION_TRIGGER, { connection: redisConnection });
const customerStateQueue = new Queue(QUEUE_NAMES.CUSTOMER_STATE, { connection: redisConnection });

/**
 * Automation Runner Worker
 * Executes automation workflow nodes for a specific customer.
 * Walks the DAG: send messages, wait, evaluate conditions.
 */
export const automationRunnerWorker = new Worker<AutomationTriggerJobData>(
  QUEUE_NAMES.AUTOMATION_TRIGGER,
  async (job) => {
    const { automationId, customerId, triggeredBy, currentNodeIndex = 0 } = job.data;
    const executionId = job.data.executionId ?? String(job.id);

    console.log(`[automation-runner] Running automation ${automationId} for customer ${customerId} from node ${currentNodeIndex}`);

    const automation = await prisma.automation.findUnique({
      where: { id: automationId },
    });

    if (!automation || automation.status !== "active") {
      console.log(`[automation-runner] Automation ${automationId} not active, skipping`);
      return;
    }
    assertV1EmailAutomation(automation);
    const activationSnapshot = await loadAutomationActivationSnapshot(automation.id);
    const currentChecksum = activationSnapshot
      ? automationActivationChecksum(activationSnapshot)
      : null;
    if (!currentChecksum || currentChecksum !== automation.activationChecksum) {
      await prisma.automation.update({
        where: { id: automation.id },
        data: { status: "paused", activationChecksum: null, activatedAt: null },
      });
      throw new Error("Automation changed after activation and was paused for merchant review");
    }

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: { rfmScore: true, lifetimeValue: { select: { historicalLtv: true } }, orders: { take: 1, orderBy: { createdAt: "desc" } } },
    });

    if (!customer) {
      console.log(`[automation-runner] Customer ${customerId} not found, skipping`);
      return;
    }

    // Fetch store messaging config for per-store provider selection
    const storeForConfig = await prisma.store.findUnique({
      where: { id: automation.storeId },
      select: { messagingConfig: true, emailSendingPausedAt: true },
    });
    if (storeForConfig?.emailSendingPausedAt) {
      console.log(`[automation-runner] Store ${automation.storeId} email is paused, skipping`);
      return { status: "store_email_paused" };
    }
    const messagingConfig = (storeForConfig?.messagingConfig as StoreMessagingConfig | null) ?? null;

    const nodes = (automation.nodes as unknown as WorkflowNode[]) ?? [];

    // One stable holdout assignment measures the incremental effect of the
    // complete journey, not just an individual step. A control customer receives
    // no step in this automation and leaves an auditable decision row instead.
    const experiment = await getOrCreateExperiment(automation.storeId, {
      label: `automation:${automation.id}:version:${automation.activeVersion}`,
      source: "automation",
      automationId: automation.id,
      automationVersion: automation.activeVersion,
    });
    if (assignArm(experiment, customer.id) === "CONTROL") {
      const firstEmailNode = nodes.find((candidate) => candidate.type === "send_email");
      const templateId = firstEmailNode?.config.templateId as string | undefined;
      const template = templateId
        ? await prisma.emailTemplate.findUnique({ where: { id: templateId }, select: { subject: true } })
        : null;
      await prisma.messageLog.upsert({
        where: { deliveryKey: `automation:${automationId}:version:${automation.activeVersion}:execution:${executionId}:control` },
        create: {
          deliveryKey: `automation:${automationId}:version:${automation.activeVersion}:execution:${executionId}:control`,
          workspaceId: automation.workspaceId,
          storeId: automation.storeId,
          customerId: customer.id,
          channel: "email",
          to: customer.email,
          subject: template?.subject,
          templateId,
          automationId,
          status: "withheld",
          treatmentArm: "CONTROL",
          experimentId: experiment.id,
          customerStateSnap: {
            capturedAt: new Date().toISOString(),
            segment: customer.rfmScore?.segment ?? null,
            orderCount: customer.rfmScore?.orderCount ?? null,
            totalSpent: customer.rfmScore?.totalSpent ?? null,
            lastOrderAt: customer.rfmScore?.lastOrderAt?.toISOString() ?? null,
            historicalLtv: customer.lifetimeValue?.historicalLtv ?? null,
          },
          metadata: { withheld: true, reason: "control_group", triggeredBy, executionId },
        },
        update: {},
      });
      return { status: "withheld_control" };
    }

    for (let i = currentNodeIndex; i < nodes.length; i++) {
      const node = nodes[i]!;
      const logPermissionSuppression = async (
        channel: "email" | "sms" | "whatsapp" | "rcs",
        to: string,
        deliveryKey?: string,
      ) => {
        const permission = await getMarketingDeliveryPermission(
          customer.id,
          channel,
        );
        if (permission.allowed) return false;
        const data = {
            ...(deliveryKey ? { deliveryKey } : {}),
            workspaceId: automation.workspaceId,
            storeId: automation.storeId,
            customerId: customer.id,
            channel,
            to,
            automationId,
            status: "suppressed",
            error: `Contact permission: ${
              permission.reason ?? "permission_denied"
            }`,
            metadata: {
              rule: "contact_permission",
              reason: permission.reason ?? null,
              detail: permission.detail ?? null,
              nodeId: node.id,
            } as any,
          };
        if (deliveryKey) {
          await prisma.messageLog.upsert({
            where: { deliveryKey },
            create: data,
            update: { status: "suppressed", error: data.error, metadata: data.metadata },
          });
        } else {
          await prisma.messageLog.create({ data });
        }
        return true;
      };

      switch (node.type) {
        case "send_email": {
          const deliveryKey = `automation:${automationId}:version:${automation.activeVersion}:execution:${executionId}:node:${node.id}:email`;
          const existingDelivery = await prisma.messageLog.findUnique({
            where: { deliveryKey },
            select: { id: true, status: true },
          });
          if (existingDelivery && !["failed", "queued"].includes(existingDelivery.status)) {
            console.log(`[automation-runner] Delivery ${deliveryKey} already resolved, skipping`);
            break;
          }
          if (await logPermissionSuppression("email", customer.email, deliveryKey)) break;
          // Governor check before sending
          const emailGovCheck = await checkAllRules({
            customerId: customer.id,
            storeId: automation.storeId,
            channel: "email",
            messageType: "automation",
          });
          if (!emailGovCheck.allowed) {
            console.log(`[automation-runner] Suppressed email to ${customer.email}: ${emailGovCheck.reason}`);
            await prisma.messageLog.upsert({
              where: { deliveryKey },
              create: {
                deliveryKey,
                workspaceId: automation.workspaceId,
                storeId: automation.storeId,
                customerId: customer.id,
                channel: "email",
                to: customer.email,
                automationId,
                status: "suppressed",
                treatmentArm: "TREATMENT",
                experimentId: experiment.id,
                error: emailGovCheck.reason,
                metadata: { rule: emailGovCheck.rule, triggeredBy, executionId, nodeId: node.id } as any,
              },
              update: { status: "suppressed", error: emailGovCheck.reason },
            });
            break;
          }

          const templateId = node.config.templateId as string;
          if (!templateId) break;

          // Fetch the email template
          const template = await prisma.emailTemplate.findUnique({
            where: { id: templateId },
          });
          if (!template) {
            console.warn(`[automation-runner] Email template ${templateId} not found, skipping node`);
            break;
          }

          // Extract product IDs from blocks
          const blocks = template.blocks as unknown as EmailBlock[];
          const productIds: string[] = [];
          for (const block of blocks) {
            if (block.type === "product" && block.props.productId) {
              productIds.push(block.props.productId);
            }
            if (block.type === "product_grid") {
              productIds.push(...block.props.productIds);
            }
          }

          // Fetch products map
          const productsMap: Record<string, ProductData> = {};
          if (productIds.length > 0) {
            const products = await prisma.product.findMany({
              where: { id: { in: productIds } },
            });
            for (const p of products) {
              productsMap[p.id] = {
                id: p.id,
                title: p.title,
                description: p.description ?? undefined,
                imageUrl: p.imageUrl ?? undefined,
                price: p.price,
                compareAtPrice: p.compareAtPrice ?? undefined,
                handle: p.handle,
              };
            }
          }

          // Fetch store (for shopDomain) — brand styling is derived from the
          // store's BrandProfile + BrandVisualProfile inside renderBrandedEmail.
          const store = await prisma.store.findUnique({ where: { id: automation.storeId } });

          // Build variables with all merge tags
          const now = new Date();
          const variables: Record<string, string> = {
            first_name: customer.firstName ?? "there",
            last_name: customer.lastName ?? "",
            email: customer.email,
            unsubscribe_url: getUnsubscribeUrl(customer.id),
            order_count: String(customer.rfmScore?.orderCount ?? 0),
            segment: customer.rfmScore?.segment ?? "New",
            ltv: `$${(customer.lifetimeValue?.historicalLtv ?? customer.rfmScore?.totalSpent ?? 0).toFixed(2)}`,
            avg_order_value: `$${(customer.rfmScore?.avgOrderValue ?? 0).toFixed(2)}`,
            last_order_date: customer.rfmScore?.lastOrderAt
              ? customer.rfmScore.lastOrderAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
              : "N/A",
            days_since_purchase: customer.rfmScore?.lastOrderAt
              ? String(Math.floor((now.getTime() - customer.rfmScore.lastOrderAt.getTime()) / 86400000))
              : "N/A",
          };

          // Create MessageLog entry
          const messageLog = existingDelivery
            ? await prisma.messageLog.update({
                where: { id: existingDelivery.id },
                data: { status: "queued", error: null },
              })
            : await prisma.messageLog.create({ data: {
              deliveryKey,
              workspaceId: automation.workspaceId,
              storeId: automation.storeId,
              customerId: customer.id,
              channel: "email",
              to: customer.email,
              subject: template.subject,
              templateId,
              automationId,
              status: "queued",
              treatmentArm: "TREATMENT",
              experimentId: experiment.id,
              customerStateSnap: {
                capturedAt: now.toISOString(),
                segment: customer.rfmScore?.segment ?? null,
                orderCount: customer.rfmScore?.orderCount ?? null,
                totalSpent: customer.rfmScore?.totalSpent ?? null,
                lastOrderAt: customer.rfmScore?.lastOrderAt?.toISOString() ?? null,
                historicalLtv: customer.lifetimeValue?.historicalLtv ?? null,
              },
              messageFeatures: {
                channel: "email",
                messageType: "automation",
                automationCategory: automation.category,
                triggerType: automation.triggerType,
                trigger: triggeredBy,
                sendHour: now.getHours(),
                sendDayOfWeek: now.getDay(),
                subjectLineLength: template.subject.length,
                hasDiscount: /discount|off|save|%/i.test(template.subject),
                nodeIndex: i,
              },
              messageVariantId: (node.config.variantId as string | undefined) ?? templateId,
              metadata: { triggeredBy, executionId, nodeId: node.id },
            } });

          // Render email HTML — brand-styled via the store's BrandKit
          const html = await renderBrandedEmail({
            storeId: automation.storeId,
            blocks,
            subject: template.subject,
            variables,
            products: productsMap,
            previewMode: false,
            tracking: {
              utmSource: "allo",
              utmMedium: "email",
              utmCampaign: automationId,
              utmContent: messageLog.id,
              storeDomain: store?.shopDomain,
            },
          });

          // Send via Resend with List-Unsubscribe headers (RFC 2369 + RFC 8058)
          const unsubscribeUrl = variables.unsubscribe_url;
          const result = await sendEmail({
            channel: "email",
            to: customer.email,
            subject: template.subject,
            html,
            from: process.env["RESEND_FROM_EMAIL"] ?? "noreply@allohq.com",
            headers: {
              "List-Unsubscribe": `<${unsubscribeUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
            idempotencyKey: deliveryKey,
          });

          // Update MessageLog with result
          if (result.status === "sent") {
            await prisma.messageLog.update({
              where: { id: messageLog.id },
              data: { status: "sent", externalId: result.externalId, provider: result.provider ?? "resend", sentAt: new Date() },
            });
            console.log(`[automation-runner] Sent email to ${customer.email} (template: ${templateId})`);
            // Log fatigue + queue state update
            await prisma.customerFatigueLog.create({
              data: { customerId: customer.id, storeId: automation.storeId, channel: "email", messageType: "automation", automationId },
            });
            await customerStateQueue.add("email-sent", { type: "email_sent", customerId: customer.id, storeId: automation.storeId });
          } else {
            await prisma.messageLog.update({
              where: { id: messageLog.id },
              data: { status: "failed", provider: result.provider ?? "resend", error: result.error },
            });
            console.error(`[automation-runner] Failed to send email to ${customer.email}: ${result.error}`);
            return {
              status: "delivery_failed",
              channel: "email",
              error: result.error,
            };
          }
          break;
        }

        case "send_sms": {
          if (
            await logPermissionSuppression("sms", customer.phone ?? "")
          ) break;
          const smsGovCheck = await checkAllRules({
            customerId: customer.id,
            storeId: automation.storeId,
            channel: "sms",
            messageType: "automation",
          });
          if (!smsGovCheck.allowed) {
            console.log(`[automation-runner] Suppressed SMS to ${customer.phone}: ${smsGovCheck.reason}`);
            await prisma.messageLog.create({
              data: {
                workspaceId: automation.workspaceId,
                storeId: automation.storeId,
                customerId: customer.id,
                channel: "sms",
                to: customer.phone ?? "",
                automationId,
                status: "suppressed",
                error: smsGovCheck.reason,
                metadata: { rule: smsGovCheck.rule } as any,
              },
            });
            break;
          }

          const smsTemplateId = node.config.smsTemplateId as string;
          if (!smsTemplateId || !customer.phone) break;

          // Validate phone number
          const smsPhone = normalizePhone(customer.phone);
          if (!isValidE164(smsPhone)) {
            console.warn(`[automation-runner] Invalid phone for SMS: ${customer.phone} (customer ${customer.id})`);
            break;
          }

          const smsTemplate = await prisma.smsTemplate.findUnique({
            where: { id: smsTemplateId },
          });
          if (!smsTemplate) break;

          // Variable substitution (supports all merge tags)
          let body = smsTemplate.body;
          const smsVars: Record<string, string> = {
            first_name: customer.firstName ?? "there",
            last_name: customer.lastName ?? "",
            order_count: String(customer.rfmScore?.orderCount ?? 0),
            segment: customer.rfmScore?.segment ?? "New",
            ltv: `$${(customer.lifetimeValue?.historicalLtv ?? customer.rfmScore?.totalSpent ?? 0).toFixed(2)}`,
            days_since_purchase: customer.rfmScore?.lastOrderAt
              ? String(Math.floor((new Date().getTime() - customer.rfmScore.lastOrderAt.getTime()) / 86400000))
              : "N/A",
          };
          for (const [key, val] of Object.entries(smsVars)) {
            body = body.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), val);
          }

          const messageLog = await prisma.messageLog.create({
            data: {
              workspaceId: automation.workspaceId,
              storeId: automation.storeId,
              customerId: customer.id,
              channel: "sms",
              to: smsPhone,
              templateId: smsTemplateId,
              automationId,
              status: "queued",
              metadata: { body } as any,
            },
          });

          const smsResult = await sendSms({ channel: "sms", to: smsPhone, body }, messagingConfig);

          if (smsResult.status === "sent") {
            await prisma.messageLog.update({
              where: { id: messageLog.id },
              data: { status: "sent", externalId: smsResult.externalId, provider: smsResult.provider, sentAt: new Date() },
            });
            console.log(`[automation-runner] Sent SMS to ${customer.phone} via ${smsResult.provider}`);
            await prisma.customerFatigueLog.create({
              data: { customerId: customer.id, storeId: automation.storeId, channel: "sms", messageType: "automation", automationId },
            });
            await customerStateQueue.add("sms-sent", { type: "sms_sent", customerId: customer.id, storeId: automation.storeId });
          } else {
            await prisma.messageLog.update({
              where: { id: messageLog.id },
              data: { status: "failed", provider: smsResult.provider, error: smsResult.error },
            });
            console.error(`[automation-runner] Failed to send SMS to ${customer.phone}: ${smsResult.error}`);
            return {
              status: "delivery_failed",
              channel: "sms",
              error: smsResult.error,
            };
          }
          break;
        }

        case "send_whatsapp": {
          if (
            await logPermissionSuppression(
              "whatsapp",
              customer.phone ?? "",
            )
          ) break;
          const waGovCheck = await checkAllRules({
            customerId: customer.id,
            storeId: automation.storeId,
            channel: "whatsapp",
            messageType: "automation",
          });
          if (!waGovCheck.allowed) {
            console.log(`[automation-runner] Suppressed WhatsApp to ${customer.phone}: ${waGovCheck.reason}`);
            await prisma.messageLog.create({
              data: {
                workspaceId: automation.workspaceId,
                storeId: automation.storeId,
                customerId: customer.id,
                channel: "whatsapp",
                to: customer.phone ?? "",
                automationId,
                status: "suppressed",
                error: waGovCheck.reason,
                metadata: { rule: waGovCheck.rule } as any,
              },
            });
            break;
          }

          const waTemplateId = node.config.whatsappTemplateId as string;
          if (!waTemplateId || !customer.phone) break;

          const waPhone = normalizePhone(customer.phone);
          if (!isValidE164(waPhone)) {
            console.warn(`[automation-runner] Invalid phone for WhatsApp: ${customer.phone} (customer ${customer.id})`);
            break;
          }

          const waTemplate = await prisma.whatsAppTemplate.findUnique({
            where: { id: waTemplateId },
          });
          if (!waTemplate) break;

          let body = waTemplate.body;
          body = body.replace(/\{\{1\}\}/g, customer.firstName ?? "there");

          const messageLog = await prisma.messageLog.create({
            data: {
              workspaceId: automation.workspaceId,
              storeId: automation.storeId,
              customerId: customer.id,
              channel: "whatsapp",
              to: waPhone,
              templateId: waTemplateId,
              automationId,
              status: "queued",
              metadata: { body } as any,
            },
          });

          const waResult = await sendWhatsApp({ channel: "whatsapp", to: waPhone, body }, messagingConfig);

          if (waResult.status === "sent") {
            await prisma.messageLog.update({
              where: { id: messageLog.id },
              data: { status: "sent", externalId: waResult.externalId, provider: waResult.provider, sentAt: new Date() },
            });
            console.log(`[automation-runner] Sent WhatsApp to ${customer.phone} via ${waResult.provider}`);
            await prisma.customerFatigueLog.create({
              data: { customerId: customer.id, storeId: automation.storeId, channel: "whatsapp", messageType: "automation", automationId },
            });
            await customerStateQueue.add("whatsapp-sent", { type: "whatsapp_sent", customerId: customer.id, storeId: automation.storeId });
          } else {
            await prisma.messageLog.update({
              where: { id: messageLog.id },
              data: { status: "failed", provider: waResult.provider, error: waResult.error },
            });
            console.error(`[automation-runner] Failed to send WhatsApp to ${customer.phone}: ${waResult.error}`);
            return {
              status: "delivery_failed",
              channel: "whatsapp",
              error: waResult.error,
            };
          }
          break;
        }

        case "send_rcs": {
          if (
            await logPermissionSuppression("rcs", customer.phone ?? "")
          ) break;
          const rcsGovCheck = await checkAllRules({
            customerId: customer.id,
            storeId: automation.storeId,
            channel: "rcs",
            messageType: "automation",
          });
          if (!rcsGovCheck.allowed) {
            console.log(`[automation-runner] Suppressed RCS to ${customer.phone}: ${rcsGovCheck.reason}`);
            await prisma.messageLog.create({
              data: {
                workspaceId: automation.workspaceId,
                storeId: automation.storeId,
                customerId: customer.id,
                channel: "rcs",
                to: customer.phone ?? "",
                automationId,
                status: "suppressed",
                error: rcsGovCheck.reason,
                metadata: { rule: rcsGovCheck.rule } as any,
              },
            });
            break;
          }

          const rcsTemplateId = node.config.rcsTemplateId as string;
          if (!rcsTemplateId || !customer.phone) break;

          const rcsPhone = normalizePhone(customer.phone);
          if (!isValidE164(rcsPhone)) {
            console.warn(`[automation-runner] Invalid phone for RCS: ${customer.phone} (customer ${customer.id})`);
            break;
          }

          const rcsTemplate = await prisma.rcsTemplate.findUnique({
            where: { id: rcsTemplateId },
          });
          if (!rcsTemplate) break;

          let body = rcsTemplate.body;
          body = body.replace(/\{\{first_name\}\}/g, customer.firstName ?? "there");

          const messageLog = await prisma.messageLog.create({
            data: {
              workspaceId: automation.workspaceId,
              storeId: automation.storeId,
              customerId: customer.id,
              channel: "rcs",
              to: rcsPhone,
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

          const rcsResult = await sendRcs({
            channel: "rcs",
            to: rcsPhone,
            body,
            cardTitle: rcsTemplate.cardTitle ?? undefined,
            cardImageUrl: rcsTemplate.cardImageUrl ?? undefined,
            actions: rcsTemplate.actions as { type: string; label: string; value: string }[] | undefined,
          }, messagingConfig);

          if (rcsResult.status === "sent") {
            await prisma.messageLog.update({
              where: { id: messageLog.id },
              data: { status: "sent", externalId: rcsResult.externalId, provider: rcsResult.provider, sentAt: new Date() },
            });
            console.log(`[automation-runner] Sent RCS to ${customer.phone} via ${rcsResult.provider}`);
            await prisma.customerFatigueLog.create({
              data: { customerId: customer.id, storeId: automation.storeId, channel: "rcs", messageType: "automation", automationId },
            });
            await customerStateQueue.add("rcs-sent", { type: "rcs_sent", customerId: customer.id, storeId: automation.storeId });
          } else {
            await prisma.messageLog.update({
              where: { id: messageLog.id },
              data: { status: "failed", provider: rcsResult.provider, error: rcsResult.error },
            });
            console.error(`[automation-runner] Failed to send RCS to ${customer.phone}: ${rcsResult.error}`);
            return {
              status: "delivery_failed",
              channel: "rcs",
              error: rcsResult.error,
            };
          }
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
              executionId,
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
