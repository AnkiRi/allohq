import {
  computeLedgerSnapshot,
  computeMonthlyInvoice,
  billingPeriodsToRecompute,
  ledgerWinnerMatches,
  MissingComparisonCapEvidenceError,
  prisma,
  Prisma,
  shouldCreateLedgerVersion,
  type PricingCurrency,
} from "@allohq/database";
import { estimateStratifiedCausedRevenue } from "@allohq/customer-state";
import { createHash } from "node:crypto";

const toMinor = (value: unknown) => Math.round(Number(value) * 100);
const toMajor = (minor: number) => minor / 100;
const bps = (minor: number, basisPoints: number) => Math.round(minor * basisPoints / 10_000);

export async function persistClosedCampaignLedgers(now = new Date()): Promise<number> {
  const assignments = await prisma.measurementAssignment.findMany({
    where: { unitType: "campaign", windowEndsAt: { lte: now } },
    include: { campaign: { select: { origin: true } } },
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
    const windowStart = new Date(Math.min(...rows.map((row) => row.windowStartsAt.getTime())));
    const windowEnd = new Date(Math.max(...rows.map((row) => row.windowEndsAt.getTime())));
    const [orders, attributed, possibleOverlaps, latest] = await Promise.all([
      prisma.measurementOrderOutcome.findMany({
        where: { assignmentId: { in: rows.map((row) => row.id) }, occurredAt: { gte: windowStart, lte: windowEnd } },
        select: { id: true, netRevenue: true, occurredAt: true, updatedAt: true, assignment: { select: { customerId: true } }, order: { select: { status: true } } },
      }),
      prisma.orderAttribution.aggregate({ where: { storeId: first.storeId, campaignId: unitId, attributedAt: { gte: windowStart, lte: windowEnd } }, _sum: { revenue: true } }),
      prisma.measurementAssignment.findMany({
        where: {
          storeId: first.storeId,
          unitId: { not: unitId },
          customerId: { in: customerIds },
          windowStartsAt: { lt: windowEnd },
          windowEndsAt: { gt: windowStart },
        },
      }),
      prisma.causedRevenueLedger.findFirst({ where: { unitType: "campaign", unitId }, orderBy: { version: "desc" } }),
    ]);
    const metadata = (first.assignmentData ?? {}) as Record<string, unknown>;
    const tier = metadata["tier"] === "measurement_ready" ? "measurement_ready"
      : metadata["tier"] === "directional" ? "directional"
        : metadata["tier"] === "unmeasured" ? "unmeasured" : "empty";
    const snapshot = computeLedgerSnapshot({
      unitType: "campaign",
      unitId,
      assignments: rows.map((row) => ({
        unitType: "campaign", unitId, customerId: row.customerId, arm: row.arm, stratum: row.stratum,
        windowStartsAt: row.windowStartsAt, windowEndsAt: row.windowEndsAt,
      })),
      possibleOverlaps: possibleOverlaps.map((row) => ({
        unitType: row.unitType === "campaign" ? "campaign" : "journey", unitId: row.unitId,
        customerId: row.customerId, arm: row.arm, stratum: row.stratum,
        windowStartsAt: row.windowStartsAt, windowEndsAt: row.windowEndsAt,
      })),
      orders: orders.map((order) => ({
        id: order.id, customerId: order.assignment.customerId, totalMinor: toMinor(order.netRevenue), status: order.order.status,
        occurredAt: order.occurredAt, updatedAt: order.updatedAt,
      })),
      attributedRevenueMinor: toMinor(attributed._sum.revenue ?? 0),
      tier,
      origin: first.campaign?.origin ?? null,
      computedAt: now,
    });
    const estimate = estimateStratifiedCausedRevenue(snapshot.stratifiedOutcomes);
    const latestComparable = latest ? {
      causedMinor: toMinor(latest.causedRevenue),
      treatedNetRevenueMinor: toMinor(latest.treatedNetRevenue),
      controlNetRevenueMinor: toMinor(latest.controlNetRevenue),
      attributedRevenueMinor: toMinor(latest.attributedRevenue),
      billable: latest.billable,
      nonBillableReason: latest.nonBillableReason,
    } : null;
    const intervalLow = toMajor(Math.round(estimate.ciLow));
    const intervalHigh = toMajor(Math.round(estimate.ciHigh));
    const strataJson = { caused: snapshot.strata, outcomes: snapshot.stratifiedOutcomes };
    const estimateChanged = latest !== null && (
      Number(latest.intervalLow) !== intervalLow ||
      Number(latest.intervalHigh) !== intervalHigh ||
      JSON.stringify(latest.strata) !== JSON.stringify(strataJson)
    );
    if (now > snapshot.refundRevisionClosesAt) continue;
    if (!estimateChanged && !shouldCreateLedgerVersion(latestComparable, snapshot, now)) continue;
    try {
      await prisma.causedRevenueLedger.create({ data: {
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
      } });
    } catch (error) {
      // Another worker may have won the same immutable version. Treat that
      // unique collision as an idempotent success; all other failures surface.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      const winner = await prisma.causedRevenueLedger.findFirst({
        where: { unitType: "campaign", unitId }, orderBy: { version: "desc" },
      });
      const winnerMatches = winner !== null && ledgerWinnerMatches({
        causedMinor: toMinor(winner.causedRevenue),
        treatedNetRevenueMinor: toMinor(winner.treatedNetRevenue),
        controlNetRevenueMinor: toMinor(winner.controlNetRevenue),
        attributedRevenueMinor: toMinor(winner.attributedRevenue),
        intervalLow: Number(winner.intervalLow), intervalHigh: Number(winner.intervalHigh),
        strata: winner.strata, billable: winner.billable, nonBillableReason: winner.nonBillableReason,
      }, {
        causedMinor: snapshot.causedMinor, treatedNetRevenueMinor: snapshot.treatedNetRevenueMinor,
        controlNetRevenueMinor: snapshot.controlNetRevenueMinor, attributedRevenueMinor: snapshot.attributedRevenueMinor,
        intervalLow, intervalHigh, strata: strataJson, billable: snapshot.billable,
        nonBillableReason: snapshot.nonBillableReason,
      });
      if (winnerMatches) continue;
      throw new Error("Concurrent causal ledger revision differed; retry will allocate the next immutable version", { cause: error });
    }
    created += 1;
  }
  return created;
}

