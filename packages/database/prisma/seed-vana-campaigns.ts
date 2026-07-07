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
import { prisma, DEMO_STORE_DOMAIN, messagingCostFor } from "../src/index";

const MARGIN = 0.6;
const ATTRIB_WINDOW = 7;

type CampaignSpec = {
  key: string;
  name: string;
  subject: string;
  daysAgo: number;
  frac: number; // share of the real customer population this cohort takes (sequential, non-overlapping)
  holdoutPct: number;
  controlConv: number; // baseline conversion (control)
  treatmentConv: number; // lifted conversion (treatment)
  aov: number; // ₹ average order value (same both arms → lift is pure conversion)
  intent: string; // what allo proposed (for the decision trace)
  segmentName: string;
  discountPercent: number;
};

// GROWTH-INTELLIGENCE demo dataset (all SYNTHETIC/seed, honestly labelled). The story the real
// controlLift machinery then reads off this data: CONCENTRATED lift — allo sends where a holdout
// PROVES incremental lift and holds back where it doesn't (loyalists who'd have bought anyway).
//   • two RESPONSIVE segments (win-back / at-risk): treatment ≫ control → statistically SIGNIFICANT
//     lift → allo SENDS.
//   • one LOYALIST "buy-anyway" segment (Champions, high baseline): treatment ≈ control → ~₹0
//     measured lift, NOT significant → allo recommends HOLDING BACK (protect the channel, no
//     wasted sends). The ~0 lift is genuine (real Welch test on these rows), not a fabricated
//     "insight" — that honesty is the whole point.
// Cohorts are taken as FRACTIONS of the real population so the seed adapts to Vana's actual count;
// holdouts stay ≥30 per arm so the significance test is meaningful.
const SENT: CampaignSpec[] = [
  { key: "diwali-winback", name: "Diwali Win-Back", subject: "We saved your favourites for Diwali 🪔", daysAgo: 24, frac: 0.38, holdoutPct: 0.25, controlConv: 0.08, treatmentConv: 0.19, aov: 1300, intent: "win_back", segmentName: "Lapsed Champions", discountPercent: 15 },
  { key: "atrisk-reactivate", name: "At-Risk Reactivation", subject: "It's been a while — a little something inside", daysAgo: 12, frac: 0.34, holdoutPct: 0.25, controlConv: 0.06, treatmentConv: 0.16, aov: 1150, intent: "win_back", segmentName: "At Risk", discountPercent: 12 },
  // The loyalist "buy-anyway" case: high control conversion (they buy without a nudge), treatment
  // barely above it → measured lift ≈ ₹0, CI straddles 0 → allo holds this segment back.
  { key: "champions-vip", name: "Champions VIP Reward", subject: "A private thank-you from Vana", daysAgo: 16, frac: 0.28, holdoutPct: 0.25, controlConv: 0.30, treatmentConv: 0.305, aov: 2100, intent: "vip_reward", segmentName: "Champions", discountPercent: 10 },
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
    take: 2000,
  });

  // Sequential, non-overlapping cohorts sized as a fraction of the REAL population,
  // so the seed adapts to Vana's actual customer count (no fixed offsets to run past).
  let cursor = 0;

  for (const spec of SENT) {
    const campaignId = `vana-seed-cmp-${spec.key}`;
    const experimentId = `vana-seed-exp-${spec.key}`;

    // --- idempotency: clear THIS campaign's prior seeded rows by EXACT keys ---
    await prisma.orderAttribution.deleteMany({ where: { campaignId } });
    await prisma.messageLog.deleteMany({ where: { campaignId } });
    await prisma.order.deleteMany({ where: { storeId, externalId: { startsWith: `seed-${spec.key}-ord-` } } });
    await prisma.campaign.deleteMany({ where: { id: campaignId } });
    await prisma.experiment.deleteMany({ where: { id: experimentId } });

    const cohortSize = Math.floor(customers.length * spec.frac);
    const cohort = customers.slice(cursor, cursor + cohortSize);
    cursor += cohortSize;
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
        // What allo PROPOSED — powers the in-product decision trace ("How allo decided").
        agentProposal: {
          proposedAt: sentAt.toISOString(),
          intent: spec.intent, segmentName: spec.segmentName, channel: "email",
          discountPercent: spec.discountPercent, recipientCount: treatment.length,
        },
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

    // Persist lift stats on the experiment (same Welch computation the hourly worker uses) so
    // the in-product decision trace reads correctly the instant the seed runs — no waiting on
    // the worker. Per-customer basis = margin (aov × MARGIN for buyers, 0 otherwise).
    {
      const val = spec.aov * MARGIN;
      const armStat = (buyers: number, n: number) => {
        const mean = n > 0 ? (buyers * val) / n : 0;
        const variance = n > 1 ? Math.max(0, (buyers * val * val - n * mean * mean) / (n - 1)) : 0;
        return { n, mean, variance };
      };
      const t = armStat(treatmentBuyers, treatment.length);
      const c = armStat(controlBuyers, control.length);
      const se = Math.sqrt(t.variance / Math.max(t.n, 1) + c.variance / Math.max(c.n, 1));
      const lift = t.mean - c.mean;
      const z = se > 0 ? lift / se : 0;
      const ncdf = (x: number) => { const k = 1 / (1 + 0.2316419 * Math.abs(x)); const d = 0.3989422804014327 * Math.exp(-(x * x) / 2); const p = d * k * (0.31938153 + k * (-0.356563782 + k * (1.781477937 + k * (-1.821255978 + k * 1.330274429)))); return x >= 0 ? 1 - p : p; };
      const pValue = se > 0 ? 2 * (1 - ncdf(Math.abs(z))) : 1;
      const underpowered = t.n < 30 || c.n < 30;
      const significant = !underpowered && se > 0 && (lift - 1.96 * se > 0 || lift + 1.96 * se < 0);
      await prisma.experiment.update({
        where: { id: experimentId },
        data: {
          stats: {
            lift: Math.round(lift), ciLow: Math.round(lift - 1.96 * se), ciHigh: Math.round(lift + 1.96 * se),
            stdErr: Math.round(se), pValue, significant, underpowered,
            confidence: underpowered ? 0 : Math.max(0, Math.min(1, 1 - pValue)),
            nTreatment: t.n, nControl: c.n, computedAt: sentAt.toISOString(),
          },
        },
      });
    }

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
          sendCost: arm === "TREATMENT" ? messagingCostFor("email") : null, // only sent arm incurs provider cost
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
