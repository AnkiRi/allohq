/**
 * Diagnosis of the control-selection statement at a million candidates.
 *
 * Measurement only. Nothing here changes how arms are decided: every mode
 * either reads, or resets `arm` back to NULL so the same statement can be run
 * again against the same rows. The statement under study is the one the engine
 * runs (`assignArmsInDatabase` in packages/campaign-engine/src/audience-run.ts),
 * reproduced here verbatim so EXPLAIN describes the real plan.
 *
 * The fixture is expensive to build and cheap to reuse: preparing a million
 * customers takes tens of minutes, but resetting `arm` and re-running the
 * statement takes as long as the statement itself. So the fixture is created
 * once and kept, and trials run against it.
 *
 *   MODE=seed    ... build the fixture and prepare it, leaving it in place
 *   MODE=explain ... EXPLAIN (ANALYZE, BUFFERS, WAL, SETTINGS) one run
 *   MODE=reset   ... set arm back to NULL and VACUUM, ready for another trial
 *   MODE=breakdown . the component costs, each from the same reset state
 *   MODE=variants  . the same statement under storage variants that change no
 *                    behaviour at all: the unused ordering index removed, and
 *                    free space left on each page
 *   MODE=status  ... what is in the disposable database right now
 *
 *   MODE=explain TEST_DATABASE_URL=... npx tsx apps/workers/src/workers/control-selection.diagnostic.ts
 *
 * Disposable Postgres only. Never point this at a production database.
 */
import { randomUUID } from "node:crypto";

const databaseUrl = process.env["TEST_DATABASE_URL"];
const MODE = process.env["MODE"] ?? "status";
const SIZE = Number(process.env["MILLION_SIZE"] ?? 1_000_000);
const BATCH = 10_000;
const FIXTURE_SLUG_PREFIX = "diag-control-selection";

if (!databaseUrl) {
  console.error("TEST_DATABASE_URL is not set. This must be a disposable database.");
  process.exit(1);
}
if (/railway|amazonaws|supabase|neon|render|heroku/i.test(databaseUrl)) {
  console.error("Refusing to run against what looks like a managed database.");
  process.exit(1);
}
process.env["DATABASE_URL"] = databaseUrl;

