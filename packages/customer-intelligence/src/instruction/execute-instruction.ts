import type { AIModelId } from "../ai";
import type { ModelHarnessConfig } from "../ai/model-harness";
import type { ParsedInstruction, InstructionIntent } from "./parse-instruction";
import { generateEmail } from "../content/generate-email";
import { generateSms } from "../content/generate-sms";
import { generateWhatsApp } from "../content/generate-whatsapp";
import { generateRcs } from "../content/generate-rcs";
import { generateWorkflow } from "../programs/generate-workflow";
import { buildWhereFromConditions } from "@allohq/database";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExecutionResult {
  intent: InstructionIntent;
  success: boolean;
  summary: string;
  created: {
    automationId?: string;
    campaignId?: string;
    templateIds?: string[];
    segmentId?: string;
  };
  tokenUsage: { input: number; output: number; model: string };
}

interface ExecutionDeps {
  prisma: any;
  storeId: string;
  workspaceId: string;
  brandProfile?: {
    brandName: string;
    brandDescription?: string | null;
    toneAttributes: Record<string, string>;
    vocabulary: Record<string, string[]>;
    visualStyle: Record<string, string | string[]>;
    sampleCopy: string[];
    creativeIntensity?: string;
  };
  model?: AIModelId;
  modelHarness?: ModelHarnessConfig | unknown;
}

// ---------------------------------------------------------------------------
// Segment creation helper
// ---------------------------------------------------------------------------

// Map the instruction parser's criteria vocabulary → the canonical conditions shape.
const OP_MAP: Record<string, string> = {
  gt: "greaterThan",
  lt: "lessThan",
  gte: "greaterThanOrEqual",
  lte: "lessThanOrEqual",
  eq: "equals",
  equals: "equals",
};
const FIELD_MAP: Record<string, string> = { segment: "rfmSegment" };

function describeConditions(conds: Array<{ field: string; op: string; value: unknown }>): string {
  const labels: Record<string, string> = {
    totalSpent: "spend",
    orderCount: "orders",
    daysSinceLastOrder: "days since order",
    avgOrderValue: "AOV",
    rfmSegment: "segment",
  };
  const ops: Record<string, string> = {
    greaterThan: ">",
    lessThan: "<",
    greaterThanOrEqual: "≥",
    lessThanOrEqual: "≤",
    equals: "=",
  };
  const parts = conds.map((c) => `${labels[c.field] ?? c.field} ${ops[c.op] ?? ""} ${c.value}`.trim());
  return parts.join(", ").slice(0, 60) || "Targeted segment";
}

async function createSegmentFromCriteria(
  deps: ExecutionDeps,
  parsed: ParsedInstruction,
): Promise<{ segmentId: string; customerCount: number; segmentName: string }> {
  // Map the parser's criteria → the CANONICAL conditions shape, so this path (the
  // Command Bar / instruction executor) resolves membership with the SAME query as
  // the chat agent and the segment detail view. One resolver, every entry point —
  // no more ad-hoc query that drifts from buildWhereFromConditions.
  const conditions = (parsed.params.segmentCriteria?.conditions ?? [])
    .map((c) => ({ field: FIELD_MAP[c.field] ?? c.field, op: OP_MAP[c.op] ?? "equals", value: c.value }))
    .filter((c) => c.value !== undefined && c.value !== null && c.value !== "");

  const requestedLimit = parsed.params.audienceLimit;
  if (
    requestedLimit !== undefined &&
    (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 500)
  ) {
    throw new Error("Audience limit must be a whole number between 1 and 500.");
  }
  const audienceLimit = requestedLimit;

  // GUARDRAIL: never silently create a broad all-customers "Custom Segment"
  // blob. A hard "top N" request is itself an explicit definition.
  if (conditions.length === 0 && !audienceLimit) {
    throw new Error(
      'I need a clear definition for that segment — e.g. "spent over ₹2,000" or "no order in 60 days". What should define it?',
    );
  }

  const canonical = {
    operator: parsed.params.segmentCriteria?.operator ?? ("AND" as const),
    conditions,
  };
  // Respect the requested name; fall back to a description of the rules — never a generic blob name.
  const segmentName =
    parsed.params.targetSegment?.trim() ||
    (audienceLimit
      ? `Top ${audienceLimit} customers`
      : describeConditions(conditions));
  const slug =
    segmentName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") +
    "-" + Date.now().toString(36);

  const where = buildWhereFromConditions(canonical, [deps.storeId]);
  let customerCount: number;
  let customerIds: string[] = [];

  if (audienceLimit) {
    const sort = parsed.params.audienceSort ?? "totalSpent";
    const orderBy =
      sort === "orderCount"
        ? { rfmScore: { orderCount: "desc" } }
        : sort === "predictedLtv"
          ? { lifetimeValue: { predictedLtv: "desc" } }
          : sort === "recent"
            ? { rfmScore: { lastOrderAt: "desc" } }
            : { rfmScore: { totalSpent: "desc" } };
    const customers = await (deps.prisma as any).customer.findMany({
      where,
      select: { id: true },
      orderBy,
      take: audienceLimit,
    });
    customerIds = customers.map((customer: { id: string }) => customer.id);
    customerCount = customerIds.length;
  } else {
    customerCount = await (deps.prisma as any).customer.count({ where });
  }

  const segment = await (deps.prisma as any).customerSegment.create({
    data: {
      storeId: deps.storeId,
      name: segmentName,
      slug,
      description: parsed.reasoning,
      kind: audienceLimit ? "manual" : "conditions",
      conditions: audienceLimit ? undefined : canonical,
      customerIds,
      customerCount,
      isSystem: false,
    },
  });

  return { segmentId: segment.id, customerCount, segmentName };
}

