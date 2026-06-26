import { prisma } from "@allohq/database";
import type { EmailBlock, ProductData } from "@allohq/email-builder";
import {
  buildBrandKit,
  renderGeneratedEmail,
  type BrandKit,
  type BuildBrandKitExtras,
  type RenderGeneratedEmailOptions,
} from "@allohq/emails";

/**
 * Load a store's BrandProfile + BrandVisualProfile and derive its BrandKit.
 *
 * This is the bridge between the database brand identity and the pure
 * `@allohq/emails` rendering layer. Every send path uses this so generated
 * emails automatically look like the sending brand.
 */
export async function loadBrandKit(
  storeId: string,
  extras?: BuildBrandKitExtras,
): Promise<BrandKit> {
  const [store, brandProfile, brandVisualProfile] = await Promise.all([
    prisma.store.findUnique({ where: { id: storeId } }),
    prisma.brandProfile.findFirst({ where: { storeId } }),
    prisma.brandVisualProfile.findUnique({ where: { storeId } }),
  ]);

  const derivedExtras: BuildBrandKitExtras = {
    storeName: store?.storeName ?? null,
    storeUrl: store?.shopDomain ? `https://${store.shopDomain}` : null,
    logoUrl: store?.storeLogoUrl ?? null,
    address: store?.address
      ? (() => {
          const a = store.address as {
            address1?: string;
            city?: string;
            province?: string;
            zip?: string;
            country?: string;
          };
          return [a.address1, a.city, a.province, a.zip, a.country]
            .filter(Boolean)
            .join(", ");
        })()
      : null,
    socialLinks: store?.socialLinks
      ? Object.entries(store.socialLinks as Record<string, string>)
          .filter(([, v]) => v)
          .map(([platform, url]) => ({ platform, url }))
      : undefined,
    ...extras,
  };

  return buildBrandKit(
    brandProfile
      ? {
          brandName: brandProfile.brandName,
          brandDescription: brandProfile.brandDescription,
          toneAttributes: brandProfile.toneAttributes as Record<string, unknown>,
          vocabulary: brandProfile.vocabulary as Record<string, unknown>,
          visualStyle: brandProfile.visualStyle as Record<string, unknown>,
          footerText: brandProfile.footerText,
        }
      : null,
    brandVisualProfile
      ? {
          primaryColors: brandVisualProfile.primaryColors,
          accentColors: brandVisualProfile.accentColors,
          fontFamily: brandVisualProfile.fontFamily,
          bodyFontFamily: brandVisualProfile.bodyFontFamily,
          logoUrl: brandVisualProfile.logoUrl,
          logoVariants: brandVisualProfile.logoVariants as Record<string, unknown> | null,
          visualTone: brandVisualProfile.visualTone,
          brandDesignTokens: brandVisualProfile.brandDesignTokens as Record<string, unknown> | null,
        }
      : null,
    derivedExtras,
  );
}

export interface RenderBrandedEmailInput {
  storeId: string;
  blocks: EmailBlock[];
  subject?: string;
  previewText?: string;
  variables?: Record<string, string>;
  products?: Record<string, ProductData>;
  dynamicProducts?: ProductData[];
  previewMode?: boolean;
  tracking?: RenderGeneratedEmailOptions["tracking"];
  /** Pre-loaded kit (skips the DB round-trip). */
  brandKit?: BrandKit;
}

/**
 * Render an EmailBlock[] content model to bulletproof, brand-styled HTML.
 *
 * Loads the store's BrandKit (unless one is supplied) and renders via
 * `@allohq/emails` React Email components — replacing the MJML path so every
 * generated email automatically looks like the sending brand.
 */
export async function renderBrandedEmail(
  input: RenderBrandedEmailInput,
): Promise<string> {
  const brandKit = input.brandKit ?? (await loadBrandKit(input.storeId));
  return renderGeneratedEmail(
    {
      blocks: input.blocks,
      subject: input.subject,
      previewText: input.previewText,
    },
    brandKit,
    {
      variables: input.variables,
      products: input.products,
      dynamicProducts: input.dynamicProducts,
      previewMode: input.previewMode,
      tracking: input.tracking,
    },
  );
}
