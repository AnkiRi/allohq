import type { PrismaClient } from "@allohq/database";
import { Prisma } from "@allohq/database";
import { ShopifyClient } from "../client";

interface ShopifyShop {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  domain: string;
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  zip: string | null;
  country: string | null;
  country_name: string | null;
  currency: string;
  iana_timezone: string;
  description: string | null;
}

/**
 * Sync shop metadata from Shopify's shop.json endpoint.
 * Populates store name, contact info, address, currency, and timezone.
 */
export async function syncShopMetadata(
  shopDomain: string,
  accessToken: string,
  storeId: string,
  prisma: PrismaClient
): Promise<void> {
  const client = new ShopifyClient(shopDomain, accessToken);
  const shop = await client.getSingle<ShopifyShop>("shop");

  const hasAddress = shop.address1 || shop.city || shop.province || shop.zip || shop.country;
  const address = hasAddress
    ? {
        address1: shop.address1 ?? "",
        address2: shop.address2 ?? "",
        city: shop.city ?? "",
        province: shop.province ?? "",
        zip: shop.zip ?? "",
        country: shop.country_name ?? shop.country ?? "",
      }
    : Prisma.JsonNull;

  await prisma.store.update({
    where: { id: storeId },
    data: {
      storeName: shop.name,
      storeEmail: shop.email || null,
      storePhone: shop.phone || null,
      storeDescription: shop.description || null,
      address,
      currency: shop.currency,
      timezone: shop.iana_timezone,
    },
  });

  console.log(`Shop metadata synced for store ${storeId}: ${shop.name}`);
}
