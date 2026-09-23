import assert from "node:assert/strict";
import test from "node:test";
import { seedTenant, type SeededTenant } from "./scale-tenant-fixture";

/**
 * Five-tenant concurrency readiness proof.
 *
 * The register records multi-tenant concurrency as a PENDING proof: nothing
 * established how several large tenants behave sharing one database and one
 * worker pool, and fairness, noisy neighbours and isolation were unproven.
 * This is that proof.
 *
 * Five synthetic tenants of a million audience members each start their real
 * preparation concurrently. A sixth tenant of a hundred thousand approves
 * while the five are still in flight. One of the five then loses its lease
 * mid-run and must recover — while the other four complete undisturbed.
 *
 * It proves ISOLATION, CORRECTNESS, RECOVERY and COMPLETION. Throughput is
 * reported, never asserted: a slow run on small infrastructure is a sizing
 * fact, whereas a tenant seeing another tenant's customer is a defect.
 *
 * Disposable Postgres, synthetic tenants, simulated provider. No Shopify, no
 * Resend, no SES, no Railway, no real recipients.
 *
 *   NODE_OPTIONS=--expose-gc TEST_DATABASE_URL=postgresql://…/joon_scale_test \
 *     pnpm --filter @allohq/workers exec tsx --test \
 *     src/workers/five-tenant.load.integration.ts
 *
 * `.load.integration.ts` keeps it out of the ordinary integration run, the
 * same way the 1M and 100k proofs are kept out.
 *
 * FIVE_TENANT_SIZE exists so the assertions can be rehearsed at a small size
 * on a laptop. The DEFAULT is the real workload; a rehearsal must be reported
 * as a rehearsal and never quoted as the proof.
 */
const databaseUrl = process.env["TEST_DATABASE_URL"];
const SIZE = Number(process.env["FIVE_TENANT_SIZE"] ?? 1_000_000);
const LATE_SIZE = Number(process.env["FIVE_TENANT_LATE_SIZE"] ?? 100_000);
const TENANTS = Number(process.env["FIVE_TENANT_COUNT"] ?? 5);
/** Which of the concurrent tenants loses its lease. */
const CRASH_INDEX = Math.min(2, TENANTS - 1);

async function load() {
  process.env["DATABASE_URL"] = databaseUrl;
  const { prisma } = await import("@allohq/database");
  const job = await import("./prepare-audience");
  const engine = await import("@allohq/campaign-engine");
  const experiments = await import("@allohq/customer-state");
  return { prisma, ...job, ...engine, experiments };
}

const mb = (bytes: number) => Math.round((bytes / 1024 / 1024) * 100) / 100;
let lastCheckpoint = "nothing yet";
function checkpoint(label: string, detail = "") {
  lastCheckpoint = label;
  console.log(`  [${new Date().toISOString().slice(11, 19)}] ${label}${detail ? ` — ${detail}` : ""}`);
}
async function settle(): Promise<number> {
  for (let i = 0; i < 3; i += 1) {
    (globalThis as Record<string, unknown>)["gc"] instanceof Function &&
      ((globalThis as { gc: () => void }).gc());
    await new Promise((r) => setTimeout(r, 60));
  }
  return process.memoryUsage().heapUsed;
}

type Tenant = SeededTenant & {
  index: number;
  label: string;
  size: number;
  experimentId: string;
  request: Record<string, unknown>;
  dispatched: string[];
  startedAt: number;
  finishedAt: number;
  status: string;
  runId: string | null;
};

