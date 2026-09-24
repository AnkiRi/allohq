import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";

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
 *     npx tsx --test apps/workers/src/workers/prepare-audience.million.load.integration.ts
 *
 * Named `.load.integration.ts` so the default integration run skips it, the
 * same way the 100k approval proof is skipped. It was `.integration.ts` at
 * first, which quietly put a million-customer run inside every pull request —
 * roughly fifteen minutes, on every branch, to re-prove something that has its
 * own workflow. It still runs on demand and on a `proof/**` branch, which is
 * where it was always meant to run.
 */
import { seedTenant } from "./scale-tenant-fixture";

const databaseUrl = process.env["TEST_DATABASE_URL"];
const SIZE = Number(process.env["MILLION_SIZE"] ?? 1_000_000);
/**
 * Deliberately sparse strata, reserved at the very start of the cohort and
 * exempted from every exclusion rule so they survive as candidates. Eight
 * strata of five pool into one `pooled_small` stratum of forty, which draws a
 * real control quota (floor(40 x 0.15) = 6). Without this, pooling at a
 * million customers is code that never runs.
 */

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
 * Structured progress, printed as it happens.
 *
 * Progress visibility only. A checkpoint says where the harness got to; it
 * never says the proof passed. The verdict is printed once, at the end, after
 * every check has run.
 */
const startedAt = process.hrtime.bigint();
let lastCheckpoint = "not started";
function checkpoint(name: string, detail = "") {
  lastCheckpoint = name;
  const seconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
  console.log(`[checkpoint ${seconds.toFixed(1).padStart(7)}s] ${name}${detail ? ` — ${detail}` : ""}`);
}

/** Every check, collected rather than asserted, so one run reports all of them. */
const checks: Array<{ label: string; ok: boolean; detail: string }> = [];
function check(label: string, ok: boolean, detail = "") {
  checks.push({ label, ok, detail });
}

// ---------------------------------------------------------------------------
// The independent oracle.
//
// This re-derives the documented assignment rules from scratch. It deliberately
// does not import assignmentValue, assignStratifiedCohortArms or
// planStratifiedControlQuotas, and it does not reuse the ranking query. If the
// oracle called the same code the product calls, agreement would prove nothing.
//
// The documented rules:
//   value(seed, stratum, customer) = first 6 bytes, big-endian, of
//                                    sha256("seed:stratum:customer") / 2^48
//   strata with fewer than ten candidates pool into "pooled_small"
//   controlCount = min(floor(n * rate), n - 1)
//   rank ascending by (value, customerId in byte order); the first
//   controlCount ranked are CONTROL, the rest TREATMENT
// ---------------------------------------------------------------------------

const ORACLE_POOL_BELOW = 10;
const ORACLE_POOLED_STRATUM = "pooled_small";
const ORACLE_RATE = 0.15;

/**
 * Written out byte by byte rather than with readUIntBE, so this is a second
 * implementation of the documented rule and not the same call in a new place.
 */
function oracleAssignmentValue(seed: string, assignmentStratum: string, customerId: string): number {
  const digest = createHash("sha256").update(`${seed}:${assignmentStratum}:${customerId}`).digest();
  let integer = 0;
  for (let index = 0; index < 6; index += 1) integer = integer * 256 + digest[index]!;
  return integer / 281474976710656; // 2^48
}

/**
 * The documented value as the database can hold it. Measured: a double written
 * through Prisma keeps sixteen significant digits, so about a quarter of these
 * values — the ones whose shortest exact decimal needs seventeen — are stored
 * one or two units in the last place away from what was computed.
 */
function storedPrecision(value: number): number {
  return Number(value.toPrecision(16));
}

