import { Worker } from "bullmq";
import { prisma } from "@allohq/database";
import { renderToHtml } from "@allohq/email-builder";
import type { EmailBlock, ProductData } from "@allohq/email-builder";
import { sendEmail } from "@allohq/messaging";
import { redisConnection, QUEUE_NAMES } from "../config";

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
        rfmScore: { select: { segment: true, totalSpent: true } },
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
      const variables: Record<string, string> = {
        first_name: customer.firstName ?? "there",
        last_name: customer.lastName ?? "",
        email: customer.email,
        unsubscribe_url: `#unsubscribe-${customer.id}`,
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

      // Send via Resend
      const result = await sendEmail({
        channel: "email",
        to: customer.email,
        subject: campaign.template.subject,
        html,
        from: process.env["RESEND_FROM_EMAIL"] ?? "noreply@allohq.com",
      });

      // Update MessageLog with result
      if (result.status === "sent") {
        await prisma.messageLog.update({
          where: { id: messageLog.id },
          data: {
            status: "sent",
            externalId: result.externalId,
            sentAt: new Date(),
          },
        });
        sentCount++;
      } else {
        await prisma.messageLog.update({
          where: { id: messageLog.id },
          data: {
            status: "failed",
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
