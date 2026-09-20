import {
  computeLedgerSnapshot,
  computeAttributedInvoice,
  billingPeriodsToRecompute,
  ledgerWinnerMatches,
  MissingComparisonCapEvidenceError,
  prisma,
  Prisma,
  shouldCreateLedgerVersion,
  type PricingCurrency,
} from "@allohq/database";
import { estimateStratifiedCausedRevenue } from "@allohq/customer-state";
import { campaignAudienceSnapshot } from "@allohq/campaign-engine";
import { createHash } from "node:crypto";

const toMinor = (value: unknown) => Math.round(Number(value) * 100);
const toMajor = (minor: number) => minor / 100;

/**
 * Frozen customers that have no assignment row.
 *
 * Extra assignment rows are deliberately tolerated: re-approving a campaign with
 * a narrower audience leaves the earlier rows in place, and those are history
 * rather than corruption. A *missing* row is fatal, because it means the chunked
 * approval write was interrupted and any lift computed from what landed would be
 * a confident answer over the wrong cohort.
 */
/**
 * Observed customers per arm before a campaign may be called measured. Matches
 * `computeLiftStats`' own `minObservedPerArm`, so the ledger and the lift
 * statistics agree on what is too small to trust.
 */
export const MIN_OBSERVED_PER_ARM = 30;

/**
 * Grade a closed unit from the outcome that actually happened.
 *
 * A row count alone can never mean "proven": significance needs a valid
 * control, an adequate sample and an interval that excludes zero. Anything
 * short of that stays directional and pools as learning rather than being
 * presented, or billed, as measured.
 */
export function measuredTier(
  outcomes: ReadonlyArray<{ treatedCount: number; controlCount: number }>,
  estimate: { ciLow: number; ciHigh: number }
): "empty" | "unmeasured" | "directional" | "measurement_ready" {
  const treated = outcomes.reduce((sum, row) => sum + row.treatedCount, 0);
  const control = outcomes.reduce((sum, row) => sum + row.controlCount, 0);
  if (treated === 0 && control === 0) return "empty";
  if (control === 0) return "unmeasured";
  if (treated < MIN_OBSERVED_PER_ARM || control < MIN_OBSERVED_PER_ARM) return "directional";
  return estimate.ciLow > 0 || estimate.ciHigh < 0 ? "measurement_ready" : "directional";
}

export function missingAssignedCustomers(
  frozenCustomerIds: readonly string[],
  assignedCustomerIds: readonly string[]
): string[] {
  const assigned = new Set(assignedCustomerIds);
  return frozenCustomerIds.filter((customerId) => !assigned.has(customerId));
}

