import { SHOPIFY_API_VERSION } from "./constants";
import { decryptSecret } from "@allohq/database";

/**
 * Lightweight GraphQL client for Shopify Admin API.
 */
export class ShopifyClient {
  private graphqlUrl: string;
  private headers: Record<string, string>;
  private encryptedAccessToken: string;

  constructor(shopDomain: string, accessToken: string) {
    // Ensure domain doesn't have protocol
    const domain = shopDomain.replace(/^https?:\/\//, "");
    this.encryptedAccessToken = accessToken;
    this.graphqlUrl =
      `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
    this.headers = {
      "X-Shopify-Access-Token": decryptSecret(accessToken),
      "Content-Type": "application/json",
    };
  }

  getEncryptedAccessToken(): string {
    return this.encryptedAccessToken;
  }

  /**
   * Execute an Admin GraphQL operation and fail on either transport-level or
   * top-level GraphQL errors. Mutation-specific userErrors remain in `data` so
   * callers can present the precise merchant-actionable failure.
   */
  async graphql<T>(
    query: string,
    variables: Record<string, unknown> = {},
  ): Promise<T> {
    const response = await fetch(this.graphqlUrl, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ query, variables }),
    });
    const body = (await response.json().catch(() => null)) as {
      data?: T;
      errors?: Array<{ message?: string }>;
    } | null;

    if (!response.ok) {
      throw new Error(
        `Shopify GraphQL error ${response.status}: ${JSON.stringify(body)}`,
      );
    }
    if (body?.errors?.length) {
      throw new Error(
        `Shopify GraphQL error: ${body.errors
          .map((error) => error.message ?? "Unknown error")
          .join("; ")}`,
      );
    }
    if (!body?.data) {
      throw new Error("Shopify GraphQL response did not contain data");
    }
    return body.data;
  }
}
