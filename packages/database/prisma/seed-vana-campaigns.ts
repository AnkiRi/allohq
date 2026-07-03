/**
 * Canonical Vana demo campaigns — conform to the attribution/causal-lift model.
 *
 * Each "sent" campaign is a CLOSED holdout experiment: an eligible cohort split
 * into TREATMENT (got the email) and CONTROL (held out), every member OBSERVED
 * (buyers → outcome "purchased" + revenue; non-buyers → "ignored" + $0), with
 * real Order rows for buyers + OrderAttribution for treatment buyers. The lift
 * the Outcomes screen shows is then computed by analytics.controlLift straight
 * off this data (treatment per-customer mean − control per-customer mean).
 *
 * Idempotent + stable-keyed (deterministic ids) so re-running never duplicates
 * and a future cleanup can target these EXACT ids — never a name substring.
 * Additive + prod-safe: only touches its own seeded rows.
 *
 * Run: pnpm --filter @allohq/database exec tsx prisma/seed-vana-campaigns.ts
 */
import "dotenv/config";
import { prisma, DEMO_STORE_DOMAIN } from "../src/index";

const MARGIN = 0.6;
const ATTRIB_WINDOW = 7;

type CampaignSpec = {
  key: string;
  name: string;
  subject: string;
  daysAgo: number;
  cohortStart: number; // slice of customers (distinct per campaign)
  cohortSize: number;
  holdoutPct: number;
  controlConv: number; // baseline conversion (control)
  treatmentConv: number; // lifted conversion (treatment)
  aov: number; // ₹ average order value (same both arms → lift is pure conversion)
};

// Numbers chosen so lift is positive + driven by CONVERSION (same AOV both arms),
// holdouts ≥30 (gate-eligible), and figures reconcile with Vana's scale.
const SENT: CampaignSpec[] = [
  { key: "diwali-winback", name: "Diwali Win-Back", subject: "We saved your favourites for Diwali 🪔", daysAgo: 24, cohortStart: 0, cohortSize: 620, holdoutPct: 0.15, controlConv: 0.10, treatmentConv: 0.135, aov: 1300 },
  { key: "champions-vip", name: "Champions VIP Reward", subject: "A private thank-you from Vana", daysAgo: 16, cohortStart: 700, cohortSize: 360, holdoutPct: 0.15, controlConv: 0.18, treatmentConv: 0.235, aov: 2100 },
];

