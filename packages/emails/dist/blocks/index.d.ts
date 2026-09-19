import * as React from "react";
import type { EmailBlock, ProductData } from "@allohq/email-builder";
import type { BrandKit } from "../brand-kit";
export interface BlockRenderContext {
    brandKit: BrandKit;
    /** Merge tags, e.g. { first_name: "Aanya", unsubscribe_url: "..." }. */
    variables: Record<string, string>;
    /** Product data keyed by product id. */
    products: Record<string, ProductData>;
    /** Dynamic recommendations resolved at send time. */
    dynamicProducts?: ProductData[];
    /** Show placeholders for missing data (editor preview). */
    previewMode?: boolean;
}
/**
 * Custom code is an explicit escape hatch, not a second rendering system.
 * Keep a deliberately small safety boundary here so preview and delivery use
 * the exact same sanitized artifact. Email providers strip many unsupported
 * elements too, but Joon must fail closed before an approval reaches them.
 */
export declare function sanitizeCustomEmailHtml(value: string): string;
export declare function renderBlock(block: EmailBlock, ctx: BlockRenderContext): React.ReactNode;
//# sourceMappingURL=index.d.ts.map