// ---------------------------------------------------------------------------
// Execute functions by intent
// ---------------------------------------------------------------------------

async function executeCreateSegment(
  parsed: ParsedInstruction,
  deps: ExecutionDeps,
): Promise<ExecutionResult> {
  const { segmentId, customerCount, segmentName } = await createSegmentFromCriteria(deps, parsed);

  return {
    intent: "create_segment",
    success: true,
    summary: `Created segment "${segmentName}" with ${customerCount} matching customers.`,
    created: { segmentId },
    tokenUsage: { input: 0, output: 0, model: "" },
  };
}

async function executeCreateAutomation(
  parsed: ParsedInstruction,
  deps: ExecutionDeps,
): Promise<ExecutionResult> {
  let totalInput = 0;
  let totalOutput = 0;
  let modelUsed = "";

  // Create segment if criteria provided
  let segmentName = parsed.params.targetSegment;
  if (parsed.params.segmentCriteria || parsed.params.audienceLimit) {
    const seg = await createSegmentFromCriteria(deps, parsed);
    segmentName = seg.segmentName;
  }

  // Fetch products for content generation
  const products = await (deps.prisma as any).product.findMany({
    where: { storeId: deps.storeId, status: "active" },
    take: 10,
    orderBy: { updatedAt: "desc" },
  });

  const store = await (deps.prisma as any).store.findUnique({
    where: { id: deps.storeId },
  });
  const storeUrl = store?.shopDomain ? `https://${store.shopDomain}` : undefined;

  const channels = parsed.params.channels ?? ["email"];
  const templateIds: string[] = [];
  const smsTemplateIds: string[] = [];
  const whatsappTemplateIds: string[] = [];
  const rcsTemplateIds: string[] = [];

  const category = parsed.params.automationType ?? "custom";
  const intent = category === "welcome_series" ? "welcome"
    : category === "abandoned_cart" ? "cart_recovery"
    : category === "post_purchase" ? "post_purchase"
    : category === "win_back" ? "win_back"
    : category === "re_engagement" ? "re_engagement"
    : category === "vip_reward" ? "vip_reward"
    : "promotion";

  // Generate email template
  if (channels.includes("email")) {
    const emailResult = await generateEmail({
      brandProfile: deps.brandProfile,
      intent: intent as any,
      segment: segmentName ? { name: segmentName, description: parsed.reasoning } : undefined,
      products: products.map((p: any) => ({
        id: p.id, title: p.title, description: p.description ?? undefined,
        imageUrl: p.imageUrl ?? undefined, price: p.price, handle: p.handle,
      })),
      storeUrl,
      context: parsed.params.discount ? {
        discount: {
          type: parsed.params.discount.type as "percentage" | "fixed",
          value: parsed.params.discount.value,
          code: parsed.params.discount.code,
        },
      } : undefined,
      creativeIntensity: (deps.brandProfile?.creativeIntensity as any) ?? "balanced",
      model: deps.model,
      modelHarness: deps.modelHarness,
    });

    const template = await (deps.prisma as any).emailTemplate.create({
      data: {
        workspaceId: deps.workspaceId,
        name: emailResult.subject,
        subject: emailResult.subject,
        previewText: emailResult.previewText,
        blocks: emailResult.blocks as any,
        category: "ai_generated",
      },
    });
    templateIds.push(template.id);
    totalInput += emailResult.inputTokens;
    totalOutput += emailResult.outputTokens;
    modelUsed = emailResult.model;
  }

  // Generate SMS template
  if (channels.includes("sms")) {
    const smsResult = await generateSms({
      brandProfile: deps.brandProfile,
      intent,
      segment: segmentName ? { name: segmentName, description: parsed.reasoning } : undefined,
      programType: category,
      model: deps.model,
      modelHarness: deps.modelHarness,
    });

    const smsTemplate = await (deps.prisma as any).smsTemplate.create({
      data: {
        workspaceId: deps.workspaceId,
        name: smsResult.name,
        body: smsResult.body,
        variables: smsResult.variables,
      },
    });
    smsTemplateIds.push(smsTemplate.id);
    totalInput += smsResult.inputTokens;
    totalOutput += smsResult.outputTokens;
    modelUsed = modelUsed || smsResult.model;
  }

  // Generate WhatsApp template
  if (channels.includes("whatsapp")) {
    const waResult = await generateWhatsApp({
      brandProfile: deps.brandProfile,
      intent,
      segment: segmentName ? { name: segmentName, description: parsed.reasoning } : undefined,
      programType: category,
      model: deps.model,
      modelHarness: deps.modelHarness,
    });

    const waTemplate = await (deps.prisma as any).whatsAppTemplate.create({
      data: {
        workspaceId: deps.workspaceId,
        name: waResult.name,
        body: waResult.body,
        variables: waResult.variables,
        category: "MARKETING",
        language: "en",
      },
    });
    whatsappTemplateIds.push(waTemplate.id);
    totalInput += waResult.inputTokens;
    totalOutput += waResult.outputTokens;
    modelUsed = modelUsed || waResult.model;
  }

  // Generate RCS template
  if (channels.includes("rcs")) {
    const rcsResult = await generateRcs({
      brandProfile: deps.brandProfile,
      intent,
      segment: segmentName ? { name: segmentName, description: parsed.reasoning } : undefined,
      programType: category,
      model: deps.model,
      modelHarness: deps.modelHarness,
    });

    const rcsTemplate = await (deps.prisma as any).rcsTemplate.create({
      data: {
        workspaceId: deps.workspaceId,
        name: rcsResult.name,
        body: rcsResult.body,
        cardTitle: rcsResult.cardTitle,
        cardImageUrl: rcsResult.cardImageUrl,
        actions: rcsResult.actions as any,
        variables: rcsResult.variables,
      },
    });
    rcsTemplateIds.push(rcsTemplate.id);
    totalInput += rcsResult.inputTokens;
    totalOutput += rcsResult.outputTokens;
    modelUsed = modelUsed || rcsResult.model;
  }

  // Generate workflow nodes
  const workflowResult = await generateWorkflow({
    programType: category,
    templateIds,
    smsTemplateIds,
    whatsappTemplateIds,
    rcsTemplateIds,
    triggerConfig: segmentName ? { segmentName } : {},
  });

  // Create the automation
  const automationName = parsed.params.campaignName
    ?? `${category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} Automation`;

  const automation = await (deps.prisma as any).automation.create({
    data: {
      workspaceId: deps.workspaceId,
      storeId: deps.storeId,
      name: automationName,
      description: parsed.reasoning,
      category,
      status: "ready",
      triggerType: category === "welcome_series" ? "event"
        : category === "abandoned_cart" ? "event"
        : "segment_entry",
      triggerConfig: segmentName ? { segmentName } : {},
      nodes: workflowResult.nodes as any,
      templateIds,
      smsTemplateIds,
      whatsappTemplateIds,
      rcsTemplateIds,
    },
  });

  const channelSummary = channels.map((c) => {
    const count = c === "email" ? templateIds.length
      : c === "sms" ? smsTemplateIds.length
      : c === "whatsapp" ? whatsappTemplateIds.length
      : rcsTemplateIds.length;
    return `${count} ${c.toUpperCase()}`;
  }).join(", ");

  return {
    intent: "create_automation",
    success: true,
    summary: `Created "${automationName}" automation with ${channelSummary} templates and workflow.${segmentName ? ` Target: ${segmentName}.` : ""}`,
    created: {
      automationId: automation.id,
      templateIds: [...templateIds, ...smsTemplateIds, ...whatsappTemplateIds, ...rcsTemplateIds],
    },
    tokenUsage: { input: totalInput, output: totalOutput, model: modelUsed },
  };
}

