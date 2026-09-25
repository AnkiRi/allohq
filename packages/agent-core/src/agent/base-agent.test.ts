import assert from "node:assert/strict";
import test from "node:test";
import { modelFacingToolOutput, serializeToolResult } from "./tool-result";

test("a multi-megabyte campaign preview stays in the UI result but never returns to the model", () => {
  const output = {
    success: true,
    contentType: "campaign_preview",
    draftCampaignId: "draft-1",
    previewHtml: `<img src="data:image/png;base64,${"A".repeat(3_200_000)}">`,
    subject: "A draft to review",
    constraints: { offer: "20% discount · valid 24 hours from launch" },
    message: "Draft created; nothing has been sent.",
  };

  const modelOutput = modelFacingToolOutput("create_campaign_with_preview", output) as Record<string, unknown>;
  const serialized = serializeToolResult("create_campaign_with_preview", output);
  assert.equal(modelOutput.previewHtml, undefined);
  assert.equal(modelOutput.previewReady, true);
  assert.equal(modelOutput.draftCampaignId, "draft-1");
  assert.ok(serialized.length < 1_000, "the next model round receives only campaign facts");
  assert.equal(output.previewHtml.length > 3_200_000, true, "the original UI artifact is unchanged");
});

test("oversized unrelated tool results cannot consume the whole context", () => {
  const serialized = serializeToolResult("other_tool", { body: "B".repeat(200_000) });
  assert.ok(serialized.length < 300);
  assert.match(serialized, /Do not repeat the action/);
});
