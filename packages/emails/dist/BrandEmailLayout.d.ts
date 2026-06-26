import * as React from "react";
import type { BrandKit } from "./brand-kit";
type BrandEmailLayoutProps = {
    brandKit: BrandKit;
    /** Inbox preview text (the dim line after the subject). */
    preview: string;
    children: React.ReactNode;
};
/**
 * Shared identity shell for every generated email: <head> defaults, the
 * brand header (logo or wordmark pill), the content card, and the footer.
 * Driven entirely by the BrandKit so every brand's emails inherit one
 * consistent, calm, premium look.
 *
 * Dark-mode-safe:
 *  - color-scheme + supported-color-schemes meta tells clients we handle both.
 *  - the wordmark sits on a brand pill, not transparent — it never vanishes
 *    when Gmail/Apple invert a light layout.
 *  - borders use a hairline that survives dark inversion.
 *  - mobile-first: fluid single column, fluid heading sizes.
 */
export declare function BrandEmailLayout({ brandKit, preview, children }: BrandEmailLayoutProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=BrandEmailLayout.d.ts.map