async function executeCreateCampaign(
  parsed: ParsedInstruction,
  deps: ExecutionDeps,
): Promise<ExecutionResult> {
  let normalizedDiscount:
    | { type: "percentage"; value: number; code: string }
    | undefined;
  if (parsed.params.discount) {
    if (parsed.params.discount.type !== "percentage") {
      throw new Error(
        "Natural-language campaign creation currently supports percentage discounts only.",
      );
    }
    const value = Number(parsed.params.discount.value);
    if (!Number.isFinite(value) || value < 1 || value > 50) {
      throw new Error("Discount percentage must be between 1% and 50%.");
    }
    const requestedCode = parsed.params.discount.code
      ?.toUpperCase()
      .replace(/[^A-Z0-9-]/g, "")
      .slice(0, 32);
    normalizedDiscount = {
      type: "percentage",
      value,
      code:
        requestedCode ||
        `JOON${Math.round(value)}-${randomUUID().slice(0, 6).toUpperCase()}`,
    };
  }

  // Create segment if needed
  let segmentId: string | undefined;
  let segmentName = parsed.params.targetSegment;
  if (parsed.params.segmentCriteria || parsed.params.audienceLimit) {
    const seg = await createSegmentFromCriteria(deps, parsed);
    segmentId = seg.segmentId;
    segmentName = seg.segmentName;
  } else if (segmentName) {
    // Try to find existing segment
    const existing = await (deps.prisma as any).customerSegment.findFirst({
      where: { storeId: deps.storeId, name: { contains: segmentName, mode: "insensitive" } },
    });
    segmentId = existing?.id;
  }

  // Fetch products
  const products = await (deps.prisma as any).product.findMany({
    where: { storeId: deps.storeId, status: "active" },
    take: 10,
    orderBy: { updatedAt: "desc" },
  });

  const store = await (deps.prisma as any).store.findUnique({ where: { id: deps.storeId } });
  const storeUrl = store?.shopDomain ? `https://${store.shopDomain}` : undefined;

  // Generate email
  const emailResult = await generateEmail({
    brandProfile: deps.brandProfile,
    intent: "promotion",
    segment: segmentName ? { name: segmentName, description: parsed.reasoning } : undefined,
    products: products.map((p: any) => ({
      id: p.id, title: p.title, description: p.description ?? undefined,
      imageUrl: p.imageUrl ?? undefined, price: p.price, handle: p.handle,
    })),
    storeUrl,
    context: normalizedDiscount ? {
      discount: {
        type: normalizedDiscount.type,
        value: normalizedDiscount.value,
        code: normalizedDiscount.code,
      },
    } : undefined,
    creativeIntensity: (deps.brandProfile?.creativeIntensity as any) ?? "balanced",
    model: deps.model,
    modelHarness: deps.modelHarness,
  });

  const template = await (deps.prisma as any).emailTemplate.create({
    data: {
      workspaceId: deps.workspaceId,
      name: emailResult.subject,
      subject: emailResult.subject,
      previewText: emailResult.previewText,
      blocks: emailResult.blocks as any,
      category: "ai_generated",
    },
  });

  const campaignName = parsed.params.campaignName ?? emailResult.subject;

  const campaign = await (deps.prisma as any).campaign.create({
    data: {
      workspaceId: deps.workspaceId,
      storeId: deps.storeId,
      name: campaignName,
      templateId: template.id,
      segmentId: segmentId ?? null,
      status: "draft",
      scheduledAt: parsed.params.scheduledAt ? new Date(parsed.params.scheduledAt) : null,
      agentProposal: {
        source: "natural_language_instruction",
        intent: "promotion",
        segmentId: segmentId ?? null,
        segmentName: segmentName ?? null,
        channel: "email",
        discountPercent: normalizedDiscount?.value ?? null,
        discountCode: normalizedDiscount?.code ?? null,
      },
    },
  });

  return {
    intent: "create_campaign",
    success: true,
    summary: `Created campaign "${campaignName}" with email template.${segmentName ? ` Target: ${segmentName}.` : ""} Status: draft.`,
    created: {
      campaignId: campaign.id,
      templateIds: [template.id],
    },
    tokenUsage: {
      input: emailResult.inputTokens,
      output: emailResult.outputTokens,
      model: emailResult.model,
    },
  };
}