/** Byte order, which is what COLLATE "C" means. Not localeCompare. */
function oracleByteOrder(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

function oracleControlQuota(size: number, rate: number): number {
  return Math.min(Math.floor(size * rate), Math.max(0, size - 1));
}

/**
 * A tenant with the mix a real store has: consent failures, undeliverable
 * addresses, recent purchasers, fatigue and collision holds, loyal full-price
 * customers Joon leaves alone, plenty of ordinary candidates, and both large
 * and sub-ten strata so pooled control behaviour is exercised.
 */

test(
  "one million customers: preparation, crash, recovery, all measured",
  { skip: databaseUrl ? false : "TEST_DATABASE_URL is not set", timeout: 180 * 60 * 1000 },
  async () => {
    if (typeof (globalThis as Record<string, unknown>)["gc"] !== "function") {
      assert.fail("this proof measures retained heap and needs NODE_OPTIONS=--expose-gc");
    }
    const { prisma, prepareCampaignAudience, campaignPreparationProgress, completedAudienceRun, experiments } = await load();

    checkpoint("run started", `${SIZE.toLocaleString()} customers`);
    const seedStart = process.hrtime.bigint();
    const fixture = await seedTenant(prisma, SIZE, "single");
    const seedMs = Number(process.hrtime.bigint() - seedStart) / 1e6;
    checkpoint("seed complete", `${(seedMs / 60000).toFixed(1)} min`);

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
      checkpoint("preparation started");
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
      checkpoint("crash injected", `${partial.toLocaleString()} durable rows written first`);
      assert.notEqual((await campaignPreparationProgress(fixture.campaignId))?.state, "ready");
      assert.equal(await completedAudienceRun(fixture.campaignId), null);
      // Held in a local, because assert.equal narrows its argument's type and
      // would leave dispatched.length fixed at 0 for the rest of the test.
      const dispatchedAfterCrash = dispatched.length;
      assert.equal(dispatchedAfterCrash, 0, "a crashed preparation must not dispatch");

      // --- recovery, measured ---
      const baseline = await settle();
      let peak = baseline;
      const sampler = setInterval(() => {
        const used = process.memoryUsage().heapUsed;
        if (used > peak) peak = used;
      }, 50);
      queries.length = 0;
      const before = await dbCounters(prisma);
      checkpoint("recovery started");
      const recoveryStart = process.hrtime.bigint();
      const outcome = await prepareCampaignAudience(request, simulatedProvider);
      const recoveryMs = Number(process.hrtime.bigint() - recoveryStart) / 1e6;
      clearInterval(sampler);
      const after = await dbCounters(prisma);
      const retained = (await settle()) - baseline;
      const captured = queries.splice(0, queries.length);

      checkpoint("preparation complete", `${(recoveryMs / 60000).toFixed(1)} min after resume, status ${outcome.status}`);
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

      // --- verification against the independent oracle -------------------
      //
      // Measured on its own baseline: the question "does the product hold a
      // million customers in memory" is not the same question as "does the
      // checker hold a million customers in memory", and conflating them is
      // what made the first two attempts inconclusive.
      checkpoint("verification started");
      const verifierBaseline = await settle();
      let verifierPeak = verifierBaseline;
      const verifierSampler = setInterval(() => {
        const used = process.memoryUsage().heapUsed;
        if (used > verifierPeak) verifierPeak = used;
      }, 50);
      const verifyStart = process.hrtime.bigint();

      // 1. The oracle derives pooling itself, from the census of ORIGINAL
      //    strata. Reading assignmentStratum back and agreeing with it would
      //    prove nothing about whether pooling was applied correctly.
      const originalCensus = await prisma.campaignAudienceMember.groupBy({
        by: ["stratum"],
        where: { runId, decision: "campaign_candidate" },
        _count: { _all: true },
      });
      const oraclePooling = new Map<string, string>();
      const oracleSizes = new Map<string, number>();
      for (const row of originalCensus) {
        const target =
          row._count._all < ORACLE_POOL_BELOW ? ORACLE_POOLED_STRATUM : row.stratum;
        oraclePooling.set(row.stratum, target);
        oracleSizes.set(target, (oracleSizes.get(target) ?? 0) + row._count._all);
      }
      const oracleQuotas = new Map(
        [...oracleSizes].map(([stratum, size]) => [stratum, oracleControlQuota(size, ORACLE_RATE)])
      );
      const pooledSourceStrata = [...oraclePooling.entries()].filter(
        ([, target]) => target === ORACLE_POOLED_STRATUM
      ).length;

      // 2. Walk one assignment stratum at a time. The working set is the
      //    largest stratum, never the cohort.
      let mismatches = 0;
      let compared = 0;
      let largestStratum = 0;
      let hashMismatches = 0;
      let hashPrecisionDifferences = 0;
      let poolingMismatches = 0;
      let quotaMismatches = 0;
      let pooledCompared = 0;
      let pooledControls = 0;
      const firstDifference: string[] = [];

      for (const [assignmentStratum, expectedSize] of oracleSizes) {
        largestStratum = Math.max(largestStratum, expectedSize);
        const ranked: Array<{ customerId: string; value: number }> = [];
        const stored = new Map<string, string | null>();
        let pageCursor: string | undefined;
        for (;;) {
          const page: Array<{
            customerId: string;
            arm: string | null;
            stratum: string;
            assignmentStratum: string | null;
            assignmentHash: number | null;
          }> = await prisma.campaignAudienceMember.findMany({
            where: {
              runId,
              decision: "campaign_candidate",
              assignmentStratum,
              ...(pageCursor ? { customerId: { gt: pageCursor } } : {}),
            },
            select: {
              customerId: true,
              arm: true,
              stratum: true,
              assignmentStratum: true,
              assignmentHash: true,
            },
            orderBy: { customerId: "asc" },
            take: 20_000,
          });
          if (page.length === 0) break;
          for (const row of page) {
            // Pooling: the product's assignment stratum must be the one the
            // oracle derives from this row's original stratum.
            if (oraclePooling.get(row.stratum) !== row.assignmentStratum) {
              poolingMismatches += 1;
              if (firstDifference.length < 3) {
                firstDifference.push(
                  `pooling ${row.customerId}: stratum ${row.stratum} stored ${row.assignmentStratum} oracle ${oraclePooling.get(row.stratum)}`
                );
              }
            }
            // Hash: recomputed here from the documented rule, not read back.
            const value = oracleAssignmentValue(
              experiment.assignmentSeed,
              assignmentStratum,
              row.customerId
            );
            // Measured, not assumed: writing a double through Prisma keeps
            // sixteen significant digits, so a value whose shortest exact
            // decimal needs seventeen comes back one or two units in the last
            // place away. The stored column must equal the documented value as
            // storage can hold it; anything else is a real defect.
            if (row.assignmentHash !== storedPrecision(value)) {
              hashMismatches += 1;
              if (firstDifference.length < 3) {
                firstDifference.push(
                  `hash ${row.customerId}: stored ${row.assignmentHash} oracle ${storedPrecision(value)}`
                );
              }
            }
            // Recorded separately: how often storage precision alone differs
            // from the exact documented value. Not a failure — ranking below
            // uses the exact value, so an arm mismatch is what would matter.
            if (row.assignmentHash !== value) hashPrecisionDifferences += 1;
            ranked.push({ customerId: row.customerId, value });
            stored.set(row.customerId, row.arm);
          }
          pageCursor = page[page.length - 1]!.customerId;
        }

        // 3. Rank and draw the control quota independently of Postgres.
        ranked.sort((a, b) => a.value - b.value || oracleByteOrder(a.customerId, b.customerId));
        const quota = oracleQuotas.get(assignmentStratum) ?? 0;
        const controls = new Set(ranked.slice(0, quota).map((entry) => entry.customerId));
        let storedControls = 0;
        for (const [customerId, arm] of stored) {
          compared += 1;
          const expectedArm = controls.has(customerId) ? "CONTROL" : "TREATMENT";
          if (arm === "CONTROL") storedControls += 1;
          if (arm !== expectedArm) {
            mismatches += 1;
            if (firstDifference.length < 3) {
              firstDifference.push(`arm ${customerId}: stored ${arm} oracle ${expectedArm}`);
            }
          }
        }
        if (storedControls !== quota) quotaMismatches += 1;
        if (assignmentStratum === ORACLE_POOLED_STRATUM) {
          pooledCompared = stored.size;
          pooledControls = storedControls;
        }
        if (stored.size !== expectedSize) quotaMismatches += 1;
      }

      clearInterval(verifierSampler);
      const verifyMs = Number(process.hrtime.bigint() - verifyStart) / 1e6;
      const verifierRetained = (await settle()) - verifierBaseline;
      checkpoint("verification complete", `${(verifyMs / 1000).toFixed(0)} s`);

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

      // --- every check, collected rather than asserted one at a time ------
      //
      // Assertions run before anything is printed, and the block is headed
      // with the verdict. A printed measurement block that appears before the
      // checks have run reads like a result when it is not one.
      for (const [label, count] of isolation) {
        check(`isolation: no ${label}`, count === 0, `${count}`);
      }
      check("no duplicate member rows after crash and resume", duplicates === 0, `${duplicates}`);
      check("every seeded customer has exactly one decision", memberRows === SIZE,
        `${memberRows.toLocaleString()} of ${SIZE.toLocaleString()}`);
      check("arms match the independent oracle", mismatches === 0,
        `${mismatches} of ${compared.toLocaleString()}`);
      check("assignment hashes match the independently recomputed rule, as stored", hashMismatches === 0,
        `${hashMismatches} of ${compared.toLocaleString()}`);
      check("small strata pooled exactly as the documented rule says", poolingMismatches === 0,
        `${poolingMismatches} of ${compared.toLocaleString()}`);
      check("control quota per stratum matches the independent quota", quotaMismatches === 0,
        `${quotaMismatches} strata differ`);
      check("pooling was actually exercised", pooledSourceStrata >= 2 && pooledCompared > 0,
        `${pooledSourceStrata} sparse strata pooled into ${pooledCompared} candidates`);
      check("the pooled stratum drew a real control quota", pooledControls > 0,
        `${pooledControls} control of ${pooledCompared}`);
      check("every candidate was compared", compared === progress!.candidates,
        `${compared.toLocaleString()} vs ${progress!.candidates.toLocaleString()}`);
      check("one measurement assignment per candidate", assignments === progress!.candidates,
        `${assignments.toLocaleString()}`);
      check("the audience reached ready", progress!.state === "ready", `${progress!.state}`);
      check("the run survived a crash and a resume", (progress!.attempts ?? 0) >= 2,
        `${progress!.attempts} attempts`);
      check("the campaign was approved and handed to delivery", campaign.status === "sending" && Boolean(campaign.approvedAt),
        `${campaign.status}`);
      check("preparation did not deadlock", after.deadlocks - beforeAll.deadlocks === 0,
        `${after.deadlocks - beforeAll.deadlocks}`);
      check("the fixture excluded undeliverable and non-consented customers", progress!.notReceiving > 0,
        `${progress!.notReceiving.toLocaleString()}`);
      check("the fixture left loyal full-price customers alone", progress!.deliberatelyLeftAlone > 0,
        `${progress!.deliberatelyLeftAlone.toLocaleString()}`);
      check("preparation retained under 40 MB", retained < 40 * 1024 * 1024, `${mb(retained)} MB`);
      check("exactly one simulated send job dispatched", dispatched.length === 1, `${dispatched.length}`);

      const failed = checks.filter((entry) => !entry.ok);
      const verdict = failed.length === 0 ? "PASS" : "FAIL";

      console.log([
        "",
        `  === ONE MILLION CUSTOMERS, SINGLE TENANT — ${verdict} ===`,
        `  ${checks.length - failed.length} of ${checks.length} checks passed`,
        "",
        ...checks.map((entry) => `    ${entry.ok ? "PASS" : "FAIL"}  ${entry.label.padEnd(58)} ${entry.detail}`),
        "",
        "  --- production preparation, measured ---",
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
        "",
        "  --- verifier, measured separately ---",
        `  verification duration ........ ${(verifyMs / 1000).toFixed(0)} s`,
        `  verifier retained heap ....... ${verifierRetained <= 0 ? `no growth detected; ${mb(-verifierRetained)} MB below baseline` : `${mb(verifierRetained)} MB`}`,
        `  verifier peak above baseline . ${mb(verifierPeak - verifierBaseline)} MB`,
        `  largest stratum replayed ..... ${largestStratum.toLocaleString()}`,
        `  hashes differing by storage .. ${hashPrecisionDifferences.toLocaleString()} of ${compared.toLocaleString()} (float8 keeps 16 significant digits; ranking uses the exact value, and no arm differed)`,
        "",
        "  --- what preparation produced ---",
        `  audience rows ................ ${memberRows.toLocaleString()}`,
        `  duplicate rows ............... ${duplicates}`,
        `  candidates ................... ${progress?.candidates.toLocaleString()}`,
        `  not receiving ................ ${progress?.notReceiving.toLocaleString()}`,
        `  deliberately left alone ...... ${progress?.deliberatelyLeftAlone.toLocaleString()}`,
        `  control / treatment .......... ${progress?.control.toLocaleString()} / ${progress?.treatment.toLocaleString()}`,
        `  measurement assignments ...... ${assignments.toLocaleString()}`,
        `  attempts (crash + recovery) .. ${progress?.attempts}`,
        `  pooled stratum ............... ${pooledSourceStrata} sparse strata -> ${pooledCompared} candidates, ${pooledControls} control`,
        `  send orchestration ........... ${dispatched.length} simulated job dispatched`,
        "  heaviest statements (recovery):",
        ...heaviest.map(([shape, e]) => `    ${String(e.count).padStart(6)} x ${e.total.toFixed(0).padStart(8)} ms  ${shape}`),
        ...(firstDifference.length ? ["  first differences:", ...firstDifference.map((d) => `    ${d}`)] : []),
        "",
      ].join("\n"));

      assert.equal(
        failed.length,
        0,
        `${failed.length} check(s) failed: ${failed.map((entry) => entry.label).join("; ")}`
      );

    } catch (error) {
      // An assertion failure is a FAIL and has already printed its block. A
      // harness error is neither a pass nor a fail: it means the proof did not
      // finish, and the checkpoint stream says where it stopped.
      if (!(error as { code?: string }).code?.startsWith?.("ERR_ASSERTION")) {
        console.log([
          "",
          "  === ONE MILLION CUSTOMERS, SINGLE TENANT — INCONCLUSIVE ===",
          `  the harness stopped after: ${lastCheckpoint}`,
          `  ${(error as Error).message}`,
          "  No readiness conclusion may be drawn from this run.",
          "",
        ].join("\n"));
      }
      throw error;
    } finally {
      await prisma.messageLog.deleteMany({ where: { workspaceId: fixture.workspaceId } }).catch(() => undefined);
      await prisma.workspace.delete({ where: { id: fixture.workspaceId } }).catch(() => undefined);
    }
  }
);
