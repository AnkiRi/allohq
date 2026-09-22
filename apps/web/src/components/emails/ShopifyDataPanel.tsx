"use client";

import * as React from "react";
import { cn } from "@allohq/ui";
import { PERSONALIZATION_TOKENS, tokenText, type EmailBlock } from "@allohq/email-builder";

export type StoreProduct = {
  id: string;
  title: string;
  price: number;
  imageUrl?: string | null;
  handle?: string;
};
/** Blocks that show product data, and so need a product chosen rather than typed. */
const PRODUCT_BLOCKS = new Set(["product", "product_grid"]);
/** Blocks whose copy can carry a personalization token. */
const TEXT_BLOCKS = new Set(["text", "hero", "button", "footer", "testimonial"]);

function formatPrice(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * The Shopify half of a block.
 *
 * Its job is to make the factual parts of an email obviously factual: a
 * product is PICKED from the store and its title, price and image are shown
 * as read-only truth, not as text fields inviting a merchant — or Joon — to
 * type something that is not so. The server enforces the same rule, so this
 * panel is where a merchant does the thing the server will not let Joon do.
 */
export function ShopifyDataPanel({
  selected,
  products,
  storeConnected,
  onBindProduct,
  onToggleGridProduct,
  onInsertToken,
}: {
  selected: EmailBlock | null;
  products: StoreProduct[];
  storeConnected: boolean;
  onBindProduct: (productId: string) => void;
  onToggleGridProduct: (productId: string) => void;
  onInsertToken: (text: string) => void;
}) {
  const [query, setQuery] = React.useState("");

  if (!selected) {
    return (
      <Empty>
        Select a block in the email to see the store data behind it.
      </Empty>
    );
  }

  if (!storeConnected) {
    return (
      <Empty>
        Connect your Shopify store to use real products, prices and links here.
        Until then Joon will not guess at any of them.
      </Empty>
    );
  }

  const isProduct = PRODUCT_BLOCKS.has(selected.type);
  const isText = TEXT_BLOCKS.has(selected.type);

  if (!isProduct && !isText) {
    return <Empty>A {selected.type.replace(/_/g, " ")} block carries no store data.</Empty>;
  }

  const filtered = query.trim()
    ? products.filter((product) => product.title.toLowerCase().includes(query.trim().toLowerCase()))
    : products;

  return (
    <div className="p-4">
      {isProduct ? (
        <ProductBinding
          selected={selected}
          products={filtered}
          query={query}
          setQuery={setQuery}
          onBindProduct={onBindProduct}
          onToggleGridProduct={onToggleGridProduct}
        />
      ) : null}

      {isText ? (
        <section className={cn(isProduct && "mt-6")}>
          <h3 className="text-[12px] font-medium">Personalize this block</h3>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Each field carries what to show when a customer has no value, so nobody
            receives an empty greeting.
          </p>
          <div className="mt-3 space-y-3">
            {(["customer", "order", "store"] as const).map((group) => {
              const tokens = PERSONALIZATION_TOKENS.filter((token) => token.group === group);
              if (!tokens.length) return null;
              return (
                <div key={group}>
                  <p className="mb-1.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    {group}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {tokens.map((token) => (
                      <button
                        key={token.key}
                        type="button"
                        onClick={() => onInsertToken(tokenText(token.key))}
                        title={
                          token.defaultFallback
                            ? `Shows "${token.defaultFallback}" when the customer has no value`
                            : "Shows nothing when the customer has no value"
                        }
                        className="rounded-lg border border-border px-2.5 py-1.5 text-left text-[12px] hover:border-[var(--evidence,#2D4F9E)] hover:bg-[var(--evidence-soft,#E9EFFF)]"
                      >
                        <span className="font-medium">{token.label}</span>
                        <span className="ml-1.5 text-muted-foreground">{token.sample}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ProductBinding({
  selected,
  products,
  query,
  setQuery,
  onBindProduct,
  onToggleGridProduct,
}: {
  selected: EmailBlock;
  products: StoreProduct[];
  query: string;
  setQuery: (value: string) => void;
  onBindProduct: (productId: string) => void;
  onToggleGridProduct: (productId: string) => void;
}) {
  const props = selected.props as Record<string, unknown>;
  const boundId = typeof props["productId"] === "string" ? props["productId"] : null;
  const bound = boundId ? products.find((product) => product.id === boundId) ?? null : null;
  const isGrid = selected.type === "product_grid";
  const gridIds = Array.isArray(props["productIds"]) ? (props["productIds"] as string[]) : [];

  return (
    <section>
      <h3 className="text-[12px] font-medium">
        {isGrid ? "Products in this grid" : "Product shown in this block"}
      </h3>

      {!isGrid ? (
        boundId ? (
          <div className="mt-2 rounded-xl border border-border p-3">
            <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              From your store
            </p>
            <p className="mt-1 text-[13px] font-medium">
              {bound?.title ?? (props["title"] as string) ?? "This product is no longer in your store"}
            </p>
            {bound ? (
              <p className="mt-0.5 text-[12px] text-muted-foreground">{formatPrice(bound.price)}</p>
            ) : (
              <p className="mt-0.5 text-[12px] text-[var(--risk,#B95849)]">
                Pick another product — this one was removed or belongs to a different store.
              </p>
            )}
            <p className="mt-2 text-[11px] text-muted-foreground">
              Title, price, description and image come from Shopify at send time. Joon
              writes the wording around them, never the facts themselves.
            </p>
          </div>
        ) : (
          <p className="mt-2 rounded-xl border border-dashed border-border p-3 text-[12px] text-muted-foreground">
            No product chosen yet. Nothing is shown in this block until you pick one —
            Joon will not choose for you.
          </p>
        )
      ) : (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Choose the individual products this grid shows. Their titles, prices and
          images are read from Shopify when the email renders.
        </p>
      )}

      {isGrid ? (
        <div className="mt-3">
          <label className="mb-1.5 block text-[11px] font-medium" htmlFor="shopify-grid-search">
            Products in this grid
          </label>
          <input
            id="shopify-grid-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search your products…"
            className="mb-2 w-full rounded-lg border border-border bg-transparent px-2.5 py-1.5 text-[13px] outline-none focus:border-[var(--evidence,#2D4F9E)]"
          />
          {products.length ? (
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {products.map((product) => {
                const chosen = gridIds.includes(product.id);
                return (
                  <button
                    key={product.id}
                    type="button"
                    aria-pressed={chosen}
                    onClick={() => onToggleGridProduct(product.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left text-[12px]",
                      chosen
                        ? "border-[var(--evidence,#2D4F9E)] bg-[var(--evidence-soft,#E9EFFF)]"
                        : "border-border hover:border-[var(--evidence,#2D4F9E)]",
                    )}
                  >
                    <span className="truncate">{product.title}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {chosen ? "In grid" : formatPrice(product.price)}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-[12px] text-muted-foreground">
              {query.trim() ? "No product matches that." : "No products have synced from your store yet."}
            </p>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">
            {gridIds.length
              ? `${gridIds.length} product${gridIds.length === 1 ? "" : "s"} in this grid.`
              : "No products chosen yet — this grid renders empty until you pick some."}
          </p>
        </div>
      ) : (
        <div className="mt-3">
          <label className="mb-1.5 block text-[11px] font-medium" htmlFor="shopify-product-search">
            {boundId ? "Choose a different product" : "Choose a product"}
          </label>
          <input
            id="shopify-product-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search your products…"
            className="mb-2 w-full rounded-lg border border-border bg-transparent px-2.5 py-1.5 text-[13px] outline-none focus:border-[var(--evidence,#2D4F9E)]"
          />
          {products.length ? (
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {products.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  aria-pressed={product.id === boundId}
                  onClick={() => onBindProduct(product.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left text-[12px]",
                    product.id === boundId
                      ? "border-[var(--evidence,#2D4F9E)] bg-[var(--evidence-soft,#E9EFFF)]"
                      : "border-border hover:border-[var(--evidence,#2D4F9E)]",
                  )}
                >
                  <span className="truncate">{product.title}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {formatPrice(product.price)}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-muted-foreground">
              {query.trim() ? "No product matches that." : "No products have synced from your store yet."}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6 text-center">
      <p className="max-w-[30ch] text-[13px] text-muted-foreground">{children}</p>
    </div>
  );
}
