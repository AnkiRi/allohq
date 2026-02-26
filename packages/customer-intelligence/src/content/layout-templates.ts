/**
 * Layout skeletons for email generation.
 * Each defines a block-type sequence the AI must follow when selected.
 */

export interface LayoutTemplate {
  id: string;
  name: string;
  description: string;
  intentHint: string; // best for which intent
  blockTypes: string[];
}

export const LAYOUT_TEMPLATES: LayoutTemplate[] = [
  {
    id: "minimal",
    name: "Minimal",
    description: "Clean, copy-focused layout with a single CTA",
    intentHint: "welcome, transactional",
    blockTypes: ["header", "text", "button", "footer"],
  },
  {
    id: "hero_focus",
    name: "Hero Focus",
    description: "Bold hero image with supporting text and CTA",
    intentHint: "promotion, seasonal",
    blockTypes: ["header", "hero", "text", "button", "footer"],
  },
  {
    id: "product_grid",
    name: "Product Grid",
    description: "Showcase multiple products in a grid layout",
    intentHint: "promotion, browse_abandonment",
    blockTypes: ["header", "text", "product_grid", "button", "footer"],
  },
  {
    id: "story",
    name: "Story",
    description: "Narrative-driven layout with images woven through text",
    intentHint: "post_purchase, re_engagement",
    blockTypes: ["header", "hero", "text", "image", "text", "button", "footer"],
  },
  {
    id: "social_proof",
    name: "Social Proof",
    description: "Testimonial-led layout with product showcase",
    intentHint: "win_back, re_engagement",
    blockTypes: ["header", "hero", "testimonial", "product", "icon_row", "button", "footer"],
  },
  {
    id: "countdown",
    name: "Countdown",
    description: "Urgency-driven layout with timer and product grid",
    intentHint: "promotion, seasonal",
    blockTypes: ["header", "hero", "countdown", "product_grid", "button", "footer"],
  },
  {
    id: "vip",
    name: "VIP",
    description: "Premium feel for loyal and high-value customers",
    intentHint: "vip_reward, post_purchase",
    blockTypes: ["header", "text", "product", "product", "text", "button", "footer"],
  },
  {
    id: "visual",
    name: "Visual",
    description: "Image-heavy layout for visual-first brands",
    intentHint: "promotion, seasonal",
    blockTypes: ["header", "hero", "image", "icon_row", "product_grid", "testimonial", "button", "footer"],
  },
];

export function getLayoutById(id: string): LayoutTemplate | undefined {
  return LAYOUT_TEMPLATES.find((l) => l.id === id);
}
