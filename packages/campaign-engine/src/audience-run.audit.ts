/**
 * Query profile for campaign approval. Measures, changes nothing.
 *
 * Run against a disposable database only:
 *   DATABASE_URL=postgresql://…/disposable \
 *     pnpm --filter @allohq/api exec tsx \
 *     ../../packages/campaign-engine/src/audience-run.audit.ts
 *
 * Reports query count, time inside queries against wall time, p50/p95/p99, and
 * the heaviest statement shapes. The numbers it produced on 2026-09-20 are
 * recorded under "Pass 8 operational audit" in the implementation register.
 *
 * The database package caches its client on globalThis when NODE_ENV is not
 * production, so seeding that slot before the first import installs an
 * instrumented client the engine will use.
 */
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

interface QueryEvent { query: string; params: string; duration: number; }
const events: QueryEvent[] = [];

const client = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
(client as any).$on("query", (event: QueryEvent) => {
  events.push({ query: event.query, params: event.params, duration: event.duration });
});
(globalThis as any).prisma = client;

const SIZE = Number(process.env.AUDIT_SIZE ?? 100_000);
const STRATA = ["champions", "loyal", "at_risk", "hibernating", "new"];
const SEED_BATCH = 10_000;

/** Collapse a query to its shape so counts group meaningfully. */
function shape(query: string): string {
  return query
    .replace(/\$\d+/g, "?")
    .replace(/\(\s*(\?,\s*)*\?\s*\)/g, "(?)")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 110);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[index]!;
}

async function main() {
  const { runCampaignAudienceResolution } = await import("./audience-run");
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;

  const workspace = await client.workspace.create({
    data: { name: "Audit", slug: `audit-${suffix}` },
  });
  const store = await client.store.create({
    data: {
      workspaceId: workspace.id,
      platform: "shopify",
      shopDomain: `audit-${suffix}.myshopify.com`,
      accessToken: "isolated-audit-token",
      installedAt: new Date("2020-01-01T00:00:00.000Z"),
      timezone: "UTC",
    },
  });
  const campaign = await client.campaign.create({
    data: {
      workspaceId: workspace.id,
      storeId: store.id,
      name: `Audit ${suffix}`,
      status: "draft",
      agentProposal: {},
    },
  });

  console.log(`seeding ${SIZE.toLocaleString()} customers...`);
  for (let offset = 0; offset < SIZE; offset += SEED_BATCH) {
    const take = Math.min(SEED_BATCH, SIZE - offset);
    await client.customer.createMany({
      data: Array.from({ length: take }, (_, index) => {
        const n = offset + index;
        return {
          storeId: store.id,
          externalId: `ext-${n}`,
          email: `audit-${suffix}-${n}@example.test`,
          acceptsMarketing: n % 11 !== 0,
        };
      }),
    });
  }
  let cursor: string | undefined;
  let seen = 0;
  for (;;) {
    const page = await client.customer.findMany({
      where: { storeId: store.id, ...(cursor ? { id: { gt: cursor } } : {}) },
      select: { id: true },
      orderBy: { id: "asc" },
      take: SEED_BATCH,
    });
    if (page.length === 0) break;
    await client.rfmScore.createMany({
      data: page.map((customer, index) => ({
        customerId: customer.id,
        storeId: store.id,
        recency: 3,
        frequency: 3,
        monetary: 3,
        totalScore: 9,
        segment: STRATA[(seen + index) % STRATA.length]!,
      })),
    });
    seen += page.length;
    cursor = page[page.length - 1]!.id;
  }
  await client.$executeRawUnsafe("ANALYZE");

  // Only the approval path is measured.
  events.length = 0;
  const startedAt = process.hrtime.bigint();
  const result = await runCampaignAudienceResolution({
    campaignId: campaign.id,
    storeId: store.id,
    runKey: "audit",
    assignmentSeed: "audit-seed",
    policyVersion: "audit-v1",
    rateForStratum: () => 0.15,
    asOf: new Date("2026-03-04T12:00:00.000Z"),
  });
  const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

  const byShape = new Map<string, number[]>();
  for (const event of events) {
    const key = shape(event.query);
    (byShape.get(key) ?? byShape.set(key, []).get(key)!).push(event.duration);
  }
  const all = events.map((event) => event.duration).sort((a, b) => a - b);
  const totalQueryMs = all.reduce((sum, value) => sum + value, 0);

  console.log(`\n=== approval of ${SIZE.toLocaleString()} customers ===`);
  console.log(`wall duration         ${(durationMs / 1000).toFixed(1)} s`);
  console.log(`queries issued        ${events.length.toLocaleString()}`);
  console.log(`time inside queries   ${(totalQueryMs / 1000).toFixed(1)} s (${((totalQueryMs / durationMs) * 100).toFixed(0)}% of wall)`);
  console.log(`p50 / p95 / p99 / max ${percentile(all, 50)} / ${percentile(all, 95)} / ${percentile(all, 99)} / ${all[all.length - 1]} ms`);
  console.log(`candidates            ${result.candidateCount.toLocaleString()}`);

  const rows = [...byShape.entries()]
    .map(([key, durations]) => {
      const sorted = [...durations].sort((a, b) => a - b);
      return {
        key,
        count: durations.length,
        total: durations.reduce((sum, value) => sum + value, 0),
        p50: percentile(sorted, 50),
        p95: percentile(sorted, 95),
        max: sorted[sorted.length - 1]!,
      };
    })
    .sort((a, b) => b.total - a.total);

  console.log(`\ndistinct query shapes ${rows.length}`);
  console.log(`\n${"count".padStart(7)} ${"total ms".padStart(9)} ${"p50".padStart(5)} ${"p95".padStart(5)} ${"max".padStart(6)}  shape`);
  for (const row of rows.slice(0, 14)) {
    console.log(
      `${String(row.count).padStart(7)} ${row.total.toFixed(0).padStart(9)} ${String(row.p50).padStart(5)} ${String(row.p95).padStart(5)} ${String(row.max).padStart(6)}  ${row.key}`
    );
  }

  await client.workspace.delete({ where: { id: workspace.id } }).catch(() => undefined);
  await client.$disconnect();
}

main();
