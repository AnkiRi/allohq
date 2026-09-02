import { complete, type AIModelId, type ModelHarnessConfig } from "../ai";
import { brandVoiceBlock } from "./prompt-templates";
import { generateImage } from "../images/generate-image";

export interface GenerateRcsInput {
  brandProfile?: {
    brandName: string;
    brandDescription?: string | null;
    toneAttributes: Record<string, string>;
    vocabulary: Record<string, string[]>;
    visualStyle: Record<string, string | string[]>;
    sampleCopy: string[];
  };
  intent: string;
  segment?: { name: string; description: string };
  programType: string;
  model?: AIModelId;
  modelHarness?: ModelHarnessConfig | unknown;
}

export interface RcsAction {
  type: "open_url" | "dial" | "reply";
  label: string;
  value: string; // URL, phone number, or reply text
}

export interface GenerateRcsOutput {
  name: string;
  body: string;
  cardTitle: string;
  cardImageUrl: string | null;
  actions: RcsAction[];
  variables: string[];
  promptUsed: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  imageCost: number;
}

function buildPrompt(input: GenerateRcsInput): string {
  const sections: string[] = [];

  sections.push(
    `You are an expert RCS (Rich Communication Services) marketing copywriter. Generate a branded, interactive RCS message for a verified Google Business Messages sender.`
  );

  if (input.brandProfile) {
    sections.push(
      brandVoiceBlock({
        brandName: input.brandProfile.brandName,
        toneAttributes: input.brandProfile.toneAttributes,
        vocabulary: input.brandProfile.vocabulary,
        visualStyle: input.brandProfile.visualStyle,
        sampleCopy: input.brandProfile.sampleCopy,
      })
    );
  }

  sections.push(`
PROGRAM TYPE: ${input.programType}
MESSAGE INTENT: ${input.intent}`);

  if (input.segment) {
    sections.push(`
TARGET AUDIENCE:
- Segment: ${input.segment.name}
- Description: ${input.segment.description}
Tailor the message and CTA to this audience.`);
  }

  sections.push(`
RCS MESSAGE RULES:
- Rich card format: title + body text + optional image + action buttons
- Body text: max 500 characters, conversational and engaging
- Card title: short, punchy headline (max 50 chars)
- Include 1-3 suggested action buttons:
  - "open_url": opens a link (use {{link}} as placeholder)
  - "dial": calls a phone number
  - "reply": quick reply text
- Use {{first_name}}, {{brand_name}}, {{discount_code}}, {{product_name}} etc. for dynamic variables
- Tone should feel like a premium app notification — branded, trustworthy, actionable
- No markdown formatting in body text

OUTPUT FORMAT — Return valid JSON only:
{
  "name": "template_name_snake_case",
  "body": "The message body with {{variable}} placeholders",
  "cardTitle": "Short Headline",
  "cardImageUrl": null,
  "actions": [
    { "type": "open_url", "label": "Shop Now", "value": "{{link}}" },
    { "type": "reply", "label": "Tell me more", "value": "MORE_INFO" }
  ],
  "variables": ["first_name", "link", "discount_code"]
}

Return ONLY valid JSON.`);

  return sections.join("\n");
}

/**
 * Generate an RCS rich message template using AI.
 */
export async function generateRcs(
  input: GenerateRcsInput
): Promise<GenerateRcsOutput> {
  const prompt = buildPrompt(input);

  const result = await complete({
    model: input.model,
    task: "generation",
    workload: "creative",
    harness: input.modelHarness,
    prompt,
    temperature: 0.7,
    jsonMode: true,
  });

  const parsed = JSON.parse(result.content) as {
    name: string;
    body: string;
    cardTitle: string;
    cardImageUrl: string | null;
    actions: RcsAction[];
    variables: string[];
  };

  // Generate card image if none was provided by the LLM
  let cardImageUrl = parsed.cardImageUrl ?? null;
  let imageCost = 0;

  if (!cardImageUrl && parsed.cardTitle) {
    try {
      const brandStyle = input.brandProfile
        ? {
            aesthetic: (input.brandProfile.visualStyle["aesthetic"] as string) ?? "modern",
            suggestedColors: (input.brandProfile.visualStyle["suggestedColors"] as string[]) ?? [],
          }
        : undefined;

      const imgResult = await generateImage({
        purpose: "card",
        prompt: `${parsed.cardTitle}. ${input.brandProfile?.brandName ?? "Brand"} marketing card image.`,
        brandStyle,
        fallbackToStock: true,
      });
      cardImageUrl = imgResult.url;
      imageCost = imgResult.cost;
    } catch (err) {
      console.warn(`[generate-rcs] Failed to generate card image:`, (err as Error).message);
    }
  }

  return {
    name: parsed.name,
    body: parsed.body,
    cardTitle: parsed.cardTitle ?? "",
    cardImageUrl,
    actions: parsed.actions ?? [],
    variables: parsed.variables ?? [],
    promptUsed: prompt,
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    imageCost,
  };
}