test(
  "five tenants of a million, one joining late, one crashing: isolation, correctness, recovery, completion",
  { skip: databaseUrl ? false : "TEST_DATABASE_URL is not set", timeout: 300 * 60 * 1000 },
  async () => {
    if (typeof (globalThis as Record<string, unknown>)["gc"] !== "function") {
      assert.fail("this proof measures retained heap and needs NODE_OPTIONS=--expose-gc");
    }
    const { prisma, prepareCampaignAudience, campaignPreparationProgress, completedAudienceRun, experiments } =
      await load();

    const rehearsal = SIZE < 1_000_000;
    checkpoint(
      rehearsal ? "REHEARSAL (not the proof)" : "run started",
      `${TENANTS} x ${SIZE.toLocaleString()} concurrent, plus one late tenant of ${LATE_SIZE.toLocaleString()}`,
    );

    const tenants: Tenant[] = [];
    const makeTenant = async (index: number, size: number, label: string): Promise<Tenant> => {
      const seeded = await seedTenant(prisma, size, label);
      const experiment = await experiments.getOrCreateExperiment(
        seeded.storeId,
        {
          label: `campaign:${seeded.campaignId}:stratified:v1`, source: "campaign", family: "winback",
          campaignId: seeded.campaignId, segmentId: null, segmentName: null,
        },
        0.15,
      );
      return {
        ...seeded, index, label, size, experimentId: experiment.id,
        request: {
          prepareAudience: true as const, campaignId: seeded.campaignId, storeId: seeded.storeId,
          runKey: `approval:five:${experiment.id}`, experimentId: experiment.id,
          assignmentSeed: experiment.assignmentSeed, family: "winback", policyRate: 0.15,
          policyReason: "new_family", evidence: null, deliveryProvider: "resend" as const,
          emailPreflightReceipt: { blockCount: 1, validatedAt: new Date().toISOString() },
          forceImmediate: false, approvedBy: null,
        },
        dispatched: [], startedAt: 0, finishedAt: 0, status: "not started", runId: null,
      };
    };

    const seedStart = process.hrtime.bigint();
    for (let index = 0; index < TENANTS; index += 1) {
      tenants.push(await makeTenant(index, SIZE, `five-${index}`));
      checkpoint(`tenant ${index} seeded`, `${SIZE.toLocaleString()} customers`);
    }
    const seedMs = Number(process.hrtime.bigint() - seedStart) / 1e6;
    checkpoint("seeding complete", `${(seedMs / 60000).toFixed(1)} min for ${TENANTS} tenants`);

    let late: Tenant | null = null;
    /** Every preparation promise, so cleanup never races work still in flight. */
    const outstanding: Array<Promise<unknown>> = [];
    try {
      const baseline = await settle();
      let peak = baseline;
      const sampler = setInterval(() => {
        const used = process.memoryUsage().heapUsed;
        if (used > peak) peak = used;
      }, 50);

      // --- all five start at once ------------------------------------------
      const runStart = process.hrtime.bigint();
      checkpoint("preparation started", `${TENANTS} tenants concurrently`);
      const running: Array<Promise<unknown>> = tenants.map((tenant) => {
        tenant.startedAt = Date.now();
        return prepareCampaignAudience(
          tenant.request as never,
          async (campaignId: string) => { tenant.dispatched.push(campaignId); },
        )
          .then((outcome: { status: string; runId?: string | null }) => {
            tenant.status = outcome.status;
            tenant.runId = outcome.runId ?? null;
            tenant.finishedAt = Date.now();
            return outcome;
          })
          .catch((error: Error) => {
            tenant.status = `threw: ${error.message}`;
            tenant.finishedAt = Date.now();
            return { status: "threw", runId: null };
          });
      });

      // --- wait until every tenant has durable work in flight ---------------
      const inFlight = async () => {
        const counts = await Promise.all(
          tenants.map((tenant) =>
            prisma.campaignAudienceMember.count({ where: { run: { campaignId: tenant.campaignId } } }),
          ),
        );
        return counts;
      };
      let counts: number[] = [];
      for (let attempt = 0; attempt < 400_000; attempt += 1) {
        counts = await inFlight();
        if (counts.every((count) => count > 0)) break;
        await new Promise((r) => setTimeout(r, 25));
      }
      assert.ok(
        counts.every((count) => count > 0),
        `every tenant must be genuinely in flight before the late tenant joins; saw ${counts.join(", ")}`,
      );
      checkpoint("all tenants in flight", counts.map((c) => c.toLocaleString()).join(" / "));

      // --- a sixth tenant approves while the five are still working ---------
      //
      // Seeding it is NOT awaited here. Awaiting it would serialise the proof:
      // the five keep running while the sixth is seeded, which is the point,
      // and at rehearsal sizes an awaited seed consumed the whole window in
      // which the crash below has to land.
      const lateJoin = (async () => {
        const lateSeedStart = process.hrtime.bigint();
        late = await makeTenant(TENANTS, LATE_SIZE, "five-late");
        checkpoint(
          "late tenant seeded mid-flight",
          `${LATE_SIZE.toLocaleString()} customers in ${(Number(process.hrtime.bigint() - lateSeedStart) / 1e6 / 1000).toFixed(0)} s`,
        );
        late.startedAt = Date.now();
        return prepareCampaignAudience(
          late.request as never,
          async (campaignId: string) => { late!.dispatched.push(campaignId); },
        )
          .then((outcome: { status: string; runId?: string | null }) => {
            late!.status = outcome.status;
            late!.runId = outcome.runId ?? null;
            late!.finishedAt = Date.now();
            return outcome;
          })
          .catch((error: Error) => {
            late!.status = `threw: ${error.message}`;
            late!.finishedAt = Date.now();
            return { status: "threw", runId: null };
          });
      })();

      // --- one of the five loses its lease mid-run --------------------------
      const victim = tenants[CRASH_INDEX]!;
      // Revoke as soon as there is ANY durable work. At a million the run lasts
      // minutes and a fifth-of-the-way threshold is comfortable; at rehearsal
      // sizes the whole run can finish inside one poll, so waiting for a
      // fraction would miss the window and prove nothing about recovery.
      let partial = 0;
      for (let attempt = 0; attempt < 2_000_000; attempt += 1) {
        partial = await prisma.campaignAudienceMember.count({
          where: { run: { campaignId: victim.campaignId } },
        });
        if (partial >= Math.max(1, Math.floor(victim.size / 5))) break;
        if (victim.finishedAt) break;
        await new Promise((r) => setTimeout(r, 5));
      }
      const crashLanded = partial > 0 && !victim.finishedAt;
      if (crashLanded) {
        await prisma.campaignAudienceRun.updateMany({
          where: { campaignId: victim.campaignId },
          data: { leaseOwner: "vanished", leaseExpiresAt: new Date(Date.now() - 120_000) },
        });
        checkpoint(`tenant ${CRASH_INDEX} lease revoked`, `${partial.toLocaleString()} durable rows written first`);
      } else {
        checkpoint(
          `tenant ${CRASH_INDEX} finished before a crash could be injected`,
          `${partial.toLocaleString()} rows; recovery is NOT exercised in this run`,
        );
      }

      // --- everyone else must finish regardless ------------------------------
      outstanding.push(...running, lateJoin);
      await Promise.all(running);
      await lateJoin;
      clearInterval(sampler);
      const concurrentMs = Number(process.hrtime.bigint() - runStart) / 1e6;
      const retained = (await settle()) - baseline;
      checkpoint("all concurrent runs settled", `${(concurrentMs / 60000).toFixed(1)} min`);

      const victimProgressAfterCrash = await campaignPreparationProgress(victim.campaignId);
      const victimCompletedAfterCrash = await completedAudienceRun(victim.campaignId);

      // --- the crashed tenant recovers, alone --------------------------------
      let recoveryMs = 0;
      if (crashLanded && victim.status !== "approved") {
        assert.equal(victim.dispatched.length, 0, "a crashed preparation must not dispatch");
        checkpoint(`tenant ${CRASH_INDEX} recovery started`);
        const recoveryStart = process.hrtime.bigint();
        const outcome = await prepareCampaignAudience(
          victim.request as never,
          async (campaignId: string) => { victim.dispatched.push(campaignId); },
        );
        recoveryMs = Number(process.hrtime.bigint() - recoveryStart) / 1e6;
        victim.status = outcome.status;
        victim.runId = outcome.runId ?? victim.runId;
        checkpoint(`tenant ${CRASH_INDEX} recovered`, `${(recoveryMs / 60000).toFixed(1)} min, status ${outcome.status}`);
      } else {
        checkpoint(`tenant ${CRASH_INDEX} finished before the lease revocation landed`);
      }

      // `late` is assigned inside the concurrent join above, which has been
      // awaited by this point; the check keeps that fact explicit rather than
      // asserted by a non-null operator.
      assert.ok(late, "the late tenant never started");
      const lateTenant: Tenant = late;
      const all: Tenant[] = [...tenants, lateTenant];

      // ======================= ASSERTIONS ==================================
      const failed: Array<{ label: string; detail: string }> = [];
      const check = (ok: boolean, label: string, detail = "") => {
        if (!ok) failed.push({ label, detail });
        return ok;
      };

      // --- completion --------------------------------------------------------
      for (const tenant of all) {
        check(tenant.status === "approved", `tenant ${tenant.index} completed`, `status ${tenant.status}`);
        check(tenant.dispatched.length === 1, `tenant ${tenant.index} dispatched exactly once`,
          `${tenant.dispatched.length} dispatches`);
        const progress = await campaignPreparationProgress(tenant.campaignId);
        check(progress?.state === "ready", `tenant ${tenant.index} reports ready`, `state ${progress?.state}`);
      }

      // --- isolation: no tenant may hold another tenant's customer -----------
      //
      // The single most important assertion in this file. Done in SQL so it
      // examines every row rather than a sample.
      let crossTenantRows = 0;
      for (const tenant of all) {
        const leak = await prisma.$queryRaw<Array<{ n: bigint }>>`
          SELECT COUNT(*)::bigint AS n
          FROM "campaign_audience_members" m
          JOIN "campaign_audience_runs" r ON r."id" = m."runId"
          JOIN "customers" c ON c."id" = m."customerId"
          WHERE r."campaignId" = ${tenant.campaignId} AND c."storeId" <> ${tenant.storeId}`;
        const n = Number(leak[0]?.n ?? 0);
        crossTenantRows += n;
        check(n === 0, `tenant ${tenant.index} holds only its own customers`, `${n} foreign rows`);
      }

      // --- isolation: a run belongs to exactly one tenant --------------------
      for (const tenant of all) {
        const foreignRuns = await prisma.campaignAudienceRun.count({
          where: { campaignId: tenant.campaignId, storeId: { not: tenant.storeId } },
        });
        check(foreignRuns === 0, `tenant ${tenant.index} runs carry its own store`, `${foreignRuns} foreign runs`);
      }

      // --- isolation: assignments never cross a tenant boundary --------------
      for (const tenant of all) {
        const assignments = await prisma.measurementAssignment.count({
          where: { unitType: "campaign", unitId: tenant.campaignId },
        });
        const foreign = await prisma.measurementAssignment.count({
          where: { unitType: "campaign", unitId: tenant.campaignId, experimentId: { not: tenant.experimentId } },
        });
        check(foreign === 0, `tenant ${tenant.index} assignments stay in its experiment`, `${foreign} foreign`);
        check(assignments > 0, `tenant ${tenant.index} produced assignments`, `${assignments}`);
      }

      // --- correctness: per-tenant totals are self-consistent ----------------
      const perTenant: Array<{ index: number; size: number; members: number; candidates: number; control: number; treatment: number; leftAlone: number; notReceiving: number; attempts: number; seconds: number }> = [];
      let totalMembers = 0;
      for (const tenant of all) {
        // A recovered run reports its id through the completed run rather than
        // the original outcome, so fall back to the database before giving up.
        const runId =
          tenant.runId ?? (await completedAudienceRun(tenant.campaignId))?.id ?? null;
        if (!runId) {
          check(false, `tenant ${tenant.index} produced a completed run`, `status ${tenant.status}`);
          continue;
        }
        tenant.runId = runId;
        const members = await prisma.campaignAudienceMember.count({ where: { runId } });
        const distinct = await prisma.$queryRaw<Array<{ d: bigint }>>`
          SELECT COUNT(DISTINCT "customerId")::bigint AS d
          FROM "campaign_audience_members" WHERE "runId" = ${runId}`;
        const duplicates = members - Number(distinct[0]?.d ?? 0);
        const progress = await campaignPreparationProgress(tenant.campaignId);
        totalMembers += members;

        check(duplicates === 0, `tenant ${tenant.index} has no duplicate members`, `${duplicates}`);
        check(
          (progress?.control ?? 0) + (progress?.treatment ?? 0) === (progress?.candidates ?? -1),
          `tenant ${tenant.index} control + treatment equals candidates`,
          `${progress?.control} + ${progress?.treatment} vs ${progress?.candidates}`,
        );
        check((progress?.candidates ?? 0) > 0, `tenant ${tenant.index} produced candidates`, `${progress?.candidates}`);

        // Arm parity: a member's arm must match its measurement assignment.
        const mismatched = await prisma.$queryRaw<Array<{ n: bigint }>>`
          SELECT COUNT(*)::bigint AS n
          FROM "campaign_audience_members" m
          JOIN "measurement_assignments" a
            ON a."customerId" = m."customerId" AND a."unitId" = ${tenant.campaignId} AND a."unitType" = 'campaign'
          WHERE m."runId" = ${runId} AND m."arm" IS NOT NULL AND a."arm" <> m."arm"`;
        check(Number(mismatched[0]?.n ?? 0) === 0, `tenant ${tenant.index} arms agree with assignments`,
          `${Number(mismatched[0]?.n ?? 0)} mismatched`);

        perTenant.push({
          index: tenant.index, size: tenant.size, members,
          candidates: progress?.candidates ?? 0, control: progress?.control ?? 0,
          treatment: progress?.treatment ?? 0, leftAlone: progress?.deliberatelyLeftAlone ?? 0,
          notReceiving: progress?.notReceiving ?? 0, attempts: progress?.attempts ?? 0,
          seconds: Math.round((tenant.finishedAt - tenant.startedAt) / 1000),
        });
      }

      // --- isolation: the whole database holds nothing beyond these tenants --
      const allRunIds = all.map((tenant) => tenant.runId).filter((id): id is string => !!id);
      const everyMember = await prisma.campaignAudienceMember.count({ where: { runId: { in: allRunIds } } });
      check(everyMember === totalMembers, "no member row belongs to an unexpected run",
        `${everyMember} vs ${totalMembers}`);

      // --- recovery ----------------------------------------------------------
      // A run that finished before the lease could be revoked proves nothing
      // about recovery, and must not be reported as if it had.
      check(
        !crashLanded || victim.status === "approved",
        `crashed tenant ${CRASH_INDEX} recovered`,
        victim.status,
      );
      check(
        crashLanded || SIZE < 1_000_000,
        "the crash landed (required at the full workload)",
        "the victim completed before its lease could be revoked",
      );
      check(victim.dispatched.length === 1, `crashed tenant ${CRASH_INDEX} dispatched once overall`,
        `${victim.dispatched.length}`);
      const survivors = tenants.filter((tenant) => tenant.index !== CRASH_INDEX);
      check(
        survivors.every((tenant) => tenant.status === "approved"),
        "the other tenants completed despite a neighbour crashing",
        survivors.map((tenant) => `${tenant.index}:${tenant.status}`).join(" "),
      );
      check(
        survivors.every((tenant) => tenant.dispatched.length === 1),
        "a neighbour's crash caused no extra or missing dispatch",
        survivors.map((tenant) => `${tenant.index}:${tenant.dispatched.length}`).join(" "),
      );

      // --- the late tenant ---------------------------------------------------
      check(lateTenant.status === "approved", "the late tenant completed", lateTenant.status);
      check(
        lateTenant.startedAt > tenants[0]!.startedAt,
        "the late tenant started after the others were already running",
        "",
      );

      // --- no side effects ---------------------------------------------------
      const workspaceIds = all.map((tenant) => tenant.workspaceId);
      const messages = await prisma.messageLog.count({ where: { workspaceId: { in: workspaceIds } } });
      check(messages === 0, "no message was logged as sent", `${messages} rows`);

      const durations = all.map((tenant) => (tenant.finishedAt - tenant.startedAt) / 1000);
      const slowest = Math.max(...durations);
      const fastest = Math.min(...durations.filter((d) => d > 0));

      console.log([
        "",
        `  === ${TENANTS} TENANTS x ${SIZE.toLocaleString()} + 1 x ${LATE_SIZE.toLocaleString()} — ${failed.length === 0 ? "PASS" : "FAIL"} ===`,
        ...(rehearsal
          ? ["  REHEARSAL ONLY: below the one-million workload; not the readiness proof.", ""]
          : []),
        `  seeding ....................... ${(seedMs / 60000).toFixed(1)} min`,
        `  concurrent phase .............. ${(concurrentMs / 60000).toFixed(1)} min`,
        `  crashed-tenant recovery ....... ${(recoveryMs / 60000).toFixed(1)} min`,
        `  retained heap ................. ${retained <= 0 ? `no growth detected; ${mb(-retained)} MB below baseline` : `${mb(retained)} MB`}`,
        `  peak heap above baseline ...... ${mb(peak - baseline)} MB`,
        `  slowest / fastest tenant ...... ${slowest.toFixed(0)} s / ${fastest.toFixed(0)} s (spread ${(slowest / Math.max(fastest, 1)).toFixed(1)}x)`,
        `  cross-tenant member rows ...... ${crossTenantRows}`,
        `  audience rows, all tenants .... ${totalMembers.toLocaleString()}`,
        "",
        "  --- per tenant ---",
        ...perTenant.map((row) =>
          `    t${row.index}${row.index === CRASH_INDEX ? "*" : " "} ${row.size.toLocaleString().padStart(9)} seeded  ` +
          `${row.candidates.toLocaleString().padStart(9)} candidates  ` +
          `${row.control.toLocaleString().padStart(8)} control  ${row.treatment.toLocaleString().padStart(9)} treatment  ` +
          `${String(row.attempts).padStart(2)} attempts  ${String(row.seconds).padStart(5)} s`),
        `    * tenant ${CRASH_INDEX} lost its lease mid-run and recovered`,
        "",
        `  victim state right after the crash: ${victimProgressAfterCrash?.state}, completed run ${victimCompletedAfterCrash ? "present" : "absent"}`,
        "",
      ].join("\n"));

      assert.equal(
        failed.length, 0,
        `${failed.length} check(s) failed: ${failed.map((entry) => `${entry.label} (${entry.detail})`).join("; ")}`,
      );
    } catch (error) {
      if (!(error as { code?: string }).code?.startsWith?.("ERR_ASSERTION")) {
        console.log([
          "",
          `  === ${TENANTS} TENANTS — INCONCLUSIVE ===`,
          `  the harness stopped after: ${lastCheckpoint}`,
          `  ${(error as Error).message}`,
          "  No readiness conclusion may be drawn from this run.",
          "",
        ].join("\n"));
      }
      throw error;
    } finally {
      // Cleanup is unconditional: a disposable database still has to come back
      // empty, or the next run measures the previous one's leftovers.
      // Settle first: deleting a workspace while its preparation is still
      // running deadlocks against that work's own transactions, which reads as
      // a hung proof rather than a failed one.
      await Promise.allSettled(outstanding);
      for (const tenant of [...tenants, ...(late ? [late] : [])]) {
        await prisma.messageLog.deleteMany({ where: { workspaceId: tenant.workspaceId } }).catch(() => undefined);
        await prisma.workspace.delete({ where: { id: tenant.workspaceId } }).catch(() => undefined);
      }
      // Without this the client keeps the event loop alive and the runner
      // never exits, so the failure message is never printed — the run looks
      // like a hang rather than a result.
      await prisma.$disconnect().catch(() => undefined);
    }
  },
);
