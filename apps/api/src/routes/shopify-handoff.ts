import type { IncomingMessage, ServerResponse } from "node:http";
import { verifyToken } from "@clerk/backend";
import { prisma } from "@allohq/database";
import { verifyShopifyIdToken } from "../auth/shopify-id-token";
import { resolveShopifyIdentity } from "../auth/resolve-shopify-identity";
import {
  createShopifyHandoff,
  canLinkShopifyIdentity,
  hashShopifyHandoff,
  isRedeemableHandoff,
  SHOPIFY_HANDOFF_TTL_MS,
} from "../auth/shopify-handoff-token";

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as Record<string, unknown>;
}

function bearer(req: IncomingMessage) {
  const value = req.headers.authorization;
  return value?.startsWith("Bearer ") ? value.slice(7) : "";
}

export async function handleShopifyHandoff(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  const apiKey = process.env.SHOPIFY_API_KEY;
  const apiSecret = process.env.SHOPIFY_API_SECRET;
  if (!apiKey || !apiSecret) return json(res, 503, { error: "Shopify is not configured" });
  try {
    const identity = verifyShopifyIdToken(bearer(req), { apiKey, apiSecret });
    const resolved = await resolveShopifyIdentity(identity);
    const handoff = createShopifyHandoff();
    await prisma.$transaction([
      prisma.shopifyWorkspaceHandoff.deleteMany({
        where: {
          storeId: resolved.storeId,
          shopifyUserId: identity.staffSubject,
          redeemedAt: null,
        },
      }),
      prisma.shopifyWorkspaceHandoff.create({
        data: {
          tokenHash: handoff.tokenHash,
          storeId: resolved.storeId,
          shopifyUserId: identity.staffSubject,
          expiresAt: handoff.expiresAt,
        },
      }),
    ]);
    return json(res, 200, {
      token: handoff.token,
      expiresInSeconds: SHOPIFY_HANDOFF_TTL_MS / 1000,
    });
  } catch (error) {
    console.error("Shopify handoff creation failed", error);
    return json(res, 401, { error: "Shopify session could not be verified" });
  }
}

export async function handleShopifyHandoffRedeem(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  try {
    const clerk = await verifyToken(bearer(req), { secretKey: process.env.CLERK_SECRET_KEY! });
    const payload = await body(req);
    const rawToken = typeof payload.token === "string" ? payload.token : "";
    if (!rawToken) return json(res, 400, { error: "Missing handoff token" });

    const handoff = await prisma.shopifyWorkspaceHandoff.findUnique({
      where: { tokenHash: hashShopifyHandoff(rawToken) },
      include: { store: true },
    });
    if (!handoff || !isRedeemableHandoff(handoff)) {
      return json(res, 410, { error: "This handoff has expired or was already used" });
    }

    await prisma.$transaction(async (tx) => {
      const syntheticIdentity = await tx.shopifyStaffIdentity.findUnique({
        where: {
          storeId_shopifyUserId: { storeId: handoff.storeId, shopifyUserId: handoff.shopifyUserId },
        },
        include: { user: { include: { workspaceMembers: true } } },
      });
      if (!syntheticIdentity) throw new Error("Shopify staff identity no longer exists");
      if (!canLinkShopifyIdentity(syntheticIdentity.user.clerkId, clerk.sub)) {
        throw new Error("This Shopify staff identity is already linked to another Joon account");
      }
      const inheritedRole =
        syntheticIdentity.user.workspaceMembers.find(
          (member) => member.workspaceId === handoff.store.workspaceId
        )?.role ?? "pending";
      const clerkUser = await tx.user.upsert({
        where: { clerkId: clerk.sub },
        update: {},
        create: { clerkId: clerk.sub, email: `${clerk.sub}@clerk.dev` },
      });
      const currentMembership = await tx.workspaceMember.findUnique({
        where: {
          workspaceId_userId: { workspaceId: handoff.store.workspaceId, userId: clerkUser.id },
        },
      });
      // Recreate the target membership so it becomes the most recently linked
      // workspace selected by Clerk authentication on the following request.
      if (currentMembership)
        await tx.workspaceMember.delete({ where: { id: currentMembership.id } });
      await tx.workspaceMember.create({
        data: {
          workspaceId: handoff.store.workspaceId,
          userId: clerkUser.id,
          role: currentMembership?.role ?? inheritedRole,
        },
      });
      await tx.shopifyStaffIdentity.update({
        where: { id: syntheticIdentity.id },
        data: { userId: clerkUser.id, lastSeenAt: new Date() },
      });
      if (
        syntheticIdentity.userId !== clerkUser.id &&
        syntheticIdentity.user.clerkId.startsWith("shopify:")
      ) {
        await tx.workspaceMember.deleteMany({
          where: { workspaceId: handoff.store.workspaceId, userId: syntheticIdentity.userId },
        });
        const remainingLinks = await tx.shopifyStaffIdentity.count({
          where: { userId: syntheticIdentity.userId },
        });
        const remainingMemberships = await tx.workspaceMember.count({
          where: { userId: syntheticIdentity.userId },
        });
        if (remainingLinks === 0 && remainingMemberships === 0)
          await tx.user.delete({ where: { id: syntheticIdentity.userId } });
      }
      const claimed = await tx.shopifyWorkspaceHandoff.updateMany({
        where: { id: handoff.id, redeemedAt: null, expiresAt: { gt: new Date() } },
        data: { redeemedAt: new Date() },
      });
      if (claimed.count !== 1) throw new Error("Handoff was redeemed concurrently");
    });
    return json(res, 200, {
      ready: true,
      storeId: handoff.storeId,
      workspaceId: handoff.store.workspaceId,
    });
  } catch (error) {
    console.error("Shopify handoff redemption failed", error);
    return json(res, 401, { error: "Joon account could not be linked" });
  }
}
