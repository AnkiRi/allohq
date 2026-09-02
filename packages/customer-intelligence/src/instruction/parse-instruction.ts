import { complete, type AIModelId } from "../ai";
import type { ModelHarnessConfig } from "../ai/model-harness";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InstructionIntent =
  | "create_automation"
  | "create_campaign"
  | "create_template"
  | "create_segment"
  | "analyze_customers"
  | "modify_existing";

export interface ParsedInstruction {
  intent: InstructionIntent;
  params: {
    segmentCriteria?: {
      conditions: Array<{ field: string; op: string; value: string | number }>;
      operator: "AND" | "OR";
    };
    automationType?: string;
    channels?: ("email" | "sms" | "whatsapp" | "rcs")[];
    campaignName?: string;
    targetSegment?: string;
    audienceLimit?: number;
    audienceSort?: "totalSpent" | "orderCount" | "predictedLtv" | "recent";
    scheduledAt?: string;
    templateType?: "email" | "sms" | "whatsapp" | "rcs";
    discount?: { type: string; value: number; code: string };
    theme?: string;
    tone?: string;
  };
  reasoning: string;
}

const INSTRUCTION_INTENTS = new Set<InstructionIntent>([
  "create_automation",
  "create_campaign",
  "create_template",
  "create_segment",
  "analyze_customers",
  "modify_existing",
]);

/**
 * Preserve concrete constraints from the merchant's words even when the model
 * omits them. The model still owns intent/semantic interpretation; this layer
 * only recovers unambiguous numbers and explicitly named channels.
 */
