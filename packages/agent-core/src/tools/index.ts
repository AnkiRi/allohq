import type { ToolDefinition } from "../types";
import { shopifyTools } from "./shopify-tools";
import { messagingTools } from "./messaging-tools";
import { analyticsTools } from "./analytics-tools";
import { customerTools } from "./customer-tools";
import { discountTools } from "./discount-tools";
import { campaignTools } from "./campaign-tools";
import { segmentTools } from "./segment-tools";
import { automationTools } from "./automation-tools";

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
