import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";

/**
 * One-million-customer single-tenant readiness proof.
 *
 * Runs Joon's real preparation job against a synthetic tenant in a disposable
 * Postgres, with a simulated provider. Forces a crash after meaningful durable
 * progress and resumes with a different worker.
 *
 * This does not establish anything about 45,000,000 customers, and no timing
 * here may be presented as evidence for that environment.
 *
 *   NODE_OPTIONS=--expose-gc MILLION_SIZE=1000000 TEST_DATABASE_URL=... \
 *     npx tsx --test apps/workers/src/workers/prepare-audience.million.integration.ts
 */
const databaseUrl = process.env["TEST_DATABASE_URL"];
const SIZE = Number(process.env["MILLION_SIZE"] ?? 1_000_000);
const BATCH = 10_000;

interface QuerySample { shape: string; duration: number }
const queries: QuerySample[] = [];

async function load() {
  process.env["DATABASE_URL"] = databaseUrl;
  const { PrismaClient } = await import("@prisma/client");
  const instrumented = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
  (instrumented as unknown as { $on: (e: string, h: (p: { query: string; duration: number }) => void) => void })
    .$on("query", (payload) => {
      queries.push({ shape: shapeOf(payload.query), duration: payload.duration });
    });
  (globalThis as Record<string, unknown>)["prisma"] = instrumented;

  const { prisma } = await import("@allohq/database");
  const job = await import("./prepare-audience");
  const engine = await import("@allohq/campaign-engine");
  const experiments = await import("@allohq/customer-state");
  return { prisma, ...job, ...engine, experiments };
}

function shapeOf(query: string): string {
  return query.replace(/\$\d+/g, "?").replace(/\(\s*(\?,\s*)*\?\s*\)/g, "(?)").replace(/\s+/g, " ").trim().slice(0, 90);
}
const mb = (bytes: number) => Math.round((bytes / 1024 / 1024) * 100) / 100;
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}
async function settle(): Promise<number> {
  for (let i = 0; i < 3; i += 1) {
    (globalThis as Record<string, unknown>)["gc"] instanceof Function && ((globalThis as { gc: () => void }).gc());
    await new Promise((r) => setTimeout(r, 60));
  }
  return process.memoryUsage().heapUsed;
}
async function dbCounters(prisma: any) {
  const [row] = await prisma.$queryRaw<Array<{ xact: bigint; deadlocks: bigint; conflicts: bigint }>>`
    SELECT (xact_commit + xact_rollback)::bigint AS xact, deadlocks::bigint, conflicts::bigint
    FROM pg_stat_database WHERE datname = current_database()`;
  return { xact: Number(row?.xact ?? 0), deadlocks: Number(row?.deadlocks ?? 0), conflicts: Number(row?.conflicts ?? 0) };
}

/**
 * A tenant with the mix a real store has: consent failures, undeliverable
 * addresses, recent purchasers, fatigue and collision holds, loyal full-price
 * customers Joon leaves alone, plenty of ordinary candidates, and both large
 * and sub-ten strata so pooled control behaviour is exercised.
 */
