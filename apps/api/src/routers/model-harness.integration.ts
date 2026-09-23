import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/**
 * Model routing, against real Postgres.
 *
 * The promise being proved: a route a model cannot perform never reaches the
 * database. The browser is not trusted to enforce capability — a form can be
 * tampered with, and a stored impossible route would look configured in
 * settings and then fail at the moment a merchant was waiting on it.
 *
 * Disposable Postgres only.
 */
const databaseUrl = process.env["TEST_DATABASE_URL"];
const skip = databaseUrl ? false : "TEST_DATABASE_URL is not set";

async function load() {
  process.env["DATABASE_URL"] = databaseUrl;
  const { prisma } = await import("@allohq/database");
  const { aiRouter } = await import("./ai");
  return { prisma, aiRouter };
}

const ctx = (prisma: any, workspaceId: string, clerkId: string) => ({
  prisma, userId: clerkId, workspaceId, isDemo: false,
  authSource: "clerk" as const, clientIp: "10.0.0.9", closedBeta: false,
});

async function fixture(prisma: any) {
  const tag = randomUUID().slice(0, 8);
  const workspace = await prisma.workspace.create({ data: { name: `Harness ${tag}`, slug: `harness-${tag}` } });
  const clerkId = `user_harness_${tag}`;
  const user = await prisma.user.create({
    data: { clerkId, email: `harness-${tag}@example.test`, name: "Harness Tester" },
  });
  await prisma.workspaceMember.create({
    data: { workspaceId: workspace.id, userId: user.id, role: "owner" },
  });
  return { workspace, user, clerkId };
}

async function cleanup(prisma: any, workspaceId: string, userId: string) {
  await prisma.workspace.deleteMany({ where: { id: workspaceId } });
  await prisma.user.deleteMany({ where: { id: userId } });
}

test("a route a model cannot perform is refused and never stored", { skip }, async () => {
  const { prisma, aiRouter } = await load();
  const f = await fixture(prisma);
  const caller = aiRouter.createCaller(ctx(prisma, f.workspace.id, f.clerkId));
  try {
    await assert.rejects(
      caller.setModelHarness({
        version: 2,
        textDefault: { primary: "claude-sonnet-5", fallbacks: [] },
        routes: { campaign_art: { primary: "claude-sonnet-5", fallbacks: [] } },
      } as never),
      (error: any) => {
        assert.match(error.message, /cannot do campaign imagery/i);
        return true;
      },
    );

    const after = await prisma.workspace.findUnique({
      where: { id: f.workspace.id },
      select: { modelHarness: true },
    });
    assert.equal((after?.modelHarness as any) ?? null, null, "a refused save must leave nothing behind");
  } finally {
    await cleanup(prisma, f.workspace.id, f.user.id);
  }
});

test("a model that does not exist is refused by name", { skip }, async () => {
  const { prisma, aiRouter } = await load();
  const f = await fixture(prisma);
  const caller = aiRouter.createCaller(ctx(prisma, f.workspace.id, f.clerkId));
  try {
    await assert.rejects(
      caller.setModelHarness({
        version: 2,
        textDefault: { primary: "claude-sonnet-5", fallbacks: [] },
        routes: { short_copy: { primary: "gpt-5-ultra", fallbacks: [] } },
      } as never),
      (error: any) => {
        assert.match(error.message, /not a model Joon can run/);
        return true;
      },
    );
  } finally {
    await cleanup(prisma, f.workspace.id, f.user.id);
  }
});

test("a capable route is stored and read back as saved", { skip }, async () => {
  const { prisma, aiRouter } = await load();
  const f = await fixture(prisma);
  const caller = aiRouter.createCaller(ctx(prisma, f.workspace.id, f.clerkId));
  try {
    await caller.setModelHarness({
      version: 2,
      textDefault: { primary: "claude-haiku-4-5-20251001", fallbacks: ["gpt-4o-mini"] },
      routes: {
        campaign_art: { primary: "gpt-image-flare", fallbacks: ["gpt-image-sunburst"] },
        short_copy: { primary: "gpt-4o-mini", fallbacks: [] },
      },
    } as never);

    const settings = await caller.getSettings();
    const harness = settings.modelHarness as any;
    assert.equal(harness.version, 2);
    assert.equal(harness.textDefault.primary, "claude-haiku-4-5-20251001");
    assert.equal(harness.routes.campaign_art.primary, "gpt-image-flare");
    assert.deepEqual(harness.routes.campaign_art.fallbacks, ["gpt-image-sunburst"]);
    assert.equal(harness.routes.short_copy.primary, "gpt-4o-mini");
  } finally {
    await cleanup(prisma, f.workspace.id, f.user.id);
  }
});

test("a pre-split harness already in the database is carried forward, not reset", { skip }, async () => {
  const { prisma, aiRouter } = await load();
  const f = await fixture(prisma);
  const caller = aiRouter.createCaller(ctx(prisma, f.workspace.id, f.clerkId));
  try {
    // What an existing workspace actually has stored today.
    await prisma.workspace.update({
      where: { id: f.workspace.id },
      data: {
        modelHarness: {
          version: 1, mode: "custom",
          defaultRoute: { primary: "claude-haiku-4-5-20251001", fallbacks: [] },
          routes: { creative: { primary: "gpt-4o-mini", fallbacks: [] } },
        } as never,
      },
    });

    const harness = (await caller.getSettings()).modelHarness as any;
    assert.equal(harness.textDefault.primary, "claude-haiku-4-5-20251001", "the chosen default survives");
    for (const workload of ["email_structure", "short_copy", "long_content", "brand_refinement"]) {
      assert.equal(harness.routes[workload]?.primary, "gpt-4o-mini", `${workload} kept its model`);
    }
  } finally {
    await cleanup(prisma, f.workspace.id, f.user.id);
  }
});

test("only an owner can change model routing", { skip }, async () => {
  const { prisma, aiRouter } = await load();
  const f = await fixture(prisma);
  const tag = randomUUID().slice(0, 8);
  const member = await prisma.user.create({
    data: { clerkId: `user_member_${tag}`, email: `member-${tag}@example.test`, name: "Member" },
  });
  await prisma.workspaceMember.create({
    data: { workspaceId: f.workspace.id, userId: member.id, role: "member" },
  });
  try {
    const caller = aiRouter.createCaller(ctx(prisma, f.workspace.id, member.clerkId));
    await assert.rejects(
      caller.setModelHarness({
        version: 2, textDefault: { primary: "gpt-4o-mini", fallbacks: [] }, routes: {},
      } as never),
    );
  } finally {
    await prisma.workspaceMember.deleteMany({ where: { workspaceId: f.workspace.id } });
    await prisma.user.deleteMany({ where: { id: member.id } });
    await cleanup(prisma, f.workspace.id, f.user.id);
  }
});
