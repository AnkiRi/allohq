import { generateEmail } from "../content/generate-email";
import type { AIModelId } from "../ai";
import type { EmailIntent } from "../context/intent-mapper";
import type { GenerateEmailOutput } from "../content/generate-email";

export interface ActivateProgramInput {
  programType: string;
  storeId: string;
  storeUrl?: string;
  model?: AIModelId;
  brandProfile?: {
    brandName: string;
    brandDescription?: string | null;
    toneAttributes: Record<string, string>;
    vocabulary: Record<string, string[]>;
    visualStyle: Record<string, string>;
    sampleCopy: string[];
  };
  segment?: { name: string; description: string };
  products: {
    id: string;
    title: string;
    description?: string;
    imageUrl?: string;
    price: number;
    handle?: string;
  }[];
}

/** Maps program types to the email intents and subjects for each email in the series */
const PROGRAM_EMAIL_SPECS: Record<string, { intent: EmailIntent; subjectHint: string }[]> = {
  welcome_series: [
    { intent: "welcome", subjectHint: "Brand introduction and welcome" },
    { intent: "welcome", subjectHint: "Our story and what makes us special" },
    { intent: "promotion", subjectHint: "First purchase incentive" },
  ],
  abandoned_cart: [
    { intent: "cart_recovery", subjectHint: "You left something behind" },
    { intent: "cart_recovery", subjectHint: "Last chance to grab your items" },
  ],
  post_purchase: [
    { intent: "post_purchase", subjectHint: "Thank you for your order" },
    { intent: "post_purchase", subjectHint: "Products you might love" },
  ],
  win_back: [
    { intent: "win_back", subjectHint: "We miss you" },
    { intent: "win_back", subjectHint: "Here's what you've been missing" },
  ],
  browse_abandonment: [
    { intent: "browse_abandonment", subjectHint: "Still thinking about it?" },
  ],
  vip_reward: [
    { intent: "vip_reward", subjectHint: "Exclusive VIP reward" },
  ],
  re_engagement: [
    { intent: "re_engagement", subjectHint: "It's been a while" },
    { intent: "re_engagement", subjectHint: "See what's new" },
  ],
  seasonal: [
    { intent: "seasonal", subjectHint: "Seasonal collection" },
  ],
};

/**
 * Generate all email templates for a program.
 */
export async function activateProgram(
  input: ActivateProgramInput
): Promise<GenerateEmailOutput[]> {
  const specs = PROGRAM_EMAIL_SPECS[input.programType] ?? [
    { intent: "promotion" as const, subjectHint: "Special offer" },
  ];

  const results: GenerateEmailOutput[] = [];

  for (const spec of specs) {
    const result = await generateEmail({
      brandProfile: input.brandProfile,
      intent: spec.intent,
      segment: input.segment,
      products: input.products,
      storeUrl: input.storeUrl,
      tweaks: `Email theme: ${spec.subjectHint}`,
      model: input.model,
    });
    results.push(result);
  }

  return results;
}
