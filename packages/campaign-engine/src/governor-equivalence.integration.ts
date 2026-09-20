import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";

/**
 * The batched governor must agree with the per-customer one.
 *
 * Journey audience evaluation called `checkAllRules` once per customer — 5.2
 * queries each, measured at 103,357 queries for 20,000 customers. The campaign
 * path already batches the same rules per page. Switching journeys onto the
 * batch is only safe if the two produce identical verdicts, so that equivalence
 * is pinned here rather than assumed, and will fail loudly if either
 * implementation drifts.
 *
 * Run with TEST_DATABASE_URL pointing at an isolated, disposable database.
 */
const databaseUrl = process.env["TEST_DATABASE_URL"];

async function load() {
  process.env["DATABASE_URL"] = databaseUrl;
  const { prisma } = await import("@allohq/database");
  const governor = await import("@allohq/communication-governor");
  return { prisma, ...governor };
}

const skip = databaseUrl ? false : "TEST_DATABASE_URL is not set";

test("batched and per-customer governor verdicts are identical", { skip }, async () => {
  const { prisma, checkAllRules, checkCampaignRulesBatch, loadStoreGovernorConfig } = await load();
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  // Wall clock, deliberately. checkFatigue, checkSupportState and checkCooldown
  // build their own windows from `new Date()` and ignore the `now` handed to
  // checkAllRules, while the batch honours it. Comparing them at a fixed past
  // instant therefore compares two different windows and disagrees for that
  // reason alone. That divergence is recorded as a defect in its own right; it
  // is not what this test is for.
  const now = new Date();
  const workspace = await prisma.workspace.create({
    data: { name: "Governor equivalence", slug: `gov-${suffix}` },
  });
  try {
    const store = await prisma.store.create({
      data: {
        workspaceId: workspace.id,
        platform: "shopify",
        shopDomain: `gov-${suffix}.myshopify.com`,
        accessToken: "isolated-test-token",
        installedAt: new Date("2020-01-01T00:00:00.000Z"),
        timezone: "UTC",
      },
    });
    const size = 500;
    await prisma.customer.createMany({
      data: Array.from({ length: size }, (_, n) => ({
        storeId: store.id,
        externalId: `ext-${n}`,
        email: `gov-${suffix}-${n}@example.test`,
        acceptsMarketing: true,
      })),
    });
    const customers = await prisma.customer.findMany({
      where: { storeId: store.id },
      select: { id: true },
      orderBy: { id: "asc" },
    });

    // Spread real history so each rule actually fires for someone: send
    // volume for fatigue, open conversations for collision, and support
    // states for the support suppressor.
    // Fatigue is counted from CustomerFatigueLog, not MessageLog. Seeding the
    // wrong table is why an earlier run of this comparison never exercised the
    // fatigue rule at all and agreed trivially.
    const fatigueLogs: any[] = [];
    for (const [n, customer] of customers.entries()) {
      for (let k = 0; k < n % 9; k += 1) {
        fatigueLogs.push({
          customerId: customer.id,
          storeId: store.id,
          channel: "email",
          messageType: "automation",
          sentAt: new Date(now.getTime() - (k + 1) * 3_600_000),
        });
      }
      if (n % 11 === 0) {
        await prisma.conversation.create({
          data: { storeId: store.id, customerId: customer.id, channel: "email", status: "active" },
        });
      }
      if (n % 13 === 0) {
        await prisma.customerState.create({
          data: {
            storeId: store.id,
            customerId: customer.id,
            lifecycleStage: "repeat",
            supportState: n % 26 === 0 ? "open_issue" : "clear",
          },
        });
      }
    }
    await prisma.customerFatigueLog.createMany({ data: fatigueLogs });

    const config = await loadStoreGovernorConfig(store.id);
    // A low weekly limit so the fatigue rule actually fires for the customers
    // given send history. With the store default nobody hit it, and an
    // equivalence check that only exercises one rule proves very little.
    const policy = {
      now,
      timezone: config.timezone ?? "UTC",
      quietHours: config.quietHours,
      maxEmailsPerWeek: 3,
    };
    const ids = customers.map((customer: { id: string }) => customer.id);
    const batched = await checkCampaignRulesBatch(ids, store.id, policy);
    const perCustomer = await Promise.all(
      ids.map((customerId: string) =>
        checkAllRules({
          customerId,
          storeId: store.id,
          channel: "email",
          messageType: "automation",
          timezone: policy.timezone,
          quietHours: policy.quietHours,
          maxEmailsPerWeek: policy.maxEmailsPerWeek,
          now,
        })
      )
    );

    let verdictDiff = 0;
    let ruleDiff = 0;
    const examples: string[] = [];
    const blocked = new Set<string>();
    for (const [index, customerId] of ids.entries()) {
      const single = perCustomer[index]!;
      const batch = batched.get(customerId)!;
      assert.ok(batch, `batch produced no decision for ${customerId}`);
      if (single.allowed !== batch.allowed) {
        verdictDiff += 1;
        if (examples.length < 6) {
          examples.push(
            `    per-customer allowed=${single.allowed} rule=${single.rule ?? "-"}  |  batch allowed=${batch.allowed} rule=${batch.rule ?? "-"}`
          );
        }
      } else if ((single.rule ?? null) !== (batch.rule ?? null)) {
        ruleDiff += 1;
        if (examples.length < 6) {
          examples.push(`    same verdict, rule ${single.rule ?? "-"} vs ${batch.rule ?? "-"}`);
        }
      }
      if (!single.allowed && single.rule) blocked.add(single.rule);
    }

    if (verdictDiff > 0 || ruleDiff > 0) {
      console.log(`\n  DISAGREEMENT: ${verdictDiff} verdicts, ${ruleDiff} rules, of ${ids.length}`);
      for (const line of examples.slice(0, 6)) console.log(line);
      console.log("");
    }
    assert.equal(verdictDiff, 0, "batched and per-customer verdicts must agree");
    assert.equal(ruleDiff, 0, "the reason a customer is held back must agree too");
    // The fixture must actually block people, or agreement proves nothing.
    // Name the rules the fixture must exercise, so the test cannot quietly
    // narrow to one rule and still pass.
    for (const rule of ["fatigue", "support_open_issue", "support_active_conversation"]) {
      assert.ok(
        [...blocked].some((fired) => fired.includes(rule.split("_")[0]!)),
        `fixture never exercised ${rule}; fired: ${[...blocked].join(", ") || "nothing"}`
      );
    }
    console.log(`\n  governor equivalence: ${ids.length} customers, rules exercised: ${[...blocked].join(", ")}\n`);
  } finally {
    await prisma.messageLog.deleteMany({ where: { workspaceId: workspace.id } }).catch(() => undefined);
    await prisma.workspace.delete({ where: { id: workspace.id } }).catch(() => undefined);
  }
});
