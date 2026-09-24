import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { seedTenant, type SeededTenant } from "./scale-tenant-fixture";
import { memoryTrend, type Trend, type TrendThresholds } from "../utils/memory-trend";
import { processMemory, type MemoryBreakdown } from "../utils/process-memory";

/**
 * Preparation soak: does one long-lived worker process hold on to memory?
 *
 * The 5 x 1M proof ended 0.78 MB above its starting heap. That is one
 * observation after one run, not a leak measurement. This keeps ONE process
 * alive through many moderate campaign preparations — several tenants at once,
 * with lease loss, sweeper recovery and duplicate deliveries mixed in — and
 * records post-GC heap, resident memory and external memory after every cycle.
 * The verdict comes from the steady-state trend (see `memory-trend.ts`), never
 * from a single number.
 *
 * It then proves it can see a leak: a canary phase in the same process keeps
 * each cycle's prepared audience rows, and the same detector must call that
 * sustained growth. A detector that never fires would make the soak's
 * "no growth" worthless.
 *
 * Disposable Postgres, synthetic tenants, no provider, no real recipients: the
 * send is recorded by a callback and never queued.
 *
 *   NODE_OPTIONS=--expose-gc TEST_DATABASE_URL=postgresql://…/joon_soak_test \
 *     pnpm --filter @allohq/workers exec tsx --test \
 *     src/workers/preparation-soak.load.integration.ts
 *
 * Fewer than 50 cycles is a rehearsal and says so.
 */
const databaseUrl = process.env["TEST_DATABASE_URL"];
const CYCLES = Number(process.env["SOAK_CYCLES"] ?? 60);
const TENANTS = Number(process.env["SOAK_TENANTS"] ?? 3);
const SIZE = Number(process.env["SOAK_SIZE"] ?? 20_000);
const WARMUP = Number(process.env["SOAK_WARMUP"] ?? 10);
/** Every Nth cycle, one tenant loses its lease mid-run and the sweeper recovers it. */
const RECOVERY_EVERY = Number(process.env["SOAK_RECOVERY_EVERY"] ?? 5);
/** Every Nth cycle, one tenant's preparation is delivered twice at once, as a redelivered job would be. */
const DUPLICATE_EVERY = Number(process.env["SOAK_DUPLICATE_EVERY"] ?? 7);
const CANARY_CYCLES = Number(process.env["SOAK_CANARY_CYCLES"] ?? 20);
const CANARY_WARMUP = Number(process.env["SOAK_CANARY_WARMUP"] ?? 4);
const CSV_PATH = process.env["SOAK_CSV"];
/**
 * Extra observation that itself touches the process: a forced GC and a
 * breakdown after each tenant is seeded, and a 100 ms peak sampler. Off
 * reproduces the conditions of the first soak run exactly.
 */
const PHASE_DETAIL = process.env["SOAK_PHASE_DETAIL"] !== "0";
/**
 * When set, the process pauses at chosen points with no query in flight and
 * asks an outside observer (the diagnosis workflow, via gdb) to record glibc's
 * own malloc_info: bytes in use versus free bytes the allocator is keeping.
 * Pausing first matters: calling into malloc while another thread holds an
 * arena lock would deadlock.
 */
