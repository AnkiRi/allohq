import { Worker } from "bullmq";
import type { Job } from "bullmq";
import { prisma } from "@allohq/database";
import { sendEmail } from "@allohq/messaging";
import { redisConnection, QUEUE_NAMES } from "../config";

interface DailyEmailJobData {
  storeId?: string;
  type?: string;
}

/**
 * Daily Revenue Email Worker (Sprint 12.1)
 * Sends a daily summary email to each store's merchant at ~8am:
 *   - Yesterday's total revenue
 *   - AI-attributed revenue (from OrderAttribution)
 *   - Top performing campaign/automation
 *   - Customers at risk + interventions sent
 *   - Today's forecast from RevenueForecast table
 */
export const dailyRevenueEmailWorker = new Worker<DailyEmailJobData>(
  QUEUE_NAMES.DAILY_REVENUE_EMAIL,
  async (job: Job<DailyEmailJobData>) => {
    // Single store mode
    if (job.data.storeId) {
      await sendDailyEmail(job.data.storeId);
      return;
    }

    // Cron mode: all active stores
    console.log("[DailyRevenueEmail] Sending daily summaries to all stores");

    const stores = await prisma.store.findMany({
      where: { isActive: true },
      select: { id: true, shopDomain: true, storeEmail: true, storeName: true },
    });

    let sent = 0;
    let skipped = 0;

    for (const store of stores) {
      if (!store.storeEmail) {
        console.log(
          `[DailyRevenueEmail] Skipping ${store.shopDomain} — no store email`
        );
        skipped++;
        continue;
      }
      try {
        await sendDailyEmail(store.id);
        sent++;
      } catch (err) {
        console.error(
          `[DailyRevenueEmail] Error for ${store.shopDomain}:`,
          (err as Error).message
        );
      }
    }

    console.log(
      `[DailyRevenueEmail] Done: ${sent} sent, ${skipped} skipped`
    );
  },
  { connection: redisConnection }
);

// ---------------------------------------------------------------------------
// Build and send the daily email for a single store
// ---------------------------------------------------------------------------

async function sendDailyEmail(storeId: string): Promise<void> {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: {
      id: true,
      storeName: true,
      storeEmail: true,
      shopDomain: true,
      currency: true,
      workspaceId: true,
    },
  });

  if (!store || !store.storeEmail) {
    console.log(
      `[DailyRevenueEmail] Store ${storeId} has no email, skipping`
    );
    return;
  }

  const currency = store.currency ?? "INR";
  const currencySymbol = currency === "INR" ? "\u20B9" : "$";
  const merchantName = store.storeName ?? store.shopDomain;

  // Yesterday's date range
  const now = new Date();
  const startOfYesterday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 1
  );
  const endOfYesterday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );

  // 1. Yesterday's total revenue
  const revenueResult = await prisma.order.aggregate({
    where: {
      storeId,
      createdAt: { gte: startOfYesterday, lt: endOfYesterday },
    },
    _sum: { totalPrice: true },
    _count: true,
  });
  const totalRevenue = revenueResult._sum.totalPrice ?? 0;
  const orderCount = revenueResult._count;

  // 2. AI-attributed revenue (from OrderAttribution, yesterday)
  const aiAttributionResult = await prisma.orderAttribution.aggregate({
    where: {
      storeId,
      attributedAt: { gte: startOfYesterday, lt: endOfYesterday },
    },
    _sum: { revenue: true },
    _count: true,
  });
  const aiRevenue = aiAttributionResult._sum.revenue ?? 0;
  const aiPercent =
    totalRevenue > 0 ? Math.round((aiRevenue / totalRevenue) * 100) : 0;

  // 3. Top performing campaign (by attributed revenue yesterday)
  const topCampaign = await prisma.$queryRaw<
    Array<{ campaignId: string; name: string; revenue: number }>
  >`
    SELECT
      oa."campaignId",
      COALESCE(c.name, a.name, 'Direct') AS name,
      SUM(oa.revenue)::float AS revenue
    FROM order_attributions oa
    LEFT JOIN campaigns c ON c.id = oa."campaignId"
    LEFT JOIN automations a ON a.id = oa."automationId"
    WHERE oa."storeId" = ${storeId}
      AND oa."attributedAt" >= ${startOfYesterday}
      AND oa."attributedAt" < ${endOfYesterday}
    GROUP BY oa."campaignId", c.name, a.name
    ORDER BY revenue DESC
    LIMIT 1
  `;
  const topCampaignName = topCampaign[0]?.name ?? "None";
  const topCampaignRevenue = topCampaign[0]?.revenue ?? 0;

  // 4. Churn risk stats (customers at risk + interventions sent yesterday)
  const atRiskCount = await prisma.customerLifetimeValue.count({
    where: {
      storeId,
      churnProbability: { gte: 0.6 },
    },
  });

  const interventionCount = await prisma.actionQueue.count({
    where: {
      storeId,
      status: { in: ["approved", "auto_executed"] },
      createdAt: { gte: startOfYesterday, lt: endOfYesterday },
    },
  });

  // 5. Today's forecast from RevenueForecast table
  const todayStr = now.toISOString().split("T")[0]!;
  const todayForecast = await prisma.revenueForecast.findFirst({
    where: {
      storeId,
      forecastDate: new Date(todayStr),
    },
  });
  const forecastAmount = todayForecast?.predicted ?? 0;
  const forecastConfidence = todayForecast
    ? Math.round(todayForecast.confidence * 100)
    : 0;

  // 6. Build the HTML email
  const subject = `Yesterday, Allo earned you ${currencySymbol}${formatNumber(totalRevenue)}`;

  const html = buildEmailHtml({
    merchantName,
    currencySymbol,
    totalRevenue,
    orderCount,
    aiRevenue,
    aiPercent,
    topCampaignName,
    topCampaignRevenue,
    atRiskCount,
    interventionCount,
    forecastAmount,
    forecastConfidence,
  });

  // 7. Send via Resend
  const fromEmail =
    process.env.RESEND_FROM_EMAIL || "updates@allo.so";

  await sendEmail({
    channel: "email",
    to: store.storeEmail,
    from: `Allo AI <${fromEmail}>`,
    subject,
    html,
  });

  console.log(
    `[DailyRevenueEmail] Sent to ${store.storeEmail}: ${currencySymbol}${formatNumber(totalRevenue)} revenue, ${aiPercent}% AI-attributed`
  );
}

