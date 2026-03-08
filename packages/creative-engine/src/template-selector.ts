import type { TemplateArchetypeId, BrandAesthetic } from "./types";
import { CAMPAIGN_ARCHETYPE_MAP } from "./types";

/** Aesthetic → archetype affinity weights (higher = better fit) */
const AESTHETIC_WEIGHTS: Partial<Record<BrandAesthetic, Partial<Record<TemplateArchetypeId, number>>>> = {
  clean_minimal: { "minimalist-note": 2, "product-spotlight": 1.5, "hero-story": 1 },
  bold_graphic: { "urgency-sale": 2, "hero-story": 1.5, "product-grid": 1.5 },
  luxury_editorial: { "editorial": 2, "hero-story": 1.5, "product-spotlight": 1.5, "minimalist-note": 1 },
  warm_organic: { "minimalist-note": 1.5, "hero-story": 1, "social-proof": 1.5, "visual-journey": 1.5 },
  playful_colorful: { "celebration-milestone": 2, "product-grid": 1.5, "hero-story": 1.5, "urgency-sale": 1 },
  tech_modern: { "product-spotlight": 2, "comparison": 1.5, "product-grid": 1.5, "hero-story": 1 },
  heritage_artisanal: { "editorial": 2, "social-proof": 1.5, "hero-story": 1, "minimalist-note": 1 },
  premium_dtc: { "hero-story": 1.5, "product-spotlight": 1.5, "product-grid": 1, "celebration-milestone": 1 },
};

/** Customer segment → archetype affinity */
const SEGMENT_WEIGHTS: Partial<Record<string, Partial<Record<TemplateArchetypeId, number>>>> = {
  champion: { "celebration-milestone": 2, "product-spotlight": 1.5, "editorial": 1 },
  loyal: { "product-grid": 1.5, "product-spotlight": 1, "hero-story": 1 },
  at_risk: { "minimalist-note": 2, "urgency-sale": 1.5, "restock-replenish": 1 },
  lost: { "minimalist-note": 2, "urgency-sale": 1, "hero-story": 1 },
  new: { "welcome": 2, "hero-story": 1.5, "visual-journey": 1 },
  first_buyer: { "thank-you": 1.5, "product-grid": 1.5, "social-proof": 1 },
};

/**
 * Select the best template archetype for a campaign.
 * Combines campaign type → archetype mapping with aesthetic and segment affinity weights.
 */
export function selectTemplate(
  campaignType: string,
  customerSegment?: string,
  brandAesthetic?: BrandAesthetic,
): TemplateArchetypeId {
  // Get candidate archetypes from campaign type
  const candidates = CAMPAIGN_ARCHETYPE_MAP[campaignType] ?? CAMPAIGN_ARCHETYPE_MAP["newsletter"]!;

  if (candidates.length === 1) {
    return candidates[0]!;
  }

  // Score each candidate
  const scores: { id: TemplateArchetypeId; score: number }[] = candidates.map((id, index) => {
    let score = candidates.length - index; // Base score from position in candidate list

    // Apply aesthetic weight
    if (brandAesthetic) {
      const aestheticBonus = AESTHETIC_WEIGHTS[brandAesthetic]?.[id] ?? 0;
      score += aestheticBonus;
    }

    // Apply segment weight
    if (customerSegment) {
      const segmentBonus = SEGMENT_WEIGHTS[customerSegment.toLowerCase()]?.[id] ?? 0;
      score += segmentBonus;
    }

    return { id, score };
  });

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);

  return scores[0]!.id;
}

/**
 * Get template recommendations for a campaign type with scores.
 */
export function getTemplateRecommendations(
  campaignType: string,
  customerSegment?: string,
  brandAesthetic?: BrandAesthetic,
): { id: TemplateArchetypeId; score: number }[] {
  const candidates = CAMPAIGN_ARCHETYPE_MAP[campaignType] ?? CAMPAIGN_ARCHETYPE_MAP["newsletter"]!;

  return candidates.map((id, index) => {
    let score = candidates.length - index;
    if (brandAesthetic) score += AESTHETIC_WEIGHTS[brandAesthetic]?.[id] ?? 0;
    if (customerSegment) score += SEGMENT_WEIGHTS[customerSegment.toLowerCase()]?.[id] ?? 0;
    return { id, score };
  }).sort((a, b) => b.score - a.score);
}