export async function persistClosedCampaignLedgers(now = new Date()): Promise<number> {
  // Only campaigns that actually completed approval. Frozen assignment rows are
  // written in bounded chunks before the approval claim, because a 100k cohort
  // cannot be inserted inside one transaction. A claim that then fails leaves
  // those rows behind, and an unapproved campaign's arms must never reach
  // attribution or this ledger.
  const assignments = await prisma.measurementAssignment.findMany({
    where: {
      unitType: "campaign",
      windowEndsAt: { lte: now },
      campaign: { approvedAt: { not: null } },
    },
    include: { campaign: { select: { origin: true, agentProposal: true } } },
    orderBy: [{ unitId: "asc" }, { customerId: "asc" }],
  });
  const byUnit = new Map<string, typeof assignments>();
  for (const assignment of assignments) {
    const group = byUnit.get(assignment.unitId) ?? [];
    group.push(assignment);
    byUnit.set(assignment.unitId, group);
  }
  let created = 0;
  for (const [unitId, rows] of byUnit) {
    const first = rows[0]!;
    const customerIds = rows.map((row) => row.customerId);
    // Refuse to measure an incomplete cohort. Assignment rows are written in
    // chunks, so an interrupted approval would otherwise yield a confident lift
    // computed over only the customers whose rows happened to land. The frozen
    // snapshot is the authority on who was approved. Extra rows are tolerated:
    // a re-approval with a narrower audience leaves earlier rows in place.
    const frozenCohort = campaignAudienceSnapshot(first.campaign?.agentProposal ?? null);
    if (frozenCohort) {
      // A legacy snapshot carries the exact membership and is checked against
      // it. A current one carries only the approved count, because the
      // membership now lives on these very rows, so a shortfall is the signal.
      const expected = frozenCohort.customerIds?.length ?? frozenCohort.eligible;
      const shortfall = frozenCohort.customerIds
        ? missingAssignedCustomers(frozenCohort.customerIds, customerIds).length
        : Math.max(0, frozenCohort.eligible - customerIds.length);
      if (shortfall > 0) {
        console.error(
          `[causal-ledger] Skipping ${unitId}: ${shortfall} of ${expected} frozen customers have no assignment row`
        );
        continue;
      }
    }
    const windowStart = new Date(Math.min(...rows.map((row) => row.windowStartsAt.getTime())));
    const windowEnd = new Date(Math.max(...rows.map((row) => row.windowEndsAt.getTime())));
    const [orders, attributed, possibleOverlaps, latest] = await Promise.all([
      prisma.measurementOrderOutcome.findMany({
        where: {
          assignmentId: { in: rows.map((row) => row.id) },
          occurredAt: { gte: windowStart, lte: windowEnd },
        },
        select: {
          id: true,
          netRevenue: true,
          occurredAt: true,
          updatedAt: true,
          assignment: { select: { customerId: true } },
          order: { select: { status: true } },
        },
      }),
      prisma.orderAttribution.aggregate({
        where: {
          storeId: first.storeId,
          campaignId: unitId,
          attributedAt: { gte: windowStart, lte: windowEnd },
        },
        _sum: { revenue: true },
      }),
      prisma.measurementAssignment.findMany({
        where: {
          storeId: first.storeId,
          unitId: { not: unitId },
          customerId: { in: customerIds },
          windowStartsAt: { lt: windowEnd },
          windowEndsAt: { gt: windowStart },
        },
      }),
      prisma.causedRevenueLedger.findFirst({
        where: { unitType: "campaign", unitId },
        orderBy: { version: "desc" },
      }),
    ]);
    // assignmentData still carries the campaign family recorded at approval.
    const metadata = (first.assignmentData ?? {}) as Record<string, unknown>;
    // The tier used to be read back from assignmentData, which approval fills
    // from campaignMeasurementPolicy. That function can only return empty,
    // unmeasured or directional, so "measurement_ready" was unreachable, every
    // unit was permanently non-billable, and pooled evidence never matured. A
    // tier is a result, not a plan, so it is now decided from the outcome that
    // was actually observed.
    const snapshotInput = {
      unitType: "campaign" as const,
      unitId,
      assignments: rows.map((row) => ({
        unitType: "campaign" as const,
        unitId,
        customerId: row.customerId,
        arm: row.arm,
        stratum: row.stratum,
        windowStartsAt: row.windowStartsAt,
        windowEndsAt: row.windowEndsAt,
      })),
      possibleOverlaps: possibleOverlaps.map((row) => ({
        unitType: (row.unitType === "campaign" ? "campaign" : "journey") as "campaign" | "journey",
        unitId: row.unitId,
        customerId: row.customerId,
        arm: row.arm,
        stratum: row.stratum,
        windowStartsAt: row.windowStartsAt,
        windowEndsAt: row.windowEndsAt,
      })),
      orders: orders.map((order) => ({
        id: order.id,
        customerId: order.assignment.customerId,
        totalMinor: toMinor(order.netRevenue),
        status: order.order.status,
        occurredAt: order.occurredAt,
        updatedAt: order.updatedAt,
      })),
      attributedRevenueMinor: toMinor(attributed._sum.revenue ?? 0),
      origin: first.campaign?.origin ?? null,
      computedAt: now,
    };
    // computeLedgerSnapshot is pure, and the tier only affects its billability
    // verdict, so a provisional pass is what produces the outcomes the real
    // tier is derived from.
    const provisional = computeLedgerSnapshot({ ...snapshotInput, tier: "directional" });
    const estimate = estimateStratifiedCausedRevenue(provisional.stratifiedOutcomes);
    const tier = measuredTier(provisional.stratifiedOutcomes, estimate);
    const snapshot =
      tier === "directional" ? provisional : computeLedgerSnapshot({ ...snapshotInput, tier });
    const latestComparable = latest
      ? {
          causedMinor: toMinor(latest.causedRevenue),
          treatedNetRevenueMinor: toMinor(latest.treatedNetRevenue),
          controlNetRevenueMinor: toMinor(latest.controlNetRevenue),
          attributedRevenueMinor: toMinor(latest.attributedRevenue),
          billable: latest.billable,
          nonBillableReason: latest.nonBillableReason,
        }
      : null;
    const intervalLow = toMajor(Math.round(estimate.ciLow));
    const intervalHigh = toMajor(Math.round(estimate.ciHigh));
    const strataJson = { caused: snapshot.strata, outcomes: snapshot.stratifiedOutcomes };
    const estimateChanged =
      latest !== null &&
      (Number(latest.intervalLow) !== intervalLow ||
        Number(latest.intervalHigh) !== intervalHigh ||
        JSON.stringify(latest.strata) !== JSON.stringify(strataJson));
    if (now > snapshot.refundRevisionClosesAt) continue;
    if (!estimateChanged && !shouldCreateLedgerVersion(latestComparable, snapshot, now)) continue;
    try {
      await prisma.causedRevenueLedger.create({
        data: {
          storeId: first.storeId,
          campaignId: first.campaignId,
          unitType: "campaign",
          unitId,
          family: typeof metadata["family"] === "string" ? metadata["family"] : null,
          windowStartsAt: windowStart,
          windowEndsAt: windowEnd,
          strata: strataJson as unknown as Prisma.InputJsonValue,
          assignedTreated: snapshot.assignedTreated,
          assignedControl: snapshot.assignedControl,
          treatedNetRevenue: toMajor(snapshot.treatedNetRevenueMinor),
          controlNetRevenue: toMajor(snapshot.controlNetRevenueMinor),
          attributedRevenue: toMajor(snapshot.attributedRevenueMinor),
          causedRevenue: toMajor(snapshot.causedMinor),
          intervalLow,
          intervalHigh,
          tier,
          overlapsAnotherUnit: snapshot.overlapsAnotherUnit,
          billable: snapshot.billable,
          nonBillableReason: snapshot.nonBillableReason,
          version: (latest?.version ?? 0) + 1,
          supersedesLedgerId: latest?.id,
          computationVersion: snapshot.computationVersion,
          computedAt: now,
          refundRevisionClosesAt: snapshot.refundRevisionClosesAt,
        },
      });
    } catch (error) {
      // Another worker may have won the same immutable version. Treat that
      // unique collision as an idempotent success; all other failures surface.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002")
        throw error;
      const winner = await prisma.causedRevenueLedger.findFirst({
        where: { unitType: "campaign", unitId },
        orderBy: { version: "desc" },
      });
      const winnerMatches =
        winner !== null &&
        ledgerWinnerMatches(
          {
            causedMinor: toMinor(winner.causedRevenue),
            treatedNetRevenueMinor: toMinor(winner.treatedNetRevenue),
            controlNetRevenueMinor: toMinor(winner.controlNetRevenue),
            attributedRevenueMinor: toMinor(winner.attributedRevenue),
            intervalLow: Number(winner.intervalLow),
            intervalHigh: Number(winner.intervalHigh),
            strata: winner.strata,
            billable: winner.billable,
            nonBillableReason: winner.nonBillableReason,
          },
          {
            causedMinor: snapshot.causedMinor,
            treatedNetRevenueMinor: snapshot.treatedNetRevenueMinor,
            controlNetRevenueMinor: snapshot.controlNetRevenueMinor,
            attributedRevenueMinor: snapshot.attributedRevenueMinor,
            intervalLow,
            intervalHigh,
            strata: strataJson,
            billable: snapshot.billable,
            nonBillableReason: snapshot.nonBillableReason,
          }
        );
      if (winnerMatches) continue;
      throw new Error(
        "Concurrent causal ledger revision differed; retry will allocate the next immutable version",
        { cause: error }
      );
    }
    created += 1;
  }
  return created;
}

