import { complete, type AIModelId } from "../ai";
import { brandVoiceBlock } from "./prompt-templates";

export interface GenerateSmsInput {
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
}

export interface GenerateSmsOutput {
  name: string;
  body: string;
  variables: string[];
  promptUsed: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

function buildPrompt(input: GenerateSmsInput): string {
  const sections: string[] = [];

  sections.push(
    `You are an expert SMS marketing copywriter for e-commerce brands. Generate a concise, high-converting SMS message.`
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
Tailor the message to this audience.`);
  }

  sections.push(`
SMS RULES:
- Maximum 160 characters (single SMS segment) — stay under this limit
- Use {{first_name}}, {{discount_code}}, {{brand_name}} etc. for dynamic variables
- Direct, punchy tone — every word counts
- Include a clear call-to-action with a short link placeholder like {{link}}
- No emojis unless critical to the brand voice
- Must include opt-out: "Reply STOP to unsubscribe"
- The opt-out text counts toward the character limit

OUTPUT FORMAT — Return valid JSON only:
{
  "name": "template_name_snake_case",
  "body": "The SMS body with {{variable}} placeholders",
  "variables": ["first_name", "link"]
}

Return ONLY valid JSON.`);

  return sections.join("\n");
}

/**
 * Generate an SMS marketing message template using AI.
 */
export async function generateSms(
  input: GenerateSmsInput
): Promise<GenerateSmsOutput> {
  const prompt = buildPrompt(input);

  const result = await complete({
    model: input.model,
    prompt,
    temperature: 0.7,
    jsonMode: true,
  });

  const parsed = JSON.parse(result.content) as {
    name: string;
    body: string;
    variables: string[];
  };

  return {
    name: parsed.name,
    body: parsed.body,
    variables: parsed.variables ?? [],
    promptUsed: prompt,
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}