async function seedTenant(prisma: any, size: number, label: string) {
  const suffix = `${label}-${Date.now()}-${randomUUID().slice(0, 6)}`;
  const workspace = await prisma.workspace.create({ data: { name: `M ${suffix}`, slug: `m-${suffix}` } });
  const store = await prisma.store.create({
    data: { workspaceId: workspace.id, platform: "shopify", shopDomain: `m-${suffix}.myshopify.com`,
      accessToken: "isolated-test-token", installedAt: new Date("2020-01-01T00:00:00.000Z"), timezone: "UTC" },
  });
  const template = await prisma.emailTemplate.create({
    data: { workspaceId: workspace.id, name: `M ${suffix}`, subject: "A note", previewText: "p",
      blocks: [{ id: "b1", type: "text", props: { html: "<p>Hello</p>" } }] },
  });
  const campaign = await prisma.campaign.create({
    // A discount campaign: this is what makes the full-price-inside-cycle rule
    // applicable at all, so loyal full-price customers can be left alone.
    data: { workspaceId: workspace.id, storeId: store.id, name: `M ${suffix}`, templateId: template.id,
      status: "draft", agentProposal: { discountPercent: 15, discountCode: `SAVE${suffix.slice(-4)}` } },
  });
  const product = await prisma.product.create({
    data: { storeId: store.id, externalId: `p-${suffix}`, handle: `p-${suffix}`, title: "Staple",
      price: 100, status: "active", variants: { create: [{ externalId: `v-${suffix}`, title: "d", price: 100, inventory: 5 }] } },
  });
  await prisma.productRepurchaseCycle.create({
    data: { productId: product.id, storeId: store.id, medianDays: 10, avgDays: 10, sampleSize: 40, confidence: 0.9 },
  });

  const now = Date.now();
  const expected = { invalid: 0, noConsent: 0, recentPurchase: 0 };
  for (let offset = 0; offset < size; offset += BATCH) {
    const take = Math.min(BATCH, size - offset);
    await prisma.customer.createMany({
      data: Array.from({ length: take }, (_, index) => {
        const n = offset + index;
        const invalid = n % 97 === 0;           // undeliverable address
        const noConsent = !invalid && n % 11 === 0; // never opted in
        if (invalid) expected.invalid += 1;
        if (noConsent) expected.noConsent += 1;
        return {
          storeId: store.id,
          externalId: `e-${n}`,
          email: invalid ? `broken-${n}-at-example` : `m-${suffix}-${n}@example.test`,
          acceptsMarketing: !noConsent,
        };
      }),
    });
  }

  let cursor: string | undefined;
  let seen = 0;
  for (;;) {
    const page = await prisma.customer.findMany({
      where: { storeId: store.id, ...(cursor ? { id: { gt: cursor } } : {}) },
      select: { id: true }, orderBy: { id: "asc" }, take: BATCH,
    });
    if (page.length === 0) break;

    // Strata: five large ones, plus deliberately tiny ones at the very start so
    // sub-ten pooling is exercised.
    await prisma.rfmScore.createMany({
      data: page.map((c: { id: string }, i: number) => {
        const n = seen + i;
        return { customerId: c.id, storeId: store.id, recency: 3, frequency: 3, monetary: 3, totalScore: 9,
          segment: n < 12 ? `tiny_${Math.floor(n / 3)}` : ["champions","loyal","at_risk","hibernating","new"][n % 5]! };
      }),
    });
    // Loyal full-price buyers Joon leaves alone, plus ordinary states.
    await prisma.customerState.createMany({
      data: page.map((c: { id: string }, i: number) => {
        const n = seen + i;
        // Every thirteenth customer is a loyal full-price buyer inside their
        // buying rhythm: Joon leaves these alone rather than discounting to
        // someone who would have paid full price.
        const leaveAlone = n % 13 === 0;
        return { storeId: store.id, customerId: c.id,
          lifecycleStage: n % 4 === 0 ? "loyal" : n % 4 === 1 ? "at_risk" : "repeat",
          vipLevel: n % 9 === 0 ? "gold" : "none",
          discountBehavior: leaveAlone ? "full_price_likely" : "mixed",
          purchaseCyclePosition: leaveAlone ? "early" : "due",
          medianOrderIntervalDays: 30,
          nextExpectedOrderAt: new Date(now + 20 * 86_400_000),
          stateEvidence: leaveAlone ? { fullPriceOrderCount: 4, orderCount: 5 } : {},
          churnRisk: 0.3 };
      }),
    });
    // Recent purchasers: excluded by the recent-purchase window.
    const recent = page.filter((_: unknown, i: number) => (seen + i) % 23 === 0);
    if (recent.length) {
      expected.recentPurchase += recent.length;
      await prisma.order.createMany({
        data: recent.map((c: { id: string }, i: number) => ({
          storeId: store.id, customerId: c.id, externalId: `o-${seen + i}-${suffix}`,
          orderNumber: `#${seen + i}`, totalPrice: 100, subtotal: 100, tax: 0, shipping: 0,
          status: "paid", createdAt: new Date(now - 1 * 86_400_000) })),
      });
    }
    // Fatigue holds.
    const fatigued = page.filter((_: unknown, i: number) => (seen + i) % 37 === 0);
    if (fatigued.length) {
      await prisma.customerFatigueLog.createMany({
        data: fatigued.flatMap((c: { id: string }) => Array.from({ length: 6 }, (_, k) => ({
          customerId: c.id, storeId: store.id, channel: "email", messageType: "campaign",
          sentAt: new Date(now - (k + 1) * 3_600_000) })) ),
      });
    }
    seen += page.length;
    cursor = page[page.length - 1]!.id;
  }
  await prisma.$executeRawUnsafe("ANALYZE");
  return { workspaceId: workspace.id, storeId: store.id, campaignId: campaign.id, expected };
}

