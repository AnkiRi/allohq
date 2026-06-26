import type { PrismaClient } from "@prisma/client";

/**
 * Demo / sandbox mode — shared constants + resolution.
 *
 * A logged-OUT visitor (e.g. a VC opening the public demo link) explores allo as
 * the seeded "Vana Naturals" brand. Their requests are routed to the Vana demo
 * workspace READ-MOSTLY; mutations are short-circuited (ctx.isDemo) so nothing
 * real fires and the shared seed never mutates.
 *
 * PORTABILITY: the demo is identified by a STABLE SLUG / DOMAIN that is identical
 * across environments — NOT a hardcoded cuid (which differs per database). The
 * actual ids are resolved at runtime by looking the slug/domain up. So the same
 * code + the same seed work in dev now and prod later, with no per-env id surgery.
 * (Override the slug/domain via env if ever needed.)
 */
export const DEMO_WORKSPACE_SLUG = process.env.DEMO_WORKSPACE_SLUG ?? "vana-demo";
export const DEMO_STORE_DOMAIN =
  process.env.DEMO_STORE_DOMAIN ?? "vana-demo.myshopify.com";
/** Synthetic owner of the demo workspace — NOT a real Clerk human user. */
export const DEMO_OWNER_CLERK_ID =
  process.env.DEMO_OWNER_CLERK_ID ?? "demo-vana-owner";
export const DEMO_STORE_NAME = "Vana Naturals";
/** Header the web client sends when a logged-out visitor is in demo mode. */
export const DEMO_HEADER = "x-allo-demo";

// Resolved ids are cached per process — the slug→id mapping is stable for the
// lifetime of the DB, so one lookup suffices.
let _demoWorkspaceId: string | null = null;
let _demoStoreId: string | null = null;

/** Resolve the Vana demo workspace id by its stable slug (cached). */
export async function getDemoWorkspaceId(
  prisma: PrismaClient,
): Promise<string | null> {
  if (_demoWorkspaceId) return _demoWorkspaceId;
  const ws = await prisma.workspace.findUnique({
    where: { slug: DEMO_WORKSPACE_SLUG },
    select: { id: true },
  });
  _demoWorkspaceId = ws?.id ?? null;
  return _demoWorkspaceId;
}

/** Resolve the Vana demo store id by its stable domain (cached). */
export async function getDemoStoreId(
  prisma: PrismaClient,
): Promise<string | null> {
  if (_demoStoreId) return _demoStoreId;
  const store = await prisma.store.findFirst({
    where: { shopDomain: DEMO_STORE_DOMAIN },
    select: { id: true },
  });
  _demoStoreId = store?.id ?? null;
  return _demoStoreId;
}
