import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { prisma } from "@allohq/database";
import {
  getModel,
  getProvider,
  resolveHarnessRoute,
  type AIModelId,
  type AIWorkload,
  type ModelHarnessConfig,
} from "@allohq/customer-intelligence";
import type { ToolDefinition, ToolContext, AgentResult, AgentType } from "../types";
import { toAnthropicTools } from "../tools";

const MAX_TOOL_ROUNDS = 5;
/**
 * Run the agent loop: send messages to the LLM, execute tool calls, repeat.
 * The merchant harness supplies an ordered provider/model chain.
 */
export async function runAgent(opts: {
  systemPrompt: string;
  userMessage: string;
  tools: ToolDefinition[];
  toolContext: ToolContext;
  agentType: AgentType;
  conversationHistory?: Array<{ role: string; content: string }>;
  model?: AIModelId;
  workload?: AIWorkload;
  modelHarness?: ModelHarnessConfig | unknown;
  maxTokens?: number;
}): Promise<AgentResult> {
  const {
    systemPrompt,
    userMessage,
    tools,
    toolContext,
    agentType,
    conversationHistory: rawHistory = [],
    maxTokens = 4096,
  } = opts;

  // Cap history so context (and cost) doesn't grow unbounded per turn — keep the
  // most recent exchanges (last 12 messages ≈ 6 turns); older turns drop off.
  const conversationHistory = rawHistory.slice(-12);

  const route = resolveHarnessRoute({
    model: opts.model,
    workload: opts.workload ?? (agentType === "customer_assistant" ? "support" : "orchestration"),
    harness: opts.modelHarness,
    task: "reasoning",
  });

  let lastError: Error | undefined;
  let attempted = 0;

  for (const modelId of route.candidates) {
    const model = getModel(modelId);
    if (!model || !getProvider(model.provider).isAvailable()) continue;
    attempted++;

    try {
      const result =
        model.provider === "anthropic"
          ? await runAnthropicAgent({
              systemPrompt,
              userMessage,
              tools,
              toolContext,
              agentType,
              conversationHistory,
              model: modelId,
              maxTokens: route.maxTokens ?? maxTokens,
            })
          : await runOpenAIAgent({
              systemPrompt,
              userMessage,
              tools,
              toolContext,
              agentType,
              conversationHistory,
              model: modelId,
              maxTokens: route.maxTokens ?? maxTokens,
            });

      return {
        ...result,
        model: modelId,
        provider: model.provider,
        usedFallback: attempted > 1,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(
        `[Agent] ${modelId} (${model.provider}) failed: ${lastError.message}. Falling back...`,
      );
    }
  }

  throw new Error(
    `All tool-capable AI models failed or unavailable. Last error: ${lastError?.message ?? "no provider configured"}`,
  );
}

// ---------------------------------------------------------------------------
// Anthropic agent
// ---------------------------------------------------------------------------

async function runAnthropicAgent(opts: {
  systemPrompt: string;
  userMessage: string;
  tools: ToolDefinition[];
  toolContext: ToolContext;
  agentType: AgentType;
  conversationHistory: Array<{ role: string; content: string }>;
  model: string;
  maxTokens: number;
}): Promise<AgentResult> {
  const { systemPrompt, userMessage, tools, toolContext, agentType, conversationHistory, model, maxTokens } = opts;

  const client = new Anthropic({ apiKey: process.env["ANTHROPIC_API_KEY"], timeout: 60_000, maxRetries: 1 });
  const anthropicTools = toAnthropicTools(tools);
  // Prompt caching — cache the STABLE prefix (system prompt + tool schemas) so the
  // ~3k-token prefix isn't re-billed on every round of the agent loop (rounds 2-5
  // read it from cache, ~90% cheaper). Dynamic conversation messages stay uncached.
  if (anthropicTools.length > 0) {
    (anthropicTools[anthropicTools.length - 1] as Record<string, unknown>).cache_control = { type: "ephemeral" };
  }
  const cachedSystem = [{ type: "text" as const, text: systemPrompt, cache_control: { type: "ephemeral" as const } }];

  const messages: Anthropic.MessageParam[] = [];
  for (const msg of conversationHistory) {
    if (msg.role === "customer" || msg.role === "user") {
      messages.push({ role: "user", content: msg.content });
    } else if (msg.role === "assistant") {
      messages.push({ role: "assistant", content: msg.content });
    }
  }
  messages.push({ role: "user", content: userMessage });

  const allToolCalls: AgentResult["toolCalls"] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: cachedSystem as unknown as Anthropic.MessageCreateParams["system"],
      tools: anthropicTools,
      messages,
    });

    const usage = response.usage as {
      input_tokens: number;
      output_tokens: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
    totalInputTokens += usage.input_tokens;
    totalOutputTokens += usage.output_tokens;
    if ((usage.cache_read_input_tokens ?? 0) > 0 || (usage.cache_creation_input_tokens ?? 0) > 0) {
      console.log(`[Agent cache] round ${round}: read=${usage.cache_read_input_tokens ?? 0} created=${usage.cache_creation_input_tokens ?? 0} fresh_input=${usage.input_tokens}`);
    }

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );

    if (toolUseBlocks.length === 0 || response.stop_reason === "end_turn") {
      const textBlocks = response.content.filter(
        (b): b is Anthropic.TextBlock => b.type === "text"
      );
      return {
        response: textBlocks.map((b) => b.text).join("\n"),
        toolCalls: allToolCalls,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
      };
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUseBlocks) {
      const result = await executeToolCall(toolUse.name, toolUse.input as Record<string, unknown>, tools, toolContext, agentType, allToolCalls);
      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: JSON.stringify(result.output),
        ...(result.isError ? { is_error: true } : {}),
      });
    }

    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });
  }

  return {
    response: "I apologize, but I wasn't able to complete your request. Please try again.",
    toolCalls: allToolCalls,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
  };
}

