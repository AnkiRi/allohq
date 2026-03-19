/**
 * A/B Test Evolver
 *
 * Automatically applies winning variants, generates follow-up hypotheses,
 * and creates chained A/B tests for continuous self-optimization.
 */

import { prisma } from "@allohq/database";

// ---------------------------------------------------------------------------
// Variable rotation order for hypothesis generation
// ---------------------------------------------------------------------------

const VARIABLE_ROTATION = [
  "subject_line",
  "send_time",
  "content",
  "discount_level",
  "channel",
] as const;

// ---------------------------------------------------------------------------
// Pattern-based variant suggestions per variable
// ---------------------------------------------------------------------------

const SUBJECT_LINE_PATTERNS: Record<string, string[]> = {
  cart_recovery: [
    "You left something behind...",
    "Still thinking about it? Here's a nudge",
    "Your cart misses you {{first_name}}",
    "Don't miss out on your picks!",
  ],
  win_back: [
    "We miss you, {{first_name}}!",
    "It's been a while... here's something special",
    "Come back for an exclusive offer",
    "Your favorites are waiting",
  ],
  post_purchase: [
    "Thanks for your order! Here's what's next",
    "You'll love these too, {{first_name}}",
    "Your order is confirmed + a surprise inside",
    "Complete your look with these picks",
  ],
  default: [
    "Something special just for you",
    "{{first_name}}, check this out",
    "You don't want to miss this",
    "A little treat from us to you",
  ],
};

const SEND_TIME_VARIANTS = [
  { value: "morning", description: "9-11 AM local time" },
  { value: "afternoon", description: "1-3 PM local time" },
  { value: "evening", description: "6-8 PM local time" },
  { value: "late_evening", description: "8-10 PM local time" },
];

const DISCOUNT_VARIANTS = [
  { value: "5", description: "5% discount" },
  { value: "10", description: "10% discount" },
  { value: "15", description: "15% discount" },
  { value: "free_shipping", description: "Free shipping" },
];

const CHANNEL_VARIANTS = [
  { value: "email", description: "Email" },
  { value: "sms", description: "SMS" },
  { value: "whatsapp", description: "WhatsApp" },
];

const CONTENT_VARIANTS = [
  { value: "minimal", description: "Short, minimal copy" },
  { value: "detailed", description: "Detailed with product info" },
  { value: "social_proof", description: "Customer reviews + social proof" },
  { value: "urgency", description: "Urgency-driven copy" },
];

// ---------------------------------------------------------------------------
// 1. applyWinner — apply the winning variant to the automation/template
// ---------------------------------------------------------------------------

export async function applyWinner(testId: string): Promise<void> {
  const test = await prisma.aBTest.findUnique({
    where: { id: testId },
    include: { store: { select: { id: true } } },
  });

  if (!test || test.status !== "concluded" || !test.winner) {
    console.log(`[ab-test-evolver] Test ${testId} not concluded or no winner`);
    return;
  }

  const winningVariant = test.winner === "a"
    ? (test.variantA as { value?: string; description?: string })
    : (test.variantB as { value?: string; description?: string });

  const winningValue = winningVariant?.value ?? "";

  console.log(
    `[ab-test-evolver] Applying winner for test ${testId}: variable=${test.variable}, winner=${test.winner}, value="${winningValue}"`,
  );

  switch (test.variable) {
    case "subject_line": {
      // Update automation nodes — find the first send node and update its subject
      if (test.automationId) {
        const automation = await prisma.automation.findUnique({
          where: { id: test.automationId },
          select: { nodes: true },
        });
        if (automation?.nodes) {
          const nodes = (automation.nodes as Array<Record<string, unknown>>) ?? [];
          for (const node of nodes) {
            if (node["type"] === "send" || node["type"] === "email") {
              const nodeConfig = (node["config"] as Record<string, unknown>) ?? {};
              nodeConfig["subject"] = winningValue;
              node["config"] = nodeConfig;
              break;
            }
          }
          await prisma.automation.update({
            where: { id: test.automationId },
            data: { nodes: nodes as any },
          });
        }
      }
      break;
    }

    case "send_time": {
      // Update automation trigger config with winning send time
      if (test.automationId) {
        const automation = await prisma.automation.findUnique({
          where: { id: test.automationId },
          select: { triggerConfig: true },
        });
        if (automation) {
          const triggerConfig = (automation.triggerConfig as Record<string, unknown>) ?? {};
          triggerConfig["preferredSendTime"] = winningValue;
          await prisma.automation.update({
            where: { id: test.automationId },
            data: { triggerConfig: triggerConfig as any },
          });
        }
      }
      break;
    }

    case "discount_level": {
      // Update automation node config with winning discount
      if (test.automationId) {
        const automation = await prisma.automation.findUnique({
          where: { id: test.automationId },
          select: { nodes: true },
        });
        if (automation?.nodes) {
          const nodes = (automation.nodes as Array<Record<string, unknown>>) ?? [];
          for (const node of nodes) {
            const nodeConfig = (node["config"] as Record<string, unknown>) ?? {};
            if (nodeConfig["discountValue"] !== undefined || nodeConfig["discount"] !== undefined) {
              nodeConfig["discountValue"] = winningValue;
              node["config"] = nodeConfig;
              break;
            }
          }
          await prisma.automation.update({
            where: { id: test.automationId },
            data: { nodes: nodes as any },
          });
        }
      }
      break;
    }

    case "channel": {
      // Update automation trigger config with preferred channel
      if (test.automationId) {
        const automation = await prisma.automation.findUnique({
          where: { id: test.automationId },
          select: { triggerConfig: true },
        });
        if (automation) {
          const triggerConfig = (automation.triggerConfig as Record<string, unknown>) ?? {};
          triggerConfig["preferredChannel"] = winningValue;
          await prisma.automation.update({
            where: { id: test.automationId },
            data: { triggerConfig: triggerConfig as any },
          });
        }
      }
      break;
    }

    case "content": {
      // Update send node content style
      if (test.automationId) {
        const automation = await prisma.automation.findUnique({
          where: { id: test.automationId },
          select: { nodes: true },
        });
        if (automation?.nodes) {
          const nodes = (automation.nodes as Array<Record<string, unknown>>) ?? [];
          for (const node of nodes) {
            if (node["type"] === "send" || node["type"] === "email") {
              const nodeConfig = (node["config"] as Record<string, unknown>) ?? {};
              nodeConfig["contentStyle"] = winningValue;
              node["config"] = nodeConfig;
              break;
            }
          }
          await prisma.automation.update({
            where: { id: test.automationId },
            data: { nodes: nodes as any },
          });
        }
      }
      break;
    }
  }

  console.log(
    `[ab-test-evolver] Successfully applied winner for test ${testId} (${test.variable}=${winningValue})`,
  );
}

