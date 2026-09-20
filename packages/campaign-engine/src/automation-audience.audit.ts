/** Query profile for automation audience evaluation. Measures, changes nothing. */
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

const events: Array<{ query: string; duration: number }> = [];
const client = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
(client as any).$on("query", (e: { query: string; duration: number }) =>
  events.push({ query: e.query, duration: e.duration })
);
(globalThis as any).prisma = client;

function shape(query: string): string {
  return query.replace(/\$\d+/g, "?").replace(/\s+/g, " ").trim().slice(0, 86);
}

async function main() {
  const size = Number(process.env.AUDIT_SIZE ?? 20_000);
  const { countAutomationAudience } = await import("./audience-resolver");
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const workspace = await client.workspace.create({ data: { name: "Auto audit", slug: `aa-${suffix}` } });
  const store = await client.store.create({
    data: { workspaceId: workspace.id, platform: "shopify", shopDomain: `aa-${suffix}.myshopify.com`,
      accessToken: "isolated-audit-token", installedAt: new Date("2020-01-01T00:00:00.000Z"), timezone: "UTC" },
  });
  const automation = await client.automation.create({
    data: { workspaceId: workspace.id, storeId: store.id, name: `aa ${suffix}`, category: "welcome_series", status: "draft" },
  });
  for (let offset = 0; offset < size; offset += 5_000) {
    const take = Math.min(5_000, size - offset);
    await client.customer.createMany({
      data: Array.from({ length: take }, (_, i) => ({
        storeId: store.id, externalId: `ext-${offset + i}`,
        email: `aa-${suffix}-${offset + i}@example.test`, acceptsMarketing: (offset + i) % 7 !== 0,
      })),
    });
  }
  await client.$executeRawUnsafe("ANALYZE");

  events.length = 0;
  const startedAt = process.hrtime.bigint();
  const result = await countAutomationAudience(automation.id, new Date("2026-03-04T12:00:00.000Z"));
  const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;

  const byShape = new Map<string, { count: number; total: number }>();
  for (const event of events) {
    const key = shape(event.query);
    const entry = byShape.get(key) ?? { count: 0, total: 0 };
    entry.count += 1; entry.total += event.duration;
    byShape.set(key, entry);
  }
  console.log(`\n=== automation audience, ${size.toLocaleString()} customers ===`);
  console.log(`wall               ${(ms / 1000).toFixed(1)} s`);
  console.log(`pages              ${result.pages}`);
  console.log(`queries            ${events.length.toLocaleString()}`);
  console.log(`queries / customer ${(events.length / size).toFixed(1)}`);
  console.log(`eligible           ${result.eligible.toLocaleString()}`);
  console.log(`\n${"count".padStart(8)} ${"total ms".padStart(9)}  shape`);
  for (const [key, entry] of [...byShape.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 8)) {
    console.log(`${String(entry.count).padStart(8)} ${entry.total.toFixed(0).padStart(9)}  ${key}`);
  }

  await client.workspace.delete({ where: { id: workspace.id } }).catch(() => undefined);
  await client.$disconnect();
}
main();
