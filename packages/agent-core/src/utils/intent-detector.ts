/**
 * Fast pre-processor that detects merchant intents from natural language
 * before sending to the LLM. Uses keyword/regex matching — no API calls needed.
 */

export type MerchantIntent =
  | "create_campaign"
  | "create_flash_sale"
  | "send_to_segment"
  | "create_automation"
  | "analytics_query"
  | "revenue_question"
  | "customer_question"
  | "general";

export interface DetectedIntent {
  intent: MerchantIntent;
  confidence: number; // 0-1
  extractedParams: Record<string, string>;
}

interface IntentPattern {
  intent: MerchantIntent;
  patterns: RegExp[];
  weight: number; // base confidence when matched
}

const INTENT_PATTERNS: IntentPattern[] = [
  {
    intent: "create_flash_sale",
    patterns: [
      /\bflash\s+sale\b/i,
      /\brun\s+a\s+sale\b/i,
      /\b(?:create|launch|start)\s+(?:a\s+)?(?:sale|discount|promotion)\b/i,
      /\b(?:send|give)\s+(?:a\s+)?(?:\d+%?\s+)?discount\b/i,
      /\blimited[\s-]time\s+(?:offer|deal|sale)\b/i,
      /\bbogo\b/i,
      /\bbuy\s+one\s+get\s+one\b/i,
    ],
    weight: 0.85,
  },
  {
    intent: "create_campaign",
    patterns: [
      /\b(?:create|draft|build|make|write)\s+(?:a\s+)?(?:email\s+)?campaign\b/i,
      /\bsend\s+(?:an?\s+)?email\b/i,
      /\bsend\s+to\b/i,
      /\bemail\s+blast\b/i,
      /\b(?:create|draft|build)\s+(?:a\s+)?(?:newsletter|announcement)\b/i,
      /\bemail\s+(?:my|the|all)\b/i,
      /\b(?:reach\s+out|message)\s+(?:to\s+)?(?:my|the|all)\b/i,
    ],
    weight: 0.8,
  },
  {
    intent: "send_to_segment",
    patterns: [
      /\bsend\s+(?:to|for)\s+(?:my\s+)?(?:vip|champion|at[\s-]risk|hibernat|loyal|new|lost)\b/i,
      /\btarget\s+(?:my\s+)?(?:vip|champion|at[\s-]risk|hibernat|loyal|new|lost)\b/i,
      /\b(?:email|message|reach)\s+(?:my\s+)?(?:vip|champion|at[\s-]risk|hibernat|loyal|new|lost)\b/i,
    ],
    weight: 0.85,
  },
  {
    intent: "create_automation",
    patterns: [
      /\b(?:create|build|set\s+up|make)\s+(?:a\s+|an\s+)?(?:automation|flow|workflow|sequence|drip)\b/i,
      /\bautomate\b/i,
      /\b(?:set\s+up|create)\s+(?:a\s+)?(?:welcome|win[\s-]back|cart[\s-]recovery|post[\s-]purchase)\s+(?:flow|series|sequence|automation)?\b/i,
      /\btrigger[\s-]based\s+email\b/i,
    ],
    weight: 0.85,
  },
  {
    intent: "revenue_question",
    patterns: [
      /\brevenue\b/i,
      /\bsales\s+(?:this|last|today|yesterday)\b/i,
      /\bhow\s+much\s+(?:did|have|has|do)\b/i,
      /\bearnings\b/i,
      /\b(?:total|monthly|weekly|daily)\s+(?:revenue|sales|income)\b/i,
      /\bMRR\b/,
      /\bGMV\b/,
      /\baverage\s+order\s+value\b/i,
      /\bAOV\b/,
    ],
    weight: 0.75,
  },
  {
    intent: "analytics_query",
    patterns: [
      /\bwhy\s+did\b/i,
      /\bexplain\s+(?:the|why|what)\b/i,
      /\bwhat\s+happened\b/i,
      /\b(?:dip|drop|decrease|decline|spike|increase|surge)\b/i,
      /\bcompare\s+(?:to|with|against)\b/i,
      /\btrend\b/i,
      /\bbreakdown\b/i,
      /\bperformance\s+(?:report|summary|overview)\b/i,
      /\bhow\s+(?:are|is)\s+(?:my|the|our)\b/i,
    ],
    weight: 0.7,
  },
  {
    intent: "customer_question",
    patterns: [
      /\bwhich\s+customers?\b/i,
      /\bwho\s+(?:should|are|is|has|have)\b/i,
      /\bsegment\b/i,
      /\bVIP\s+(?:customers?|list|segment)\b/i,
      /\bat[\s-]risk\s+customers?\b/i,
      /\bchurn(?:ing|ed)?\b/i,
      /\b(?:best|top|high[\s-]value|high[\s-]ltv)\s+customers?\b/i,
      /\b(?:find|show|list)\s+(?:me\s+)?(?:my\s+)?customers?\b/i,
    ],
    weight: 0.75,
  },
];

// Param extraction patterns
const PARAM_EXTRACTORS: { key: string; pattern: RegExp }[] = [
  // Segment names
  { key: "segment", pattern: /\b(champions?|vips?|at[\s-]risk|hibernat(?:ing|ed)?|loyal(?:ists?)?|new\s+customers?|lost|can'?t\s+lose)\b/i },
  // Discount percentages
  { key: "discountPercent", pattern: /(\d{1,2})%\s*(?:off|discount)?/i },
  // Product mentions
  { key: "product", pattern: /(?:for|on|about)\s+(?:the\s+)?["']?([^"',.\n]{3,30})["']?/i },
  // Timeframes
  { key: "timeframe", pattern: /\b(today|yesterday|this\s+week|last\s+week|this\s+month|last\s+month|past\s+\d+\s+days?|last\s+\d+\s+days?|\d+\s+days?\s+ago)\b/i },
  // Campaign/email intent types
  { key: "emailIntent", pattern: /\b(welcome|win[\s-]?back|cart[\s-]?recovery|post[\s-]?purchase|seasonal|promotion|re[\s-]?engagement|vip[\s-]?reward|browse[\s-]?abandonment|announcement)\b/i },
];

/**
 * Detect the merchant's intent from a chat message.
 * Returns the best matching intent with confidence score and extracted parameters.
 */
export function detectIntent(message: string): DetectedIntent {
  let bestIntent: MerchantIntent = "general";
  let bestConfidence = 0;

  for (const { intent, patterns, weight } of INTENT_PATTERNS) {
    let hits = 0;
    for (const pattern of patterns) {
      if (pattern.test(message)) {
        hits++;
      }
    }

    if (hits > 0) {
      // Confidence increases with more pattern matches (diminishing returns)
      const confidence = Math.min(weight + (hits - 1) * 0.05, 0.95);
      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestIntent = intent;
        void hits;
      }
    }
  }

  // Extract parameters
  const extractedParams: Record<string, string> = {};
  for (const { key, pattern } of PARAM_EXTRACTORS) {
    const match = message.match(pattern);
    if (match?.[1]) {
      extractedParams[key] = match[1].trim();
    }
  }

  // Boost confidence if we extracted relevant params
  if (Object.keys(extractedParams).length > 0 && bestConfidence > 0) {
    bestConfidence = Math.min(bestConfidence + 0.05, 0.95);
  }

  return {
    intent: bestIntent,
    confidence: Math.round(bestConfidence * 100) / 100,
    extractedParams,
  };
}