// ---------------------------------------------------------------------------
// 2. generateNextHypothesis — pick the next variable and generate variants
// ---------------------------------------------------------------------------

export interface Hypothesis {
  variable: string;
  variantA: { value: string; description: string };
  variantB: { value: string; description: string };
  name: string;
}

export async function generateNextHypothesis(
  testId: string,
  _storeId: string,
): Promise<Hypothesis> {
  const test = await prisma.aBTest.findUnique({
    where: { id: testId },
    select: { variable: true, automationId: true },
  });

  const currentVariable = test?.variable ?? "subject_line";

  // Get the next variable in rotation
  const currentIndex = VARIABLE_ROTATION.indexOf(
    currentVariable as (typeof VARIABLE_ROTATION)[number],
  );
  const nextIndex = (currentIndex + 1) % VARIABLE_ROTATION.length;
  const nextVariable = VARIABLE_ROTATION[nextIndex]!;

  // Determine automation category for context-aware suggestions
  let automationCategory = "default";
  if (test?.automationId) {
    const automation = await prisma.automation.findUnique({
      where: { id: test.automationId },
      select: { category: true },
    });
    automationCategory = automation?.category ?? "default";
  }

  // Generate smart variant values based on variable type
  let variantA: { value: string; description: string };
  let variantB: { value: string; description: string };

  switch (nextVariable) {
    case "subject_line": {
      const patterns =
        SUBJECT_LINE_PATTERNS[automationCategory] ??
        SUBJECT_LINE_PATTERNS["default"]!;
      const shuffled = [...patterns].sort(() => Math.random() - 0.5);
      variantA = { value: shuffled[0]!, description: "Subject line variant A" };
      variantB = { value: shuffled[1]!, description: "Subject line variant B" };
      break;
    }

    case "send_time": {
      const shuffled = [...SEND_TIME_VARIANTS].sort(() => Math.random() - 0.5);
      variantA = shuffled[0]!;
      variantB = shuffled[1]!;
      break;
    }

    case "discount_level": {
      const shuffled = [...DISCOUNT_VARIANTS].sort(() => Math.random() - 0.5);
      variantA = shuffled[0]!;
      variantB = shuffled[1]!;
      break;
    }

    case "channel": {
      const shuffled = [...CHANNEL_VARIANTS].sort(() => Math.random() - 0.5);
      variantA = shuffled[0]!;
      variantB = shuffled[1]!;
      break;
    }

    case "content": {
      const shuffled = [...CONTENT_VARIANTS].sort(() => Math.random() - 0.5);
      variantA = shuffled[0]!;
      variantB = shuffled[1]!;
      break;
    }

    default: {
      variantA = { value: "control", description: "Control variant" };
      variantB = { value: "experiment", description: "Experimental variant" };
    }
  }

  const name = `Auto: ${nextVariable} test (${automationCategory}) — ${variantA.description} vs ${variantB.description}`;

  return { variable: nextVariable, variantA, variantB, name };
}

// ---------------------------------------------------------------------------
// 3. createFollowUpTest — create a chained A/B test
// ---------------------------------------------------------------------------

export async function createFollowUpTest(
  testId: string,
  storeId: string,
  autoStart: boolean,
): Promise<{ id: string; name: string; variable: string }> {
  const hypothesis = await generateNextHypothesis(testId, storeId);

  // Get the automation from the original test
  const originalTest = await prisma.aBTest.findUnique({
    where: { id: testId },
    select: { automationId: true, minSampleSize: true },
  });

  const newTest = await prisma.aBTest.create({
    data: {
      storeId,
      automationId: originalTest?.automationId,
      name: hypothesis.name,
      variable: hypothesis.variable,
      variantA: hypothesis.variantA as any,
      variantB: hypothesis.variantB as any,
      splitRatio: 0.5,
      status: autoStart ? "running" : "draft",
      minSampleSize: originalTest?.minSampleSize ?? 100,
      startedAt: autoStart ? new Date() : undefined,
    },
  });

  console.log(
    `[ab-test-evolver] Created follow-up test ${newTest.id}: ${hypothesis.name} (${autoStart ? "auto-started" : "pending review"})`,
  );

  return { id: newTest.id, name: newTest.name, variable: newTest.variable };
}
