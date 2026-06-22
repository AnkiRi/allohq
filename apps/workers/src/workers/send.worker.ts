import { Worker, Queue } from "bullmq";
import { prisma } from "@allohq/database";
import { renderBrandedEmail, loadBrandKit } from "@allohq/customer-intelligence";
import type { EmailBlock, ProductData } from "@allohq/email-builder";
import { sendEmail } from "@allohq/messaging";
import { DEMO_STORE_ID } from "@allohq/database";
import { checkAllRules } from "@allohq/communication-governor";
import {
  learnFromResults,
  assignVariant as abAssignVariant,
  recordConversion,
  getActiveTestForStore,
} from "@allohq/campaign-engine";
import { getRecommendations, resolveProducts } from "@allohq/product-recommendations";
import { getOrCreateExperiment, assignArm } from "@allohq/customer-state";
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

    if (!campaign.template) {
      throw new Error(`Campaign ${campaignId} has no template`);
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

    // Check for active A/B tests on this store (subject_line or content)
    const activeSubjectTest = await getActiveTestForStore(campaign.storeId, "subject_line");
    console.log(`Found ${customers.length} recipients for campaign ${campaign.name}`);

    // Update recipient count
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { recipientCount: customers.length },
    });

    // Causal-data moat: get (or create) a holdout experiment for this cohort.
    // A deterministic fraction (splitRatio) of recipients is assigned to CONTROL
    // and WITHHELD (no send) so we can measure the incremental lift of sending.
    const cohortLabel = campaign.segment
      ? `campaign-segment:${campaign.segmentId}`
      : `campaign-allmarketing:${campaign.storeId}`;
    const experiment = await getOrCreateExperiment(campaign.storeId, {
      label: cohortLabel,
      source: "campaign",
      campaignId,
      segmentId: campaign.segmentId ?? null,
      segmentName: campaign.segment?.name ?? null,
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

    // Detect if any blocks need dynamic product recommendations
    const hasDynamicProducts = blocks.some(
      (b) =>
        (b.type === "product" && b.props.source && b.props.source !== "manual") ||
        (b.type === "product_grid" && b.props.source && b.props.source !== "manual"),
    );
    const maxDynamicCount = blocks.reduce((max, b) => {
      if (b.type === "product_grid" && b.props.dynamicProductCount) {
        return Math.max(max, b.props.dynamicProductCount);
      }
      return max;
    }, hasDynamicProducts ? 4 : 0);

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
    void brandSettings;

    // Derive the store's BrandKit once — every email renders in this brand's look.
    const brandKit = await loadBrandKit(campaign.storeId);

    // Render and send each email
    let sentCount = 0;
    let failCount = 0;
    let suppressedCount = 0;
    let controlCount = 0;
    for (const customer of customers) {
      // Causal-data moat: deterministic control-group assignment.
      // CONTROL ⇒ withhold the send and record a "withheld" MessageLog row so
      // the counterfactual baseline accumulates (audit trail for outcome pricing).
      const arm = assignArm(experiment, customer.id);
      if (arm === "CONTROL") {
        controlCount++;
        await prisma.messageLog.create({
          data: {
            workspaceId: campaign.store.workspaceId,
            storeId: campaign.storeId,
            customerId: customer.id,
            channel: "email",
            to: customer.email,
            subject: campaign.template.subject,
            campaignId,
            status: "withheld",
            treatmentArm: "CONTROL",
            experimentId: experiment.id,
            metadata: { withheld: true, reason: "control_group", experimentId: experiment.id },
          },
        });
        continue;
      }

      // A/B test variant assignment for subject line
      let effectiveSubject = campaign.template.subject;
      let abTestId: string | undefined;
      let abVariant: "a" | "b" | undefined;

      if (activeSubjectTest) {
        abVariant = abAssignVariant(activeSubjectTest.id, customer.id, activeSubjectTest.splitRatio);
        abTestId = activeSubjectTest.id;
        const variantData = abVariant === "a"
          ? activeSubjectTest.variantA as Record<string, unknown>
          : activeSubjectTest.variantB as Record<string, unknown>;
        if (variantData && typeof variantData["value"] === "string") {
          effectiveSubject = variantData["value"];
        }
      }

      // Governor check before sending
      const governorCheck = await checkAllRules({
        customerId: customer.id,
        storeId: campaign.storeId,
        channel: "email",
        messageType: "campaign",
        campaignId,
      });
      if (!governorCheck.allowed) {
        suppressedCount++;
        // Log suppression with correct status
        await prisma.messageLog.create({
          data: {
            workspaceId: campaign.store.workspaceId,
            storeId: campaign.storeId,
            customerId: customer.id,
            channel: "email",
            to: customer.email,
            subject: effectiveSubject,
            campaignId,
            status: "suppressed",
            treatmentArm: "TREATMENT",
            experimentId: experiment.id,
            error: `Suppressed: ${governorCheck.reason}`,
            metadata: { suppressed: true, rule: governorCheck.rule },
          },
        });
        continue;
      }

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

      // Capture ML training features at send time
      const sendTime = new Date();
      const subjectLine = campaign.template?.subject ?? "";
      const messageFeatures = {
        channel: "email",
        messageType: "campaign",
        hasDiscount: /discount|off|save|%/i.test(subjectLine),
        subjectLineLength: subjectLine.length,
        sendHour: sendTime.getHours(),
        sendDayOfWeek: sendTime.getDay(),
        segment: customer.rfmScore?.segment ?? null,
      };

      // Create MessageLog entry first (need its ID for UTM content)
      const messageLog = await prisma.messageLog.create({
        data: {
          workspaceId: campaign.store.workspaceId,
          storeId: campaign.storeId,
          customerId: customer.id,
          channel: "email",
          to: customer.email,
          subject: effectiveSubject,
          templateId: campaign.templateId,
          campaignId,
          status: "queued",
          treatmentArm: "TREATMENT",
          experimentId: experiment.id,
          messageFeatures,
          metadata: abTestId ? { abTestId, abVariant } : undefined,
        },
      });

      // Resolve dynamic product recommendations per-customer if needed
      let dynamicProducts: ProductData[] | undefined;
      if (hasDynamicProducts && maxDynamicCount > 0) {
        try {
          const recs = await getRecommendations({
            storeId: campaign.storeId,
            customerId: customer.id,
            limit: maxDynamicCount,
          });
          if (recs.length > 0) {
            const resolved = await resolveProducts(campaign.storeId, recs.map((r) => r.productId));
            dynamicProducts = resolved.map((r) => ({
              id: r.productId,
              title: r.title,
              price: r.price,
              compareAtPrice: r.compareAtPrice,
              imageUrl: r.imageUrl,
              handle: r.handle,
            }));
          }
        } catch (err: any) {
          console.warn(`[send-worker] Dynamic product resolution failed for ${customer.id}: ${err.message}`);
        }
      }

      const html = await renderBrandedEmail({
        storeId: campaign.storeId,
        brandKit,
        blocks,
        subject: effectiveSubject,
        variables,
        products: productsMap,
        dynamicProducts,
        previewMode: false,
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
      // Demo/sandbox safety: the seeded demo store NEVER hits a real provider —
      // no Resend/Twilio call, no token/credit spend, fake "sent" result.
      const result =
        campaign.store?.id === DEMO_STORE_ID
          ? ({ success: true, messageId: `demo-${messageLog.id}`, demo: true } as any)
          : await sendEmail({
              channel: "email",
              to: customer.email,
              subject: effectiveSubject,
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
        // Record A/B test "sent" event
        if (abTestId && abVariant) {
          try {
            await recordConversion(abTestId, abVariant, "sent");
          } catch (err: any) {
            console.warn(`[send-worker] A/B test recording failed: ${err.message}`);
          }
        }
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

    console.log(`Campaign ${campaign.name} sent to ${sentCount} recipients (${failCount} failed, ${suppressedCount} suppressed, ${controlCount} withheld as CONTROL via experiment ${experiment.id})`);

    // Run performance learner to close the feedback loop
    try {
      await learnFromResults(campaignId);
    } catch (err: any) {
      console.warn(`[send-worker] Performance learning failed for ${campaignId}: ${err.message}`);
    }

    return { sentCount, failCount, suppressedCount };
  },
  { connection: redisConnection }
);

sendWorker.on("completed", (job) => {
  console.log(`Send job ${job.id} completed`);
});

sendWorker.on("failed", (job, err) => {
  console.error(`Send job ${job?.id} failed:`, err.message);
});