// ---------------------------------------------------------------------------
// OpenAI agent (fallback)
// ---------------------------------------------------------------------------

function toOpenAITools(tools: ToolDefinition[]): OpenAI.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: "object",
        properties: Object.fromEntries(
          Object.entries(t.parameters).map(([key, val]) => [key, val])
        ),
      },
    },
  }));
}

async function runOpenAIAgent(opts: {
  systemPrompt: string;
  userMessage: string;
  tools: ToolDefinition[];
  toolContext: ToolContext;
  agentType: AgentType;
  conversationHistory: Array<{ role: string; content: string }>;
  model: string;
  maxTokens: number;
}): Promise<AgentResult> {
  const { systemPrompt, userMessage, tools, toolContext, agentType, conversationHistory, model, maxTokens } = opts;

  const client = new OpenAI({ apiKey: process.env["OPENAI_API_KEY"], timeout: 60_000, maxRetries: 1 });
  const openaiTools = toOpenAITools(tools);

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
  ];
  for (const msg of conversationHistory) {
    if (msg.role === "customer" || msg.role === "user") {
      messages.push({ role: "user", content: msg.content });
    } else if (msg.role === "assistant") {
      messages.push({ role: "assistant", content: msg.content });
    }
  }
  messages.push({ role: "user", content: userMessage });

  const allToolCalls: AgentResult["toolCalls"] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.chat.completions.create({
      model,
      max_tokens: maxTokens,
      messages,
      tools: openaiTools.length > 0 ? openaiTools : undefined,
    });

    totalInputTokens += response.usage?.prompt_tokens ?? 0;
    totalOutputTokens += response.usage?.completion_tokens ?? 0;

    const choice = response.choices[0];
    if (!choice) break;

    const fnCalls = choice.message.tool_calls ?? [];

    if (fnCalls.length === 0) {
      return {
        response: choice.message.content ?? "",
        toolCalls: allToolCalls,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
      };
    }

    // Add assistant message with tool calls
    messages.push(choice.message);

    // Execute each tool call
    for (const fnCall of fnCalls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(fnCall.function.arguments || "{}");
      } catch {}

      const result = await executeToolCall(fnCall.function.name, args, tools, toolContext, agentType, allToolCalls);
      messages.push({
        role: "tool",
        tool_call_id: fnCall.id,
        content: JSON.stringify(result.output),
      });
    }
  }

  return {
    response: "I apologize, but I wasn't able to complete your request. Please try again.",
    toolCalls: allToolCalls,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
  };
}

// ---------------------------------------------------------------------------
// Shared tool execution
// ---------------------------------------------------------------------------

async function executeToolCall(
  toolName: string,
  input: Record<string, unknown>,
  tools: ToolDefinition[],
  toolContext: ToolContext,
  agentType: AgentType,
  allToolCalls: AgentResult["toolCalls"],
): Promise<{ output: unknown; isError: boolean }> {
  const tool = tools.find((t) => t.name === toolName);
  if (!tool) {
    return { output: { error: `Unknown tool: ${toolName}` }, isError: true };
  }

  try {
    const output = await tool.handler(input, toolContext);

    await prisma.agentAction.create({
      data: {
        storeId: toolContext.storeId,
        customerId: toolContext.customerId ?? null,
        agentType,
        actionType: toolName,
        input: input as any,
        output: (output ?? {}) as any,
        status: "completed",
      },
    });

    allToolCalls.push({ name: toolName, input, output });
    return { output, isError: false };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Tool execution failed";

    await prisma.agentAction.create({
      data: {
        storeId: toolContext.storeId,
        customerId: toolContext.customerId ?? null,
        agentType,
        actionType: toolName,
        input: input as any,
        status: "failed",
        error: errorMsg,
      },
    });

    return { output: { error: errorMsg }, isError: true };
  }
}
