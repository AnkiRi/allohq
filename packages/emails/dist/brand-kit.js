"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_BRAND_KIT = void 0;
exports.buildBrandKit = buildBrandKit;
exports.formatINR = formatINR;
// ---------------------------------------------------------------------------
// Defaults — a calm, premium neutral that any brand reads well against.
// Mirrors the taste of the Vana kit without its specific green identity.
// ---------------------------------------------------------------------------
exports.DEFAULT_BRAND_KIT = {
    colors: {
        paper: "#F6F5F2",
        surface: "#FFFFFF",
        accent: "#EDEBE5",
        line: "#E4E1D8",
        primary: "#1A1A17",
        primaryDeep: "#0F0F0D",
        secondary: "#4A4A42",
        ink: "#1A1A17",
        body: "#3B3A33",
        muted: "#6B6A5E",
        onPrimary: "#F6F5F2",
        onPrimaryMuted: "#C9C7BD",
    },
    fonts: {
        serif: "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, 'Times New Roman', serif",
        sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    },
    logo: {
        wordmark: "Allo",
        alt: "Allo",
    },
    voice: {
        brandName: "Allo",
        bannedWords: [],
    },
    footer: {},
    radius: { card: 14, button: 10 },
    contentWidth: 600,
};
// ---------------------------------------------------------------------------
// Color helpers — derive a tasteful palette from whatever brand colors exist.
// ---------------------------------------------------------------------------
function isHex(c) {
    return typeof c === "string" && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c.trim());
}
function normalizeHex(hex) {
    let h = hex.trim().replace(/^#/, "");
    if (h.length === 3)
        h = h.split("").map((c) => c + c).join("");
    return `#${h.toLowerCase()}`;
}
function hexToRgb(hex) {
    const h = normalizeHex(hex).slice(1);
    return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
    };
}
function rgbToHex(r, g, b) {
    const to = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
    return `#${to(r)}${to(g)}${to(b)}`;
}
/** Relative luminance (WCAG). */
function luminance(hex) {
    const { r, g, b } = hexToRgb(hex);
    const a = [r, g, b].map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}
