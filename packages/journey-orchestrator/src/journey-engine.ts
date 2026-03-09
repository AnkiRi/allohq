import { prisma } from "@allohq/database";
import { checkAllRules } from "@allohq/communication-governor";
import { getRecommendations, resolveProducts } from "@allohq/product-recommendations";
import type { Channel } from "@allohq/messaging";
import type {
  JourneyStep,
  JourneyStepInput,
  JourneyDecision,
  WorkflowNode,
} from "./types";
import { getBestChannel } from "./channel-selector";
import { getOptimalSendTime } from "./timing-optimizer";
import { getTone, adaptTone } from "./tone-adapter";
import {
  getPersonalisationContext,
  personaliseContent,
} from "./content-personaliser";
import { checkSilence, suppressJourneyForSilence } from "./silence-detector";
import { assignVariant, recordResult } from "./ab-testing";

/**
 * Start a new adaptive journey for a customer.
 */
export async function startJourney(params: {
  customerId: string;
  storeId: string;
  automationId?: string;
  journeyType: string;
  nodes: WorkflowNode[];
}): Promise<string> {
  const journey = await prisma.customerJourney.create({
    data: {
      customerId: params.customerId,
      storeId: params.storeId,
      automationId: params.automationId,
      journeyType: params.journeyType,
      totalSteps: params.nodes.length,
      status: "active",
      channelPath: [],
      stepHistory: [],
    },
  });
  return journey.id;
}

/**
 * Execute the next step in an adaptive journey.
 * This is the core orchestration function that makes channel,
 * timing, and content decisions per step.
 */
export async function executeJourneyStep(
  input: JourneyStepInput,
): Promise<{
  executed: boolean;
  decision: JourneyDecision | null;
  suppressed: boolean;
  reason?: string;
}> {
  const { journeyId, customerId, storeId, stepIndex, nodes } = input;

  // Load journey
  const journey = await prisma.customerJourney.findUnique({
    where: { id: journeyId },
  });

  if (!journey || journey.status !== "active") {
    return { executed: false, decision: null, suppressed: false, reason: "Journey not active" };
  }

  // Check if journey is complete
  if (stepIndex >= nodes.length) {
    await prisma.customerJourney.update({
      where: { id: journeyId },
      data: { status: "completed", completedAt: new Date() },
    });
    return { executed: false, decision: null, suppressed: false, reason: "Journey complete" };
  }

  const node = nodes[stepIndex]!;

  // Handle special node types
  if (node.type === "silence_check") {
    const threshold = (node.config["threshold"] as number) ?? 3;
    const { silent } = await checkSilence(customerId, journeyId, threshold);
    if (silent) {
      await suppressJourneyForSilence(journeyId, customerId);
      return { executed: false, decision: null, suppressed: true, reason: "Customer is silent" };
    }
    // Continue to next step
    await advanceJourney(journeyId, stepIndex);
    return { executed: true, decision: null, suppressed: false, reason: "Silence check passed" };
  }

  if (node.type === "recommend_products") {
    // Resolve product recommendations and store in step history for next send step to use
    const productCount = (node.config["productCount"] as number) ?? 4;
    const strategies = node.config["strategies"] as string[] | undefined;

    const recs = await getRecommendations({
      storeId,
      customerId,
      limit: productCount,
      strategies: strategies as import("@allohq/product-recommendations").StrategyType[] | undefined,
    });

    const resolved = recs.length > 0
      ? await resolveProducts(storeId, recs.map((r) => r.productId))
      : [];

    // Store resolved products in step history — next send step reads them
    const stepRecord: JourneyStep = {
      step: stepIndex,
      channel: "email", // placeholder
      sentAt: new Date().toISOString(),
    };
    // Attach recommended products as extra data in the step
    (stepRecord as unknown as Record<string, unknown>)["recommendedProducts"] = resolved.map((p) => ({
      productId: p.productId,
      title: p.title,
      price: p.price,
      imageUrl: p.imageUrl,
    }));

    const stepHistory = (journey.stepHistory ?? []) as unknown as JourneyStep[];
    stepHistory.push(stepRecord);

    await prisma.customerJourney.update({
      where: { id: journeyId },
      data: {
        currentStep: stepIndex + 1,
        stepHistory: JSON.parse(JSON.stringify(stepHistory)),
      },
    });

    return { executed: true, decision: null, suppressed: false, reason: `Resolved ${resolved.length} product recommendations` };
  }

  if (node.type === "wait") {
    // Wait nodes don't need channel decisions — handled by worker re-queue
    return { executed: true, decision: null, suppressed: false, reason: "Wait step" };
  }

  if (node.type === "condition") {
    const passed = await evaluateCondition(node, customerId, storeId);
    if (!passed) {
      await prisma.customerJourney.update({
        where: { id: journeyId },
        data: { status: "completed", completedAt: new Date() },
      });
      return { executed: false, decision: null, suppressed: false, reason: "Condition not met" };
    }
    await advanceJourney(journeyId, stepIndex);
    return { executed: true, decision: null, suppressed: false, reason: "Condition passed" };
  }

  // Determine channel
  let channel: Channel;
  if (node.type === "channel_select") {
    // Use adaptive channel selection
    const best = await getBestChannel(customerId, storeId);
    if (!best) {
      return { executed: false, decision: null, suppressed: true, reason: "No channel available" };
    }
    channel = best;
  } else {
    // Channel is specified by node type
    channel = nodeTypeToChannel(node.type);
  }

  // Check governor
  const govDecision = await checkAllRules({
    customerId,
    storeId,
    channel,
    messageType: "automation",
  });

  if (!govDecision.allowed) {
    // Try fallback channel if adaptive
    if (node.type === "channel_select") {
      const { selectChannel } = await import("./channel-selector");
      const alternatives = await selectChannel(customerId, storeId);
      const fallback = alternatives.find((s) => s.allowed && s.channel !== channel);
      if (fallback) {
        channel = fallback.channel;
      } else {
        return {
          executed: false,
          decision: null,
          suppressed: true,
          reason: `Governor: ${govDecision.reason}`,
        };
      }
    } else {
      return {
        executed: false,
        decision: null,
        suppressed: true,
        reason: `Governor: ${govDecision.reason}`,
      };
    }
  }

  // Determine timing
  const sendAt = await getOptimalSendTime(customerId, storeId);

  // Determine tone
  const tone = await getTone(customerId);

  // Handle A/B test nodes
  let abTestId: string | undefined;
  let variant: "a" | "b" | undefined;
  if (node.type === "ab_test") {
    abTestId = node.config["testId"] as string;
    if (abTestId) {
      variant = assignVariant(abTestId, customerId);
      await recordResult(abTestId, variant, "sent");
    }
  }

  // Get personalisation context (pass journeyId to pick up recommended products)
  const context = await getPersonalisationContext(customerId, storeId, journeyId);

  // Get template content and personalise
  const templateId =
    (node.config["templateId"] as string) ??
    (variant === "b"
      ? (node.config["templateIdB"] as string)
      : (node.config["templateIdA"] as string));

  let content = (node.config["content"] as string) ?? "";
  if (content) {
    content = personaliseContent(content, context);
    content = adaptTone(content, tone);
  }

  const decision: JourneyDecision = {
    channel,
    sendAt,
    tone,
    templateId,
    abTestId,
    variant,
  };

  // Record step in journey history
  const stepRecord: JourneyStep = {
    step: stepIndex,
    channel,
    sentAt: new Date().toISOString(),
    opened: false,
    clicked: false,
    converted: false,
    variant,
  };

  const stepHistory = (journey.stepHistory ?? []) as unknown as JourneyStep[];
  stepHistory.push(stepRecord);
  const channelPath = (journey.channelPath ?? []) as unknown as string[];
  if (!channelPath.includes(channel)) channelPath.push(channel);

  await prisma.customerJourney.update({
    where: { id: journeyId },
    data: {
      currentStep: stepIndex + 1,
      stepHistory: JSON.parse(JSON.stringify(stepHistory)),
      channelPath: JSON.parse(JSON.stringify(channelPath)),
    },
  });

  return { executed: true, decision, suppressed: false };
}

