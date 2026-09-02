import assert from "node:assert/strict";
import test from "node:test";
import { executeInstruction } from "./execute-instruction";
import { applyDeterministicInstructionConstraints } from "./parse-instruction";
import type { ParsedInstruction } from "./parse-instruction";

function candidate(
  params: ParsedInstruction["params"] = {},
): ParsedInstruction {
  return {
    intent: "create_campaign",
    params,
    reasoning: "Create a promotion.",
  };
}

test("hard constraints recover top-customer count, discount, and channels", () => {
  const parsed = applyDeterministicInstructionConstraints(
    "Create a 30% discount email and WhatsApp campaign for my top 20 customers",
    candidate(),
  );

  assert.equal(parsed.params.audienceLimit, 20);
  assert.equal(parsed.params.audienceSort, "totalSpent");
  assert.deepEqual(parsed.params.channels, ["email", "whatsapp"]);
  assert.deepEqual(parsed.params.discount, {
    type: "percentage",
    value: 30,
    code: "",
  });
});

test("explicit ranking language selects the matching customer signal", () => {
  const parsed = applyDeterministicInstructionConstraints(
    "Reward my 12 most frequent customers",
    candidate(),
  );

  assert.equal(parsed.params.audienceLimit, 12);
  assert.equal(parsed.params.audienceSort, "orderCount");
});

test("a percentage audience does not become a fixed top-customer limit", () => {
  const parsed = applyDeterministicInstructionConstraints(
    "Analyze my top 20% of customers by value",
    {
      intent: "analyze_customers",
      params: {},
      reasoning: "Analyze a percentile.",
    },
  );

  assert.equal(parsed.params.audienceLimit, undefined);
  assert.equal(parsed.params.discount, undefined);
});

test("an invalid model response is rejected before execution", () => {
  assert.throws(
    () =>
      applyDeterministicInstructionConstraints(
        "Create a campaign",
        { intent: "unknown", params: {}, reasoning: "" } as unknown as ParsedInstruction,
      ),
    /invalid action/,
  );
});

test("a top-N instruction freezes the ranked customer IDs without criteria", async () => {
  let findManyArgs: Record<string, unknown> | undefined;
  let segmentData: Record<string, unknown> | undefined;
  const prisma = {
    customer: {
      findMany: async (args: Record<string, unknown>) => {
        findManyArgs = args;
        return [{ id: "customer-ankita" }, { id: "customer-maya" }];
      },
    },
    customerSegment: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        segmentData = data;
        return { id: "segment-top-two" };
      },
    },
  };

  const result = await executeInstruction(
    {
      intent: "create_segment",
      params: { audienceLimit: 2, audienceSort: "totalSpent" },
      reasoning: "The two highest-spend customers.",
    },
    {
      prisma,
      storeId: "store-one",
      workspaceId: "workspace-one",
    },
  );

  assert.equal(result.success, true);
  assert.equal(findManyArgs?.["take"], 2);
  assert.deepEqual(findManyArgs?.["orderBy"], {
    rfmScore: { totalSpent: "desc" },
  });
  assert.equal(segmentData?.["kind"], "manual");
  assert.deepEqual(segmentData?.["customerIds"], [
    "customer-ankita",
    "customer-maya",
  ]);
});

test("audience requests above the pilot safety limit fail explicitly", async () => {
  await assert.rejects(
    executeInstruction(
      {
        intent: "create_segment",
        params: { audienceLimit: 501 },
        reasoning: "A very large segment.",
      },
      {
        prisma: {},
        storeId: "store-one",
        workspaceId: "workspace-one",
      },
    ),
    /between 1 and 500/,
  );
});
