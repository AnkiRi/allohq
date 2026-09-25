import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { openSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import test from "node:test";
import { seedTenant } from "./scale-tenant-fixture";

/**
 * Delivery reliability proof: several tenants through the REAL email-send
 * queue, with worker processes that can be killed mid-campaign.
 *
 * The production `sendWorker` runs in a child process (email-queue.load-worker.ts)
 * against disposable Postgres and Redis. The email provider is a local fake
 * served by this test: Resend's documented 10 requests/second team limit (429
 * rate_limit_exceeded), 60-180 ms latency, 1% 500s, and idempotency keys that
 * return the original id instead of sending twice, as Resend does. The worker
 * process refuses every other host, so no email can be sent.
 *
 * Scenarios (QUEUE_SCENARIO):
 *  - concurrent: tenants approve 3 s apart; one worker process throughout;
 *  - restart:    the same, but the worker is killed (SIGKILL) part-way through
 *                delivery and a new one started, and one pending delivery
 *                chunk is deleted from Redis, as a lost job would be.
 *
 * After the queue drains, the delivery-recovery sweep runs as its production
 * schedule would. The proof then REQUIRES, per tenant: no stranded delivery
 * (deferred, failed or never attempted with nothing left to send it), no
 * recipient sent to twice, nothing sent to the control group, and no request
 * to a real host. Wait times and throughput are reported.
 *
 *   TEST_DATABASE_URL=postgresql://…/joon_queue_test REDIS_HOST=127.0.0.1 REDIS_PORT=6390 \
 *     pnpm --filter @allohq/workers exec tsx --test src/workers/email-queue.load.integration.ts
 *
 * Capacity settings are read from the environment exactly as production reads
 * them; unset means production's defaults. The worker's concurrency stays 1.
 */
const databaseUrl = process.env["TEST_DATABASE_URL"];
const SCENARIO = process.env["QUEUE_SCENARIO"] ?? "concurrent";
const TENANTS = (process.env["QUEUE_TENANTS"] ?? "4000,400,400,400").split(",").map(Number);
const STAGGER_MS = Number(process.env["QUEUE_STAGGER_MS"] ?? 3_000);
const PROVIDER_RPS = Number(process.env["PROVIDER_RPS"] ?? 10);
const PROVIDER_FAILURE_RATE = Number(process.env["PROVIDER_FAILURE_RATE"] ?? 0.01);
const PROVIDER_LATENCY_MS = Number(process.env["PROVIDER_LATENCY_MS"] ?? 120);
const RESTART_AFTER_SENDS = Number(process.env["QUEUE_RESTART_AFTER_SENDS"] ?? 400);
const RESTART_GAP_MS = Number(process.env["QUEUE_RESTART_GAP_MS"] ?? 3_000);
const TIME_CAP_MS = Number(process.env["QUEUE_TIME_CAP_MINUTES"] ?? 25) * 60_000;
const REPORT_PATH = process.env["QUEUE_REPORT"];
/** Each worker process logs to its own file here: the test runner's output drops lines. */
const WORKER_LOG_DIR = process.env["QUEUE_WORKER_LOG_DIR"] ?? "/tmp";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const seconds = (ms: number | null | undefined) => (ms == null ? "—" : `${(ms / 1000).toFixed(1)} s`);

/** Refuse anything that is not a local, disposable database and Redis. */
function disposableEnvironment(): Record<string, string> {
  const database = new URL(databaseUrl!);
  if (!["localhost", "127.0.0.1"].includes(database.hostname) || !/test/.test(database.pathname)) {
    throw new Error("TEST_DATABASE_URL must be a local database whose name contains 'test'");
  }
  const redisHost = process.env["REDIS_HOST"] ?? "localhost";
  if (!["localhost", "127.0.0.1"].includes(redisHost)) throw new Error(`REDIS_HOST ${redisHost} is not a local, disposable Redis`);
  return {
    DATABASE_URL: databaseUrl!,
    EMAIL_PROVIDER: "resend",
    RESEND_API_KEY: "re_simulated_provider_only",
    RESEND_FROM_EMAIL: "Joon Queue Test <send@joon-queue.example.test>",
    // Synthetic @example.test recipients, and a provider that only exists in
    // this test: "live" here cannot reach anyone.
    MESSAGING_SEND_MODE: "live",
    GLOBAL_EMAIL_KILL_SWITCH: "false",
    UNSUBSCRIBE_SIGNING_SECRET: "simulated-unsubscribe-signing-secret-0123456789",
    API_BASE_URL: "https://api.joon-queue.example.test",
    // The sweep's production grace period is minutes; the proof cannot wait that long.
    DELIVERY_RECOVERY_GRACE_MS: process.env["DELIVERY_RECOVERY_GRACE_MS"] ?? "5000",
  };
}

/** Resend, locally: rate limit, latency, transient failures and idempotency. */
async function startFakeResend() {
  const accepted: Array<{ at: number; to: string }> = [];
  const idempotent = new Map<string, string>();
  const stats = { requests: 0, rateLimited: 0, serverErrors: 0, replays: 0 };
  let tokens = PROVIDER_RPS;
  let refilledAt = Date.now();
  const server = createServer((req, res) => {
    const parts: Buffer[] = [];
    req.on("data", (part: Buffer) => parts.push(part));
    req.on("end", async () => {
      const reply = (status: number, body: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };
      stats.requests += 1;
      const now = Date.now();
      tokens = Math.min(PROVIDER_RPS, tokens + ((now - refilledAt) / 1000) * PROVIDER_RPS);
      refilledAt = now;
      await sleep(PROVIDER_LATENCY_MS * (0.5 + Math.random()));
      if (tokens < 1) {
        stats.rateLimited += 1;
        return reply(429, { statusCode: 429, name: "rate_limit_exceeded", message: `Too many requests. You can only make ${PROVIDER_RPS} requests per second.` });
      }
      tokens -= 1;
      if (Math.random() < PROVIDER_FAILURE_RATE) {
        stats.serverErrors += 1;
        return reply(500, { statusCode: 500, name: "internal_server_error", message: "An unexpected error occurred." });
      }
      const key = String(req.headers["idempotency-key"] ?? "") || null;
      if (key && idempotent.has(key)) {
        stats.replays += 1;
        return reply(200, { id: idempotent.get(key) });
      }
      const body = JSON.parse(Buffer.concat(parts).toString() || "{}") as { to?: string | string[] };
      const id = randomUUID();
      if (key) idempotent.set(key, id);
      accepted.push({ at: Date.now(), to: Array.isArray(body.to) ? body.to[0]! : String(body.to) });
      reply(200, { id });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  return { url: `http://127.0.0.1:${address.port}`, accepted, stats, close: () => new Promise((resolve) => server.close(resolve)) };
}

type Tenant = {
  label: string; size: number; workspaceId: string; storeId: string; campaignId: string; experimentId: string;
  request: Record<string, unknown>; approvedAt: number;
};

test(
  "delivery reliability: tenants through the real email queue, a worker killed mid-campaign, nothing stranded, sent twice or sent to control",
  { skip: databaseUrl ? false : "TEST_DATABASE_URL is not set", timeout: TIME_CAP_MS + 20 * 60_000 },
  async () => {
    const env = disposableEnvironment();
    Object.assign(process.env, env);
    const provider = await startFakeResend();
    const { prisma } = await import("@allohq/database");
    const experiments = await import("@allohq/customer-state");
    const { Queue } = await import("bullmq");
    const { redisConnection, QUEUE_NAMES } = await import("../config");
    const queue = new Queue(QUEUE_NAMES.EMAIL_SEND, { connection: redisConnection });
    await queue.obliterate({ force: true });

    const log = (line: string) => console.log(`  [${new Date().toISOString().slice(11, 19)}] ${line}`);
    const capacityEnv = ["EMAIL_STORE_CONCURRENCY", "EMAIL_PROVIDER_PER_MINUTE", "EMAIL_PROVIDER_PER_SECOND"]
      .map((name) => `${name}=${process.env[name] ?? "default"}`).join(" ");
    log(`${SCENARIO} | tenants ${TENANTS.join(", ")} | provider ${PROVIDER_RPS} rps, ${PROVIDER_FAILURE_RATE * 100}% 500s | ${capacityEnv}`);

    const blocked = new Map<string, number>();
    const workers: ChildProcess[] = [];
    const startWorker = async () => {
      const logFile = openSync(join(WORKER_LOG_DIR, `queue-worker-${workers.length + 1}.log`), "a");
      // One process, with tsx as a loader: the tsx CLI would start the worker
      // as a grandchild, and killing the CLI would leave the worker running.
      const child = spawn(process.execPath, ["--import", "tsx", join(__dirname, "email-queue.load-worker.ts")], {
        cwd: join(__dirname, "../.."),
        env: { ...process.env, ...env, FAKE_RESEND_URL: provider.url, QUEUE_CONCURRENCY: "1" },
        stdio: ["ignore", logFile, logFile, "ipc"],
      });
      workers.push(child);
      await new Promise<void>((resolve, reject) => {
        child.on("message", (message: { ready?: boolean; blocked?: string }) => {
          if (message.ready) resolve();
          if (message.blocked) blocked.set(message.blocked, (blocked.get(message.blocked) ?? 0) + 1);
        });
        child.on("exit", (code, signal) => reject(new Error(`worker exited before it was ready (${code ?? signal})`)));
      });
      return child;
    };

    const tenants: Tenant[] = [];
    try {
      for (const [index, size] of TENANTS.entries()) {
        const label = index === 0 ? "large" : `small-${index}`;
        const seeded = await seedTenant(prisma, size, `q-${label}`);
        // No discount: creating a discount code calls Shopify, which this test
        // does not simulate (and must not reach).
        await prisma.campaign.update({ where: { id: seeded.campaignId }, data: { agentProposal: {} } });
        // Live sending requires a verified sender domain, as it does in production.
        await prisma.senderProviderIdentity.create({
          data: { storeId: seeded.storeId, provider: "resend", domain: "joon-queue.example.test", status: "verified", verifiedAt: new Date() },
        });
        // An established sender, so warm-up does not decide the result. A real
        // new store is capped at 500 emails a day whatever the queue does.
        await prisma.sesWarmupState.upsert({
          where: { storeId: seeded.storeId },
          create: { storeId: seeded.storeId, startedAt: new Date("2020-01-01T00:00:00Z"), healthyDay: 8 },
          update: { healthyDay: 8 },
        });
        const experiment = await experiments.getOrCreateExperiment(
          seeded.storeId,
          { label: `campaign:${seeded.campaignId}:stratified:v1`, source: "campaign", family: "winback",
            campaignId: seeded.campaignId, segmentId: null, segmentName: null },
          0.15,
        );
        tenants.push({
          label, size, workspaceId: seeded.workspaceId, storeId: seeded.storeId, campaignId: seeded.campaignId,
          experimentId: experiment.id, approvedAt: 0,
          request: {
            prepareAudience: true, campaignId: seeded.campaignId, storeId: seeded.storeId,
            runKey: `approval:queue:${experiment.id}`, experimentId: experiment.id,
            assignmentSeed: experiment.assignmentSeed, family: "winback", policyRate: 0.15,
            policyReason: "new_family", evidence: null, deliveryProvider: "resend",
            emailPreflightReceipt: { blockCount: 1, validatedAt: new Date().toISOString() },
            // "Send now": Joon's timing plan would otherwise spread sends over hours.
            forceImmediate: true, approvedBy: null,
          },
        });
      }
      log(`seeded ${tenants.length} tenants`);

      let worker = await startWorker();
      const started = Date.now();

      // Approvals arrive the way the API enqueues them: the large tenant first,
      // then the small ones while it is working.
      for (const [index, tenant] of tenants.entries()) {
        if (index > 0) await sleep(STAGGER_MS);
        tenant.approvedAt = Date.now();
        await queue.add("prepare-audience", tenant.request, {
          jobId: `prepare-audience-${tenant.campaignId}-${tenant.experimentId}`,
          attempts: 5,
          backoff: { type: "exponential", delay: 5_000 },
          removeOnComplete: { age: 24 * 60 * 60, count: 1_000 },
          removeOnFail: { age: 7 * 24 * 60 * 60, count: 1_000 },
        });
      }

      const pendingWork = async () => {
        const counts = await queue.getJobCounts("waiting", "active", "prioritized");
        const delayed = await queue.getJobs(["delayed"], 0, -1);
        const deliveryDelayed = delayed.filter((job) => !(job.data as { finalize?: boolean }).finalize);
        return { busy: counts["waiting"]! + counts["active"]! + counts["prioritized"]!, delayed: deliveryDelayed.length };
      };
      const drain = async (deadline: number) => {
        let lastLog = 0;
        while (Date.now() < deadline) {
          await sleep(2_000);
          const pending = await pendingWork();
          if (Date.now() - lastLog > 30_000) {
            lastLog = Date.now();
            log(`${provider.accepted.length} sent | ${pending.busy} waiting/running | ${pending.delayed} delayed | 429s ${provider.stats.rateLimited}`);
          }
          if (pending.busy === 0 && pending.delayed === 0) return true;
        }
        return false;
      };

      // --- restart: kill the worker part-way through delivery, lose one job --
      const restart: Record<string, unknown> = {};
      if (SCENARIO === "restart") {
        // Kill after enough sends, or as soon as the queue goes idle (on code
        // that strands deliveries it never reaches the threshold).
        while (provider.accepted.length < RESTART_AFTER_SENDS && Date.now() - started < TIME_CAP_MS) {
          await sleep(500);
          if (Date.now() - started > 20_000) {
            const pending = await pendingWork();
            if (pending.busy === 0 && pending.delayed === 0) break;
          }
        }
        const exited = new Promise((resolve) => worker.once("exit", resolve));
        worker.kill("SIGKILL");
        await exited;
        // The premise of the test: the worker process is really gone.
        assert.throws(() => process.kill(worker.pid!, 0), /ESRCH/, "the killed worker must not still be running");
        restart["killedAt"] = Date.now() - started;
        restart["sentAtKill"] = provider.accepted.length;
        log(`worker killed (SIGKILL) after ${provider.accepted.length} sends`);
        // A job lost from Redis: its deliveries must still be found and sent.
        const pending = await queue.getJobs(["waiting", "delayed"], 0, -1);
        const lost = pending.find((job) => job.name === "deliver-chunk");
        if (lost) {
          await lost.remove();
          restart["lostJob"] = lost.id;
          restart["lostDeliveries"] = (lost.data as { deliveries?: unknown[] }).deliveries?.length ?? 0;
          log(`removed pending job ${lost.id} (${restart["lostDeliveries"]} deliveries), as a lost job`);
        }
        await sleep(RESTART_GAP_MS);
        worker = await startWorker();
        restart["restartedAt"] = Date.now() - started;
        const resumedFrom = provider.accepted.length;
        const resumeDeadline = Date.now() + 5 * 60_000;
        while (provider.accepted.length === resumedFrom && Date.now() < resumeDeadline) await sleep(200);
        restart["firstSendAfterRestart"] = Date.now() - started;
        log(`sending resumed ${seconds((restart["firstSendAfterRestart"] as number) - (restart["restartedAt"] as number))} after the new worker started`);
      }

      let drained = await drain(started + TIME_CAP_MS);
      // The recovery sweep, as its production schedule would run it. Planned
      // deliveries whose job is gone or failed are re-driven; delivery keys
      // make a re-driven delivery that already went out a no-op.
      const sweeps: number[] = [];
      for (let round = 0; round < 3 && drained; round += 1) {
        const before = provider.accepted.length;
        await queue.add("recover-deliveries", { recoverDeliveries: true }, { removeOnComplete: true, removeOnFail: true });
        await sleep(3_000);
        drained = await drain(started + TIME_CAP_MS);
        sweeps.push(provider.accepted.length - before);
        if (provider.accepted.length === before) break;
      }
      const endedAt = Date.now();

      // Measure only after the provider has been quiet for 10 s.
      let lastSeen = provider.stats.requests;
      let quietSince = Date.now();
      while (Date.now() - quietSince < 10_000 && Date.now() - endedAt < 120_000) {
        await sleep(1_000);
        if (provider.stats.requests !== lastSeen) { lastSeen = provider.stats.requests; quietSince = Date.now(); }
      }
      worker.kill("SIGTERM");
      log(drained ? "queue drained" : `TIME CAP reached after ${seconds(endedAt - started)}; the queue was not drained`);

      // ================= measurements =================
      const states = ["completed", "failed", "delayed", "waiting", "active"] as const;
      const jobs: Array<{ id: string; name: string; state: string; data: any; timestamp: number; delay: number;
        processedOn?: number; finishedOn?: number; attemptsMade: number }> = [];
      for (const state of states) {
        for (const job of await queue.getJobs([state], 0, -1)) {
          jobs.push({ id: String(job.id), name: job.name, state, data: job.data, timestamp: job.timestamp,
            delay: Number(job.opts.delay ?? 0), processedOn: job.processedOn ?? undefined,
            finishedOn: job.finishedOn ?? undefined, attemptsMade: job.attemptsMade });
        }
      }
      const sentTo = new Map<string, number>();
      for (const send of provider.accepted) sentTo.set(send.to, (sentTo.get(send.to) ?? 0) + 1);

      const report: Array<Record<string, any>> = [];
      for (const tenant of tenants) {
        const own = jobs.filter((job) => job.data?.campaignId === tenant.campaignId);
        const prepare = own.find((job) => job.name === "prepare-audience");
        const planner = own.find((job) => job.name === "campaign-send");
        // What must be delivered comes from the frozen audience, not from the
        // plan: every TREATMENT recipient the planner did not deliberately skip.
        // A job lost from Redis therefore cannot hide its recipients.
        const treatment = (await prisma.measurementAssignment.findMany({
          where: { experimentId: tenant.experimentId, arm: "TREATMENT" }, select: { customerId: true },
        })).map((row: { customerId: string }) => row.customerId);
        const skipped = new Set((await prisma.messageLog.findMany({
          where: { campaignId: tenant.campaignId, status: "skipped" }, select: { customerId: true },
        })).map((row: { customerId: string | null }) => row.customerId));
        const expected = treatment.filter((customerId: string) => !skipped.has(customerId));
        const plannedCustomers = new Set<string>(own.filter((job) => job.name === "deliver-chunk")
          .flatMap((job) => (job.data.deliveries ?? []).map((delivery: { customerId: string }) => delivery.customerId)));
        const keys = expected.map((customerId: string) => `campaign:${tenant.campaignId}:customer:${customerId}:email:treatment`);
        const outcomes = await prisma.messageLog.findMany({ where: { deliveryKey: { in: keys } }, select: { status: true } });
        const status: Record<string, number> = {};
        for (const row of outcomes as Array<{ status: string }>) status[row.status] = (status[row.status] ?? 0) + 1;
        const neverAttempted = keys.length - outcomes.length;
        const stranded = (status["queued"] ?? 0) + (status["failed"] ?? 0) + neverAttempted;
        const controlIds = (await prisma.measurementAssignment.findMany({
          where: { experimentId: tenant.experimentId, arm: "CONTROL" }, select: { customerId: true },
        })).map((row: { customerId: string }) => row.customerId);
        const emails = async (ids: string[]) => new Set((await prisma.customer.findMany({ where: { id: { in: ids } }, select: { email: true } }))
          .map((customer: { email: string }) => customer.email));
        const controlEmails = await emails(controlIds);
        const tenantEmails = await emails(expected);
        const sends = provider.accepted.filter((send) => tenantEmails.has(send.to)).map((send) => send.at);
        const chunks = own.filter((job) => job.name === "deliver-chunk");
        report.push({
          tenant: tenant.label, customers: tenant.size, treatment: treatment.length, skipped: skipped.size,
          expected: keys.length, inSurvivingJobs: plannedCustomers.size,
          sent: status["sent"] ?? 0, suppressed: status["suppressed"] ?? 0, deferred: status["queued"] ?? 0,
          failed: status["failed"] ?? 0, neverAttempted, stranded,
          prepareWait: prepare?.processedOn ? prepare.processedOn - tenant.approvedAt : null,
          prepareRun: prepare?.finishedOn && prepare.processedOn ? prepare.finishedOn - prepare.processedOn : null,
          plannerWait: planner?.processedOn ? planner.processedOn - (planner.timestamp + planner.delay) : null,
          firstSend: sends.length ? Math.min(...sends) - tenant.approvedAt : null,
          lastSend: sends.length ? Math.max(...sends) - tenant.approvedAt : null,
          chunkJobs: chunks.length,
          chunksFailed: chunks.filter((job) => job.state === "failed").length,
          pacingDeferrals: chunks.reduce((total, job) => total + Number(job.data.pacingDeferrals ?? 0), 0),
          controlSent: [...controlEmails].filter((email) => sentTo.has(email)).length,
        });
      }

      const allSends = provider.accepted.map((send) => send.at);
      const window = allSends.length > 1 ? Math.max(...allSends) - Math.min(...allSends) : 0;
      const summary = {
        scenario: SCENARIO, drained, elapsed: endedAt - started, sent: provider.accepted.length,
        throughputPerMinute: window ? Math.round((provider.accepted.length / window) * 60_000) : null,
        ...provider.stats, duplicateRecipients: [...sentTo.values()].filter((count) => count > 1).length,
        blockedHosts: Object.fromEntries(blocked), sweeps, restart,
        jobsFailed: jobs.filter((job) => job.state === "failed").length,
        stranded: report.reduce((total, row) => total + row["stranded"], 0),
        expected: report.reduce((total, row) => total + row["expected"], 0),
      };

      console.log([
        "",
        `  === DELIVERY RELIABILITY: ${SCENARIO} · ${TENANTS.length} tenants (${TENANTS.join(", ")}) · ${capacityEnv} · provider ${PROVIDER_RPS} rps ===`,
        `  ${drained ? "drained" : "NOT DRAINED (time cap)"} in ${seconds(summary.elapsed)} | sent ${summary.sent} | ${summary.throughputPerMinute ?? "—"} sends/min`,
        `  provider: ${summary.requests} requests, ${summary.rateLimited} rate-limited (429), ${summary.serverErrors} server errors (500), ${summary.replays} idempotent replays`,
        `  STRANDED ${summary.stranded} of ${summary.expected} expected deliveries | duplicate recipients ${summary.duplicateRecipients} | jobs failed for good ${summary.jobsFailed} | recovery sweeps sent ${sweeps.join(", ") || "—"}`,
        ...(SCENARIO === "restart" ? [`  restart: killed at ${seconds(restart["killedAt"] as number)} after ${restart["sentAtKill"]} sends; lost job ${restart["lostJob"] ?? "none"} (${restart["lostDeliveries"] ?? 0} deliveries); new worker at ${seconds(restart["restartedAt"] as number)}; sending again at ${seconds(restart["firstSendAfterRestart"] as number)}`] : []),
        "",
        "  tenant     treatment expected  sent suppr deferred failed never STRANDED | prep wait  prep run  first send  last send | chunks failed deferrals",
        ...report.map((row) =>
          `  ${String(row["tenant"]).padEnd(9)} ${String(row["treatment"]).padStart(9)} ${String(row["expected"]).padStart(8)} ${String(row["sent"]).padStart(5)} ${String(row["suppressed"]).padStart(5)} ${String(row["deferred"]).padStart(8)} ${String(row["failed"]).padStart(6)} ${String(row["neverAttempted"]).padStart(5)} ${String(row["stranded"]).padStart(8)} | ` +
          `${seconds(row["prepareWait"]).padStart(9)} ${seconds(row["prepareRun"]).padStart(9)} ${seconds(row["firstSend"]).padStart(11)} ${seconds(row["lastSend"]).padStart(10)} | ` +
          `${String(row["chunkJobs"]).padStart(6)} ${String(row["chunksFailed"]).padStart(6)} ${String(row["pacingDeferrals"]).padStart(9)}`),
        "",
      ].join("\n"));
      if (REPORT_PATH) writeFileSync(REPORT_PATH, JSON.stringify({ summary, tenants: report }, null, 2));

      assert.deepEqual(summary.blockedHosts, {}, "nothing may try to reach any real host");
      assert.equal(summary.duplicateRecipients, 0, "no recipient may receive the same campaign twice");
      for (const row of report) {
        assert.equal(row["controlSent"], 0, `${row["tenant"]}: the control group must never be sent to`);
        assert.equal(row["stranded"], 0, `${row["tenant"]}: ${row["stranded"]} planned deliveries were left with nothing to send them`);
      }
    } finally {
      for (const child of workers) if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      await provider.close();
      await queue.obliterate({ force: true }).catch(() => undefined);
      await queue.close();
      for (const tenant of tenants) {
        await prisma.messageLog.deleteMany({ where: { workspaceId: tenant.workspaceId } }).catch(() => undefined);
        await prisma.workspace.delete({ where: { id: tenant.workspaceId } }).catch(() => undefined);
      }
      await prisma.$disconnect().catch(() => undefined);
      // Modules the test imported hold Redis connections open; never linger.
      setTimeout(() => process.exit(process.exitCode ?? 0), 3_000).unref();
    }
  },
);
