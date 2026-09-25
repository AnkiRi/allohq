import type { ShopifyClient } from "../client";

/**
 * What Joon can actually retrieve of a store's branding.
 *
 * Audited against the scopes Joon installs: `read_products`, `read_customers`,
 * `read_orders`, `read_checkouts`, `write_discounts`, `read_fulfillments`,
 * `read_inventory`, `write_pixels`, `read_customer_events`.
 *
 * That list has no `read_themes` and no `read_content`, so **theme assets and
 * `settings_data.json` are out of reach** — a logo configured only in the
 * theme cannot be read, and Joon must not imply otherwise.
 *
 * `shop.brand` is the one branding surface that may be readable with ordinary
 * shop access. Whether a given store returns anything depends on whether the
 * merchant filled in Shopify's own brand settings, which most have not. So
 * this ASKS, and treats "nothing" as a completely normal answer rather than an
 * error — the merchant uploads a logo instead.
 *
 * No scope is broadened to make this work. If richer brand import is wanted
 * later it needs `read_content`, and that is a decision to report, not take.
 */

export type ShopifyBrandAssets = {
  logoUrl: string | null;
  squareLogoUrl: string | null;
  coverImageUrl: string | null;
  /** Why nothing came back, when nothing did. Operator-facing. */
  unavailableReason: string | null;
};

const BRAND_QUERY = `
  query JoonShopBrand {
    shop {
      name
      brand {
        logo { image { url } }
        squareLogo { image { url } }
        coverImage { image { url } }
      }
    }
  }
`;

type BrandResponse = {
  shop?: {
    brand?: {
      logo?: { image?: { url?: string } | null } | null;
      squareLogo?: { image?: { url?: string } | null } | null;
      coverImage?: { image?: { url?: string } | null } | null;
    } | null;
  };
};

export async function fetchShopifyBrandAssets(
  client: Pick<ShopifyClient, "graphql">,
): Promise<ShopifyBrandAssets> {
  const empty: ShopifyBrandAssets = {
    logoUrl: null,
    squareLogoUrl: null,
    coverImageUrl: null,
    unavailableReason: null,
  };

  let data: BrandResponse;
  try {
    data = await client.graphql<BrandResponse>(BRAND_QUERY);
  } catch (error) {
    // A scope or schema refusal is a normal answer here, not a failure worth
    // surfacing to a merchant: they simply upload a logo instead.
    return {
      ...empty,
      unavailableReason: error instanceof Error ? error.message : String(error),
    };
  }

  const brand = data.shop?.brand;
  if (!brand) {
    return { ...empty, unavailableReason: "shop.brand returned nothing for this store" };
  }

  const assets: ShopifyBrandAssets = {
    logoUrl: brand.logo?.image?.url ?? null,
    squareLogoUrl: brand.squareLogo?.image?.url ?? null,
    coverImageUrl: brand.coverImage?.image?.url ?? null,
    unavailableReason: null,
  };

  if (!assets.logoUrl && !assets.squareLogoUrl && !assets.coverImageUrl) {
    assets.unavailableReason = "the store has no brand assets set in Shopify";
  }
  return assets;
}

/** What a merchant is told when nothing came back. Names no scope or API. */
export const NO_SHOPIFY_LOGO_MESSAGE = "No Shopify logo found — upload one.";
