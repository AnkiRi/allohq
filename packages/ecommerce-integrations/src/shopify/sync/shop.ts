import type { PrismaClient } from "@allohq/database";
import { Prisma } from "@allohq/database";
import { ShopifyClient } from "../client";
import { syncShopifyBrandLogo } from "./brand-logo";

interface ShopifyShop {
  name: string;
  email: string;
  contactEmail: string | null;
  currencyCode: string;
  ianaTimezone: string;
  billingAddress: {
    address1: string | null;
    address2: string | null;
    city: string | null;
    province: string | null;
    zip: string | null;
    country: string | null;
  } | null;
}

/**
 * Sync shop metadata through the GraphQL Admin API.
 * Populates store name, contact info, address, currency, and timezone.
 */
export async function syncShopMetadata(
  shopDomain: string,
  accessToken: string,
  storeId: string,
  prisma: PrismaClient
): Promise<void> {
  const client = new ShopifyClient(shopDomain, accessToken);
  const response = await client.graphql<{ shop: ShopifyShop }>(`
    query JoonShopMetadata {
      shop {
        name
        email
        contactEmail
        currencyCode
        ianaTimezone
        billingAddress {
          address1
          address2
          city
          province
          zip
          country
        }
      }
    }
  `);
  const shop = response.shop;

  const sourceAddress = shop.billingAddress;
  const hasAddress =
    sourceAddress?.address1 ||
    sourceAddress?.city ||
    sourceAddress?.province ||
    sourceAddress?.zip ||
    sourceAddress?.country;
  const address = hasAddress
    ? {
        address1: sourceAddress?.address1 ?? "",
        address2: sourceAddress?.address2 ?? "",
        city: sourceAddress?.city ?? "",
        province: sourceAddress?.province ?? "",
        zip: sourceAddress?.zip ?? "",
        country: sourceAddress?.country ?? "",
      }
    : Prisma.JsonNull;

  await prisma.store.update({
    where: { id: storeId },
    data: {
      storeName: shop.name,
      storeEmail: shop.contactEmail || shop.email || null,
      storePhone: null,
      address,
      currency: shop.currencyCode,
      timezone: shop.ianaTimezone,
    },
  });

  // Brand imagery rides along with shop metadata, so install, bootstrap and
  // every later sync all import it through this one path. It is deliberately
  // not allowed to fail the metadata sync: most stores have no brand logo set,
  // and the scopes Joon installs may refuse the field entirely.
  try {
    const logo = await syncShopifyBrandLogo(client, storeId, prisma);
    console.log(`Shopify brand logo for store ${storeId}: ${logo.outcome}${logo.detail ? ` — ${logo.detail}` : ""}`);
  } catch (error) {
    console.warn(
      `Shopify brand logo sync skipped for store ${storeId}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  console.log(`Shop metadata synced for store ${storeId}: ${shop.name}`);
}
