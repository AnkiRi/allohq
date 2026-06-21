import * as React from "react";
import { render } from "@react-email/render";
import type { EmailBlock, ProductData } from "@allohq/email-builder";
import type { BrandKit } from "./brand-kit";
import { BrandEmailLayout } from "./BrandEmailLayout";
import { renderBlock, type BlockRenderContext } from "./blocks";

export interface RenderGeneratedEmailContent {
  /** Inbox preview text. */
  previewText?: string;
  /** Subject — used as a fallback preview if previewText is absent. */
  subject?: string;
  /** The generated content model. */
  blocks: EmailBlock[];
}

export interface RenderGeneratedEmailOptions {
  variables?: Record<string, string>;
  products?: Record<string, ProductData>;
  dynamicProducts?: ProductData[];
  previewMode?: boolean;
  /** UTM tracking — injected into store-domain links after render. */
  tracking?: {
    utmSource: string;
    utmMedium: string;
    utmCampaign: string;
    utmContent?: string;
    storeDomain?: string;
  };
}

/** The full email document, brand-kit-driven. */
function GeneratedEmailDocument({
  content,
  brandKit,
  ctx,
}: {
  content: RenderGeneratedEmailContent;
  brandKit: BrandKit;
  ctx: BlockRenderContext;
}) {
  const preview = content.previewText || content.subject || "";
  return (
    <BrandEmailLayout brandKit={brandKit} preview={preview}>
      {content.blocks.map((block, i) => (
        <React.Fragment key={block.id ?? i}>{renderBlock(block, ctx)}</React.Fragment>
      ))}
    </BrandEmailLayout>
  );
}

/** Inject UTM params into <a href> URLs matching the store domain. */
function injectUtmParams(
  html: string,
  tracking: NonNullable<RenderGeneratedEmailOptions["tracking"]>,
): string {
  return html.replace(/href="([^"]+)"/g, (_m, url: string) => {
    if (url.startsWith("mailto:") || url.startsWith("#") || url.includes("unsubscribe")) {
      return `href="${url}"`;
    }
    if (!url.startsWith("http")) return `href="${url}"`;
    if (tracking.storeDomain && !url.includes(tracking.storeDomain)) {
      return `href="${url}"`;
    }
    const sep = url.includes("?") ? "&" : "?";
    const params = [
      `utm_source=${encodeURIComponent(tracking.utmSource)}`,
      `utm_medium=${encodeURIComponent(tracking.utmMedium)}`,
      `utm_campaign=${encodeURIComponent(tracking.utmCampaign)}`,
      ...(tracking.utmContent ? [`utm_content=${encodeURIComponent(tracking.utmContent)}`] : []),
    ].join("&");
    return `href="${url}${sep}${params}"`;
  });
}

/**
 * Render a generated email (EmailBlock[] content model) into bulletproof,
 * brand-styled HTML via React Email.
 *
 * The brand kit drives the entire look: header (logo/wordmark), colors, fonts,
 * footer, and every block component — so every generated email automatically
 * looks like the sending brand.
 *
 * Output is table-based, single-column mobile-fluid, and dark-mode-safe.
 */
export async function renderGeneratedEmail(
  content: RenderGeneratedEmailContent,
  brandKit: BrandKit,
  options: RenderGeneratedEmailOptions = {},
): Promise<string> {
  const ctx: BlockRenderContext = {
    brandKit,
    variables: options.variables ?? {},
    products: options.products ?? {},
    dynamicProducts: options.dynamicProducts,
    previewMode: options.previewMode,
  };

  let html = await render(
    <GeneratedEmailDocument content={content} brandKit={brandKit} ctx={ctx} />,
    { pretty: false },
  );

  if (options.tracking) {
    html = injectUtmParams(html, options.tracking);
  }
  return html;
}