async function executeCreateTemplate(
  parsed: ParsedInstruction,
  deps: ExecutionDeps,
): Promise<ExecutionResult> {
  const templateType = parsed.params.templateType ?? "email";

  const products = await (deps.prisma as any).product.findMany({
    where: { storeId: deps.storeId, status: "active" },
    take: 10,
    orderBy: { updatedAt: "desc" },
  });
  const store = await (deps.prisma as any).store.findUnique({ where: { id: deps.storeId } });
  const storeUrl = store?.shopDomain ? `https://${store.shopDomain}` : undefined;

  if (templateType === "email") {
    const result = await generateEmail({
      brandProfile: deps.brandProfile,
      intent: "promotion",
      products: products.map((p: any) => ({
        id: p.id, title: p.title, description: p.description ?? undefined,
        imageUrl: p.imageUrl ?? undefined, price: p.price, handle: p.handle,
      })),
      storeUrl,
      creativeIntensity: (deps.brandProfile?.creativeIntensity as any) ?? "balanced",
      model: deps.model,
      modelHarness: deps.modelHarness,
      tweaks: parsed.params.tone ? `Tone: ${parsed.params.tone}` : undefined,
    });

    const template = await (deps.prisma as any).emailTemplate.create({
      data: {
        workspaceId: deps.workspaceId,
        name: result.subject,
        subject: result.subject,
        previewText: result.previewText,
        blocks: result.blocks as any,
        category: "ai_generated",
      },
    });

    return {
      intent: "create_template",
      success: true,
      summary: `Created email template "${result.subject}".`,
      created: { templateIds: [template.id] },
      tokenUsage: { input: result.inputTokens, output: result.outputTokens, model: result.model },
    };
  }

  if (templateType === "sms") {
    const result = await generateSms({
      brandProfile: deps.brandProfile,
      intent: parsed.params.theme ?? "promotion",
      programType: "custom",
      model: deps.model,
      modelHarness: deps.modelHarness,
    });

    const template = await (deps.prisma as any).smsTemplate.create({
      data: {
        workspaceId: deps.workspaceId,
        name: result.name,
        body: result.body,
        variables: result.variables,
      },
    });

    return {
      intent: "create_template",
      success: true,
      summary: `Created SMS template "${result.name}".`,
      created: { templateIds: [template.id] },
      tokenUsage: { input: result.inputTokens, output: result.outputTokens, model: result.model },
    };
  }

  // Default: generate email
  return executeCreateTemplate({ ...parsed, params: { ...parsed.params, templateType: "email" } }, deps);
}

