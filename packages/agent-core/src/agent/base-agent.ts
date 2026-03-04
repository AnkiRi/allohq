import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@allohq/database";
import type { ToolDefinition, ToolContext, AgentResult, AgentType } from "../types";
import { toAnthropicTools } from "../tools";

const MAX_TOOL_ROUNDS = 5;
const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";

/**
 * Run the agent loop: send messages to Claude, execute tool calls, repeat.
 * Returns final text response and list of tool calls made.
 */
export async function runAgent(opts: {
  systemPrompt: string;
  userMessage: string;
  tools: ToolDefinition[];
  toolContext: ToolContext;
  agentType: AgentType;
  conversationHistory?: Array<{ role: string; content: string }>;
  model?: string;
  maxTokens?: number;
}): Promise<AgentResult> {
  const {
    systemPrompt,
    userMessage,
    tools,
    toolContext,
    agentType,
    conversationHistory = [],
    model = DEFAULT_MODEL,
    maxTokens = 4096,
  } = opts;

  const client = new Anthropic({ apiKey: process.env["ANTHROPIC_API_KEY"] });
  const anthropicTools = toAnthropicTools(tools);
  const toolMap = new Map(tools.map((t) => [t.name, t]));

  // Build messages array
  const messages: Anthropic.MessageParam[] = [];

  // Add conversation history
  for (const msg of conversationHistory) {
    if (msg.role === "customer" || msg.role === "user") {
      messages.push({ role: "user", content: msg.content });
    } else if (msg.role === "assistant") {
      messages.push({ role: "assistant", content: msg.content });
    }
  }

  // Add current user message
  messages.push({ role: "user", content: userMessage });

  const allToolCalls: AgentResult["toolCalls"] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // Agent loop: call LLM, execute tools, repeat
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      tools: anthropicTools,
      messages,
    });

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;

    // Check if we have tool calls
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );

    // If no tool calls, extract text response and return
    if (toolUseBlocks.length === 0 || response.stop_reason === "end_turn") {
      const textBlocks = response.content.filter(
        (b): b is Anthropic.TextBlock => b.type === "text"
      );
      const responseText = textBlocks.map((b) => b.text).join("\n");

      // Log final response
      return {
        response: responseText,
        toolCalls: allToolCalls,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
      };
    }

    // Execute tool calls
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUseBlocks) {
      const tool = toolMap.get(toolUse.name);
      if (!tool) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: JSON.stringify({ error: `Unknown tool: ${toolUse.name}` }),
          is_error: true,
        });
        continue;
      }

      try {
        const input = toolUse.input as Record<string, unknown>;
        const output = await tool.handler(input, toolContext);

        // Log the action
        await prisma.agentAction.create({
          data: {
            storeId: toolContext.storeId,
            agentType,
            actionType: toolUse.name,
            input: input as any,
            output: (output ?? {}) as any,
            status: "completed",
          },
        });

        allToolCalls.push({ name: toolUse.name, input, output });

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: JSON.stringify(output),
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Tool execution failed";

        await prisma.agentAction.create({
          data: {
            storeId: toolContext.storeId,
            agentType,
            actionType: toolUse.name,
            input: (toolUse.input ?? {}) as any,
            status: "failed",
            error: errorMsg,
          },
        });

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: JSON.stringify({ error: errorMsg }),
          is_error: true,
        });
      }
    }

    // Add assistant response + tool results to messages for next round
    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });
  }

  // If we exhausted all rounds, return whatever we have
  return {
    response: "I apologize, but I wasn't able to complete your request. Please try again.",
    toolCalls: allToolCalls,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
  };
}
