import { Worker, Queue } from "bullmq";
import { prisma } from "@allohq/database";
import { renderToHtml } from "@allohq/email-builder";
import type { EmailBlock, ProductData } from "@allohq/email-builder";
import { sendEmail } from "@allohq/messaging";
import { redisConnection, QUEUE_NAMES } from "../config";
import { getUnsubscribeUrl } from "../utils/unsubscribe";

const customerStateQueue = new Queue(QUEUE_NAMES.CUSTOMER_STATE, { connection: redisConnection });

interface SendJobData {
  campaignId: string;
}

export const sendWorker = new Worker<SendJobData>(
  QUEUE_NAMES.EMAIL_SEND,
  async (job) => {
    const { campaignId } = job.data;

    console.log(`Processing email send for campaign ${campaignId}`);

    // Fetch campaign with template and segment
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        template: true,
        segment: true,
        store: true,
      },
    });

    if (!campaign) {
      throw new Error(`Campaign ${campaignId} not found`);
    }

    // Fetch recipients based on segment
    const customerWhere: Record<string, unknown> = {
      storeId: campaign.storeId,
      acceptsMarketing: true,
    };

    if (campaign.segmentId && campaign.segment) {
      // Add segment-based filtering using RFM scores
      customerWhere["rfmScore"] = { segment: campaign.segment.name };
    }

    const customers = await prisma.customer.findMany({
      where: customerWhere,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        rfmScore: {
          select: { segment: true, totalSpent: true, orderCount: true, avgOrderValue: true, lastOrderAt: true },
        },
        lifetimeValue: { select: { historicalLtv: true } },
      },
    });

    console.log(`Found ${customers.length} recipients for campaign ${campaign.name}`);

    // Update recipient count
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { recipientCount: customers.length },
    });

    // Fetch products referenced in template blocks for rendering
    const blocks = campaign.template.blocks as unknown as EmailBlock[];
    const productIds: string[] = [];
    for (const block of blocks) {
      if (block.type === "product" && block.props.productId) {
        productIds.push(block.props.productId);
      }
      if (block.type === "product_grid") {
        productIds.push(...block.props.productIds);
      }
    }

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

    // Fetch brand settings for auto header/footer
    const brandProfile = await prisma.brandProfile.findFirst({
      where: { storeId: campaign.storeId, workspaceId: campaign.store.workspaceId },
      select: { logoPosition: true, headerBgColor: true, footerText: true, showSocialLinks: true, showAddress: true, brandName: true },
    });

    const store = campaign.store;
    const brandSettings = brandProfile ? {
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

    // Render and send each email
    let sentCount = 0;
    let failCount = 0;
    for (const customer of customers) {
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

      // Create MessageLog entry first (need its ID for UTM content)
      const messageLog = await prisma.messageLog.create({
        data: {
          workspaceId: campaign.store.workspaceId,
          storeId: campaign.storeId,
          customerId: customer.id,
          channel: "email",
          to: customer.email,
          subject: campaign.template.subject,
          templateId: campaign.templateId,
          campaignId,
          status: "queued",
        },
      });

      const html = renderToHtml(blocks, {
        variables,
        products: productsMap,
        previewMode: false,
        brandSettings,
        tracking: {
          utmSource: "allo",
          utmMedium: "email",
          utmCampaign: campaignId,
          utmContent: messageLog.id,
          storeDomain: campaign.store.shopDomain,
        },
      });

      // Send via Resend with List-Unsubscribe headers (RFC 2369 + RFC 8058)
      const unsubscribeUrl = variables.unsubscribe_url;
      const result = await sendEmail({
        channel: "email",
        to: customer.email,
        subject: campaign.template.subject,
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
          data: {
            status: "sent",
            externalId: result.externalId,
            provider: result.provider ?? "resend",
            sentAt: new Date(),
          },
        });
        sentCount++;
        // Log fatigue and queue state update
        if (customer.id) {
          await prisma.customerFatigueLog.create({
            data: {
              customerId: customer.id,
              storeId: campaign.storeId,
              channel: "email",
              messageType: "campaign",
              campaignId,
            },
          });
          await customerStateQueue.add("email-sent", {
            type: "email_sent",
            customerId: customer.id,
            storeId: campaign.storeId,
          });
        }
      } else {
        await prisma.messageLog.update({
          where: { id: messageLog.id },
          data: {
            status: "failed",
            provider: result.provider ?? "resend",
            error: result.error,
          },
        });
        failCount++;
        console.error(`  [SEND] Failed for ${customer.email}: ${result.error}`);
      }

      // Update progress
      const processed = sentCount + failCount;
      if (processed % 50 === 0) {
        await job.updateProgress(Math.round((processed / customers.length) * 100));
      }
    }

    // Mark campaign as sent
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: "sent",
        sentAt: new Date(),
        recipientCount: sentCount,
      },
    });

    console.log(`Campaign ${campaign.name} sent to ${sentCount} recipients (${failCount} failed)`);
    return { sentCount, failCount };
  },
  { connection: redisConnection }
);

sendWorker.on("completed", (job) => {
  console.log(`Send job ${job.id} completed`);
});

sendWorker.on("failed", (job, err) => {
  console.error(`Send job ${job?.id} failed:`, err.message);
});
