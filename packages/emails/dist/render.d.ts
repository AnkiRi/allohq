import type { EmailBlock, ProductData } from "@allohq/email-builder";
import type { BrandKit } from "./brand-kit";
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
export declare function renderGeneratedEmail(content: RenderGeneratedEmailContent, brandKit: BrandKit, options?: RenderGeneratedEmailOptions): Promise<string>;
//# sourceMappingURL=render.d.ts.map