const MALLOC_SNAPSHOT_DIR = process.env["SOAK_MALLOC_SNAPSHOT_DIR"];
const SNAPSHOT_CYCLES = new Set([1, 2, 3, 5, 10, 15, 20]);
/** Restrict snapshots to one label, so a run in original conditions pauses only after the fact. */
const MALLOC_SNAPSHOT_ONLY = process.env["SOAK_MALLOC_SNAPSHOT_ONLY"];
async function mallocSnapshot(label: string) {
  if (!MALLOC_SNAPSHOT_DIR || (MALLOC_SNAPSHOT_ONLY && label !== MALLOC_SNAPSHOT_ONLY)) return;
  const request = join(MALLOC_SNAPSHOT_DIR, `${label}.request`);
  writeFileSync(request, String(process.pid));
  for (let waited = 0; waited < 60_000 && existsSync(request); waited += 100) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
const MIN_SOAK_CYCLES = 50;

const MB = 1024 * 1024;
/**
 * What counts as growth. Resident memory gets a much wider allowance: the
 * allocator keeps freed pages, and Prisma's query engine lives outside the JS
 * heap, so RSS moves in steps that are not leaks.
 */
const THRESHOLDS: Record<"heap" | "external" | "rss", TrendThresholds> = {
  heap: { slopePerCycle: 64 * 1024, rise: 4 * MB },
  external: { slopePerCycle: 64 * 1024, rise: 4 * MB },
  rss: { slopePerCycle: 1 * MB, rise: 32 * MB },
};

type Sample = {
  phase: "soak" | "canary";
  cycle: number;
  seconds: number;
  heap: number;
  external: number;
  rss: number;
  arrayBuffers: number;
  databaseMb: number;
  recovered: boolean;
  duplicated: boolean;
  /** Post-GC breakdown of where resident memory is (see process-memory.ts). */
  detail: MemoryBreakdown;
  /** Highest values seen while the cycle ran, sampled every 100 ms. */
  peakRss: number;
  peakHeapTotal: number;
  peakHeapUsed: number;
};

/** Resident memory by owner, for one line of the log. */
const breakdown = (label: string, m: MemoryBreakdown) =>
  `  [memory] ${label.padEnd(22)} rss ${mb(m.rss).padStart(7)} | heap used ${mb(m.heapUsed).padStart(6)} of ${mb(m.heapTotal).padStart(6)} committed | ` +
  `v8 malloc ${mb(m.v8Malloced).padStart(5)} | external ${mb(m.external).padStart(5)} | ` +
  (m.mallocMainArena === null
    ? "smaps unavailable"
    : `malloc main ${mb(m.mallocMainArena).padStart(7)} + ${m.threadArenaCount} thread arenas ${mb(m.mallocThreadArenas!).padStart(7)} | ` +
      `other anon ${mb(m.otherAnonymous!).padStart(7)} | files ${mb(m.fileBacked!).padStart(6)} | huge pages ${mb(m.anonHugePages!).padStart(6)} | threads ${m.threads}`);

async function load() {
  process.env["DATABASE_URL"] = databaseUrl;
  const { prisma } = await import("@allohq/database");
  const job = await import("./prepare-audience");
  const experiments = await import("@allohq/customer-state");
  return { prisma, ...job, experiments };
}

async function settled() {
  const gc = (globalThis as { gc?: () => void }).gc!;
  for (let i = 0; i < 3; i += 1) {
    gc();
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  return process.memoryUsage();
}

const mb = (bytes: number) => (bytes / MB).toFixed(1);
const kb = (bytes: number) => (bytes / 1024).toFixed(0);

test(
  "one worker process through many preparation cycles: no sustained memory growth, and the detector can see one",
  { skip: databaseUrl ? false : "TEST_DATABASE_URL is not set", timeout: 170 * 60 * 1000 },
  async () => {
    if (typeof (globalThis as { gc?: unknown }).gc !== "function") {
      assert.fail("the soak measures post-GC memory and needs NODE_OPTIONS=--expose-gc");
    }
    console.log(breakdown("before load", processMemory()));
    const { prisma, prepareCampaignAudience, recoverStalePreparationRuns, experiments } = await load();
    console.log(breakdown("modules loaded", processMemory()));
    await prisma.$queryRaw`SELECT 1`;
    console.log(breakdown("database connected", processMemory()));
    const rehearsal = CYCLES < MIN_SOAK_CYCLES;
    const started = Date.now();
    const log = (line: string) => console.log(`  [${new Date().toISOString().slice(11, 19)}] ${line}`);
    log(`${rehearsal ? "REHEARSAL (not the soak): " : ""}${CYCLES} cycles x ${TENANTS} tenants x ${SIZE.toLocaleString()} customers, then a ${CANARY_CYCLES}-cycle canary`);

    const tenants: Array<SeededTenant & { templateId: string }> = [];
    const samples: Sample[] = [];
    const candidates = new Map<number, number>();
    let recoveries = 0;
    let duplicates = 0;
    try {
      for (let index = 0; index < TENANTS; index += 1) {
        const seeded = await seedTenant(prisma, SIZE, `soak-${index}`);
        const template = await prisma.emailTemplate.findFirstOrThrow({ where: { workspaceId: seeded.workspaceId }, select: { id: true } });
        tenants.push({ ...seeded, templateId: template.id });
        if (PHASE_DETAIL) {
          await settled();
          console.log(breakdown(`seeded tenant ${index}`, processMemory()));
        }
      }
      const seedSeconds = (Date.now() - started) / 1000;
      await mallocSnapshot("seeded");
      log(`seeded ${TENANTS} tenants in ${seedSeconds.toFixed(0)} s`);

      /** One cycle: a fresh campaign per tenant, all prepared at once. */
      const cycle = async (phase: Sample["phase"], index: number, retain?: unknown[]) => {
        const cycleStart = Date.now();
        const peak = { rss: 0, heapTotal: 0, heapUsed: 0 };
        const sampler = PHASE_DETAIL ? setInterval(() => {
          const now = process.memoryUsage();
          peak.rss = Math.max(peak.rss, now.rss);
          peak.heapTotal = Math.max(peak.heapTotal, now.heapTotal);
          peak.heapUsed = Math.max(peak.heapUsed, now.heapUsed);
        }, 100) : undefined;
        const crash = phase === "soak" && RECOVERY_EVERY > 0 && index % RECOVERY_EVERY === RECOVERY_EVERY - 1;
        // Never both in one cycle: a duplicate could take over the revoked run
        // and blur which path finished it.
        const duplicate = phase === "soak" && !crash && DUPLICATE_EVERY > 0 && index % DUPLICATE_EVERY === DUPLICATE_EVERY - 1;
        const victim = index % TENANTS;
        const dispatched = new Map<string, number>();
        const enqueue = async (campaignId: string) => { dispatched.set(campaignId, (dispatched.get(campaignId) ?? 0) + 1); };

        const requests = await Promise.all(tenants.map(async (tenant, tenantIndex) => {
          const campaign = await prisma.campaign.create({
            data: { workspaceId: tenant.workspaceId, storeId: tenant.storeId, name: `soak ${phase} ${index} t${tenantIndex}`,
              templateId: tenant.templateId, status: "draft", agentProposal: { discountPercent: 15, discountCode: `SOAK${index}` } },
          });
          const experiment = await experiments.getOrCreateExperiment(
            tenant.storeId,
            { label: `campaign:${campaign.id}:stratified:v1`, source: "campaign", family: "winback",
              campaignId: campaign.id, segmentId: null, segmentName: null },
            0.15,
          );
          return {
            prepareAudience: true as const, campaignId: campaign.id, storeId: tenant.storeId,
            runKey: `approval:soak:${experiment.id}`, experimentId: experiment.id,
            assignmentSeed: experiment.assignmentSeed, family: "winback", policyRate: 0.15,
            policyReason: "new_family", evidence: null, deliveryProvider: "resend" as const,
            emailPreflightReceipt: { blockCount: 1, validatedAt: new Date().toISOString() },
            forceImmediate: false, approvedBy: null,
          };
        }));

        const attempts = requests.map((request) => prepareCampaignAudience(request as never, enqueue));
        if (duplicate) attempts.push(prepareCampaignAudience(requests[victim] as never, enqueue));

        let recovered = false;
        if (crash) {
          // Revoke the victim's lease as soon as it has durable work, exactly as
          // a worker that died mid-run would leave it.
          const campaignId = requests[victim]!.campaignId;
          for (let poll = 0; poll < 200_000; poll += 1) {
            const rows = await prisma.campaignAudienceMember.count({ where: { run: { campaignId } } });
            if (rows > 0) {
              const revoked = await prisma.campaignAudienceRun.updateMany({
                where: { campaignId, status: { in: ["resolving", "assigning"] } },
                data: { leaseOwner: "vanished", leaseExpiresAt: new Date(Date.now() - 120_000) },
              });
              recovered = revoked.count > 0;
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 5));
          }
        }
        const outcomes = await Promise.allSettled(attempts);
        for (const [i, outcome] of outcomes.entries()) {
          if (recovered && i === victim) continue; // the attempt that "died"
          assert.equal(outcome.status, "fulfilled", `cycle ${index}: attempt ${i} failed: ${(outcome as PromiseRejectedResult).reason}`);
        }
        if (recovered) {
          // The revocation can land just as the attempt finishes; then there is
          // nothing to recover and this cycle does not count as a recovery.
          const run = await prisma.campaignAudienceRun.findFirst({
            where: { campaignId: requests[victim]!.campaignId }, select: { status: true },
          });
          recovered = run?.status === "resolving" || run?.status === "assigning" || run?.status === "failed";
        }

        if (recovered) {
          // The production path: the sweeper finds the expired lease and
          // re-enqueues the request the run recorded for itself.
          const found: Array<{ campaignId: string }> = [];
          await recoverStalePreparationRuns(async (request: { campaignId: string }) => { found.push(request); });
          const mine = found.filter((request) => request.campaignId === requests[victim]!.campaignId);
          assert.equal(mine.length, 1, `cycle ${index}: the sweeper must find the abandoned run exactly once`);
          const outcome = await prepareCampaignAudience(mine[0] as never, enqueue);
          assert.equal(outcome.status, "approved", `cycle ${index}: recovery completes the run`);
          recoveries += 1;
        }
        if (duplicate) duplicates += 1;

        for (const [tenantIndex, request] of requests.entries()) {
          const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: request.campaignId }, select: { approvedAt: true } });
          assert.ok(campaign.approvedAt, `cycle ${index}: tenant ${tenantIndex} approved`);
          assert.equal(dispatched.get(request.campaignId), 1, `cycle ${index}: tenant ${tenantIndex} dispatched exactly once`);
          const members = await prisma.campaignAudienceMember.count({
            where: { run: { campaignId: request.campaignId }, decision: "campaign_candidate" },
          });
          // Every cycle must do the same work, or a changing workload would read
          // as a memory trend.
          if (!candidates.has(tenantIndex)) candidates.set(tenantIndex, members);
          assert.equal(members, candidates.get(tenantIndex), `cycle ${index}: tenant ${tenantIndex} prepared the same audience as its first cycle`);
        }

        if (retain) {
          // The deliberate leak: keep this cycle's prepared audience of one tenant.
          retain.push(await prisma.campaignAudienceMember.findMany({
            where: { run: { campaignId: requests[victim]!.campaignId } },
            select: { customerId: true, decision: true, stratum: true },
          }));
        }

        clearInterval(sampler);
        const memory = await settled();
        const detail = processMemory();
        const size = await prisma.$queryRaw<Array<{ mb: bigint }>>`SELECT pg_database_size(current_database()) / 1048576 AS mb`;
        const sample: Sample = {
          phase, cycle: index, seconds: (Date.now() - cycleStart) / 1000,
          heap: memory.heapUsed, external: memory.external, rss: memory.rss, arrayBuffers: memory.arrayBuffers,
          databaseMb: Number(size[0]?.mb ?? 0), recovered, duplicated: duplicate,
          detail, peakRss: peak.rss, peakHeapTotal: peak.heapTotal, peakHeapUsed: peak.heapUsed,
        };
        samples.push(sample);
        if (SNAPSHOT_CYCLES.has(index + 1)) await mallocSnapshot(`${phase}-${index + 1}`);
        if (index < 3 || index % 10 === 9) {
          console.log(`  [memory] ${phase} ${index + 1} peaks while running: rss ${mb(peak.rss)} | heap committed ${mb(peak.heapTotal)} | heap used ${mb(peak.heapUsed)}`);
          console.log(breakdown(`${phase} ${index + 1} (post-GC)`, detail));
        }
        log(`${phase} ${String(index + 1).padStart(3)}  ${sample.seconds.toFixed(1)} s  heap ${mb(sample.heap)} MB  ` +
          `external ${mb(sample.external)} MB  rss ${mb(sample.rss)} MB${recovered ? "  recovered" : ""}${duplicate ? "  duplicate" : ""}`);
      };

      for (let index = 0; index < CYCLES; index += 1) await cycle("soak", index);
      const soak = samples.filter((sample) => sample.phase === "soak");
      const soakSeconds = soak.reduce((total, sample) => total + sample.seconds, 0);
      const trends = {
        heap: memoryTrend(soak.map((s) => s.heap), WARMUP, THRESHOLDS.heap),
        external: memoryTrend(soak.map((s) => s.external), WARMUP, THRESHOLDS.external),
        rss: memoryTrend(soak.map((s) => s.rss), WARMUP, THRESHOLDS.rss),
      };

      // --- canary: the same process, now deliberately keeping per-cycle data ---
      const retained: unknown[] = [];
      for (let index = 0; index < CANARY_CYCLES; index += 1) await cycle("canary", index, retained);
      const canary = samples.filter((sample) => sample.phase === "canary");
      const canaryHeap = memoryTrend(canary.map((s) => s.heap), CANARY_WARMUP, THRESHOLDS.heap);
      const retainedRows = retained.reduce<number>((total, rows) => total + (rows as unknown[]).length, 0);
      retained.length = 0;

      if (CSV_PATH) {
        writeFileSync(CSV_PATH, [
          "phase,cycle,seconds,heap_mb,external_mb,rss_mb,array_buffers_mb,database_mb,recovered,duplicated," +
            "heap_total_mb,v8_malloc_mb,malloc_main_mb,malloc_thread_arenas_mb,thread_arenas,other_anon_mb,file_mb,threads," +
            "peak_rss_mb,peak_heap_total_mb,peak_heap_used_mb",
          ...samples.map((s) => [s.phase, s.cycle + 1, s.seconds.toFixed(2), mb(s.heap), mb(s.external), mb(s.rss),
            mb(s.arrayBuffers), s.databaseMb, s.recovered, s.duplicated,
            mb(s.detail.heapTotal), mb(s.detail.v8Malloced), s.detail.mallocMainArena === null ? "" : mb(s.detail.mallocMainArena),
            s.detail.mallocThreadArenas === null ? "" : mb(s.detail.mallocThreadArenas), s.detail.threadArenaCount ?? "",
            s.detail.otherAnonymous === null ? "" : mb(s.detail.otherAnonymous), s.detail.fileBacked === null ? "" : mb(s.detail.fileBacked),
            s.detail.threads ?? "", mb(s.peakRss), mb(s.peakHeapTotal), mb(s.peakHeapUsed)].join(",")),
        ].join("\n") + "\n");
      }

      const row = (name: string, trend: Trend, series: number[]) =>
        `  ${name.padEnd(16)} warm-up ${mb(series[0]!).padStart(7)} → ${mb(series[WARMUP - 1] ?? series[0]!).padStart(7)} MB | ` +
        `steady first quarter ${mb(trend.firstQuarterMedian).padStart(7)} → last quarter ${mb(trend.lastQuarterMedian).padStart(7)} MB | ` +
        `slope ${kb(trend.slopePerCycle).padStart(6)} KB/cycle, second half ${kb(trend.lateSlopePerCycle).padStart(6)} KB/cycle | ` +
        `noise ±${kb(trend.noise)} KB, material rise > ${mb(trend.materialRise)} MB | ${trend.verdict}`;
      const sustained = Object.values(trends).some((trend) => trend.verdict === "sustained growth");
      const recoveryCycles = Math.floor(CYCLES / RECOVERY_EVERY);
      console.log([
        "",
        `  === PREPARATION SOAK: ${CYCLES} cycles x ${TENANTS} tenants x ${SIZE.toLocaleString()} — ${sustained ? "SUSTAINED GROWTH" : "NO SUSTAINED GROWTH"} ===`,
        ...(rehearsal ? [`  REHEARSAL ONLY: fewer than ${MIN_SOAK_CYCLES} cycles; not the soak.`] : []),
        `  one process throughout; ${WARMUP} warm-up cycles, ${trends.heap.steadyCycles} steady-state cycles`,
        `  seeding ${seedSeconds.toFixed(0)} s | soak ${(soakSeconds / 60).toFixed(1)} min (median cycle ${soak.map((s) => s.seconds).sort((a, b) => a - b)[Math.floor(soak.length / 2)]!.toFixed(1)} s) | total ${((Date.now() - started) / 60000).toFixed(1)} min`,
        `  lease-loss recoveries ${recoveries} of ${recoveryCycles} scheduled | duplicate deliveries ${duplicates} | candidates per tenant ${[...candidates.values()].map((n) => n.toLocaleString()).join(" / ")}`,
        `  database ${soak[0]!.databaseMb} → ${soak.at(-1)!.databaseMb} MB`,
        "",
        row("heap (post-GC)", trends.heap, soak.map((s) => s.heap)),
        row("external", trends.external, soak.map((s) => s.external)),
        row("rss", trends.rss, soak.map((s) => s.rss)),
        "",
        `  canary: kept ${retainedRows.toLocaleString()} audience rows over ${CANARY_CYCLES} cycles`,
        row("canary heap", canaryHeap, canary.map((s) => s.heap)),
        "",
      ].join("\n"));

      assert.ok(recoveries >= 1, "at least one lease-loss recovery must actually land, or recovery was not exercised");
      assert.equal(canaryHeap.verdict, "sustained growth", "the detector must see deliberately retained per-cycle data; otherwise a clean soak proves nothing");
      for (const [name, trend] of Object.entries(trends)) {
        assert.notEqual(trend.verdict, "sustained growth", `${name}: sustained growth across the steady state`);
      }
    } finally {
      for (const tenant of tenants) {
        await prisma.workspace.delete({ where: { id: tenant.workspaceId } }).catch(() => undefined);
      }
      await prisma.$disconnect().catch(() => undefined);
    }
  },
);