export async function buildMonthlyShadowInvoices(now = new Date()): Promise<number> {
  const latestClosedPeriodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const stores = await prisma.store.findMany({ where: { isActive: true }, select: { id: true, currency: true } });
  let created = 0;
  for (const store of stores) {
    const revisionFloor = new Date(now.getTime() - 30 * 86_400_000);
    const revisedWindows = await prisma.causedRevenueLedger.findMany({
      where: { storeId: store.id, computedAt: { gte: revisionFloor }, windowEndsAt: { lt: latestClosedPeriodEnd } },
      select: { windowEndsAt: true },
    });
    const periods = billingPeriodsToRecompute(revisedWindows.map((row) => row.windowEndsAt), now);
    // Recompute chronologically so a revised negative carry deterministically
    // cascades into every subsequent closed period.
    for (const { periodStart, periodEnd } of periods) {
    const allVersions = await prisma.causedRevenueLedger.findMany({
      where: { storeId: store.id, windowEndsAt: { gte: periodStart, lt: periodEnd } },
      orderBy: [{ unitId: "asc" }, { version: "desc" }],
    });
    const latestByUnit = [...allVersions.reduce((map, row) => {
      if (!map.has(row.unitId)) map.set(row.unitId, row);
      return map;
    }, new Map<string, (typeof allVersions)[number]>()).values()];
    const merchantCampaignIds = (await prisma.campaign.findMany({
      where: { storeId: store.id, origin: "merchant" }, select: { id: true },
    })).map((campaign) => campaign.id);
    const subscriberSnapshotAt = new Date();
    const [activeSubscribers, postageEmails, previous, existingInvoice] = await Promise.all([
      prisma.customer.count({ where: { storeId: store.id, acceptsMarketing: true } }),
      prisma.messageLog.count({ where: {
        storeId: store.id,
        // Provider acceptance is immutable evidence for postage. Delivery,
        // bounce, complaint, or later status transitions must not change it.
        externalId: { not: null },
        NOT: [{ provider: "demo" }, { externalId: { startsWith: "demo-" } }],
        sentAt: { gte: periodStart, lt: periodEnd },
        campaignId: { in: merchantCampaignIds },
      } }),
      prisma.shadowInvoice.findFirst({
        where: { storeId: store.id, periodEnd: { lte: periodStart } },
        orderBy: [{ periodEnd: "desc" }, { version: "desc" }],
      }),
      prisma.shadowInvoice.findFirst({
        where: { storeId: store.id, periodStart, periodEnd },
        orderBy: { version: "desc" },
      }),
    ]);
    const currency: PricingCurrency = existingInvoice
      ? (existingInvoice.currency === "INR" ? "INR" : "USD")
      : store.currency?.toUpperCase() === "INR" ? "INR" : "USD";
    const invoiceActiveSubscribers = existingInvoice?.activeSubscribers ?? activeSubscribers;
    const invoiceSubscriberSnapshotAt = existingInvoice?.subscriberSnapshotAt ?? subscriberSnapshotAt;
    const carryInMinor = previous ? toMinor(previous.carryOut) : 0;
    const units = latestByUnit.map((row) => ({
        unitType: row.unitType === "campaign" ? "campaign" : "journey",
        unitId: row.unitId,
        causedMinor: toMinor(row.causedRevenue),
        tier: row.tier === "measurement_ready" ? "measurement_ready" : row.tier === "directional" ? "directional" : row.tier === "unmeasured" ? "unmeasured" : "empty",
        overlapsAnotherUnit: row.overlapsAnotherUnit || !row.billable,
      } as const));
    const invoiceInput = {
      units, carryInMinor, postageEmails, activeSubscribers: invoiceActiveSubscribers, monthlySends: postageEmails,
      currency, subscriberSnapshotAt: invoiceSubscriberSnapshotAt.toISOString(),
    };
    const ledgerVersions = latestByUnit.map((row) => ({ id: row.id, unitType: row.unitType, unitId: row.unitId, version: row.version }));
    const inputFingerprint = createHash("sha256").update(JSON.stringify({
      ledgerVersions, carryInMinor, postageEmails, activeSubscribers: invoiceActiveSubscribers, currency,
    })).digest("hex");
    if (existingInvoice?.inputFingerprint === inputFingerprint) continue;
    const invoiceVersion = (existingInvoice?.version ?? 0) + 1;
    let status = "ready";
    let pendingReason: string | null = null;
    let invoice;
    try {
      // Real shadow invoices fail closed until approved Klaviyo cap evidence is
      // supplied to the pricing module. The public-calculator escape hatch is
      // intentionally never used here.
      invoice = computeMonthlyInvoice(invoiceInput);
    } catch (error) {
      if (!(error instanceof MissingComparisonCapEvidenceError)) throw error;
      status = "pending_cap";
      pendingReason = "Approved comparison-cap evidence is not configured";
      const pendingMath = computeMonthlyInvoice({ ...invoiceInput, allowUncappedPreview: true });
      invoice = {
        ...pendingMath,
        liftFeeMinor: 0,
        totalMinor: pendingMath.postageMinor,
        lines: pendingMath.lines.map((line) => line.kind === "performance_fee" ? { ...line, amountMinor: 0 } : line),
      };
    }
    const attributedMinor = latestByUnit.reduce((sum, row) => sum + toMinor(row.attributedRevenue), 0);
    const causedMinor = latestByUnit.filter((row) => row.billable).reduce((sum, row) => sum + toMinor(row.causedRevenue), 0);
    const usageLines = invoice.lines.map((line, index) => ({
      usageRecordKey: `${store.id}:${periodStart.toISOString()}:${invoice.pricingVersion}:v${invoiceVersion}:${index}`,
      type: line.kind,
      amountMinor: line.amountMinor,
      currency,
      billableNow: false,
    }));
    try {
      await prisma.shadowInvoice.create({ data: {
      storeId: store.id, periodStart, periodEnd, currency, activeSubscribers: invoiceActiveSubscribers, subscriberSnapshotAt: invoiceSubscriberSnapshotAt,
      billableCausedRevenue: toMajor(invoice.billableCausedMinor), carryIn: toMajor(invoice.carryInMinor), carryOut: toMajor(invoice.carryOutMinor),
      liftFee: toMajor(invoice.liftFeeMinor), postageEmails, postage: toMajor(invoice.postageMinor),
      performanceFeeCap: invoice.performanceFeeCapMinor === null ? null : toMajor(invoice.performanceFeeCapMinor), total: toMajor(invoice.totalMinor),
      variants: { attributed8PercentMinor: bps(Math.max(0, attributedMinor), 800), caused15PercentMinor: bps(Math.max(0, causedMinor + carryInMinor), 1500), caused20PercentMinor: invoice.uncappedPerformanceFeeMinor },
      lines: usageLines,
      ledgerVersions,
      pricingVersion: invoice.pricingVersion,
      version: invoiceVersion,
      supersedesInvoiceId: existingInvoice?.id,
      inputFingerprint,
      status,
      pendingReason,
      } });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      const winner = await prisma.shadowInvoice.findFirst({
        where: { storeId: store.id, periodStart, periodEnd, pricingVersion: invoice.pricingVersion },
        orderBy: { version: "desc" },
      });
      if (winner?.inputFingerprint === inputFingerprint) continue;
      throw new Error("Concurrent shadow invoice revision differed; retry will allocate the next immutable version", { cause: error });
    }
    created += 1;
    }
  }
  return created;
}
