// ============================================================================
// Email Block Types
// ============================================================================

export interface TextBlock {
  id: string;
  type: "text";
  props: {
    html: string;
    align?: "left" | "center" | "right";
    fontSize?: number;
    color?: string;
    fontFamily?: string;
  };
}

export interface ImageBlock {
  id: string;
  type: "image";
  props: {
    src: string;
    alt?: string;
    width?: number;
    height?: number;
    href?: string;
    align?: "left" | "center" | "right";
  };
}

export interface ButtonBlock {
  id: string;
  type: "button";
  props: {
    text: string;
    href: string;
    bgColor?: string;
    textColor?: string;
    borderRadius?: number;
    align?: "left" | "center" | "right";
    fullWidth?: boolean;
  };
}

export interface DividerBlock {
  id: string;
  type: "divider";
  props: {
    color?: string;
    thickness?: number;
    margin?: number;
  };
}

export interface SpacerBlock {
  id: string;
  type: "spacer";
  props: {
    height: number;
  };
}

export interface ProductBlock {
  id: string;
  type: "product";
  props: {
    productId: string;
    showPrice?: boolean;
    showDescription?: boolean;
    showImage?: boolean;
    buttonText?: string;
    buttonHref?: string;
    /** Resolved product data (populated by AI or at render time) */
    title?: string;
    description?: string;
    imageUrl?: string;
    price?: number;
  };
}

export interface ProductGridBlock {
  id: string;
  type: "product_grid";
  props: {
    productIds: string[];
    columns?: 2 | 3;
    showPrice?: boolean;
    showDescription?: boolean;
  };
}

export interface ColumnsBlock {
  id: string;
  type: "columns";
  props: {
    columns: EmailBlock[][];
    columnWidths?: number[];
  };
}

export interface SocialBlock {
  id: string;
  type: "social";
  props: {
    links: { platform: string; url: string }[];
  };
}

export interface HeaderBlock {
  id: string;
  type: "header";
  props: {
    logoSrc?: string;
    logoAlt?: string;
    bgColor?: string;
    align?: "left" | "center" | "right";
  };
}

export interface FooterBlock {
  id: string;
  type: "footer";
  props: {
    text: string;
    unsubscribeText?: string;
  };
}

export interface HeroBlock {
  id: string;
  type: "hero";
  props: {
    heading: string;
    subtext?: string;
    buttonText?: string;
    buttonHref?: string;
    bgColor?: string;
    bgImageSrc?: string;
    textColor?: string;
    align?: "left" | "center" | "right";
  };
}

export interface IconRowBlock {
  id: string;
  type: "icon_row";
  props: {
    items: { icon: string; label: string; description?: string }[];
  };
}

export interface CountdownBlock {
  id: string;
  type: "countdown";
  props: {
    endDate: string;
    label: string;
    bgColor?: string;
    textColor?: string;
  };
}

export interface TestimonialBlock {
  id: string;
  type: "testimonial";
  props: {
    quote: string;
    author: string;
    rating?: number;
    avatarUrl?: string;
  };
}

/** Union of all email block types */
export type EmailBlock =
  | TextBlock
  | ImageBlock
  | ButtonBlock
  | DividerBlock
  | SpacerBlock
  | ProductBlock
  | ProductGridBlock
  | ColumnsBlock
  | SocialBlock
  | HeaderBlock
  | FooterBlock
  | HeroBlock
  | IconRowBlock
  | CountdownBlock
  | TestimonialBlock;

/** All possible block type strings */
export type EmailBlockType = EmailBlock["type"];

/** A complete email template */
export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  previewText?: string;
  blocks: EmailBlock[];
  metadata: Record<string, string>;
}

/** Product data for rendering product blocks */
export interface ProductData {
  id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  price: number;
  compareAtPrice?: number;
  handle?: string;
  vendor?: string;
}

/** Brand settings for auto header/footer injection */
export interface RenderBrandSettings {
  logoUrl?: string;
  logoPosition?: "left" | "center" | "right";
  headerBgColor?: string;
  storeName?: string;
  address?: string;
  socialLinks?: { platform: string; url: string }[];
  footerText?: string;
  showSocialLinks?: boolean;
  showAddress?: boolean;
}

/** UTM tracking params for link injection */
export interface TrackingParams {
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent?: string;
  storeDomain?: string; // only inject UTM into links matching this domain
}

/** Options for rendering an email template to HTML */
export interface RenderOptions {
  variables: Record<string, string>;
  products?: Record<string, ProductData>;
  previewMode?: boolean;
  inlineCss?: boolean;
  brandSettings?: RenderBrandSettings;
  tracking?: TrackingParams;
}

/** Options for rendering via MJML archetype system (AI-generated campaigns) */
export interface ArchetypeRenderOptions {
  archetypeId: string;
  brandTokens: Record<string, string>;
  contentSlots: Record<string, unknown>;
}

/** Default props factory for each block type */
export function createDefaultBlock(type: EmailBlockType, id: string): EmailBlock {
  switch (type) {
    case "text":
      return { id, type, props: { html: "<p>Enter your text here...</p>" } };
    case "image":
      return { id, type, props: { src: "", alt: "Image" } };
    case "button":
      return { id, type, props: { text: "Click Here", href: "#", bgColor: "#000000", textColor: "#FFFFFF", borderRadius: 4 } };
    case "divider":
      return { id, type, props: { color: "#E5E7EB", thickness: 1, margin: 16 } };
    case "spacer":
      return { id, type, props: { height: 24 } };
    case "product":
      return { id, type, props: { productId: "", showPrice: true, showDescription: true, showImage: true, buttonText: "Shop Now", buttonHref: "#" } };
    case "product_grid":
      return { id, type, props: { productIds: [], columns: 2, showPrice: true, showDescription: false } };
    case "columns":
      return { id, type, props: { columns: [[], []], columnWidths: [50, 50] } };
    case "social":
      return { id, type, props: { links: [] } };
    case "header":
      return { id, type, props: { bgColor: "#FFFFFF" } };
    case "footer":
      return { id, type, props: { text: "You received this email because you subscribed.", unsubscribeText: "Unsubscribe" } };
    case "hero":
      return { id, type, props: { heading: "Welcome", subtext: "Discover something new", buttonText: "Shop Now", buttonHref: "#", bgColor: "#000000", textColor: "#FFFFFF", align: "center" } };
    case "icon_row":
      return { id, type, props: { items: [{ icon: "🚚", label: "Free Shipping" }, { icon: "🔒", label: "Secure Checkout" }, { icon: "↩️", label: "Easy Returns" }] } };
    case "countdown":
      return { id, type, props: { endDate: new Date(Date.now() + 7 * 86400000).toISOString(), label: "Sale ends in", bgColor: "#FF0000", textColor: "#FFFFFF" } };
    case "testimonial":
      return { id, type, props: { quote: "This product changed my life!", author: "Happy Customer", rating: 5 } };
  }
}
