import { Worker, Queue } from "bullmq";
import { prisma } from "@allohq/database";
import { renderToHtml } from "@allohq/email-builder";
import type { EmailBlock, ProductData } from "@allohq/email-builder";
import { sendEmail, sendSms, sendWhatsApp, sendRcs, isValidE164, normalizePhone } from "@allohq/messaging";
import type { StoreMessagingConfig } from "@allohq/messaging";
import { redisConnection, QUEUE_NAMES } from "../config";
import { getUnsubscribeUrl } from "../utils/unsubscribe";

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
      include: { rfmScore: true, lifetimeValue: { select: { historicalLtv: true } }, orders: { take: 1, orderBy: { createdAt: "desc" } } },
    });

    if (!customer) {
      console.log(`[automation-runner] Customer ${customerId} not found, skipping`);
      return;
    }

    // Respect marketing opt-out
    if (!customer.acceptsMarketing) {
      console.log(`[automation-runner] Customer ${customerId} opted out, skipping`);
      return;
    }

    // Fetch store messaging config for per-store provider selection
    const storeForConfig = await prisma.store.findUnique({
      where: { id: automation.storeId },
      select: { messagingConfig: true },
    });
    const messagingConfig = (storeForConfig?.messagingConfig as StoreMessagingConfig | null) ?? null;

    const nodes = (automation.nodes as unknown as WorkflowNode[]) ?? [];

    for (let i = currentNodeIndex; i < nodes.length; i++) {
      const node = nodes[i]!;

      switch (node.type) {
        case "send_email": {
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

          // Fetch brand settings
          const store = await prisma.store.findUnique({ where: { id: automation.storeId } });
          const brandProfile = store ? await prisma.brandProfile.findFirst({
            where: { storeId: automation.storeId, workspaceId: automation.workspaceId },
            select: { logoPosition: true, headerBgColor: true, footerText: true, showSocialLinks: true, showAddress: true, brandName: true },
          }) : null;

          const brandSettings = store && brandProfile ? {
            logoUrl: store.storeLogoUrl ?? undefined,
            logoPosition: (brandProfile.logoPosition as "left" | "center" | "right") ?? "center",
            headerBgColor: brandProfile.headerBgColor ?? undefined,
            storeName: store.storeName ?? brandProfile.brandName,
            address: store.address ? (() => {
              const addr = store.address as { address1?: string; city?: string; province?: string; zip?: string; country?: string };
              return [addr.address1, addr.city, addr.province, addr.zip, addr.country].filter(Boolean).join(", ");
            })() : undefined,
            socialLinks: store.socialLinks ? Object.entries(store.socialLinks as Record<string, string>).filter(([, v]) => v).map(([k, v]) => ({ platform: k, url: v })) : undefined,
            footerText: brandProfile.footerText ?? undefined,
            showSocialLinks: brandProfile.showSocialLinks,
            showAddress: brandProfile.showAddress,
          } : undefined;

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
          const messageLog = await prisma.messageLog.create({
            data: {
              workspaceId: automation.workspaceId,
              storeId: automation.storeId,
              customerId: customer.id,
              channel: "email",
              to: customer.email,
              subject: template.subject,
              templateId,
              automationId,
              status: "queued",
            },
          });

          // Render email HTML
          const html = renderToHtml(blocks, {
            variables,
            products: productsMap,
            previewMode: false,
            brandSettings,
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
          });

          // Update MessageLog with result
          if (result.status === "sent") {
            await prisma.messageLog.update({
              where: { id: messageLog.id },
              data: { status: "sent", externalId: result.externalId, provider: result.provider ?? "resend", sentAt: new Date() },
            });
            console.log(`[automation-runner] Sent email to ${customer.email} (template: ${templateId})`);
          } else {
            await prisma.messageLog.update({
              where: { id: messageLog.id },
              data: { status: "failed", provider: result.provider ?? "resend", error: result.error },
            });
            console.error(`[automation-runner] Failed to send email to ${customer.email}: ${result.error}`);
          }
          break;
        }

        case "send_sms": {
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
          } else {
            await prisma.messageLog.update({
              where: { id: messageLog.id },
              data: { status: "failed", provider: smsResult.provider, error: smsResult.error },
            });
            console.error(`[automation-runner] Failed to send SMS to ${customer.phone}: ${smsResult.error}`);
          }
          break;
        }

        case "send_whatsapp": {
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
          } else {
            await prisma.messageLog.update({
              where: { id: messageLog.id },
              data: { status: "failed", provider: waResult.provider, error: waResult.error },
            });
            console.error(`[automation-runner] Failed to send WhatsApp to ${customer.phone}: ${waResult.error}`);
          }
          break;
        }

        case "send_rcs": {
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
          } else {
            await prisma.messageLog.update({
              where: { id: messageLog.id },
              data: { status: "failed", provider: rcsResult.provider, error: rcsResult.error },
            });
            console.error(`[automation-runner] Failed to send RCS to ${customer.phone}: ${rcsResult.error}`);
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
