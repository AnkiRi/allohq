import { SHOPIFY_API_VERSION } from "./constants";
import type { ShopifyPaginatedResponse } from "./types";

/**
 * Lightweight REST client for Shopify Admin API.
 * Uses native fetch — no SDK dependency at runtime.
 */
export class ShopifyClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(shopDomain: string, accessToken: string) {
    // Ensure domain doesn't have protocol
    const domain = shopDomain.replace(/^https?:\/\//, "");
    this.baseUrl = `https://${domain}/admin/api/${SHOPIFY_API_VERSION}`;
    this.headers = {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    };
  }

  /**
   * GET request with automatic cursor-based pagination support.
   * Returns data array and optional next page cursor from Link header.
   */
  async get<T>(
    endpoint: string,
    params: Record<string, string> = {}
  ): Promise<ShopifyPaginatedResponse<T>> {
    const url = new URL(`${this.baseUrl}/${endpoint}.json`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url.toString(), { headers: this.headers });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Shopify API error ${response.status}: ${body}`
      );
    }

    const json = (await response.json()) as Record<string, T[]>;
    // Shopify REST wraps in a key matching the endpoint (e.g. { products: [...] })
    const dataKey = Object.keys(json)[0]!;
    const data = json[dataKey] as T[];

    // Parse Link header for cursor pagination
    const linkHeader = response.headers.get("link");
    const nextPageInfo = parseLinkHeader(linkHeader);

    return { data, nextPageInfo };
  }

  /**
   * GET request for single-object endpoints (e.g. shop.json).
   * Returns the unwrapped object directly.
   */
  async getSingle<T>(endpoint: string): Promise<T> {
    const url = `${this.baseUrl}/${endpoint}.json`;
    const response = await fetch(url, { headers: this.headers });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Shopify API error ${response.status}: ${body}`);
    }

    const json = (await response.json()) as Record<string, T>;
    const dataKey = Object.keys(json)[0]!;
    return json[dataKey] as T;
  }

  /**
   * POST request (used for webhook registration, etc.)
   */
  async post<T>(endpoint: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}/${endpoint}.json`;
    const response = await fetch(url, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Shopify API error ${response.status}: ${text}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * PUT request (used for updating resources)
   */
  async put<T>(endpoint: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}/${endpoint}.json`;
    const response = await fetch(url, {
      method: "PUT",
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Shopify API error ${response.status}: ${text}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * DELETE request
   */
  async delete(endpoint: string): Promise<void> {
    const url = `${this.baseUrl}/${endpoint}.json`;
    const response = await fetch(url, {
      method: "DELETE",
      headers: this.headers,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Shopify API error ${response.status}: ${text}`);
    }
  }
}

/**
 * Parse the Link header to extract the `page_info` for the next page.
 * Shopify uses: `<url?page_info=xyz>; rel="next"`
 */
function parseLinkHeader(header: string | null): string | undefined {
  if (!header) return undefined;

  const parts = header.split(",");
  for (const part of parts) {
    const match = part.match(/<[^>]*[?&]page_info=([^>&]*).*>;\s*rel="next"/);
    if (match) return match[1];
  }
  return undefined;
}
