import { createHash } from "node:crypto";
import { prisma } from "@allohq/database";
import type { VerifiedShopifyIdentity } from "./shopify-id-token";

export class ShopifyIdentityResolutionError extends Error {
  readonly code = "SHOPIFY_IDENTITY_NOT_AUTHORIZED" as const;

  constructor(reason: string) {
    super(`Shopify identity is not authorized: ${reason}`);
    this.name = "ShopifyIdentityResolutionError";
  }
}

/**
 * Resolve a verified App Bridge identity to one existing active installation.
 * This never installs a shop and never chooses between duplicate tenants.
 */
export async function resolveShopifyIdentity(identity: VerifiedShopifyIdentity) {
  const stores = await prisma.store.findMany({
    where: { shopDomain: identity.shopDomain, platform: "shopify", isActive: true },
    select: { id: true, workspaceId: true },
    take: 2,
  });
  if (stores.length !== 1) {
    throw new ShopifyIdentityResolutionError(
      stores.length === 0 ? "shop is not installed" : "shop maps to multiple workspaces",
    );
  }
  const store = stores[0]!;
  const existing = await prisma.shopifyStaffIdentity.findUnique({
    where: {
      storeId_shopifyUserId: {
        storeId: store.id,
        shopifyUserId: identity.staffSubject,
      },
    },
    include: { user: true },
  });
  if (existing) {
    await prisma.shopifyStaffIdentity.update({
      where: { id: existing.id },
      data: { lastSeenAt: new Date() },
    });
    return { userId: existing.user.id, workspaceId: store.workspaceId, storeId: store.id };
  }

  // Phase 1E will explicitly promote the installing identity to admin. A staff
  // identity first encountered on an existing installation starts as member.
  const stableIdentity = createHash("sha256")
    .update(`${identity.shopDomain}:${identity.staffSubject}`)
    .digest("hex");
  const authId = `shopify:${stableIdentity}`;
  const email = `${stableIdentity}@shopify-identity.joon.invalid`;

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { clerkId: authId },
      create: { clerkId: authId, email },
      update: {},
    });
    await tx.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: store.workspaceId, userId: user.id } },
      create: { workspaceId: store.workspaceId, userId: user.id, role: "member" },
      update: {},
    });
    await tx.shopifyStaffIdentity.upsert({
      where: {
        storeId_shopifyUserId: {
          storeId: store.id,
          shopifyUserId: identity.staffSubject,
        },
      },
      create: {
        storeId: store.id,
        userId: user.id,
        shopifyUserId: identity.staffSubject,
      },
      update: { lastSeenAt: new Date() },
    });
    return { userId: user.id, workspaceId: store.workspaceId, storeId: store.id };
  });
}