async function main() {
  const { prisma } = await import("@allohq/database");

  const fixture = await prisma.workspace.findFirst({
    where: { slug: { startsWith: FIXTURE_SLUG_PREFIX } },
    select: { id: true, slug: true, stores: { select: { id: true } } },
  });

  if (MODE === "status") {
    if (!fixture) {
      console.log("no diagnostic fixture present. Run MODE=seed first.");
      return;
    }
    const storeId = fixture.stores[0]!.id;
    const run = await prisma.campaignAudienceRun.findFirst({
      where: { storeId },
      orderBy: { startedAt: "desc" },
      select: { id: true, status: true, candidateCount: true, controlCount: true, treatmentCount: true },
    });
    const unassigned = run
      ? await prisma.campaignAudienceMember.count({
          where: { runId: run.id, decision: "campaign_candidate", arm: null },
        })
      : 0;
    console.log({ fixture: fixture.slug, run, unassignedCandidates: unassigned });
    return;
  }

  if (MODE === "seed") {
    if (fixture) {
      console.log(`fixture ${fixture.slug} already exists; nothing to do.`);
      return;
    }
    await seed(prisma);
    return;
  }

  if (!fixture) {
    console.error("no diagnostic fixture present. Run MODE=seed first.");
    process.exit(1);
  }
  const storeId = fixture.stores[0]!.id;
  const run = await prisma.campaignAudienceRun.findFirstOrThrow({
    where: { storeId },
    orderBy: { startedAt: "desc" },
    select: { id: true, assignmentSeed: true, diagnostics: true },
  });

  if (MODE === "reset") {
    const started = process.hrtime.bigint();
    const cleared = await prisma.$executeRawUnsafe(
      `UPDATE "campaign_audience_members" SET "arm" = NULL WHERE "runId" = $1 AND "arm" IS NOT NULL`,
      run.id
    );
    // Dead tuples from the previous trial are the previous trial's cost, not
    // this one's. Vacuum between trials so write amplification is measured on
    // a comparable starting state, and say so in the output.
    await prisma.$executeRawUnsafe(`VACUUM (ANALYZE) "campaign_audience_members"`);
    console.log(`reset ${cleared.toLocaleString()} rows in ${(Number(process.hrtime.bigint() - started) / 1e9).toFixed(1)}s, vacuumed and analyzed`);
    return;
  }

  if (MODE === "variants") {
    const quotas = quotaValuesFrom(run.diagnostics);
    if (quotas.length === 0) {
      console.error("the run has no stored quota plan; cannot reproduce the statement");
      process.exit(1);
    }
    const ORDERING_INDEX = "campaign_audience_members_runId_assignmentStratum_assignmen_idx";
    const createOrderingIndex =
      `CREATE INDEX IF NOT EXISTS "${ORDERING_INDEX}" ON "campaign_audience_members"` +
      `("runId","assignmentStratum","assignmentHash","customerId")`;

    // Each arm starts from a freshly rewritten table. Repeated trials leave
    // dead tuples behind, and measuring the fourth trial against the first
    // measures bloat rather than the change: locally the same statement drifted
    // from 4,954 ms to 7,252 ms across eight trials before a VACUUM FULL.
    const arms: Array<{ name: string; before: string[]; after: string[] }> = [
      { name: "as it is today", before: [], after: [] },
      {
        name: "without the ordering index the planner never uses",
        before: [`DROP INDEX IF EXISTS "${ORDERING_INDEX}"`],
        after: [createOrderingIndex],
      },
      {
        name: "fillfactor 90, all indexes",
        before: [`ALTER TABLE "campaign_audience_members" SET (fillfactor = 90)`],
        after: [`ALTER TABLE "campaign_audience_members" SET (fillfactor = 100)`],
      },
      {
        name: "fillfactor 90, without the ordering index",
        before: [
          `ALTER TABLE "campaign_audience_members" SET (fillfactor = 90)`,
          `DROP INDEX IF EXISTS "${ORDERING_INDEX}"`,
        ],
        after: [
          `ALTER TABLE "campaign_audience_members" SET (fillfactor = 100)`,
          createOrderingIndex,
        ],
      },
    ];

    const results: Array<Record<string, string>> = [];
    for (const arm of arms) {
      for (const statement of arm.before) await prisma.$executeRawUnsafe(statement);
      await prisma.$executeRawUnsafe(
        `UPDATE "campaign_audience_members" SET "arm" = NULL WHERE "runId" = $1 AND "arm" IS NOT NULL`,
        run.id
      );
      await prisma.$executeRawUnsafe(`VACUUM FULL "campaign_audience_members"`);
      await prisma.$executeRawUnsafe(`ANALYZE "campaign_audience_members"`);
      const plan = await prisma.$queryRawUnsafe<Array<Record<string, string>>>(
        `EXPLAIN (ANALYZE, BUFFERS, WAL, TIMING) ${statementSql(run.id, quotas)}`
      );
      const text = plan.map((row) => Object.values(row)[0]).join("\n");
      const indexRows = await prisma.$queryRawUnsafe<Array<{ indexes: bigint }>>(
        `SELECT COALESCE(SUM(pg_relation_size(i.indexrelid)), 0)::bigint AS indexes
         FROM pg_index i WHERE i.indrelid = 'campaign_audience_members'::regclass`
      );
      const indexes = indexRows[0]?.indexes ?? 0n;
      results.push({
        arm: arm.name,
        ms: match(text, /Execution Time: ([\d.]+) ms/) ?? "?",
        walRecords: match(text, /WAL: records=(\d+)/) ?? "0",
        walBytes: match(text, /WAL:[^\n]*bytes=(\d+)/) ?? "0",
        fpi: match(text, /WAL:[^\n]*fpi=(\d+)/) ?? "0",
        buffers: match(text, /Buffers: shared hit=(\d+)/) ?? "0",
        indexBytes: String(indexes),
        usedIndex: /Index (Only )?Scan/.test(text) ? "yes" : "no",
      });
      for (const statement of arm.after) await prisma.$executeRawUnsafe(statement);
      console.log(`  measured: ${arm.name}`);
    }

    const candidates = await prisma.campaignAudienceMember.count({
      where: { runId: run.id, decision: "campaign_candidate" },
    });
    console.log(`\n=== STORAGE VARIANTS — ${candidates.toLocaleString()} candidates ===`);
    console.log("  Each arm changes storage only. None changes which customers are control.\n");
    for (const row of results) {
      console.log(`  ${row["arm"]}`);
      console.log(`    execution ............ ${Number(row["ms"]).toLocaleString()} ms`);
      console.log(`    WAL .................. ${Number(row["walRecords"]).toLocaleString()} records, ${(Number(row["walBytes"]) / 1048576).toFixed(1)} MB, ${Number(row["fpi"]).toLocaleString()} full-page images`);
      console.log(`    shared buffer hits ... ${Number(row["buffers"]).toLocaleString()}`);
      console.log(`    indexes on the table . ${(Number(row["indexBytes"]) / 1048576).toFixed(0)} MB`);
      console.log(`    planner used an index  ${row["usedIndex"]}`);
      console.log("");
    }
    await resetArms(prisma, run.id);
    return;
  }

  if (MODE === "breakdown") {
    const quotas = quotaValuesFrom(run.diagnostics);
    if (quotas.length === 0) {
      console.error("the run has no stored quota plan; cannot reproduce the statement");
      process.exit(1);
    }
    // Each variant starts from the same state — arms cleared, table vacuumed
    // and analysed — so the numbers are comparable to each other and to the
    // same run at a different size.
    const variants: Array<{ name: string; sql: string }> = [
      { name: "ranking only, no write", sql: rankingOnlySql(run.id) },
      { name: "the statement as it is today, every candidate written", sql: statementSql(run.id, quotas) },
      { name: "only the control rows written", sql: controlOnlySql(run.id, quotas) },
    ];
    const results: Array<Record<string, string>> = [];
    for (const variant of variants) {
      await resetArms(prisma, run.id);
      const before = await ioCounters(prisma);
      const plan = await prisma.$queryRawUnsafe<Array<Record<string, string>>>(
        `EXPLAIN (ANALYZE, BUFFERS, WAL, TIMING) ${variant.sql}`
      );
      const after = await ioCounters(prisma);
      const text = plan.map((row) => Object.values(row)[0]).join("\n");
      results.push({
        variant: variant.name,
        ms: match(text, /Execution Time: ([\d.]+) ms/) ?? "?",
        walRecords: match(text, /WAL: records=(\d+)/) ?? "0",
        walBytes: match(text, /WAL:[^\n]*bytes=(\d+)/) ?? "0",
        buffers: match(text, /Buffers: shared hit=(\d+)/) ?? "0",
        sort: match(text, /Sort Method: ([^\n]+?)\s*$/m) ?? "none",
        tempBytes: String(after.tempBytes - before.tempBytes),
      });
      console.log(`  measured: ${variant.name}`);
    }

    const candidates = await prisma.campaignAudienceMember.count({
      where: { runId: run.id, decision: "campaign_candidate" },
    });
    console.log(`\n=== CONTROL SELECTION, COMPONENT COSTS — ${candidates.toLocaleString()} candidates ===\n`);
    for (const row of results) {
      console.log(`  ${row["variant"]}`);
      console.log(`    execution ............ ${Number(row["ms"]).toLocaleString()} ms`);
      console.log(`    WAL .................. ${Number(row["walRecords"]).toLocaleString()} records, ${(Number(row["walBytes"]) / 1048576).toFixed(1)} MB`);
      console.log(`    shared buffer hits ... ${Number(row["buffers"]).toLocaleString()}`);
      console.log(`    sort ................. ${row["sort"]}`);
      console.log(`    temp bytes ........... ${Number(row["tempBytes"]).toLocaleString()}`);
      console.log("");
    }
    // Left in the assigned state is wrong for a later trial; leave it clean.
    await resetArms(prisma, run.id);
    return;
  }

  if (MODE === "explain") {
    const quotas = quotaValuesFrom(run.diagnostics);
    if (quotas.length === 0) {
      console.error("the run has no stored quota plan; cannot reproduce the statement");
      process.exit(1);
    }
    const pending = await prisma.campaignAudienceMember.count({
      where: { runId: run.id, decision: "campaign_candidate", arm: null },
    });
    if (pending === 0) {
      console.error("every candidate already has an arm. Run MODE=reset first.");
      process.exit(1);
    }
    console.log(`explaining against ${pending.toLocaleString()} unassigned candidates in ${quotas.length} strata`);

    const settings = await prisma.$queryRawUnsafe<Array<{ name: string; setting: string }>>(
      `SELECT name, setting FROM pg_settings
        WHERE name IN ('work_mem','maintenance_work_mem','shared_buffers','effective_cache_size',
                       'max_parallel_workers_per_gather','random_page_cost','temp_buffers','wal_level')
        ORDER BY name`
    );
    const before = await ioCounters(prisma);
    const plan = await prisma.$queryRawUnsafe<Array<Record<string, string>>>(
      `EXPLAIN (ANALYZE, BUFFERS, WAL, SETTINGS, TIMING, VERBOSE) ${statementSql(run.id, quotas)}`
    );
    const after = await ioCounters(prisma);

    console.log("\n--- pg_settings as this database is actually configured ---");
    for (const row of settings) console.log(`  ${row.name.padEnd(32)} ${row.setting}`);
    console.log("\n--- temp file activity across the statement ---");
    console.log(`  temp files ................ ${after.tempFiles - before.tempFiles}`);
    console.log(`  temp bytes ................ ${(after.tempBytes - before.tempBytes).toLocaleString()}`);
    console.log("\n--- EXPLAIN (ANALYZE, BUFFERS, WAL, SETTINGS) ---");
    for (const row of plan) console.log("  " + Object.values(row)[0]);
  }
}