export function applyDeterministicInstructionConstraints(
  instruction: string,
  candidate: ParsedInstruction,
): ParsedInstruction {
  if (
    !candidate ||
    !INSTRUCTION_INTENTS.has(candidate.intent) ||
    typeof candidate.params !== "object" ||
    candidate.params === null
  ) {
    throw new Error("The instruction model returned an invalid action.");
  }

  const params: ParsedInstruction["params"] = { ...candidate.params };
  const topCustomerMatch =
    instruction.match(
      /\btop\s+(\d{1,4})\s+(?:(?:most\s+)?(?:valuable|highest[- ]value|frequent|recent)\s+)?customers?\b/i,
    ) ??
    instruction.match(
      /\b(\d{1,4})\s+(?:most\s+)?(?:valuable|highest[- ]value|frequent|recent)\s+customers?\b/i,
    );

  if (topCustomerMatch?.[1]) {
    params.audienceLimit = Number(topCustomerMatch[1]);
    if (/\b(?:frequent|frequency|most orders?)\b/i.test(instruction)) {
      params.audienceSort = "orderCount";
    } else if (/\b(?:predicted|lifetime value|ltv)\b/i.test(instruction)) {
      params.audienceSort = "predictedLtv";
    } else if (/\b(?:recent|latest)\b/i.test(instruction)) {
      params.audienceSort = "recent";
    } else {
      params.audienceSort = "totalSpent";
    }
  }

  const percentMatch = instruction.match(/\b(\d{1,3}(?:\.\d+)?)\s*%/);
  if (
    percentMatch?.[1] &&
    /\b(?:discount|offer|coupon|promo(?:tion)?|off)\b/i.test(instruction)
  ) {
    const codeMatch = instruction.match(/\bcode\s+([a-z0-9-]{3,32})\b/i);
    params.discount = {
      type: "percentage",
      value: Number(percentMatch[1]),
      code: candidate.params.discount?.code || codeMatch?.[1] || "",
    };
  }

  const explicitChannels: NonNullable<ParsedInstruction["params"]["channels"]> = [];
  if (/\be-?mail\b/i.test(instruction)) explicitChannels.push("email");
  if (/\bsms\b|\btext message\b/i.test(instruction)) explicitChannels.push("sms");
  if (/\bwhats\s*app\b/i.test(instruction)) explicitChannels.push("whatsapp");
  if (/\brcs\b/i.test(instruction)) explicitChannels.push("rcs");
  if (explicitChannels.length > 0) params.channels = explicitChannels;

  return {
    ...candidate,
    params,
    reasoning:
      typeof candidate.reasoning === "string" ? candidate.reasoning : "",
  };
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function buildParsePrompt(
  instruction: string,
  context: {
    page: string;
    existingSegments: string[];
    existingAutomations: string[];
  },
): string {
  return `You are AlloHQ's instruction parser. Parse the user's natural language instruction into a structured action.

CURRENT PAGE CONTEXT: ${context.page}

EXISTING SEGMENTS: ${context.existingSegments.length > 0 ? context.existingSegments.join(", ") : "none"}
EXISTING AUTOMATIONS: ${context.existingAutomations.length > 0 ? context.existingAutomations.join(", ") : "none"}

USER INSTRUCTION: "${instruction}"

Determine the intent and extract parameters. Intents:
- "create_automation": User wants to create an automation flow (welcome series, abandoned cart, win-back, etc.)
- "create_campaign": User wants to send a one-time campaign/blast to a segment
- "create_template": User wants to design a single email/SMS/WhatsApp/RCS template
- "create_segment": User wants to find/group customers by criteria (spending, behavior, recency)
- "analyze_customers": User wants insights about customers without creating anything
- "modify_existing": User wants to change an existing automation or campaign

For segment criteria, map natural language to fields:
- "spent > $X" → { field: "totalSpent", op: "gt", value: X }
- "haven't purchased in X days" → { field: "daysSinceLastOrder", op: "gt", value: X }
- "ordered more than X times" → { field: "orderCount", op: "gt", value: X }
- "VIP" or "top spenders" → { field: "segment", op: "eq", value: "Champions" }
- "at risk" → { field: "segment", op: "eq", value: "At Risk" }
- "new customers" → { field: "segment", op: "eq", value: "New Customers" }
- "inactive" → { field: "daysSinceLastOrder", op: "gt", value: 60 }
- "top 20 customers" → audienceLimit: 20, audienceSort: "totalSpent"
- "20 most frequent customers" → audienceLimit: 20, audienceSort: "orderCount"
- "top 20 by predicted value" → audienceLimit: 20, audienceSort: "predictedLtv"

An audienceLimit is a hard recipient snapshot size, not a vague segment label.
Never silently drop the requested number.

For automation types: welcome_series, abandoned_cart, post_purchase, win_back, re_engagement, vip_reward, browse_abandonment, seasonal
For channels: default to ["email"] unless the user specifies others

OUTPUT FORMAT — Return valid JSON only:
{
  "intent": "create_automation",
  "params": {
    "automationType": "win_back",
    "channels": ["email", "sms"],
    "targetSegment": "inactive customers",
    "audienceLimit": 20,
    "audienceSort": "totalSpent",
    "segmentCriteria": {
      "conditions": [
        { "field": "daysSinceLastOrder", "op": "gt", "value": 30 },
        { "field": "totalSpent", "op": "gt", "value": 500 }
      ],
      "operator": "AND"
    },
    "discount": { "type": "percentage", "value": 20, "code": "WINBACK20" },
    "theme": "win-back",
    "tone": "friendly and urgent"
  },
  "reasoning": "The user wants to re-engage high-value customers who haven't purchased recently with a discount incentive."
}

Return ONLY valid JSON.`;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export async function parseInstruction(
  instruction: string,
  context: {
    page: string;
    existingSegments: string[];
    existingAutomations: string[];
  },
  model?: AIModelId,
  modelHarness?: ModelHarnessConfig | unknown,
): Promise<ParsedInstruction> {
  const prompt = buildParsePrompt(instruction, context);

  const result = await complete({
    model,
    task: "classification", // intent parsing is cheap/deterministic → economy tier
    workload: "classification",
    harness: modelHarness,
    prompt,
    temperature: 0.3,
    jsonMode: true,
    maxTokens: 1024,
  });

  const parsed = JSON.parse(result.content) as ParsedInstruction;
  return applyDeterministicInstructionConstraints(instruction, parsed);
}
