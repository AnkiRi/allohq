import type { ToolDefinition } from "../types";
import { shopifyTools } from "./shopify-tools";
import { messagingTools } from "./messaging-tools";
import { analyticsTools } from "./analytics-tools";
import { customerTools } from "./customer-tools";
import { discountTools } from "./discount-tools";
import { campaignTools } from "./campaign-tools";
import { segmentTools } from "./segment-tools";
import { automationTools } from "./automation-tools";
import { autonomyTools } from "./autonomy-tools";
import { creativeTools } from "./creative-tools";
import { briefingTools } from "./briefing-tools";
import { journeyTools } from "./journey-tools";
import { simulationTools } from "./simulation-tools";
import { inlineCampaignTools } from "./inline-campaign-tool";
import { deepAnalyticsTools } from "./deep-analytics-tools";

/** All tools available to the customer-facing agent */
export function getCustomerTools(): ToolDefinition[] {
  return [
    ...shopifyTools,
    ...messagingTools,
    ...customerTools,
    ...discountTools,
  ];
}

/** All tools available to the merchant-facing agent */
export function getMerchantTools(): ToolDefinition[] {
  return [
    ...shopifyTools,
    ...messagingTools,
    ...customerTools,
    ...analyticsTools,
    ...discountTools,
    ...campaignTools,
    ...segmentTools,
    ...automationTools,
    ...autonomyTools,
    ...creativeTools,
    ...briefingTools,
    ...journeyTools,
    ...simulationTools,
    ...inlineCampaignTools,
    ...deepAnalyticsTools,
  ];
}

/** Convert tool definitions to Anthropic tool format */
export function toAnthropicTools(tools: ToolDefinition[]) {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: {
      type: "object" as const,
      properties: t.parameters,
    },
  }));
}