function match(text: string, pattern: RegExp): string | undefined {
  return pattern.exec(text)?.[1];
}

async function resetArms(prisma: any, runId: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE "campaign_audience_members" SET "arm" = NULL WHERE "runId" = $1 AND "arm" IS NOT NULL`,
    runId
  );
  await prisma.$executeRawUnsafe(`VACUUM (ANALYZE) "campaign_audience_members"`);
}

/** The ranking on its own. Aggregated by max so the window function cannot be
 *  optimised away, which is what happens with a plain count. */
function rankingOnlySql(runId: string): string {
  return `
    WITH ranked AS (
      SELECT
        m."id",
        m."assignmentStratum" AS stratum,
        row_number() OVER (
          PARTITION BY m."assignmentStratum"
          ORDER BY m."assignmentHash" ASC, m."customerId" COLLATE "C" ASC
        ) AS rank
      FROM "campaign_audience_members" m
      WHERE m."runId" = ${literal(runId)}
        AND m."decision" = 'campaign_candidate'
        AND m."assignmentStratum" IS NOT NULL
    )
    SELECT max(rank), max(stratum) FROM ranked`;
}

/** The same ranking, writing only the rows that become CONTROL. A measurement,
 *  not a proposal: the product still writes every candidate. */
function controlOnlySql(runId: string, quotas: Array<[string, number]>): string {
  const values = quotas
    .map(([stratum, quota]) => `(${literal(stratum)}::text, ${Math.trunc(quota)}::int)`)
    .join(",");
  return `
    WITH quotas(stratum, quota) AS (VALUES ${values}),
    ranked AS (
      SELECT
        m."id",
        m."assignmentStratum" AS stratum,
        row_number() OVER (
          PARTITION BY m."assignmentStratum"
          ORDER BY m."assignmentHash" ASC, m."customerId" COLLATE "C" ASC
        ) AS rank
      FROM "campaign_audience_members" m
      WHERE m."runId" = ${literal(runId)}
        AND m."decision" = 'campaign_candidate'
        AND m."assignmentStratum" IS NOT NULL
    )
    UPDATE "campaign_audience_members" AS target
    SET "arm" = 'CONTROL'::"TreatmentArm"
    FROM ranked
    JOIN quotas ON quotas."stratum" = ranked."stratum"
    WHERE target."id" = ranked."id" AND ranked."rank" <= quotas."quota"`;
}

/** The statement the engine runs, reproduced so EXPLAIN describes the real plan. */
function statementSql(runId: string, quotas: Array<[string, number]>): string {
  const values = quotas
    .map(([stratum, quota]) => `(${literal(stratum)}::text, ${Math.trunc(quota)}::int)`)
    .join(",");
  return `
    WITH quotas(stratum, quota) AS (VALUES ${values}),
    ranked AS (
      SELECT
        m."id",
        m."assignmentStratum" AS stratum,
        row_number() OVER (
          PARTITION BY m."assignmentStratum"
          ORDER BY m."assignmentHash" ASC, m."customerId" COLLATE "C" ASC
        ) AS rank
      FROM "campaign_audience_members" m
      WHERE m."runId" = ${literal(runId)}
        AND m."decision" = 'campaign_candidate'
        AND m."assignmentStratum" IS NOT NULL
    )
    UPDATE "campaign_audience_members" AS target
    SET "arm" = CASE
      WHEN ranked."rank" <= quotas."quota" THEN 'CONTROL'::"TreatmentArm"
      ELSE 'TREATMENT'::"TreatmentArm"
    END
    FROM ranked
    JOIN quotas ON quotas."stratum" = ranked."stratum"
    WHERE target."id" = ranked."id"`;
}

function literal(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function quotaValuesFrom(diagnostics: unknown): Array<[string, number]> {
  const strata = (diagnostics as { strata?: Record<string, { controlCount?: number }> } | null)?.strata;
  if (!strata) return [];
  return Object.entries(strata).map(([stratum, detail]) => [stratum, Number(detail.controlCount ?? 0)]);
}

async function ioCounters(prisma: {
  $queryRawUnsafe: <T>(sql: string) => Promise<T>;
}): Promise<{ tempFiles: number; tempBytes: number }> {
  const rows = await prisma.$queryRawUnsafe<Array<{ temp_files: bigint; temp_bytes: bigint }>>(
    `SELECT temp_files, temp_bytes FROM pg_stat_database WHERE datname = current_database()`
  );
  return {
    tempFiles: Number(rows[0]?.temp_files ?? 0),
    tempBytes: Number(rows[0]?.temp_bytes ?? 0),
  };
}

/**
 * The same shape of tenant the million-customer proof seeds, prepared through
 * the real job path so the rows under study are the rows the product writes.
 */
async function seed(prisma: any) {
  const suffix = `${Date.now()}-${randomUUID().slice(0, 6)}`;
  const workspace = await prisma.workspace.create({
    data: { name: `Diag ${suffix}`, slug: `${FIXTURE_SLUG_PREFIX}-${suffix}` },
  });
  const store = await prisma.store.create({
    data: { workspaceId: workspace.id, platform: "shopify", shopDomain: `diag-${suffix}.myshopify.com`,
      accessToken: "isolated-test-token", installedAt: new Date("2020-01-01T00:00:00.000Z"), timezone: "UTC" },
  });
  const template = await prisma.emailTemplate.create({
    data: { workspaceId: workspace.id, name: `Diag ${suffix}`, subject: "A note", previewText: "p",
      blocks: [{ id: "b1", type: "text", props: { html: "<p>Hello</p>" } }] },
  });
  const campaign = await prisma.campaign.create({
    data: { workspaceId: workspace.id, storeId: store.id, name: `Diag ${suffix}`, templateId: template.id,
      status: "draft", agentProposal: { discountPercent: 15, discountCode: `SAVE${suffix.slice(-4)}` } },
  });

  console.log(`seeding ${SIZE.toLocaleString()} customers...`);
  const started = process.hrtime.bigint();
  for (let offset = 0; offset < SIZE; offset += BATCH) {
    const take = Math.min(BATCH, SIZE - offset);
    await prisma.customer.createMany({
      data: Array.from({ length: take }, (_, index) => {
        const n = offset + index;
        return {
          storeId: store.id,
          externalId: `d-${n}`,
          email: `diag-${suffix}-${n}@example.test`,
          acceptsMarketing: true,
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
    await prisma.rfmScore.createMany({
      data: page.map((c: { id: string }, i: number) => {
        const n = seen + i;
        return { customerId: c.id, storeId: store.id, recency: 3, frequency: 3, monetary: 3, totalScore: 9,
          segment: n < 40 ? `tiny_${Math.floor(n / 5)}` : ["champions","loyal","at_risk","hibernating","new"][n % 5]! };
      }),
    });
    await prisma.customerState.createMany({
      data: page.map((c: { id: string }) => ({
        storeId: store.id, customerId: c.id, lifecycleStage: "repeat", vipLevel: "none",
        discountBehavior: "mixed", purchaseCyclePosition: "due", medianOrderIntervalDays: 30,
        stateEvidence: {}, churnRisk: 0.3,
      })),
    });
    seen += page.length;
    cursor = page[page.length - 1]!.id;
  }
  await prisma.$executeRawUnsafe("ANALYZE");
  console.log(`seeded in ${(Number(process.hrtime.bigint() - started) / 6e10).toFixed(1)} min`);

  const experiments = await import("@allohq/customer-state");
  const job = await import("./prepare-audience");
  const experiment = await experiments.getOrCreateExperiment(
    store.id,
    { label: `campaign:${campaign.id}:stratified:v1`, source: "campaign", family: "winback",
      campaignId: campaign.id, segmentId: null, segmentName: null },
    0.15
  );
  console.log("preparing the audience through the real job path...");
  const prepStart = process.hrtime.bigint();
  const outcome = await job.prepareCampaignAudience(
    {
      prepareAudience: true as const, campaignId: campaign.id, storeId: store.id,
      runKey: `diag:${experiment.id}`, experimentId: experiment.id,
      assignmentSeed: experiment.assignmentSeed, family: "winback", policyRate: 0.15,
      policyReason: "new_family" as never, evidence: null, deliveryProvider: "resend" as const,
      emailPreflightReceipt: { blockCount: 1, validatedAt: new Date().toISOString() },
      forceImmediate: false, approvedBy: null,
    },
    async () => undefined
  );
  console.log(`prepared in ${(Number(process.hrtime.bigint() - prepStart) / 6e10).toFixed(1)} min, status ${outcome.status}`);
  console.log(`fixture kept: workspace ${workspace.id}. Run MODE=reset then MODE=explain.`);
}

void (async () => {
  const { prisma } = await import("@allohq/database");
  await main().finally(() => prisma.$disconnect());
})();
