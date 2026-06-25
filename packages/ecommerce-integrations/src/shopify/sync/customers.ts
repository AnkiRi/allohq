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

    // Upsert each page's rows in PARALLEL, in small chunks — the old one-at-a-
    // time `await` made big stores crawl (~93k serial round-trips). Concurrency
    // is bounded so we don't exhaust the DB connection pool. Upsert semantics
    // (works for first sync AND re-sync) and per-row error collection preserved.
    const CONCURRENCY = 25;
    for (let i = 0; i < response.data.length; i += CONCURRENCY) {
      const chunk = response.data.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        chunk.map((customer) => {
          const tags = customer.tags
            ? customer.tags.split(",").map((t) => t.trim()).filter(Boolean)
            : [];
          return prisma.customer.upsert({
            where: {
              storeId_externalId: { storeId, externalId: String(customer.id) },
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
        }),
      );
      results.forEach((r, j) => {
        if (r.status === "fulfilled") {
          imported++;
        } else {
          const msg =
            r.reason instanceof Error ? r.reason.message : String(r.reason);
          errors.push(`Customer ${chunk[j]?.id}: ${msg}`);
        }
      });
    }

    pageInfo = response.nextPageInfo;
  } while (pageInfo);

  return { imported, errors };
}
