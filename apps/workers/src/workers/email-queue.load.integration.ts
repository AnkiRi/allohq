import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import test from "node:test";
import { seedTenant } from "./scale-tenant-fixture";

/**
 * Several tenants through the REAL email-send queue, with a simulated provider.
 *
 * Every campaign job — audience preparation, the send planner, 100-recipient
 * delivery chunks, finalisation — runs on one BullMQ queue whose worker takes
 * one job at a time. Nothing had measured what that means when tenants approve
 * together: how long a small tenant waits behind a large one, how fast mail
 * actually leaves, what the capacity lease and provider rate limit do, and
 * whether anything is left behind.
 *
 * This runs the production `sendWorker` against disposable Postgres and Redis.
 * The provider is simulated by replacing `fetch` in this process: the real
 * Resend code path runs, and requests to api.resend.com are answered locally
 * with realistic latency, Resend's documented 10 requests/second team limit
 * (429 rate_limit_exceeded) and occasional 500s. Any other host is refused, so
 * no request can leave the machine and no email can be sent.
 *
 * It MEASURES and reports. It asserts only safety: no duplicate send, no send
 * to the control group, no real network. Queue wait, throughput, fairness,
 * retries and stranded deliveries are the findings, not pass conditions.
 *
 *   TEST_DATABASE_URL=postgresql://…/joon_queue_test REDIS_HOST=127.0.0.1 REDIS_PORT=6390 \
 *     pnpm --filter @allohq/workers exec tsx --test src/workers/email-queue.load.integration.ts
 *
 * Capacity settings (EMAIL_STORE_CONCURRENCY, EMAIL_PROVIDER_PER_MINUTE, …) are
 * read from the environment exactly as production reads them; leave them unset
 * to measure production's defaults. QUEUE_CONCURRENCY sets the worker's
 * concurrency for this run only (production today: 1).
 */
const databaseUrl = process.env["TEST_DATABASE_URL"];
const TENANTS = (process.env["QUEUE_TENANTS"] ?? "4000,400,400,400").split(",").map(Number);
const STAGGER_MS = Number(process.env["QUEUE_STAGGER_MS"] ?? 3_000);
const CONCURRENCY = Number(process.env["QUEUE_CONCURRENCY"] ?? 1);
const PROVIDER_RPS = Number(process.env["PROVIDER_RPS"] ?? 10);
const PROVIDER_FAILURE_RATE = Number(process.env["PROVIDER_FAILURE_RATE"] ?? 0.01);
const PROVIDER_LATENCY_MS = Number(process.env["PROVIDER_LATENCY_MS"] ?? 120);
const TIME_CAP_MS = Number(process.env["QUEUE_TIME_CAP_MINUTES"] ?? 25) * 60_000;
const REPORT_PATH = process.env["QUEUE_REPORT"];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const seconds = (ms: number | null | undefined) => (ms == null ? "—" : `${(ms / 1000).toFixed(1)} s`);

/** Refuse anything that is not a local, disposable database and Redis. */
async function configureDisposableEnvironment() {
  // Stricter than scripts/assert-disposable-database.mjs, which the workflow
  // also runs: this harness writes queues and data, so both must be local.
  const database = new URL(databaseUrl!);
  if (!["localhost", "127.0.0.1"].includes(database.hostname) || !/test/.test(database.pathname)) {
    throw new Error("TEST_DATABASE_URL must be a local database whose name contains 'test'");
  }
  const redisHost = process.env["REDIS_HOST"] ?? "localhost";
  if (!["localhost", "127.0.0.1"].includes(redisHost)) throw new Error(`REDIS_HOST ${redisHost} is not a local, disposable Redis`);
  Object.assign(process.env, {
    DATABASE_URL: databaseUrl,
    EMAIL_PROVIDER: "resend",
    RESEND_API_KEY: "re_simulated_provider_only",
    RESEND_FROM_EMAIL: "Joon Queue Test <send@joon-queue.example.test>",
    // Synthetic @example.test recipients, and a provider that only exists in
    // this process: "live" here cannot reach anyone.
    MESSAGING_SEND_MODE: "live",
    GLOBAL_EMAIL_KILL_SWITCH: "false",
    UNSUBSCRIBE_SIGNING_SECRET: "simulated-unsubscribe-signing-secret-0123456789",
    API_BASE_URL: "https://api.joon-queue.example.test",
  });
}

