import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, workspaceProcedure } from "../trpc";
import { NO_SHOPIFY_LOGO_MESSAGE } from "@allohq/ecommerce-integrations";
import { assetStorageStatus } from "../lib/asset-storage-status";

/**
 * The Asset Library.
 *
 * Everything a merchant can put in an email, in one store-scoped place, with
 * where each thing came from stated rather than implied:
 *
 *   Shopify    product and catalogue images, read live from the store
 *   Upload     files the merchant added
 *   Generated  images Joon made, with the model and prompt that made them
 *   Brand      logo, dark logo, hero, lifestyle, reference
 *
 * Shopify product images are NOT copied into Joon. They are listed from the
 * synced catalogue and used by reference, because claiming Joon holds a copy
 * it does not hold would be a lie about where a picture lives.
 */

export type LibrarySource = "shopify" | "upload" | "generated" | "brand";

const BRAND_TYPES = new Set(["logo", "logo_dark", "hero", "lifestyle", "reference", "icon"]);

export const assetsRouter = router({
  /** Everything selectable for this store, grouped by where it came from. */
  library: workspaceProcedure
    .input(z.object({ storeId: z.string(), limit: z.number().int().min(1).max(200).default(60) }))
    .query(async ({ ctx, input }) => {
      // Store scoping is the isolation boundary and is enforced here, not by
      // the caller passing the right id.
      const store = await ctx.prisma.store.findFirst({
        where: { id: input.storeId, workspaceId: ctx.workspaceId },
        select: { id: true, storeLogoUrl: true },
      });
      if (!store) throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });

      const [assets, products] = await Promise.all([
        ctx.prisma.brandAsset.findMany({
          where: { workspaceId: ctx.workspaceId, storeId: input.storeId, status: "ready" },
          orderBy: { createdAt: "desc" },
          take: input.limit,
          select: {
            id: true, type: true, url: true, fileName: true, source: true,
            sourcePrompt: true, sourceAssetIds: true, width: true, height: true,
            altText: true, createdAt: true,
          },
        }),
        ctx.prisma.product.findMany({
          where: { storeId: input.storeId, imageUrl: { not: null } },
          orderBy: { updatedAt: "desc" },
          take: input.limit,
          select: { id: true, title: true, imageUrl: true, handle: true },
        }),
      ]);

      const classify = (asset: (typeof assets)[number]): LibrarySource => {
        if (asset.source === "generated") return "generated";
        if (asset.source === "shopify") return "shopify";
        return BRAND_TYPES.has(asset.type) && asset.source !== "upload" ? "brand" : "upload";
      };

      const stored = assets.map((asset) => ({
        id: asset.id,
        url: asset.url,
        label: asset.fileName,
        source: classify(asset),
        type: asset.type,
        width: asset.width,
        height: asset.height,
        altText: asset.altText,
        /** Present only for generated assets: what made it, and from what. */
        provenance: asset.source === "generated"
          ? { prompt: asset.sourcePrompt, fromAssetIds: asset.sourceAssetIds }
          : null,
        createdAt: asset.createdAt,
      }));

      return {
        // Listed by reference from the synced catalogue. Not copies.
        shopify: products
          .filter((product) => product.imageUrl)
          .map((product) => ({
            id: `product:${product.id}`,
            url: product.imageUrl!,
            label: product.title,
            source: "shopify" as const,
            productId: product.id,
          })),
        uploads: stored.filter((asset) => asset.source === "upload"),
        generated: stored.filter((asset) => asset.source === "generated"),
        brand: stored.filter((asset) => asset.source === "brand"),
        /**
         * Shopify's own brand logo, only when the store actually has one.
         * Joon installs no theme or content scope, so a logo configured only
         * in the theme is unreachable and is reported as absent.
         */
        shopifyLogo: store.storeLogoUrl
          ? { url: store.storeLogoUrl, label: "Store logo" }
          : null,
        shopifyLogoMessage: store.storeLogoUrl ? null : NO_SHOPIFY_LOGO_MESSAGE,
        /** Uploads need somewhere to go; the UI gates on this before starting. */
        storageConfigured: assetStorageStatus().configured,
      };
    }),
});
