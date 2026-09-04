import type { PrismaClient } from "@allohq/database";
import { ShopifyClient } from "../client";
import type { ShopifySyncResult } from "../types";

interface GraphqlCustomer {
  id: string;
  firstName: string | null;
  lastName: string | null;
  tags: string[];
  defaultEmailAddress: {
    emailAddress: string;
    marketingState: string;
    marketingOptInLevel: string | null;
    marketingUpdatedAt: string | null;
  } | null;
}

function legacyId(gid: string): string {
  const value = gid.split("/").pop();
  if (!value) throw new Error(`Invalid Shopify GID: ${gid}`);
  return value;
}

export async function syncAllCustomers(
  shopDomain: string,
  accessToken: string,
  storeId: string,
  prisma: PrismaClient,
): Promise<ShopifySyncResult> {
  const client = new ShopifyClient(shopDomain, accessToken);
  let imported = 0;
  const errors: string[] = [];
  let cursor: string | null = null;

  do {
    const response: {
      customers: {
        nodes: GraphqlCustomer[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    } = await client.graphql(`
      query JoonCustomers($after: String) {
        customers(first: 100, after: $after) {
          nodes {
            id
            firstName
            lastName
            tags
            defaultEmailAddress {
              emailAddress
              marketingState
              marketingOptInLevel
              marketingUpdatedAt
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    `, { after: cursor });

    const customers = response.customers.nodes;
    const concurrency = 12;
    for (let i = 0; i < customers.length; i += concurrency) {
      const chunk = customers.slice(i, i + concurrency);
      const results = await Promise.allSettled(
        chunk.map(async (customer) => {
          const emailAddress = customer.defaultEmailAddress;
          if (!emailAddress?.emailAddress) {
            throw new Error("no email address; skipped");
          }
          const shopifyState = emailAddress.marketingState.toLowerCase();
          const status =
            shopifyState === "subscribed"
              ? "opted_in"
              : shopifyState === "unsubscribed"
                ? "opted_out"
                : "unknown";
          const acceptsMarketing = status === "opted_in";
          const consentUpdatedAt = emailAddress.marketingUpdatedAt;

          const syncedCustomer = await prisma.customer.upsert({
            where: {
              storeId_externalId: {
                storeId,
                externalId: legacyId(customer.id),
              },
            },
            create: {
              storeId,
              externalId: legacyId(customer.id),
              email: emailAddress.emailAddress,
              // Email-only v1 deliberately does not request protected phone data.
              phone: null,
              firstName: customer.firstName,
              lastName: customer.lastName,
              acceptsMarketing,
              tags: customer.tags,
            },
            update: {
              email: emailAddress.emailAddress,
              phone: null,
              firstName: customer.firstName,
              lastName: customer.lastName,
              acceptsMarketing,
              tags: customer.tags,
            },
          });

          await prisma.contactConsent.upsert({
            where: {
              customerId_channel: {
                customerId: syncedCustomer.id,
                channel: "email",
              },
            },
            create: {
              storeId,
              customerId: syncedCustomer.id,
              channel: "email",
              status,
              source: "shopify",
              evidence: {
                state: shopifyState,
                optInLevel: emailAddress.marketingOptInLevel,
              },
              collectedAt: consentUpdatedAt
                ? new Date(consentUpdatedAt)
                : null,
              revokedAt: status === "opted_out" ? new Date() : null,
            },
            update: {
              status,
              source: "shopify",
              evidence: {
                state: shopifyState,
                optInLevel: emailAddress.marketingOptInLevel,
              },
              collectedAt: consentUpdatedAt
                ? new Date(consentUpdatedAt)
                : null,
              revokedAt: status === "opted_out" ? new Date() : null,
            },
          });
          imported++;
        }),
      );
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          errors.push(
            `Customer ${chunk[index]?.id}: ${
              result.reason instanceof Error
                ? result.reason.message
                : String(result.reason)
            }`,
          );
        }
      });
    }

    cursor = response.customers.pageInfo.hasNextPage
      ? response.customers.pageInfo.endCursor
      : null;
  } while (cursor);

  return { imported, errors };
}
