import type { PrismaClient } from "@allohq/database";
import { ShopifyClient } from "../client";
import type { ShopifyCustomer, ShopifySyncResult } from "../types";

/**
 * Sync all customers from Shopify to the database.
 * Uses cursor-based pagination via Link header.
 */
export async function syncAllCustomers(
  shopDomain: string,
  accessToken: string,
  storeId: string,
  prisma: PrismaClient
): Promise<ShopifySyncResult> {
  const client = new ShopifyClient(shopDomain, accessToken);
  let imported = 0;
  const errors: string[] = [];
  let pageInfo: string | undefined;

  do {
    const params: Record<string, string> = { limit: "250" };
    if (pageInfo) params.page_info = pageInfo;

    const response = await client.get<ShopifyCustomer>("customers", params);

    for (const customer of response.data) {
      try {
        const tags = customer.tags
          ? customer.tags.split(",").map((t) => t.trim()).filter(Boolean)
          : [];

        await prisma.customer.upsert({
          where: {
            storeId_externalId: {
              storeId,
              externalId: String(customer.id),
            },
          },
          create: {
            storeId,
            externalId: String(customer.id),
            email: customer.email,
            phone: customer.phone,
            firstName: customer.first_name,
            lastName: customer.last_name,
            acceptsMarketing: customer.accepts_marketing,
            tags,
          },
          update: {
            email: customer.email,
            phone: customer.phone,
            firstName: customer.first_name,
            lastName: customer.last_name,
            acceptsMarketing: customer.accepts_marketing,
            tags,
          },
        });

        imported++;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`Customer ${customer.id}: ${msg}`);
      }
    }

    pageInfo = response.nextPageInfo;
  } while (pageInfo);

  return { imported, errors };
}