type Accepted = { at: number; to: string };
function simulateResend() {
  const accepted: Accepted[] = [];
  const idempotent = new Map<string, string>();
  const stats = { requests: 0, rateLimited: 0, serverErrors: 0, replays: 0, blocked: new Map<string, number>() };
  let tokens = PROVIDER_RPS;
  let refilledAt = Date.now();
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.hostname !== "api.resend.com") {
      stats.blocked.set(url.hostname, (stats.blocked.get(url.hostname) ?? 0) + 1);
      throw new Error(`network disabled in this test: ${url.hostname}`);
    }
    stats.requests += 1;
    const now = Date.now();
    tokens = Math.min(PROVIDER_RPS, tokens + ((now - refilledAt) / 1000) * PROVIDER_RPS);
    refilledAt = now;
    await sleep(PROVIDER_LATENCY_MS * (0.5 + Math.random()));
    if (tokens < 1) {
      stats.rateLimited += 1;
      return json(429, { statusCode: 429, name: "rate_limit_exceeded", message: `Too many requests. You can only make ${PROVIDER_RPS} requests per second.` });
    }
    tokens -= 1;
    if (Math.random() < PROVIDER_FAILURE_RATE) {
      stats.serverErrors += 1;
      return json(500, { statusCode: 500, name: "internal_server_error", message: "An unexpected error occurred." });
    }
    const key = new Headers(init?.headers).get("idempotency-key");
    if (key && idempotent.has(key)) {
      stats.replays += 1;
      return json(200, { id: idempotent.get(key) });
    }
    const body = JSON.parse(String(init?.body ?? "{}")) as { to?: string | string[] };
    const id = randomUUID();
    if (key) idempotent.set(key, id);
    accepted.push({ at: Date.now(), to: Array.isArray(body.to) ? body.to[0]! : String(body.to) });
    return json(200, { id });
  }) as typeof fetch;
  return { accepted, stats, restore: () => { globalThis.fetch = original; } };
}

type Tenant = {
  label: string; size: number; workspaceId: string; storeId: string; campaignId: string; experimentId: string;
  request: Record<string, unknown>; approvedAt: number;
};