/**
 * Get active journeys for a customer.
 */
export async function getActiveJourneys(
  customerId: string,
  storeId: string,
) {
  return prisma.customerJourney.findMany({
    where: { customerId, storeId, status: "active" },
    orderBy: { startedAt: "desc" },
  });
}

/**
 * Get journey statistics for an automation.
 */
export async function getJourneyStats(automationId: string) {
  const journeys = await prisma.customerJourney.findMany({
    where: { automationId },
    select: {
      status: true,
      channelPath: true,
      stepHistory: true,
      suppressReason: true,
    },
  });

  const stats = {
    total: journeys.length,
    active: 0,
    completed: 0,
    suppressed: 0,
    paused: 0,
    channelUsage: {} as Record<string, number>,
    suppressReasons: {} as Record<string, number>,
    avgStepsCompleted: 0,
  };

  let totalSteps = 0;
  for (const j of journeys) {
    switch (j.status) {
      case "active": stats.active++; break;
      case "completed": stats.completed++; break;
      case "suppressed": stats.suppressed++; break;
      case "paused": stats.paused++; break;
    }

    const channels = (j.channelPath ?? []) as string[];
    for (const ch of channels) {
      stats.channelUsage[ch] = (stats.channelUsage[ch] ?? 0) + 1;
    }

    if (j.suppressReason) {
      stats.suppressReasons[j.suppressReason] =
        (stats.suppressReasons[j.suppressReason] ?? 0) + 1;
    }

    const steps = (j.stepHistory ?? []) as unknown as JourneyStep[];
    totalSteps += steps.length;
  }

  stats.avgStepsCompleted =
    journeys.length > 0 ? Math.round(totalSteps / journeys.length) : 0;

  return stats;
}

// ---- Helpers ----

function nodeTypeToChannel(
  type: string,
): Channel {
  switch (type) {
    case "send_email": return "email";
    case "send_sms": return "sms";
    case "send_whatsapp": return "whatsapp";
    case "send_rcs": return "rcs";
    default: return "email";
  }
}

async function advanceJourney(journeyId: string, stepIndex: number) {
  await prisma.customerJourney.update({
    where: { id: journeyId },
    data: { currentStep: stepIndex + 1 },
  });
}

async function evaluateCondition(
  node: WorkflowNode,
  customerId: string,
  _storeId: string,
): Promise<boolean> {
  const condition = node.config["condition"] as string;

  switch (condition) {
    case "has_purchased": {
      const orders = await prisma.order.count({ where: { customerId } });
      return orders > 0;
    }
    case "is_vip": {
      const state = await prisma.customerState.findUnique({
        where: { customerId },
        select: { vipLevel: true },
      });
      return state?.vipLevel === "gold" || state?.vipLevel === "platinum";
    }
    case "has_opened_email": {
      const opened = await prisma.messageLog.count({
        where: { customerId, status: "opened" },
      });
      return opened > 0;
    }
    case "is_at_risk": {
      const state = await prisma.customerState.findUnique({
        where: { customerId },
        select: { lifecycleStage: true },
      });
      return state?.lifecycleStage === "at_risk";
    }
    default:
      return true;
  }
}
