import { complete, type AIModelId, type ModelHarnessConfig } from "../ai";
import { brandVoiceBlock } from "./prompt-templates";

export interface GenerateWhatsAppInput {
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

export interface GenerateWhatsAppOutput {
  name: string;
  body: string;
  variables: string[];
  promptUsed: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

function buildPrompt(input: GenerateWhatsAppInput): string {
  const sections: string[] = [];

  sections.push(
    `You are an expert WhatsApp Business marketing copywriter. Generate a WhatsApp message template.`
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
Tailor the tone and offer to this audience.`);
  }

  sections.push(`
WHATSAPP TEMPLATE RULES:
- Maximum 1024 characters for the body
- Use {{1}}, {{2}}, etc. for dynamic variables (customer name, discount code, product name, etc.)
- Conversational, friendly tone appropriate for WhatsApp
- Include a clear call-to-action
- No HTML or markdown formatting
- Use line breaks for readability
- Can include 1-2 relevant emojis but don't overdo it

OUTPUT FORMAT — Return valid JSON only:
{
  "name": "template_name_snake_case",
  "body": "The message body with {{1}} variables",
  "variables": ["first_name", "discount_code"]
}

Return ONLY valid JSON.`);

  return sections.join("\n");
}

/**
 * Generate a WhatsApp Business message template using AI.
 */
export async function generateWhatsApp(
  input: GenerateWhatsAppInput
): Promise<GenerateWhatsAppOutput> {
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
