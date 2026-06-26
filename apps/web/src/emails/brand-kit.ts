/**
 * Vana Naturals — Brand Kit
 *
 * The single source of truth for the brand's email identity. Both the
 * win-back and replenishment emails are driven entirely by these tokens
 * via the shared <VanaLayout> primitive, so any future generated email
 * inherits the same calm, plant-powered look without redefining it.
 *
 * Voice: warm, knowledgeable, unhurried, plant-powered — never hypey.
 * No neon, no "SALE", no emoji-stuffing. Restraint is the brand.
 */

export const vana = {
  name: "Vana Naturals",
  // A text wordmark is the logo. Lowercase tail keeps it soft and modern.
  wordmark: "Vana",
  tagline: "Plant-powered, the patient way",
  url: "https://vananaturals.in",

  /**
   * Palette — committed botanical green on warm paper.
   * Greens are the identity; the paper bg only carries warmth so the
   * brand never reads as generic beige+brass.
   * Every text/bg pairing here clears WCAG AA (4.5:1 for body).
   */
  color: {
    // Surfaces
    paper: "#F7F4EC", // warm off-white page background
    surface: "#FFFFFF", // card / content surface (sits on paper)
    sand: "#EDE6D6", // soft sand accent fill (dividers, chips, tip blocks)
    sandLine: "#E2D9C4", // hairline borders that survive Gmail/Apple dark

    // Brand greens
    primary: "#1F5E3D", // deep botanical green — wordmark, CTAs, headings
    primaryDeep: "#16482F", // pressed / deepest green for gradients & footer
    moss: "#2E7D5B", // lighter green for secondary accents & links

    // Ink
    ink: "#1A1A17", // near-black warm ink — headings on light
    body: "#3B3A33", // body copy — 4.5:1+ on paper and surface
    muted: "#6B6A5E", // captions / meta — used only at >=12px on light

    // On dark surfaces (footer, CTA)
    onDark: "#F7F4EC", // paper-toned text on green (never pure white logo)
    onDarkMuted: "#C9D8CF", // muted mint for secondary text on green
  },

  /**
   * Type — humanist serif display for headings, clean sans for body.
   * Email-safe stacks: Georgia (serif, ~universal) for the editorial
   * heading voice; system humanist sans for body readability.
   */
  font: {
    serif:
      "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, 'Times New Roman', serif",
    sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  },

  /** Spacing rhythm (px) — generous, unhurried. */
  space: {
    page: 28,
    section: 32,
    gap: 16,
  },

  radius: {
    card: 14,
    button: 10,
    chip: 999,
  },

  contentWidth: 600,
} as const;

/** Indian rupee formatting — ₹ with Indian digit grouping (e.g. ₹1,299). */
export function formatINR(amount: number): string {
  return `₹${new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(amount)}`;
}

export type VanaBrand = typeof vana;
