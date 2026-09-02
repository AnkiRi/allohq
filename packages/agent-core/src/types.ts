/** A tool definition the agent can call */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
  handler: (params: Record<string, unknown>, context: ToolContext) => Promise<unknown>;
}

/** Context passed to tool handlers */
export interface ToolContext {
  storeId: string;
  customerId?: string;
  conversationId?: string;
}

/** A message in the agent conversation */
export interface AgentMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolName?: string;
}

/** Result from running the agent */
export interface AgentResult {
  response: string;
  toolCalls: Array<{
    name: string;
    input: Record<string, unknown>;
    output: unknown;
  }>;
  inputTokens: number;
  outputTokens: number;
  /** Concrete route selected by the model harness. */
  model?: string;
  provider?: "anthropic" | "openai";
  usedFallback?: boolean;
}

export type AgentType = "customer_assistant" | "retention_strategist";
