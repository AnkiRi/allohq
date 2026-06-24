/**
 * Vana Naturals — seed content for the /emails generate-first editor.
 *
 * This is a real, on-brand "generated" email expressed in the portable
 * EmailBlock[] content model. It is what allo would have written: a calm,
 * no-discount win-back for a lapsed Ayurveda/wellness customer. Everything
 * here round-trips through @allohq/emails → bulletproof, cross-client HTML,
 * so the human can edit any block to the pixel and the output stays safe.
 *
 * No snowboard test content. Voice: warm, unhurried, plant-powered.
 */

import type { EmailBlock } from "@allohq/email-builder";
import {
  buildBrandKit,
  type BrandKit,
  type BrandProfileSource,
  type BrandVisualProfileSource,
  type BuildBrandKitExtras,
} from "@allohq/emails";

// ---------------------------------------------------------------------------
// Vana brand kit — derived through the SAME buildBrandKit() path every
// generated email uses, so the editor preview matches production rendering.
// ---------------------------------------------------------------------------

const VANA_BRAND_PROFILE: BrandProfileSource = {
  brandName: "Vana Naturals",
  brandDescription: "Plant-powered, the patient way",
  vocabulary: { bannedWords: ["SALE", "BUY NOW", "limited time", "hurry"] },
  footerText:
    "You are receiving this because you once trusted us with your evenings.",
};

const VANA_VISUAL_PROFILE: BrandVisualProfileSource = {
  primaryColors: ["#1F5E3D"],
  accentColors: ["#2E7D5B"],
  fontFamily:
    "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, 'Times New Roman', serif",
  bodyFontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
};

const VANA_EXTRAS: BuildBrandKitExtras = {
  storeName: "Vana Naturals",
  storeUrl: "https://vananaturals.in",
  address: "Vana Naturals, 14 Banyan Lane, Bengaluru, KA 560001, India",
  socialLinks: [
    { platform: "Instagram", url: "https://instagram.com/vananaturals" },
    { platform: "Journal", url: "https://vananaturals.in/journal" },
  ],
  preferencesUrl: "https://vananaturals.in/account/preferences",
  unsubscribeUrl: "https://vananaturals.in/unsubscribe",
};

export function buildVanaBrandKit(): BrandKit {
  return buildBrandKit(VANA_BRAND_PROFILE, VANA_VISUAL_PROFILE, VANA_EXTRAS);
}

// ---------------------------------------------------------------------------
// The generated email — EmailBlock[] content model.
// ---------------------------------------------------------------------------

export const VANA_SEED_SUBJECT = "We saved your spot, {{first_name}}";
export const VANA_SEED_PREVIEW =
  "A quiet hello: your evenings, remembered. No rush.";

export const VANA_SEED_BLOCKS: EmailBlock[] = [
  {
    id: "hero",
    type: "hero",
    props: {
      heading: "We saved your spot, {{first_name}}.",
      subtext:
        "It has been a little while. No rush, no pressure, just a gentle note to say the door is still open whenever you are ready.",
      align: "left",
    },
  },
  {
    id: "intro",
    type: "text",
    props: {
      html:
        "The last time we packed a parcel for you was back in {{last_order_month}}, and we have thought of you since.\n\nYou came to us for Ashwagandha Calm, the one so many people reach for when the evenings feel a little too loud. We still make it the same slow way: roots sun-dried, milled in small batches, nothing added that does not belong.",
      align: "left",
    },
  },
  {
    id: "product",
    type: "product",
    props: {
      productId: "ashwagandha-calm",
      source: "manual",
      title: "Ashwagandha Calm",
      description:
        "A grounding evening ritual. KSM-66 root, slow-milled, nothing else.",
      imageUrl: "https://picsum.photos/seed/vana-ashwagandha-amber-jar/280/280",
      price: 899,
      showPrice: true,
      showImage: true,
      showDescription: true,
      buttonText: "Bring it back",
      buttonHref: "https://vananaturals.in/account/reorder",
    },
  },
  {
    id: "reasons",
    type: "icon_row",
    props: {
      items: [
        {
          icon: "🌿",
          label: "Small batches",
          description: "Milled fresh, never warehoused for months.",
        },
        {
          icon: "🧪",
          label: "Third-party tested",
          description: "Every batch checked for purity and potency.",
        },
        {
          icon: "📦",
          label: "Carbon-neutral post",
          description: "Plastic-free parcels, sent the gentle way.",
        },
      ],
    },
  },
  {
    id: "testimonial",
    type: "testimonial",
    props: {
      quote:
        "I stopped reaching for my phone at midnight. That alone was worth coming back for.",
      author: "Aanya R., Bengaluru",
      rating: 5,
    },
  },
  {
    id: "cta",
    type: "button",
    props: {
      text: "Reorder Ashwagandha Calm",
      href: "https://vananaturals.in/account/reorder",
      align: "left",
    },
  },
  {
    id: "signoff",
    type: "text",
    props: {
      html:
        "Whenever feels right. We will keep the kettle on.\n\nThe Vana team",
      align: "left",
    },
  },
];
