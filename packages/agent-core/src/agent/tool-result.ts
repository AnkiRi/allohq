const MAX_TOOL_RESULT_CHARS = 24_000;

/** Full HTML is for the merchant preview, not the model's next turn or audit log. */
export function modelFacingToolOutput(toolName: string, output: unknown): unknown {
  if (toolName === "create_campaign_with_preview" && output && typeof output === "object") {
    const { previewHtml: _previewHtml, ...summary } = output as Record<string, unknown>;
    return { ...summary, previewReady: typeof _previewHtml === "string" && _previewHtml.length > 0 };
  }
  return output;
}

export function serializeToolResult(toolName: string, output: unknown): string {
  const serialized = JSON.stringify(modelFacingToolOutput(toolName, output)) ?? "null";
  if (serialized.length <= MAX_TOOL_RESULT_CHARS) return serialized;
  // Never send a partial JSON value or let a large result consume the entire
  // conversation. The original result remains in toolCalls for the UI.
  return JSON.stringify({ error: "This result is too large to inspect. Do not repeat the action; ask the merchant to contact the Joon team." });
}