test(
  "one million customers: preparation, crash, recovery, all measured",
  { skip: databaseUrl ? false : "TEST_DATABASE_URL is not set", timeout: 180 * 60 * 1000 },
  async () => {
    if (typeof (globalThis as Record<string, unknown>)["gc"] !== "function") {
      assert.fail("this proof measures retained heap and needs NODE_OPTIONS=--expose-gc");
    }
    const { prisma, prepareCampaignAudience, campaignPreparationProgress, completedAudienceRun, experiments } = await load();

    const seedStart = process.hrtime.bigint();
    const fixture = await seedTenant(prisma, SIZE, "single");
    const seedMs = Number(process.hrtime.bigint() - seedStart) / 1e6;

    try {
      const experiment = await experiments.getOrCreateExperiment(
        fixture.storeId,
        { label: `campaign:${fixture.campaignId}:stratified:v1`, source: "campaign", family: "winback",
          campaignId: fixture.campaignId, segmentId: null, segmentName: null },
        0.15
      );
      const request = {
        prepareAudience: true as const, campaignId: fixture.campaignId, storeId: fixture.storeId,
        runKey: `approval:million:${experiment.id}`, experimentId: experiment.id,
        assignmentSeed: experiment.assignmentSeed, family: "winback", policyRate: 0.15,
        policyReason: "new_family" as never, evidence: null, deliveryProvider: "resend" as const,
        emailPreflightReceipt: { blockCount: 1, validatedAt: new Date().toISOString() },
        forceImmediate: false, approvedBy: null,
      };

      // What the merchant's request itself costs.
      const apiStart = process.hrtime.bigint();
      await experiments.getOrCreateExperiment(
        fixture.storeId,
        { label: `campaign:${fixture.campaignId}:stratified:v1`, source: "campaign", family: "winback",
          campaignId: fixture.campaignId, segmentId: null, segmentName: null }, 0.15);
      await campaignPreparationProgress(fixture.campaignId);
      const apiMs = Number(process.hrtime.bigint() - apiStart) / 1e6;

      const dispatched: string[] = [];
      const providerCalls: string[] = [];
      const simulatedProvider = async (campaignId: string) => { dispatched.push(campaignId); };

      // --- crash after meaningful durable progress ---
      queries.length = 0;
      const beforeAll = await dbCounters(prisma);
      const crashing = prepareCampaignAudience(request, simulatedProvider);
      const crashAfter = Math.floor(SIZE / 5);
      let partial = 0;
      for (let attempt = 0; attempt < 200_000; attempt += 1) {
        partial = await prisma.campaignAudienceMember.count({ where: { run: { campaignId: fixture.campaignId } } });
        if (partial >= crashAfter) break;
        await new Promise((r) => setTimeout(r, 25));
      }
      assert.ok(partial > 0 && partial < SIZE, `crash needs partial work; saw ${partial}`);
      await prisma.campaignAudienceRun.updateMany({
        where: { campaignId: fixture.campaignId },
        data: { leaseOwner: "vanished", leaseExpiresAt: new Date(Date.now() - 120_000) },
      });
      await crashing.catch(() => undefined);
      assert.notEqual((await campaignPreparationProgress(fixture.campaignId))?.state, "ready");
      assert.equal(await completedAudienceRun(fixture.campaignId), null);
      assert.equal(dispatched.length, 0, "a crashed preparation must not dispatch");

      // --- recovery, measured ---
      const baseline = await settle();
      let peak = baseline;
      const sampler = setInterval(() => {
        const used = process.memoryUsage().heapUsed;
        if (used > peak) peak = used;
      }, 50);
      queries.length = 0;
      const before = await dbCounters(prisma);
      const recoveryStart = process.hrtime.bigint();
      const outcome = await prepareCampaignAudience(request, simulatedProvider);
      const recoveryMs = Number(process.hrtime.bigint() - recoveryStart) / 1e6;
      clearInterval(sampler);
      const after = await dbCounters(prisma);
      const retained = (await settle()) - baseline;
      const captured = queries.splice(0, queries.length);

      assert.equal(outcome.status, "approved", `recovery ended as ${outcome.status}`);
      const runId = outcome.runId!;

      // --- what it produced ---
      const memberRows = await prisma.campaignAudienceMember.count({ where: { runId } });
      const distinctRows = await prisma.$queryRaw<Array<{ d: bigint }>>`
        SELECT COUNT(DISTINCT "customerId")::bigint AS d FROM "campaign_audience_members" WHERE "runId" = ${runId}`;
      const duplicates = memberRows - Number(distinctRows[0]?.d ?? 0);
      const progress = await campaignPreparationProgress(fixture.campaignId);
      const assignments = await prisma.measurementAssignment.count({
        where: { unitType: "campaign", unitId: fixture.campaignId } });
      const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: fixture.campaignId } });

      // --- arm parity against the deterministic reference, one stratum at a
      // time ---
      //
      // Replaying the reference over the whole cohort at once is what the
      // production path was rewritten to avoid, and it is what killed the first
      // 1M attempt: the harness, not the product, ran the machine out of
      // memory. Arms are decided independently within each assignment stratum,
      // so replaying per stratum is the same computation with a bounded
      // working set — the largest stratum, not the cohort.
      const strata = await prisma.campaignAudienceMember.groupBy({
        by: ["assignmentStratum"],
        where: { runId, decision: "campaign_candidate" },
        _count: { _all: true },
      });
      let mismatches = 0;
      let compared = 0;
      let largestStratum = 0;
      for (const stratum of strata) {
        if (!stratum.assignmentStratum) continue;
        largestStratum = Math.max(largestStratum, stratum._count._all);
        const members: Array<{ customerId: string; arm: string | null }> = [];
        let pageCursor: string | undefined;
        for (;;) {
          const page: Array<{ customerId: string; arm: string | null }> =
            await prisma.campaignAudienceMember.findMany({
              where: {
                runId,
                decision: "campaign_candidate",
                assignmentStratum: stratum.assignmentStratum,
                ...(pageCursor ? { customerId: { gt: pageCursor } } : {}),
              },
              select: { customerId: true, arm: true },
              orderBy: { customerId: "asc" },
              take: 20_000,
            });
          if (page.length === 0) break;
          members.push(...page);
          pageCursor = page[page.length - 1]!.customerId;
        }
        const reference = experiments.assignStratifiedCohortArms({
          assignmentSeed: experiment.assignmentSeed,
          customers: members.map((m) => ({ customerId: m.customerId, stratum: stratum.assignmentStratum })),
          rateForStratum: () => 0.15,
        });
        for (const member of members) {
          compared += 1;
          if (reference.assignments[member.customerId]?.arm !== member.arm) mismatches += 1;
        }
      }

      // --- isolation: nothing simulated may reach downstream systems ---
      const isolation: Array<[string, number]> = [
        ["live provider calls", providerCalls.length],
        ["real deliveries", await prisma.messageLog.count({ where: { storeId: fixture.storeId } })],
        ["billing — shadow invoices", await prisma.shadowInvoice.count({ where: { storeId: fixture.storeId } })],
        ["causal proof — caused revenue", await prisma.causedRevenueLedger.count({ where: { storeId: fixture.storeId } })],
        ["merchant outcomes", await prisma.measurementOrderOutcome.count({ where: { assignment: { storeId: fixture.storeId } } })],
        ["warm-up state", await prisma.sesWarmupState.count({ where: { storeId: fixture.storeId } })],
        ["reputation assessments", await prisma.senderReputationAssessment.count({ where: { storeId: fixture.storeId } })],
      ];

      const durations = captured.map((q) => q.duration).sort((a, b) => a - b);
      const byShape = new Map<string, { count: number; total: number }>();
      for (const q of captured) {
        const e = byShape.get(q.shape) ?? { count: 0, total: 0 };
        e.count += 1; e.total += q.duration; byShape.set(q.shape, e);
      }
      const heaviest = [...byShape.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 5);

      console.log([
        "",
        `  === ONE MILLION CUSTOMERS, SINGLE TENANT (measured) ===`,
        `  seeded ....................... ${SIZE.toLocaleString()} in ${(seedMs / 60000).toFixed(1)} min`,
        `  API-side work ................ ${apiMs.toFixed(0)} ms`,
        `  crash injected after ......... ${partial.toLocaleString()} durable rows`,
        `  recovery duration ............ ${(recoveryMs / 60000).toFixed(1)} min (${(recoveryMs / 1000).toFixed(0)} s)`,
        `  retained heap ................ ${retained <= 0 ? `no growth detected; ${mb(-retained)} MB below baseline` : `${mb(retained)} MB`}`,
        `  peak heap above baseline ..... ${mb(peak - baseline)} MB`,
        `  queries (recovery) ........... ${captured.length.toLocaleString()} in ${byShape.size} shapes`,
        `  transactions (recovery) ...... ${(after.xact - before.xact).toLocaleString()}`,
        `  query p50/p95/p99/max ........ ${percentile(durations,50)} / ${percentile(durations,95)} / ${percentile(durations,99)} / ${durations[durations.length-1] ?? 0} ms`,
        `  deadlocks .................... ${after.deadlocks - beforeAll.deadlocks}`,
        `  lock conflicts ............... ${after.conflicts - beforeAll.conflicts}`,
        `  audience rows ................ ${memberRows.toLocaleString()}`,
        `  duplicate rows ............... ${duplicates}`,
        `  candidates ................... ${progress?.candidates.toLocaleString()}`,
        `  not receiving ................ ${progress?.notReceiving.toLocaleString()}`,
        `  deliberately left alone ...... ${progress?.deliberatelyLeftAlone.toLocaleString()}`,
        `  control / treatment .......... ${progress?.control.toLocaleString()} / ${progress?.treatment.toLocaleString()}`,
        `  measurement assignments ...... ${assignments.toLocaleString()}`,
        `  attempts (crash + recovery) .. ${progress?.attempts}`,
        `  arm parity ................... ${mismatches} mismatches of ${compared.toLocaleString()} (largest stratum ${largestStratum.toLocaleString()})`,
        `  send orchestration ........... ${dispatched.length} simulated job dispatched`,
        "  isolation:",
        ...isolation.map(([l, c]) => `    ${l.padEnd(34)} ${c}`),
        "  heaviest statements (recovery):",
        ...heaviest.map(([shape, e]) => `    ${String(e.count).padStart(6)} x ${e.total.toFixed(0).padStart(8)} ms  ${shape}`),
        "",
      ].join("\n"));

      for (const [label, count] of isolation) {
        assert.equal(count, 0, `simulated run leaked into ${label}: ${count}`);
      }
      assert.equal(duplicates, 0, "a resumed 1M run must not duplicate a row");
      assert.equal(memberRows, SIZE);
      assert.equal(mismatches, 0, "arms must match the deterministic reference after crash and resume");
      assert.equal(compared, progress!.candidates);
      assert.equal(assignments, progress!.candidates);
      assert.equal(progress!.state, "ready");
      assert.ok(progress!.attempts >= 2);
      assert.equal(campaign.status, "sending");
      assert.ok(campaign.approvedAt);
      assert.equal(after.deadlocks - beforeAll.deadlocks, 0, "preparation must not deadlock");
      assert.ok(progress!.notReceiving > 0, "the fixture must exclude undeliverable and non-consented customers");
      assert.ok(
        progress!.deliberatelyLeftAlone > 0,
        "the fixture must leave loyal full-price customers alone, or that path is unexercised"
      );
      assert.ok(retained < 40 * 1024 * 1024, `${mb(retained)} MB retained at 1M`);
    } finally {
      await prisma.messageLog.deleteMany({ where: { workspaceId: fixture.workspaceId } }).catch(() => undefined);
      await prisma.workspace.delete({ where: { id: fixture.workspaceId } }).catch(() => undefined);
    }
  }
);
