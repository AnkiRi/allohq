import type { EmailIntent } from "../context/intent-mapper";

/** Brand voice injection block for prompts */
export function brandVoiceBlock(brand: {
  brandName: string;
  toneAttributes: Record<string, string>;
  vocabulary: Record<string, string[]>;
  visualStyle?: Record<string, string | string[]>;
  sampleCopy: string[];
}): string {
  const colorSection = brand.visualStyle
    ? (() => {
        const colors = brand.visualStyle["suggestedColors"];
        const colorList = Array.isArray(colors) ? colors : [];
        const primary = colorList[0] ?? "#000000";
        const secondary = colorList[1] ?? "#333333";
        const accent = colorList[2] ?? "#666666";
        return `
- Brand Colors: primary=${primary}, secondary=${secondary}, accent=${accent}
  Use these brand colors for buttons, hero backgrounds, and headings. Use the primary color for main CTAs.`;
      })()
    : "";

  return `
BRAND VOICE:
- Brand: ${brand.brandName}
- Tone: ${Object.entries(brand.toneAttributes).map(([k, v]) => `${k}: ${v}`).join(", ")}
- Preferred vocabulary: ${(brand.vocabulary["preferredWords"] ?? []).join(", ")}
- CTA patterns: ${(brand.vocabulary["ctaPatterns"] ?? []).join(", ")}${colorSection}
- Sample copy from the brand:
${brand.sampleCopy.slice(0, 3).map((s, i) => `  ${i + 1}. "${s.slice(0, 200)}"`).join("\n")}

Write all email copy matching this brand voice exactly. Use the same tone, energy level, and vocabulary patterns.
Use the hero block for dramatic openers, icon_row for trust signals (free shipping, support, etc.), and testimonial blocks for social proof.`;
}

/** Intent-specific prompt instructions */
export function intentInstructions(intent: EmailIntent): string {
  const instructions: Record<EmailIntent, string> = {
    welcome: `
PURPOSE: Welcome a new subscriber/customer.
STRUCTURE:
- Warm greeting introducing the brand
- What makes the brand special (brand story)
- Featured products (best-sellers or new arrivals)
- A clear CTA to start shopping
- Optional: welcome discount offer
TONE: Friendly, warm, inviting. Make the customer feel valued.`,

    cart_recovery: `
PURPOSE: Recover an abandoned cart.
STRUCTURE:
- Reminder about items left behind
- Product highlights with images
- Create urgency (limited stock, price guarantee)
- Clear CTA to complete purchase
- Optional: small discount incentive
TONE: Helpful, not pushy. Focus on the value of the product.`,

    post_purchase: `
PURPOSE: Thank and engage after a purchase.
STRUCTURE:
- Thank you message
- Order summary/what to expect
- Related product recommendations (cross-sell)
- Invite to join community/follow on social
- CTA to explore more products
TONE: Grateful, excited for them. Build anticipation.`,

    win_back: `
PURPOSE: Re-engage a lapsed customer.
STRUCTURE:
- "We miss you" or "It's been a while" opening
- What's new since they last visited
- Personalized product recommendations
- Strong incentive (discount or free shipping)
- Urgent CTA
TONE: Warm but with urgency. Show what they're missing.`,

    seasonal: `
PURPOSE: Seasonal/festivity-themed campaign.
STRUCTURE:
- Festive greeting tied to the occasion
- Curated seasonal product collection
- Special seasonal offer
- Gift guide or themed recommendations
- Festive CTA
TONE: Celebratory, festive, match the occasion's energy.`,

    promotion: `
PURPOSE: Drive sales with a limited-time promotion.
STRUCTURE:
- Bold headline with the offer
- Discount details (code, percentage, dates)
- Best-selling or featured products
- Urgency elements (countdown, limited stock)
- Strong CTA
TONE: Exciting, urgent, high-energy. Make the deal feel unmissable.`,

    re_engagement: `
PURPOSE: Re-engage customers who haven't interacted recently.
STRUCTURE:
- Personal reconnection message
- New products or improvements since their last visit
- Personalized recommendations
- Soft incentive
- Easy CTA to browse
TONE: Friendly, curious. Don't be aggressive.`,

    browse_abandonment: `
PURPOSE: Follow up on browsing activity without purchase.
STRUCTURE:
- "Still thinking about it?" opening
- Products they viewed
- Social proof (reviews, popularity)
- Optional small incentive
- CTA to view products
TONE: Helpful, suggestive, not creepy.`,

    vip_reward: `
PURPOSE: Reward top customers and make them feel special.
STRUCTURE:
- Exclusive VIP greeting
- Special offer or early access
- Premium product recommendations
- Loyalty reward or points
- VIP-only CTA
TONE: Exclusive, appreciative, luxurious. Make them feel elite.`,
  };

  return instructions[intent];
}

/** Product formatting for prompts */
export function formatProductsForPrompt(
  products: { id: string; title: string; description?: string; price: number; imageUrl?: string; handle?: string }[],
  storeUrl?: string
): string {
  if (products.length === 0) return "No products available.";

  return products
    .map((p, i) => {
      const parts = [`${i + 1}. [ID: ${p.id}] "${p.title}" — $${p.price.toFixed(2)}`];
      if (p.imageUrl) parts.push(`   Image: ${p.imageUrl}`);
      if (p.handle && storeUrl) parts.push(`   URL: ${storeUrl}/products/${p.handle}`);
      if (p.description) parts.push(`   ${p.description.slice(0, 150)}`);
      return parts.join("\n");
    })
    .join("\n");
}
