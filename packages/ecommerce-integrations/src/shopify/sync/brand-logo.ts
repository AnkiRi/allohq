import type { PrismaClient } from "@allohq/database";
import type { ShopifyClient } from "../client";
import { fetchShopifyBrandAssets } from "../admin/brand";

/**
 * Import the store's Shopify brand logo, without ever overruling the merchant.
 *
 * **Precedence.** A logo the merchant chose always wins. Joon writes
 * `store.storeLogoUrl` only when it is empty, or when the value there is one
 * Joon itself put there on a previous sync. If the merchant has since uploaded
 * or typed their own, Shopify's answer is kept in the Asset Library as a
 * choice but never forced into the store logo.
 *
 * **Absence is not deletion.** Most stores never fill in Shopify's brand
 * settings, and the scopes Joon installs may refuse the field outright. Both
 * are ordinary answers. Neither clears an existing logo, and neither is an
 * error a merchant should see.
 */
export type BrandLogoOutcome =
  /** Nothing was there; Shopify's logo is now the store logo. */
  | "imported"
  /** Joon's previous Shopify logo changed upstream and was refreshed. */
  | "updated"
  /** Shopify's logo is unchanged from what is already stored. */
  | "unchanged"
  /** The merchant's own logo was left alone; Shopify's is offered in the library. */
  | "kept_merchant_logo"
  /** Shopify returned no logo, or the field was unavailable. Nothing changed. */
  | "absent";

export type BrandLogoSyncResult = {
  outcome: BrandLogoOutcome;
  /** The store logo in force after this sync. */
  storeLogoUrl: string | null;
  /** Operator-facing only; never shown to a merchant. */
  detail: string | null;
};

const LOGO_TYPE = "logo";
const SHOPIFY_SOURCE = "shopify";

export async function syncShopifyBrandLogo(
  client: Pick<ShopifyClient, "graphql">,
  storeId: string,
  prisma: PrismaClient,
): Promise<BrandLogoSyncResult> {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { id: true, workspaceId: true, storeLogoUrl: true },
  });
  if (!store) return { outcome: "absent", storeLogoUrl: null, detail: `Store ${storeId} not found` };

  // Captured before anything is written: the outcome describes what was there
  // BEFORE this sync, and must not depend on the read row staying unmutated.
  const previousLogoUrl = store.storeLogoUrl;

  const brand = await fetchShopifyBrandAssets(client);
  // `logo` is the wordmark a merchant sets for their storefront; `squareLogo`
  // is the avatar-shaped variant and is a reasonable second choice.
  const incoming = brand.logoUrl ?? brand.squareLogoUrl;

  // One row per store for the Shopify-derived logo, found before anything is
  // written, so a repeated sync updates it instead of stacking duplicates.
  const existing = await prisma.brandAsset.findFirst({
    where: { storeId, type: LOGO_TYPE, source: SHOPIFY_SOURCE },
    orderBy: { createdAt: "asc" },
    select: { id: true, url: true },
  });

  if (!incoming) {
    return {
      outcome: "absent",
      storeLogoUrl: previousLogoUrl,
      detail: brand.unavailableReason ?? "shop.brand has no logo set for this store",
    };
  }

  if (existing) {
    if (existing.url !== incoming) {
      await prisma.brandAsset.update({
        where: { id: existing.id },
        data: { url: incoming, status: "ready" },
      });
    }
  } else {
    await prisma.brandAsset.create({
      data: {
        workspaceId: store.workspaceId,
        storeId,
        type: LOGO_TYPE,
        source: SHOPIFY_SOURCE,
        url: incoming,
        fileName: "Shopify brand logo",
        altText: "Store logo from Shopify brand settings",
        status: "ready",
      },
    });
  }

  const merchantOwnsCurrent = !!previousLogoUrl && previousLogoUrl !== existing?.url;
  if (merchantOwnsCurrent) {
    return {
      outcome: "kept_merchant_logo",
      storeLogoUrl: previousLogoUrl,
      detail: "A logo the merchant set is in force; Shopify's is available in the library",
    };
  }

  if (previousLogoUrl === incoming) {
    return { outcome: "unchanged", storeLogoUrl: incoming, detail: null };
  }

  await prisma.store.update({ where: { id: storeId }, data: { storeLogoUrl: incoming } });
  return {
    outcome: previousLogoUrl ? "updated" : "imported",
    storeLogoUrl: incoming,
    detail: null,
  };
}
