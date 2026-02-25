import { Worker } from "bullmq";
import { prisma } from "@allohq/database";
import { renderToHtml } from "@allohq/email-builder";
import type { EmailBlock, ProductData } from "@allohq/email-builder";
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

    // Render and "send" each email
    let sentCount = 0;
    for (const customer of customers) {
      const variables: Record<string, string> = {
        first_name: customer.firstName ?? "there",
        last_name: customer.lastName ?? "",
        email: customer.email,
        unsubscribe_url: `#unsubscribe-${customer.id}`,
      };

      const html = renderToHtml(blocks, {
        variables,
        products: productsMap,
        previewMode: false,
      });

      // TODO: Wire to actual email provider (SendGrid, SES, etc.)
      // For now, log the send
      console.log(`  [SEND] To: ${customer.email} | Subject: ${campaign.template.subject} | HTML length: ${html.length}`);
      sentCount++;

      // Update progress
      if (sentCount % 50 === 0) {
        await job.updateProgress(Math.round((sentCount / customers.length) * 100));
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

    console.log(`Campaign ${campaign.name} sent to ${sentCount} recipients`);
    return { sentCount };
  },
  { connection: redisConnection }
);

sendWorker.on("completed", (job) => {
  console.log(`Send job ${job.id} completed`);
});

sendWorker.on("failed", (job, err) => {
  console.error(`Send job ${job?.id} failed:`, err.message);
});
