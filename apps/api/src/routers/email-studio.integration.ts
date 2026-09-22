import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/**
 * The email a product without a description used to break.
 *
 * `Product.description` is a nullable column. Template enrichment copied it
 * onto the product block, so the block carried `description: null`, and the
 * whole document failed `emailBlocksSchema` with `invalid_union` — taking the
 * preview with it and refusing to save.
 *
 * This walks the lifecycle the fix has to restore: open, select, edit, save,
 * reopen, and freeze a version the approval path can read back.
 *
 * Disposable Postgres only. No provider, no recipients, no model calls.
 */
const databaseUrl = process.env["TEST_DATABASE_URL"];
const skip = databaseUrl ? false : "TEST_DATABASE_URL is not set";

async function load() {
  process.env["DATABASE_URL"] = databaseUrl;
  const { prisma } = await import("@allohq/database");
  const { templatesRouter } = await import("./templates");
  const builder = await import("@allohq/email-builder");
  const { ensureEmailVersion } = await import("@allohq/campaign-engine");
  return { prisma, templatesRouter, ensureEmailVersion, ...builder };
}

function caller(prisma: any, workspaceId: string, clerkId: string) {
  return {
    prisma,
    userId: clerkId,
    workspaceId,
    isDemo: false,
    authSource: "clerk" as const,
    clientIp: "10.0.0.2",
    closedBeta: false,
  };
}

/** A workspace, a store, and a product with NO description — the trigger. */
async function fixture(prisma: any) {
  const tag = randomUUID().slice(0, 8);
  const workspace = await prisma.workspace.create({
    data: { name: `Studio ${tag}`, slug: `studio-${tag}` },
  });
  const clerkId = `user_studio_${tag}`;
  const user = await prisma.user.create({
    data: { clerkId, email: `studio-${tag}@example.test`, name: "Studio Tester" },
  });
  await prisma.workspaceMember.create({
    data: { workspaceId: workspace.id, userId: user.id, role: "owner" },
  });
  const store = await prisma.store.create({
    data: {
      workspaceId: workspace.id,
      platform: "shopify",
      shopDomain: `studio-${tag}.myshopify.com`,
      accessToken: "ciphertext-not-a-real-token",
      isActive: true,
    },
  });
  const product = await prisma.product.create({
    data: {
      storeId: store.id,
      externalId: `ext-${tag}`,
      title: "Hydrogen Snowboard",
      handle: `hydrogen-${tag}`,
      description: null, // the trigger
      imageUrl: null,
      price: 749.95,
    },
  });
  const template = await prisma.emailTemplate.create({
    data: {
      workspaceId: workspace.id,
      name: `Winter drop ${tag}`,
      subject: "Ride further this winter",
      previewText: "New season, same spirit.",
      blocks: [
        { id: "b1", type: "hero", props: { heading: "Ride further" } },
        { id: "b2", type: "text", props: { html: "<p>New season.</p>" } },
        { id: "b3", type: "divider", props: {} },
        { id: "b4", type: "product", props: { productId: product.id, showPrice: true } },
      ],
    },
  });
  return { workspace, store, product, template, clerkId, user };
}