async function executeAnalyzeCustomers(
  parsed: ParsedInstruction,
  deps: ExecutionDeps,
): Promise<ExecutionResult> {
  // Build query from criteria
  const where: Record<string, unknown> = { storeId: deps.storeId };
  if (parsed.params.segmentCriteria) {
    for (const cond of parsed.params.segmentCriteria.conditions) {
      if (cond.field === "segment") {
        where["rfmScore"] = { segment: cond.value };
      }
    }
  }

  const totalCustomers = await (deps.prisma as any).customer.count({ where: { storeId: deps.storeId } });
  const matchingCustomers = await (deps.prisma as any).customer.count({ where });

  const segments = await (deps.prisma as any).customerSegment.findMany({
    where: { storeId: deps.storeId },
    select: { name: true, customerCount: true },
    orderBy: { customerCount: "desc" },
    take: 5,
  });

  const segmentSummary = segments.map((s: any) => `${s.name}: ${s.customerCount}`).join(", ");

  return {
    intent: "analyze_customers",
    success: true,
    summary: `Total customers: ${totalCustomers}. Matching your criteria: ${matchingCustomers}. Top segments: ${segmentSummary || "none"}.`,
    created: {},
    tokenUsage: { input: 0, output: 0, model: "" },
  };
}

// ---------------------------------------------------------------------------
// Main executor
// ---------------------------------------------------------------------------

export async function executeInstruction(
  parsed: ParsedInstruction,
  deps: ExecutionDeps,
): Promise<ExecutionResult> {
  switch (parsed.intent) {
    case "create_segment":
      return executeCreateSegment(parsed, deps);
    case "create_automation":
      return executeCreateAutomation(parsed, deps);
    case "create_campaign":
      return executeCreateCampaign(parsed, deps);
    case "create_template":
      return executeCreateTemplate(parsed, deps);
    case "analyze_customers":
      return executeAnalyzeCustomers(parsed, deps);
    case "modify_existing":
      return {
        intent: "modify_existing",
        success: false,
        summary: "Modifying existing items is not yet supported. Please edit directly in the UI.",
        created: {},
        tokenUsage: { input: 0, output: 0, model: "" },
      };
    default:
      return {
        intent: parsed.intent,
        success: false,
        summary: `Unknown intent: ${parsed.intent}`,
        created: {},
        tokenUsage: { input: 0, output: 0, model: "" },
      };
  }
}