async function main() {
  const store = await prisma.store.findFirst({ where: { shopDomain: DEMO_STORE_DOMAIN } });
  if (!store) throw new Error("Vana demo store not found");
  const { id: storeId, workspaceId } = store;

  // Pull a stable, ordered slice of customers to assign to cohorts.
  const customers = await prisma.customer.findMany({
    where: { storeId },
    select: {
      id: true, email: true,
      rfmScore: { select: { segment: true, totalSpent: true, orderCount: true, avgOrderValue: true, lastOrderAt: true, recency: true, frequency: true, monetary: true, totalScore: true } },
      lifetimeValue: { select: { historicalLtv: true, predictedLtv: true, churnProbability: true } },
    },
    orderBy: { id: "asc" },
    take: 1100,
  });

  for (const spec of SENT) {
    const campaignId = `vana-seed-cmp-${spec.key}`;
    const experimentId = `vana-seed-exp-${spec.key}`;

    // --- idempotency: clear THIS campaign's prior seeded rows by EXACT keys ---
    await prisma.orderAttribution.deleteMany({ where: { campaignId } });
    await prisma.messageLog.deleteMany({ where: { campaignId } });
    await prisma.order.deleteMany({ where: { storeId, externalId: { startsWith: `seed-${spec.key}-ord-` } } });
    await prisma.campaign.deleteMany({ where: { id: campaignId } });
    await prisma.experiment.deleteMany({ where: { id: experimentId } });

    const cohort = customers.slice(spec.cohortStart, spec.cohortStart + spec.cohortSize);
    const controlN = Math.round(cohort.length * spec.holdoutPct);
    const control = cohort.slice(0, controlN);
    const treatment = cohort.slice(controlN);
    const controlBuyers = Math.round(control.length * spec.controlConv);
    const treatmentBuyers = Math.round(treatment.length * spec.treatmentConv);

    const sentAt = new Date(Date.now() - spec.daysAgo * 86400000);

    await prisma.campaign.create({
      data: {
        id: campaignId, workspaceId, storeId, name: spec.name,
        status: "sent", sentAt, recipientCount: treatment.length,
        openCount: Math.round(treatment.length * 0.42), clickCount: Math.round(treatment.length * 0.11),
      },
    });
    await prisma.experiment.create({
      data: {
        id: experimentId, storeId,
        cohortDefinition: { label: spec.name, campaignId } as object,
        splitRatio: spec.holdoutPct, assignmentSeed: experimentId,
        status: "closed", startAt: sentAt, endAt: new Date(sentAt.getTime() + ATTRIB_WINDOW * 86400000),
      },
    });

    // --- message logs (every member OBSERVED) + orders for buyers ---
    const mlRows: any[] = [];
    const orderRows: any[] = [];
    const attribRows: any[] = [];

    const build = (arm: "CONTROL" | "TREATMENT", list: any[], buyers: number) => {
      list.forEach((c, i) => {
        const isBuyer = i < buyers;
        const mlId = `seed-${spec.key}-ml-${arm}-${i}`;
        // Same feature-snapshot shape the send worker writes at send time.
        const rfm = c.rfmScore; const ltv = c.lifetimeValue;
        const stateSnap = {
          capturedAt: sentAt.toISOString(),
          segment: rfm?.segment ?? null,
          rfm: rfm ? { recency: rfm.recency, frequency: rfm.frequency, monetary: rfm.monetary, totalScore: rfm.totalScore } : null,
          totalSpent: rfm?.totalSpent ?? null,
          orderCount: rfm?.orderCount ?? null,
          avgOrderValue: rfm?.avgOrderValue ?? null,
          lastOrderAt: rfm?.lastOrderAt ? rfm.lastOrderAt.toISOString() : null,
          historicalLtv: ltv?.historicalLtv ?? null,
          predictedLtv: ltv?.predictedLtv ?? null,
          churnProbability: ltv?.churnProbability ?? null,
        };
        mlRows.push({
          id: mlId, workspaceId, storeId, customerId: c.id, channel: "email",
          to: c.email, subject: spec.subject, campaignId, experimentId,
          status: arm === "CONTROL" ? "withheld" : "sent",
          treatmentArm: arm, sentAt: arm === "CONTROL" ? null : sentAt, createdAt: sentAt,
          customerStateSnap: stateSnap,
          outcome: isBuyer ? "purchased" : "ignored",
          outcomeRevenue: isBuyer ? spec.aov : 0,
          outcomeMargin: isBuyer ? spec.aov * MARGIN : 0,
          outcomeTimestamp: new Date(sentAt.getTime() + 2 * 86400000),
        });
        if (isBuyer) {
          const orderId = `seed-${spec.key}-ord-${arm}-${i}`;
          orderRows.push({
            id: orderId, storeId, customerId: c.id,
            externalId: `seed-${spec.key}-ord-${arm}-${i}`,
            orderNumber: `${spec.key.toUpperCase()}-${arm[0]}${i}`,
            totalPrice: spec.aov, subtotal: spec.aov, tax: 0, shipping: 0,
            status: "paid",
            createdAt: new Date(sentAt.getTime() + 2 * 86400000),
          });
          // Only TREATMENT buyers are ATTRIBUTED to the message (control got nothing).
          if (arm === "TREATMENT") {
            attribRows.push({
              orderId, customerId: c.id, storeId, messageLogId: mlId, campaignId,
              channel: "email", revenue: spec.aov, touchType: "click", windowDays: ATTRIB_WINDOW,
            });
          }
        }
      });
    };
    build("CONTROL", control, controlBuyers);
    build("TREATMENT", treatment, treatmentBuyers);

    await prisma.messageLog.createMany({ data: mlRows });
    await prisma.order.createMany({ data: orderRows });
    await prisma.orderAttribution.createMany({ data: attribRows });

    const controlMean = (controlBuyers * spec.aov) / control.length;
    const treatmentMean = (treatmentBuyers * spec.aov) / treatment.length;
    const lift = treatmentMean - controlMean;
    console.log(
      `${spec.name}: control ${control.length} (${controlBuyers} buyers, ₹${controlMean.toFixed(0)}/cust) | ` +
      `treatment ${treatment.length} (${treatmentBuyers} buyers, ₹${treatmentMean.toFixed(0)}/cust) | ` +
      `lift ₹${lift.toFixed(0)}/cust (${((lift / controlMean) * 100).toFixed(1)}%) | incremental ₹${(lift * treatment.length).toFixed(0)}`,
    );
  }
  console.log("✓ seeded canonical Vana campaigns (idempotent)");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