/** Darken (amount < 0) or lighten (amount > 0) toward black/white. */
function shade(hex, amount) {
    const { r, g, b } = hexToRgb(hex);
    const target = amount < 0 ? 0 : 255;
    const t = Math.abs(amount);
    return rgbToHex(r + (target - r) * t, g + (target - g) * t, b + (target - b) * t);
}
/** Mix a color toward another by ratio (0..1). */
function mix(hex, toward, ratio) {
    const a = hexToRgb(hex);
    const b = hexToRgb(toward);
    return rgbToHex(a.r + (b.r - a.r) * ratio, a.g + (b.g - a.g) * ratio, a.b + (b.b - a.b) * ratio);
}
/** Pick readable text (ink or paper-tone) for a given background. */
function readableOn(bg, light, dark) {
    return luminance(bg) > 0.45 ? dark : light;
}
function firstHex(...candidates) {
    for (const c of candidates) {
        if (Array.isArray(c)) {
            const found = c.find(isHex);
            if (found)
                return normalizeHex(found);
        }
        else if (isHex(c)) {
            return normalizeHex(c);
        }
    }
    return undefined;
}
/** Web-safe font keywords mapped to full email-safe stacks. */
function fontStack(name, kind) {
    if (!name)
        return undefined;
    const n = name.toLowerCase();
    const generic = n.includes("serif") && !n.includes("sans");
    // Prepend the named font onto a safe fallback stack of the right family.
    const fallback = kind === "serif" || generic
        ? exports.DEFAULT_BRAND_KIT.fonts.serif
        : exports.DEFAULT_BRAND_KIT.fonts.sans;
    // If the named font is itself a generic keyword, just use the stack.
    if (["serif", "sans-serif", "sans", "system-ui", "inherit"].includes(n)) {
        return fallback;
    }
    const quoted = name.includes(" ") ? `'${name}'` : name;
    return `${quoted}, ${fallback}`;
}
function bannedWordsFrom(vocabulary) {
    if (!vocabulary)
        return [];
    const raw = vocabulary["bannedWords"] ?? vocabulary["banned"] ?? vocabulary["avoid"];
    if (Array.isArray(raw))
        return raw.filter((w) => typeof w === "string");
    return [];
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
function buildBrandKit(brandProfile, brandVisualProfile, extras) {
    const d = exports.DEFAULT_BRAND_KIT;
    const vp = brandVisualProfile ?? undefined;
    const bp = brandProfile ?? undefined;
    // --- Colors -------------------------------------------------------------
    const visualStyleColors = bp?.visualStyle
        ? (bp.visualStyle["suggestedColors"] ?? bp.visualStyle["colors"] ?? bp.visualStyle["palette"])
        : undefined;
    const primary = firstHex(vp?.primaryColors, visualStyleColors) ?? d.colors.primary;
    const secondaryRaw = firstHex(vp?.accentColors) ?? mix(primary, "#000000", 0.18);
    // Keep the secondary readable as a link color on light surfaces.
    const secondary = luminance(secondaryRaw) > 0.55 ? shade(secondaryRaw, -0.35) : secondaryRaw;
    const primaryDeep = shade(primary, -0.28);
    // Accent/paper are warm-neutral, lightly tinted by the brand so cards feel
    // on-brand without competing with the primary color.
    const accent = mix(d.colors.accent, primary, 0.06);
    const paper = mix(d.colors.paper, primary, 0.03);
    const line = mix(d.colors.line, primary, 0.08);
    const colors = {
        paper,
        surface: d.colors.surface,
        accent,
        line,
        primary,
        primaryDeep,
        secondary,
        ink: d.colors.ink,
        body: d.colors.body,
        muted: d.colors.muted,
        onPrimary: readableOn(primary, d.colors.onPrimary, d.colors.ink),
        onPrimaryMuted: readableOn(primary, d.colors.onPrimaryMuted, d.colors.muted),
    };
    // --- Fonts --------------------------------------------------------------
    const fonts = {
        serif: fontStack(vp?.fontFamily, "serif") ?? d.fonts.serif,
        sans: fontStack(vp?.bodyFontFamily, "sans") ?? d.fonts.sans,
    };
    // --- Voice / name -------------------------------------------------------
    const brandName = bp?.brandName || extras?.storeName || d.voice.brandName;
    const tagline = (bp?.brandDescription && bp.brandDescription.length <= 120
        ? bp.brandDescription
        : undefined) ?? undefined;
    // --- Logo ---------------------------------------------------------------
    const logoSrc = extras?.logoUrl ??
        vp?.logoUrl ??
        (vp?.logoVariants && typeof vp.logoVariants["light"] === "string"
            ? vp.logoVariants["light"]
            : undefined) ??
        undefined;
    const logo = {
        src: logoSrc ?? undefined,
        wordmark: brandName,
        alt: brandName,
    };
    // --- Footer -------------------------------------------------------------
    const footer = {
        address: extras?.address ?? undefined,
        customText: bp?.footerText ?? undefined,
        socialLinks: extras?.socialLinks,
        preferencesUrl: extras?.preferencesUrl,
        unsubscribeUrl: extras?.unsubscribeUrl,
    };
    return {
        colors,
        fonts,
        logo,
        voice: {
            brandName,
            tagline,
            bannedWords: bannedWordsFrom(bp?.vocabulary),
        },
        footer,
        url: extras?.storeUrl ?? undefined,
        radius: d.radius,
        contentWidth: d.contentWidth,
    };
}
/** Indian rupee formatting — ₹ with Indian digit grouping (e.g. ₹1,299). */
function formatINR(amount) {
    return `₹${new Intl.NumberFormat("en-IN", {
        maximumFractionDigits: 0,
    }).format(amount)}`;
}
//# sourceMappingURL=brand-kit.js.map