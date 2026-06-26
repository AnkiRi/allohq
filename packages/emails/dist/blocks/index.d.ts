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
export declare function renderBlock(block: EmailBlock, ctx: BlockRenderContext): React.ReactNode;
//# sourceMappingURL=index.d.ts.map