/**
 * BrandKit — the single source of truth for one brand's email identity.
 *
 * Generalizes the proven Vana Naturals pattern (apps/web/src/emails/brand-kit.ts)
 * so that EVERY generated email can be rendered in the sending brand's own look,
 * derived from its BrandProfile (voice) + BrandVisualProfile (colors/fonts/logo).
 *
 * Everything downstream — the layout shell and the block components — reads only
 * from a BrandKit, so a brand's emails stay consistent without re-deriving tokens.
 */
export interface BrandKitColors {
    /** Warm page background behind the content card. */
    paper: string;
    /** The content card / primary surface. */
    surface: string;
    /** Soft accent fill — hero bands, tip blocks, product card backings. */
    accent: string;
    /** Hairline border that survives dark-mode inversion. */
    line: string;
    /** Primary brand color — wordmark pill, CTAs, headings. */
    primary: string;
    /** Deepest brand color — pressed states, footer. */
    primaryDeep: string;
    /** Secondary brand color — links, secondary accents. */
    secondary: string;
    /** Near-black heading ink on light surfaces. */
    ink: string;
    /** Body copy color (clears AA on paper + surface). */
    body: string;
    /** Captions / meta. */
    muted: string;
    /** Text that sits on the primary/dark color (never pure-white logo). */
    onPrimary: string;
    /** Muted text on the primary/dark color. */
    onPrimaryMuted: string;
}
export interface BrandKitFonts {
    /** Display / heading stack (email-safe). */
    serif: string;
    /** Body / UI stack (email-safe). */
    sans: string;
}
export interface BrandKitLogo {
    /** Logo image URL, if the brand has one. */
    src?: string;
    /** Text wordmark, always present as a fallback so the header never vanishes. */
    wordmark: string;
    /** Optional small descriptor printed beside the wordmark (e.g. "Naturals"). */
    descriptor?: string;
    alt: string;
}
export interface BrandKitVoice {
    brandName: string;
    /** One-line brand tagline for the footer. */
    tagline?: string;
    /** Words the brand must never use (enforced upstream in content gen; kept here for reference). */
    bannedWords: string[];
}
export interface BrandKitFooter {
    /** Postal address line, if available. */
    address?: string;
    /** Custom legal / sign-off line. */
    customText?: string;
    /** Social links shown in the footer. */
    socialLinks?: {
        platform: string;
        url: string;
    }[];
    preferencesUrl?: string;
    unsubscribeUrl?: string;
}
export interface BrandKit {
    colors: BrandKitColors;
    fonts: BrandKitFonts;
    logo: BrandKitLogo;
    voice: BrandKitVoice;
    footer: BrandKitFooter;
    /** Brand homepage / store URL. */
    url?: string;
    radius: {
        card: number;
        button: number;
    };
    contentWidth: number;
}
export declare const DEFAULT_BRAND_KIT: BrandKit;
export interface BrandProfileSource {
    brandName?: string | null;
    brandDescription?: string | null;
    toneAttributes?: Record<string, unknown> | null;
    vocabulary?: Record<string, unknown> | null;
    visualStyle?: Record<string, unknown> | null;
    footerText?: string | null;
}
export interface BrandVisualProfileSource {
    primaryColors?: unknown;
    accentColors?: unknown;
    fontFamily?: string | null;
    bodyFontFamily?: string | null;
    logoUrl?: string | null;
    logoVariants?: Record<string, unknown> | null;
    visualTone?: string | null;
    brandDesignTokens?: Record<string, unknown> | null;
}
export interface BuildBrandKitExtras {
    storeName?: string | null;
    storeUrl?: string | null;
    logoUrl?: string | null;
    address?: string | null;
    socialLinks?: {
        platform: string;
        url: string;
    }[];
    preferencesUrl?: string;
    unsubscribeUrl?: string;
}
/**
 * Derive a complete BrandKit from a store's BrandProfile + BrandVisualProfile.
 *
 * - Colors: primary from the brand's primary color; the rest of the palette
 *   (deep, secondary, accent, line, on-primary) is derived around it so the
 *   result is always cohesive and AA-readable, even from a single brand color.
 * - Fonts: brand heading/body fonts wrapped in email-safe fallback stacks.
 * - Logo: image URL if present, with the brand name as a text-wordmark fallback
 *   so the header never vanishes in dark mode.
 * - Voice: brand name, tagline (from description), and banned words.
 *
 * Every field has a sensible fallback (DEFAULT_BRAND_KIT), so a brand with no
 * profile at all still renders a calm, premium neutral email.
 */
export declare function buildBrandKit(brandProfile?: BrandProfileSource | null, brandVisualProfile?: BrandVisualProfileSource | null, extras?: BuildBrandKitExtras): BrandKit;
/** Indian rupee formatting — ₹ with Indian digit grouping (e.g. ₹1,299). */
export declare function formatINR(amount: number): string;
//# sourceMappingURL=brand-kit.d.ts.map