import { complete, type AIModelId } from "../ai";

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
    scheduledAt?: string;
    templateType?: "email" | "sms" | "whatsapp" | "rcs";
    discount?: { type: string; value: number; code: string };
    theme?: string;
    tone?: string;
  };
  reasoning: string;
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

For automation types: welcome_series, abandoned_cart, post_purchase, win_back, re_engagement, vip_reward, browse_abandonment, seasonal
For channels: default to ["email"] unless the user specifies others

OUTPUT FORMAT — Return valid JSON only:
{
  "intent": "create_automation",
  "params": {
    "automationType": "win_back",
    "channels": ["email", "sms"],
    "targetSegment": "inactive customers",
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
): Promise<ParsedInstruction> {
  const prompt = buildParsePrompt(instruction, context);

  const result = await complete({
    model,
    prompt,
    temperature: 0.3,
    jsonMode: true,
    maxTokens: 1024,
  });

  const parsed = JSON.parse(result.content) as ParsedInstruction;
  return parsed;
}