test(
  "tenants through the real email-send queue: wait, preparation, throughput, fairness, retries, stranded deliveries",
  { skip: databaseUrl ? false : "TEST_DATABASE_URL is not set", timeout: TIME_CAP_MS + 20 * 60_000 },
  async () => {
    await configureDisposableEnvironment();
    const provider = simulateResend();
    const { prisma } = await import("@allohq/database");
    const experiments = await import("@allohq/customer-state");
    const { Queue } = await import("bullmq");
    const { redisConnection, QUEUE_NAMES } = await import("../config");
    const queue = new Queue(QUEUE_NAMES.EMAIL_SEND, { connection: redisConnection });
    await queue.obliterate({ force: true });

    const log = (line: string) => console.log(`  [${new Date().toISOString().slice(11, 19)}] ${line}`);
    const capacityEnv = ["EMAIL_STORE_CONCURRENCY", "EMAIL_PROVIDER_PER_MINUTE", "EMAIL_STORE_DAILY_CAP"]
      .map((name) => `${name}=${process.env[name] ?? "default"}`).join(" ");
    log(`tenants ${TENANTS.join(", ")} | worker concurrency ${CONCURRENCY} | provider ${PROVIDER_RPS} rps, ${PROVIDER_FAILURE_RATE * 100}% 500s | ${capacityEnv}`);

    const tenants: Tenant[] = [];
    let worker: { close: () => Promise<void>; concurrency: number } | null = null;
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

      const { sendWorker } = await import("./send.worker");
      worker = sendWorker as unknown as { close: () => Promise<void>; concurrency: number };
      worker.concurrency = CONCURRENCY;
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

      // Drained: nothing waiting or running, and nothing delayed except each
      // campaign's finalisation (scheduled a minute after its last delivery).
      const pendingWork = async () => {
        const counts = await queue.getJobCounts("waiting", "active", "prioritized");
        const delayed = await queue.getJobs(["delayed"], 0, -1);
        const deliveryDelayed = delayed.filter((job) => !(job.data as { finalize?: boolean }).finalize);
        return { busy: counts["waiting"]! + counts["active"]! + counts["prioritized"]!, delayed: deliveryDelayed.length };
      };
      let lastLog = 0;
      let drained = false;
      while (Date.now() - started < TIME_CAP_MS) {
        await sleep(2_000);
        const pending = await pendingWork();
        if (Date.now() - lastLog > 30_000) {
          lastLog = Date.now();
          log(`${provider.accepted.length} sent | ${pending.busy} waiting/running | ${pending.delayed} delayed (retries/deferrals) | 429s ${provider.stats.rateLimited}`);
        }
        if (Date.now() - started > 20_000 && pending.busy === 0 && pending.delayed === 0) { drained = true; break; }
      }
      const endedAt = Date.now();
      await worker.close();
      worker = null;
      log(drained ? "queue drained" : `TIME CAP reached after ${seconds(endedAt - started)}; the queue was not drained`);

      // ================= measurements =================
      const states = ["completed", "failed", "delayed", "waiting", "active"] as const;
      const jobs: Array<{ name: string; state: string; data: any; timestamp: number; delay: number;
        processedOn?: number; finishedOn?: number; attemptsMade: number; failedReason?: string }> = [];
      for (const state of states) {
        for (const job of await queue.getJobs([state], 0, -1)) {
          jobs.push({ name: job.name, state, data: job.data, timestamp: job.timestamp, delay: Number(job.opts.delay ?? 0),
            processedOn: job.processedOn ?? undefined, finishedOn: job.finishedOn ?? undefined,
            attemptsMade: job.attemptsMade, failedReason: job.failedReason });
        }
      }
      const byCampaign = (campaignId: string) => jobs.filter((job) => job.data?.campaignId === campaignId);
      const sentTo = new Map<string, number>();
      for (const send of provider.accepted) sentTo.set(send.to, (sentTo.get(send.to) ?? 0) + 1);

      const report: Record<string, unknown>[] = [];
      for (const tenant of tenants) {
        const own = byCampaign(tenant.campaignId);
        const prepare = own.find((job) => job.name === "prepare-audience");
        const planner = own.find((job) => job.name === "campaign-send");
        const chunks = own.filter((job) => job.name === "deliver-chunk");
        // Every planned delivery, by the key delivery writes its outcome under:
        // sent, suppressed on purpose (consent, governor), deferred (queued),
        // failed, or never attempted at all.
        const plannedKeys = [...new Set(chunks.flatMap((job) => (job.data.deliveries ?? [])
          .map((delivery: { customerId: string }) => `campaign:${tenant.campaignId}:customer:${delivery.customerId}:email:treatment`)))];
        const planned = plannedKeys.length;
        const outcomes = await prisma.messageLog.findMany({ where: { deliveryKey: { in: plannedKeys } }, select: { status: true } });
        const status: Record<string, number> = {};
        for (const row of outcomes as Array<{ status: string }>) status[row.status] = (status[row.status] ?? 0) + 1;
        const neverAttempted = planned - outcomes.length;
        const stranded = (status["queued"] ?? 0) + (status["failed"] ?? 0) + neverAttempted;
        const recipients = new Set((await prisma.customer.findMany({ where: { storeId: tenant.storeId }, select: { email: true } }))
          .map((customer: { email: string }) => customer.email));
        const sends = provider.accepted.filter((send) => recipients.has(send.to)).map((send) => send.at);
        const waits = own.filter((job) => job.processedOn).map((job) => job.processedOn! - (job.timestamp + job.delay));
        // The control group, from the assignments preparation froze.
        const controlIds = (await prisma.measurementAssignment.findMany({
          where: { experimentId: tenant.experimentId, arm: "CONTROL" }, select: { customerId: true },
        })).map((row: { customerId: string }) => row.customerId);
        const controlEmails = new Set((await prisma.customer.findMany({ where: { id: { in: controlIds } }, select: { email: true } }))
          .map((customer: { email: string }) => customer.email));
        const control = [...controlEmails].filter((email) => sentTo.has(email)).length;
        report.push({
          tenant: tenant.label, customers: tenant.size, planned,
          sent: status["sent"] ?? 0, suppressed: status["suppressed"] ?? 0, deferred: status["queued"] ?? 0,
          failed: status["failed"] ?? 0, neverAttempted, stranded,
          otherStatuses: Object.fromEntries(Object.entries(status).filter(([key]) => !["sent", "suppressed", "queued", "failed"].includes(key))),
          prepareWait: prepare?.processedOn ? prepare.processedOn - tenant.approvedAt : null,
          prepareRun: prepare?.finishedOn && prepare.processedOn ? prepare.finishedOn - prepare.processedOn : null,
          plannerWait: planner?.processedOn ? planner.processedOn - (planner.timestamp + planner.delay) : null,
          firstSend: sends.length ? Math.min(...sends) - tenant.approvedAt : null,
          lastSend: sends.length ? Math.max(...sends) - tenant.approvedAt : null,
          maxJobWait: waits.length ? Math.max(...waits) : null,
          chunkJobs: chunks.length,
          chunksRetried: chunks.filter((job) => job.attemptsMade > 1).length,
          chunksFailed: chunks.filter((job) => job.state === "failed").length,
          controlGroup: controlEmails.size,
          controlSent: control,
          failedReasons: [...new Set(chunks.filter((job) => job.failedReason).map((job) => job.failedReason!.slice(0, 80)))].slice(0, 3),
        });
      }

      const allSends = provider.accepted.map((send) => send.at);
      const window = allSends.length > 1 ? Math.max(...allSends) - Math.min(...allSends) : 0;
      const duplicates = [...sentTo.values()].filter((count) => count > 1).length;
      const summary = {
        drained, elapsed: endedAt - started, sent: provider.accepted.length,
        throughputPerMinute: window ? Math.round((provider.accepted.length / window) * 60_000) : null,
        providerRequests: provider.stats.requests, rateLimited: provider.stats.rateLimited,
        serverErrors: provider.stats.serverErrors, idempotentReplays: provider.stats.replays,
        duplicateRecipients: duplicates, blockedHosts: Object.fromEntries(provider.stats.blocked),
        jobsFailed: jobs.filter((job) => job.state === "failed").length,
        jobsLeft: jobs.filter((job) => ["waiting", "active"].includes(job.state) || (job.state === "delayed" && !job.data?.finalize)).length,
      };

      console.log([
        "",
        `  === EMAIL QUEUE: ${TENANTS.length} tenants (${TENANTS.join(", ")}) · concurrency ${CONCURRENCY} · ${capacityEnv} · provider ${PROVIDER_RPS} rps ===`,
        `  ${drained ? "drained" : "NOT DRAINED (time cap)"} in ${seconds(summary.elapsed)} | sent ${summary.sent} | ${summary.throughputPerMinute ?? "—"} sends/min between first and last send`,
        `  provider: ${summary.providerRequests} requests, ${summary.rateLimited} rate-limited (429), ${summary.serverErrors} server errors (500), ${summary.idempotentReplays} idempotent replays`,
        `  jobs left behind: ${summary.jobsLeft} | jobs failed for good: ${summary.jobsFailed} | duplicate recipients: ${duplicates}`,
        `  stranded deliveries (deferred + failed + never attempted, nothing left to send them): ${report.reduce((total, row: any) => total + row.stranded, 0)} of ${report.reduce((total, row: any) => total + row.planned, 0)} planned`,
        "",
        "  tenant     customers planned  sent suppr deferred failed never STRANDED | prep wait  prep run  first send  last send | chunks retried failed",
        ...report.map((row: any) =>
          `  ${String(row.tenant).padEnd(9)} ${String(row.customers).padStart(9)} ${String(row.planned).padStart(7)} ${String(row.sent).padStart(5)} ${String(row.suppressed).padStart(5)} ${String(row.deferred).padStart(8)} ${String(row.failed).padStart(6)} ${String(row.neverAttempted).padStart(5)} ${String(row.stranded).padStart(8)} | ` +
          `${seconds(row.prepareWait).padStart(9)} ${seconds(row.prepareRun).padStart(9)} ${seconds(row.firstSend).padStart(11)} ${seconds(row.lastSend).padStart(10)} | ` +
          `${String(row.chunkJobs).padStart(6)} ${String(row.chunksRetried).padStart(7)} ${String(row.chunksFailed).padStart(6)}`),
        ...report.flatMap((row: any) => row.failedReasons.length ? [`  ${row.tenant} chunk failures: ${row.failedReasons.join(" | ")}`] : []),
        "",
      ].join("\n"));
      if (REPORT_PATH) writeFileSync(REPORT_PATH, JSON.stringify({ config: { TENANTS, STAGGER_MS, CONCURRENCY, PROVIDER_RPS, PROVIDER_FAILURE_RATE, PROVIDER_LATENCY_MS, capacityEnv }, summary, tenants: report }, null, 2));

      // Safety only. Everything else above is a measurement.
      assert.equal(summary.duplicateRecipients, 0, "no recipient may receive the same campaign twice");
      for (const row of report) assert.equal(row["controlSent"], 0, `${row["tenant"]}: the control group must never be sent to`);
      assert.deepEqual(summary.blockedHosts, {}, "nothing may try to reach any real host");
    } finally {
      await worker?.close().catch(() => undefined);
      provider.restore();
      await queue.obliterate({ force: true }).catch(() => undefined);
      await queue.close();
      for (const tenant of tenants) {
        await prisma.messageLog.deleteMany({ where: { workspaceId: tenant.workspaceId } }).catch(() => undefined);
        await prisma.workspace.delete({ where: { id: tenant.workspaceId } }).catch(() => undefined);
      }
      await prisma.$disconnect().catch(() => undefined);
      // Queues opened by the worker module keep Redis connections alive.
      setTimeout(() => process.exit(process.exitCode ?? 0), 2_000).unref();
    }
  },
);