async function cleanup(prisma: any, workspaceId: string, storeId: string, userId?: string) {
  await prisma.emailVersion.deleteMany({ where: { workspaceId } });
  await prisma.emailTemplate.deleteMany({ where: { workspaceId } });
  await prisma.product.deleteMany({ where: { storeId } });
  await prisma.store.deleteMany({ where: { id: storeId } });
  await prisma.workspace.deleteMany({ where: { id: workspaceId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
}

test("an email whose product has no description opens, edits, saves and reopens", { skip }, async () => {
  const { prisma, templatesRouter, emailBlocksSchema } = await load();
  const { workspace, store, product, template, clerkId, user } = await fixture(prisma);
  try {
    const api = templatesRouter.createCaller(caller(prisma, workspace.id, clerkId) as any);

    // OPEN — this is the call that used to hand the editor a null.
    const opened = await api.getById({ id: template.id });
    const productBlock = (opened.blocks as any[])[3];
    assert.equal(productBlock.type, "product");
    assert.ok(
      !("description" in productBlock.props),
      "an absent product description must be absent, not null",
    );
    assert.equal(productBlock.props.title, "Hydrogen Snowboard", "real product facts still arrive");
    assert.equal(productBlock.props.price, 749.95);

    // RENDER / PREVIEW — the editor validates before it previews or saves.
    const validated = emailBlocksSchema.safeParse(opened.blocks);
    assert.equal(validated.success, true, "the opened document validates, so preview renders");

    // SELECT + EDIT the affected block.
    const edited = (opened.blocks as any[]).map((block: any) =>
      block.id === "b4" ? { ...block, props: { ...block.props, buttonText: "Shop the board" } } : block,
    );

    // SAVE.
    const saved = await api.update({ id: template.id, blocks: edited as any });
    assert.ok(saved.version, "saving freezes a recoverable version");

    // REOPEN.
    const reopened = await api.getById({ id: template.id });
    const reopenedProduct = (reopened.blocks as any[])[3];
    assert.equal(reopenedProduct.props.buttonText, "Shop the board", "the edit survived");
    assert.ok(!("description" in reopenedProduct.props), "and no null came back");
    assert.equal(emailBlocksSchema.safeParse(reopened.blocks).success, true);
  } finally {
    await cleanup(prisma, workspace.id, store.id, user.id);
    void product;
  }
});

test("a version frozen from that email is readable by the approval path", { skip }, async () => {
  const { prisma, templatesRouter, ensureEmailVersion, safeParseEmailDocument } = await load();
  const { workspace, store, template, clerkId, user } = await fixture(prisma);
  try {
    const api = templatesRouter.createCaller(caller(prisma, workspace.id, clerkId) as any);
    await api.update({ id: template.id, subject: "Ride further this winter" });

    // The approval freeze runs this exact call.
    const current = await prisma.emailTemplate.findUnique({ where: { id: template.id } });
    assert.ok(current, "the template is still there");
    const version = await ensureEmailVersion(prisma, {
      workspaceId: workspace.id,
      templateId: template.id,
      storeId: store.id,
      template: current,
      source: "approval",
      note: "Frozen for test",
    });
    assert.ok(version.contentHash, "an approval-sourced version exists");

    // Delivery reads the frozen document back. It must not need a fallback.
    const readBack = safeParseEmailDocument(version.document);
    assert.equal(readBack.success, true, "the approved document reads back without falling back");
  } finally {
    await cleanup(prisma, workspace.id, store.id, user.id);
  }
});

test("a blank email stays blank", { skip }, async () => {
  const { prisma, templatesRouter } = await load();
  const tag = randomUUID().slice(0, 8);
  const workspace = await prisma.workspace.create({
    data: { name: `Blank ${tag}`, slug: `blank-${tag}` },
  });
  const clerkId = `user_blank_${tag}`;
  const user = await prisma.user.create({
    data: { clerkId, email: `blank-${tag}@example.test`, name: "Blank Tester" },
  });
  await prisma.workspaceMember.create({
    data: { workspaceId: workspace.id, userId: user.id, role: "owner" },
  });
  try {
    const api = templatesRouter.createCaller(caller(prisma, workspace.id, clerkId) as any);
    const created = await api.create({
      name: `Blank ${tag}`,
      subject: "Untitled",
      blocks: [],
    });
    const opened = await api.getById({ id: created.id });
    const blocks = opened.blocks as any[];

    assert.deepEqual(blocks, [], "no blocks are invented");
    const text = JSON.stringify(opened);
    assert.ok(!/discount|% off|use code|promo/i.test(text), "no offer is inferred");
    assert.equal(
      blocks.filter((b: any) => b.type === "product" || b.type === "product_grid").length,
      0,
      "no product is silently selected",
    );
    assert.equal(
      await prisma.generatedImage.count({ where: { workspaceId: workspace.id } }),
      0,
      "creating a blank email generates no image",
    );
    assert.equal(
      await prisma.emailProposal.count({ where: { workspaceId: workspace.id } }),
      0,
      "and asks the model for nothing",
    );
  } finally {
    await prisma.emailVersion.deleteMany({ where: { workspaceId: workspace.id } });
    await prisma.emailTemplate.deleteMany({ where: { workspaceId: workspace.id } });
    await prisma.workspace.deleteMany({ where: { id: workspace.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});