export async function buildMonthlyShadowInvoices(now = new Date()): Promise<number> {
  const latestClosedPeriodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const stores = await prisma.store.findMany({
    where: { isActive: true },
    select: { id: true, currency: true },
  });
  let created = 0;
  for (const store of stores) {
    const revisionFloor = new Date(now.getTime() - 30 * 86_400_000);
    const revisedWindows = await prisma.causedRevenueLedger.findMany({
      where: {
        storeId: store.id,
        computedAt: { gte: revisionFloor },
        windowEndsAt: { lt: latestClosedPeriodEnd },
      },
      select: { windowEndsAt: true },
    });
    const periods = billingPeriodsToRecompute(
      revisedWindows.map((row) => row.windowEndsAt),
      now
    );
    // Recompute chronologically so a revised negative carry deterministically
    // cascades into every subsequent closed period.
    for (const { periodStart, periodEnd } of periods) {
      const allVersions = await prisma.causedRevenueLedger.findMany({
        where: { storeId: store.id, windowEndsAt: { gte: periodStart, lt: periodEnd } },
        orderBy: [{ unitId: "asc" }, { version: "desc" }],
      });
      const latestByUnit = [
        ...allVersions
          .reduce((map, row) => {
            if (!map.has(row.unitId)) map.set(row.unitId, row);
            return map;
          }, new Map<string, (typeof allVersions)[number]>())
          .values(),
      ];
      const subscriberSnapshotAt = new Date();
      const [activeSubscribers, monthlySends, attributed, existingInvoice] = await Promise.all([
        prisma.customer.count({ where: { storeId: store.id, acceptsMarketing: true } }),
        prisma.messageLog.count({
          where: {
            storeId: store.id,
            externalId: { not: null },
            NOT: [{ provider: "demo" }, { externalId: { startsWith: "demo-" } }],
            sentAt: { gte: periodStart, lt: periodEnd },
          },
        }),
        prisma.orderAttribution.aggregate({
          where: {
            storeId: store.id,
            order: {
              createdAt: { gte: periodStart, lt: periodEnd },
              status: { not: "cancelled" },
            },
          },
          _sum: { revenue: true },
          _count: true,
        }),
        prisma.shadowInvoice.findFirst({
          where: { storeId: store.id, periodStart, periodEnd },
          orderBy: { version: "desc" },
        }),
      ]);
      const storeCurrency = store.currency?.toUpperCase();
      if (storeCurrency !== "INR" && storeCurrency !== "USD") {
        // Comparison-cap evidence and minor-unit math are currently configured
        // only for these currencies. A shadow invoice in a different currency
        // must not be silently relabelled or priced as USD.
        console.warn("Skipping shadow invoice for unsupported store currency", {
          storeId: store.id,
          currency: storeCurrency ?? null,
        });
        continue;
      }
      const currency: PricingCurrency = storeCurrency;
      const invoiceActiveSubscribers = existingInvoice?.activeSubscribers ?? activeSubscribers;
      const invoiceSubscriberSnapshotAt =
        existingInvoice?.subscriberSnapshotAt ?? subscriberSnapshotAt;
      const attributedMinor = toMinor(attributed._sum.revenue ?? 0);
      const invoiceInput = {
        attributedRevenueMinor: attributedMinor,
        activeSubscribers: invoiceActiveSubscribers,
        monthlySends,
        currency,
        subscriberSnapshotAt: invoiceSubscriberSnapshotAt.toISOString(),
      };
      const ledgerVersions = latestByUnit.map((row) => ({
        id: row.id,
        unitType: row.unitType,
        unitId: row.unitId,
        version: row.version,
      }));
      const inputFingerprint = createHash("sha256")
        .update(
          JSON.stringify({
            ledgerVersions,
            attributedMinor,
            attributedOrders: attributed._count,
            monthlySends,
            activeSubscribers: invoiceActiveSubscribers,
            currency,
          })
        )
        .digest("hex");
      if (existingInvoice?.inputFingerprint === inputFingerprint) continue;
      const invoiceVersion = (existingInvoice?.version ?? 0) + 1;
      let status = "ready";
      let pendingReason: string | null = null;
      let invoice;
      try {
        // Real shadow invoices fail closed until approved Klaviyo cap evidence is
        // supplied to the pricing module. The public-calculator escape hatch is
        // intentionally never used here.
        invoice = computeAttributedInvoice(invoiceInput);
      } catch (error) {
        if (!(error instanceof MissingComparisonCapEvidenceError)) throw error;
        status = "pending_cap";
        pendingReason = "Approved comparison-cap evidence is not configured";
        const pendingMath = computeAttributedInvoice({
          ...invoiceInput,
          allowUncappedPreview: true,
        });
        invoice = {
          ...pendingMath,
          feeMinor: 0,
          totalMinor: 0,
          lines: pendingMath.lines.map((line) =>
            line.kind === "attributed_fee" ? { ...line, amountMinor: 0 } : line
          ),
        };
      }
      const usageLines = invoice.lines.map((line, index) => ({
        usageRecordKey: `${store.id}:${periodStart.toISOString()}:${invoice.pricingVersion}:v${invoiceVersion}:${index}`,
        type: line.kind,
        amountMinor: line.amountMinor,
        currency,
        billableNow: false,
      }));
      try {
        await prisma.shadowInvoice.create({
          data: {
            storeId: store.id,
            periodStart,
            periodEnd,
            currency,
            activeSubscribers: invoiceActiveSubscribers,
            subscriberSnapshotAt: invoiceSubscriberSnapshotAt,
            billableCausedRevenue: 0,
            carryIn: 0,
            carryOut: 0,
            attributedRevenue: toMajor(invoice.attributedRevenueMinor),
            attributedFee: toMajor(invoice.feeMinor),
            liftFee: 0,
            postageEmails: 0,
            postage: 0,
            performanceFeeCap: invoice.capMinor === null ? null : toMajor(invoice.capMinor),
            total: toMajor(invoice.totalMinor),
            variants: invoice.variants,
            lines: usageLines,
            ledgerVersions,
            pricingVersion: invoice.pricingVersion,
            version: invoiceVersion,
            supersedesInvoiceId: existingInvoice?.id,
            inputFingerprint,
            status,
            pendingReason,
          },
        });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002")
          throw error;
        const winner = await prisma.shadowInvoice.findFirst({
          where: {
            storeId: store.id,
            periodStart,
            periodEnd,
            pricingVersion: invoice.pricingVersion,
          },
          orderBy: { version: "desc" },
        });
        if (winner?.inputFingerprint === inputFingerprint) continue;
        throw new Error(
          "Concurrent shadow invoice revision differed; retry will allocate the next immutable version",
          { cause: error }
        );
      }
      created += 1;
    }
  }
  return created;
}