// ---------------------------------------------------------------------------
// HTML email builder
// ---------------------------------------------------------------------------

interface EmailData {
  merchantName: string;
  currencySymbol: string;
  totalRevenue: number;
  orderCount: number;
  aiRevenue: number;
  aiPercent: number;
  topCampaignName: string;
  topCampaignRevenue: number;
  atRiskCount: number;
  interventionCount: number;
  forecastAmount: number;
  forecastConfidence: number;
}

function buildEmailHtml(data: EmailData): string {
  const {
    merchantName,
    currencySymbol,
    totalRevenue,
    orderCount,
    aiRevenue,
    aiPercent,
    topCampaignName,
    topCampaignRevenue,
    atRiskCount,
    interventionCount,
    forecastAmount,
    forecastConfidence,
  } = data;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Daily Revenue Summary</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f7f7f8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f7f7f8; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 32px 40px; color: #ffffff;">
              <h1 style="margin: 0; font-size: 28px; font-weight: 700;">Daily Revenue Summary</h1>
              <p style="margin: 8px 0 0; opacity: 0.9; font-size: 15px;">Hi ${escapeHtml(merchantName)}, here's your yesterday's snapshot</p>
            </td>
          </tr>

          <!-- Big number: Total Revenue -->
          <tr>
            <td style="padding: 32px 40px 16px; text-align: center;">
              <p style="margin: 0; color: #6b7280; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Yesterday's Revenue</p>
              <p style="margin: 8px 0; font-size: 48px; font-weight: 800; color: #111827;">${currencySymbol}${formatNumber(totalRevenue)}</p>
              <p style="margin: 0; color: #6b7280; font-size: 14px;">${orderCount} order${orderCount !== 1 ? "s" : ""}</p>
            </td>
          </tr>

          <!-- Stats grid -->
          <tr>
            <td style="padding: 16px 40px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <!-- AI Revenue -->
                <tr>
                  <td style="padding: 12px 16px; background-color: #f0fdf4; border-radius: 8px; margin-bottom: 8px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="color: #15803d; font-size: 14px; font-weight: 600;">AI-Attributed Revenue</td>
                        <td align="right" style="color: #15803d; font-size: 18px; font-weight: 700;">${currencySymbol}${formatNumber(aiRevenue)} <span style="font-size: 13px; font-weight: 400;">(${aiPercent}%)</span></td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td style="height: 8px;"></td></tr>

                <!-- Top Campaign -->
                <tr>
                  <td style="padding: 12px 16px; background-color: #eff6ff; border-radius: 8px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="color: #1d4ed8; font-size: 14px; font-weight: 600;">Top Campaign</td>
                        <td align="right" style="color: #1d4ed8; font-size: 14px; font-weight: 600;">${currencySymbol}${formatNumber(topCampaignRevenue)}</td>
                      </tr>
                      <tr>
                        <td colspan="2" style="color: #3b82f6; font-size: 13px; padding-top: 4px;">${escapeHtml(topCampaignName)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td style="height: 8px;"></td></tr>

                <!-- Churn Risk -->
                <tr>
                  <td style="padding: 12px 16px; background-color: #fef3c7; border-radius: 8px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="color: #92400e; font-size: 14px; font-weight: 600;">Customers at Risk</td>
                        <td align="right" style="color: #92400e; font-size: 18px; font-weight: 700;">${atRiskCount}</td>
                      </tr>
                      <tr>
                        <td colspan="2" style="color: #b45309; font-size: 13px; padding-top: 4px;">Interventions sent yesterday: ${interventionCount}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td style="height: 8px;"></td></tr>

                <!-- Today's Forecast -->
                ${forecastAmount > 0 ? `
                <tr>
                  <td style="padding: 12px 16px; background-color: #f5f3ff; border-radius: 8px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="color: #6d28d9; font-size: 14px; font-weight: 600;">Today's Forecast</td>
                        <td align="right" style="color: #6d28d9; font-size: 18px; font-weight: 700;">${currencySymbol}${formatNumber(forecastAmount)}</td>
                      </tr>
                      <tr>
                        <td colspan="2" style="color: #7c3aed; font-size: 13px; padding-top: 4px;">Confidence: ${forecastConfidence}%</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                ` : ""}
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="margin: 0; color: #9ca3af; font-size: 13px;">Powered by Allo AI &middot; Your AI marketing copilot</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNumber(n: number): string {
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
