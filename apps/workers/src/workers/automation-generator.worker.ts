import { Worker } from "bullmq";
import { prisma } from "@allohq/database";
import {
  activateProgram,
  generateSms,
  generateWhatsApp,
  generateRcs,
  generateWorkflow,
} from "@allohq/customer-intelligence";
import type { AIModelId } from "@allohq/customer-intelligence";
import { redisConnection, QUEUE_NAMES } from "../config";
import { isV1ReleaseMode, assertV1EmailAutomation } from "@allohq/release-gate";

interface AutomationGenerateJobData {
  automationId: string;
  storeId: string;
  model?: string;
}

/** Maps categories to their target RFM segments */
const SEGMENT_TARGETS: Record<string, string[]> = {
  win_back: ["At Risk", "Lost", "Hibernating"],
  vip_reward: ["Champions", "Loyal Customers"],
  re_engagement: ["Hibernating", "Can't Lose Them"],
};

export const automationGeneratorWorker = new Worker<AutomationGenerateJobData>(
  QUEUE_NAMES.AUTOMATION_GENERATE,
  async (job) => {
    const { automationId, storeId } = job.data;

    console.log(`[automation-generator] Generating content for automation ${automationId}`);

    const automation = await prisma.automation.findUnique({
      where: { id: automationId },
    });

    if (!automation) {
      throw new Error(`Automation ${automationId} not found`);
    }

    const workspaceId = automation.workspaceId;

    const brandProfile = await prisma.brandProfile.findFirst({
      where: { storeId, workspaceId },
    });

    const products = await prisma.product.findMany({
      where: { storeId, status: "active" },
      take: 15,
      orderBy: { updatedAt: "desc" },
    });

    const store = await prisma.store.findUnique({ where: { id: storeId } });
    const storeUrl = store ? `https://${store.shopDomain}` : undefined;

    // Resolve model
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { defaultModel: true, modelHarness: true },
    });
    const resolvedModel =
      (job.data.model as AIModelId) ||
      (!workspace?.modelHarness
        ? (workspace?.defaultModel as AIModelId | null) ?? undefined
        : undefined);
    const modelHarness = workspace?.modelHarness;
    // A call-level model remains an intentional one-off override. Otherwise the
    // workspace harness selects the creative route and its fallback chain.
    const aiModel = resolvedModel;

    const creativeIntensity = (brandProfile?.creativeIntensity as "text_heavy" | "balanced" | "visual_heavy") ?? undefined;

    const brandInput = brandProfile
      ? {
          brandName: brandProfile.brandName,
          brandDescription: brandProfile.brandDescription,
          toneAttributes: brandProfile.toneAttributes as Record<string, string>,
          vocabulary: brandProfile.vocabulary as Record<string, string[]>,
          visualStyle: brandProfile.visualStyle as Record<string, string>,
          sampleCopy: brandProfile.sampleCopy as string[],
        }
      : undefined;

    const productInput = products.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description ?? undefined,
      imageUrl: p.imageUrl ?? undefined,
      price: p.price,
      handle: p.handle,
    }));

    // Look up target segment
    const targetSegmentNames = SEGMENT_TARGETS[automation.category] ?? [];
    let segment: { name: string; description: string } | undefined;
    if (targetSegmentNames.length > 0) {
      const seg = await prisma.customerSegment.findFirst({
        where: { storeId, name: { in: targetSegmentNames } },
      });
      if (seg) {
        segment = { name: seg.name, description: seg.description ?? seg.name };
      }
    }

    await prisma.automation.update({
      where: { id: automationId },
      data: { status: "generating" },
    });

    // Idempotency (retry-safe): a failed attempt (attempts:2) may have created partial
    // templates. Clear this automation's prior templates so a retry produces exactly ONE
    // set per channel — never duplicates / double-charges accumulating across attempts.
    await Promise.all([
      automation.templateIds?.length
        ? prisma.emailTemplate.deleteMany({ where: { id: { in: automation.templateIds } } })
        : Promise.resolve(),
      prisma.smsTemplate.deleteMany({ where: { automationId } }),
      prisma.whatsAppTemplate.deleteMany({ where: { automationId } }),
      prisma.rcsTemplate.deleteMany({ where: { automationId } }),
    ]);

    // -- 1. GENERATE EMAILS --
    const emailResults = await activateProgram({
      programType: automation.category,
      storeId,
      storeUrl,
      model: aiModel,
      modelHarness,
      creativeIntensity,
      brandProfile: brandInput,
      segment,
      products: productInput,
    });

    const templateIds: string[] = [];
    for (const result of emailResults) {
      // Dedup: skip if template with same name already exists
      const templateName = `${automation.name} — ${result.subject}`;
      const existingTemplate = await prisma.emailTemplate.findFirst({
        where: { workspaceId, name: templateName },
      });
      if (existingTemplate) {
        templateIds.push(existingTemplate.id);
        continue;
      }

      const template = await prisma.emailTemplate.create({
        data: {
          workspaceId,
          name: templateName,
          subject: result.subject,
          previewText: result.previewText,
          blocks: result.blocks as any,
          category: "ai_generated",
        },
      });
      templateIds.push(template.id);

      await prisma.generatedContent.create({
        data: {
          workspaceId,
          templateId: template.id,
          prompt: result.promptUsed,
          response: JSON.stringify(result),
          model: result.model,
          intent: automation.category,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        },
      });

      await prisma.tokenUsage.create({
        data: {
          workspaceId,
          model: result.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          purpose: "generate_email",
        },
      });
    }

    const emailOnly = isV1ReleaseMode();

    // -- 2. GENERATE SMS (post-v1 only) --
    const smsTemplateIds: string[] = [];
    if (!emailOnly) try {
      const smsResult = await generateSms({
        brandProfile: brandInput,
        intent: automation.category,
        segment,
        programType: automation.category,
        model: aiModel,
        modelHarness,
      });

      const smsTemplate = await prisma.smsTemplate.create({
        data: {
          workspaceId,
          automationId,
          name: smsResult.name,
          body: smsResult.body,
          variables: smsResult.variables as any,
        },
      });

      smsTemplateIds.push(smsTemplate.id);

      await prisma.tokenUsage.create({
        data: {
          workspaceId,
          model: smsResult.model,
          inputTokens: smsResult.inputTokens,
          outputTokens: smsResult.outputTokens,
          purpose: "generate_sms",
        },
      });
    } catch (smsErr) {
      console.error(`[automation-generator] SMS generation failed for ${automation.name}:`, smsErr);
    }

    // -- 3. GENERATE WHATSAPP (post-v1 only) --
    const whatsappTemplateIds: string[] = [];
    if (!emailOnly) try {
      const waResult = await generateWhatsApp({
        brandProfile: brandInput,
        intent: automation.category,
        segment,
        programType: automation.category,
        model: aiModel,
        modelHarness,
      });

      const waTemplate = await prisma.whatsAppTemplate.create({
        data: {
          workspaceId,
          automationId,
          name: waResult.name,
          body: waResult.body,
          variables: waResult.variables as any,
          category: "MARKETING",
          language: "en",
        },
      });

      whatsappTemplateIds.push(waTemplate.id);

      await prisma.tokenUsage.create({
        data: {
          workspaceId,
          model: waResult.model,
          inputTokens: waResult.inputTokens,
          outputTokens: waResult.outputTokens,
          purpose: "generate_whatsapp",
        },
      });
    } catch (waErr) {
      console.error(`[automation-generator] WhatsApp generation failed for ${automation.name}:`, waErr);
    }

    // -- 4. GENERATE RCS (post-v1 only) --
    const rcsTemplateIds: string[] = [];
    if (!emailOnly) try {
      const rcsResult = await generateRcs({
        brandProfile: brandInput,
        intent: automation.category,
        segment,
        programType: automation.category,
        model: aiModel,
        modelHarness,
      });

      const rcsTemplate = await prisma.rcsTemplate.create({
        data: {
          workspaceId,
          automationId,
          name: rcsResult.name,
          body: rcsResult.body,
          cardTitle: rcsResult.cardTitle,
          cardImageUrl: rcsResult.cardImageUrl,
          actions: rcsResult.actions as any,
          variables: rcsResult.variables as any,
        },
      });

      rcsTemplateIds.push(rcsTemplate.id);

      await prisma.tokenUsage.create({
        data: {
          workspaceId,
          model: rcsResult.model,
          inputTokens: rcsResult.inputTokens,
          outputTokens: rcsResult.outputTokens,
          purpose: "generate_rcs",
        },
      });
    } catch (rcsErr) {
      console.error(`[automation-generator] RCS generation failed for ${automation.name}:`, rcsErr);
    }

    // -- 5. GENERATE WORKFLOW NODES --
    const allTemplates = await prisma.emailTemplate.findMany({
      where: { id: { in: templateIds } },
      select: { id: true, name: true, subject: true },
    });
    const templateNameMap = new Map(allTemplates.map((t) => [t.id, t.subject || t.name]));

    const waTemplates = whatsappTemplateIds.length > 0
      ? await prisma.whatsAppTemplate.findMany({ where: { id: { in: whatsappTemplateIds } }, select: { id: true, name: true } })
      : [];
    const waNameMap = new Map(waTemplates.map((t) => [t.id, t.name]));

    const smsTemplates = smsTemplateIds.length > 0
      ? await prisma.smsTemplate.findMany({ where: { id: { in: smsTemplateIds } }, select: { id: true, name: true } })
      : [];
    const smsNameMap = new Map(smsTemplates.map((t) => [t.id, t.name]));

    const rcsTemplatesForMap = rcsTemplateIds.length > 0
      ? await prisma.rcsTemplate.findMany({ where: { id: { in: rcsTemplateIds } }, select: { id: true, name: true } })
      : [];
    const rcsNameMap = new Map(rcsTemplatesForMap.map((t) => [t.id, t.name]));

    const workflowDef = generateWorkflow({
      programType: automation.category,
      templateIds,
      whatsappTemplateIds,
      smsTemplateIds,
      rcsTemplateIds,
      triggerConfig: automation.triggerConfig as Record<string, unknown>,
    });

    const enrichedNodes = workflowDef.nodes.map((node) => {
      if (node.type === "send_email" && typeof node.config.templateId === "string") {
        return { ...node, config: { ...node.config, templateName: templateNameMap.get(node.config.templateId) ?? "Email" } };
      }
      if (node.type === "send_whatsapp" && typeof node.config.whatsappTemplateId === "string") {
        return { ...node, config: { ...node.config, templateName: waNameMap.get(node.config.whatsappTemplateId) ?? "WhatsApp" } };
      }
      if (node.type === "send_sms" && typeof node.config.smsTemplateId === "string") {
        return { ...node, config: { ...node.config, templateName: smsNameMap.get(node.config.smsTemplateId) ?? "SMS" } };
      }
      if (node.type === "send_rcs" && typeof node.config.rcsTemplateId === "string") {
        return { ...node, config: { ...node.config, templateName: rcsNameMap.get(node.config.rcsTemplateId) ?? "RCS" } };
      }
      return node;
    });
    assertV1EmailAutomation({
      nodes: enrichedNodes,
      smsTemplateIds,
      whatsappTemplateIds,
      rcsTemplateIds,
    });

    // -- 6. UPDATE AUTOMATION WITH ALL GENERATED DATA --
    // Partial-failure guard: a workflow node pointing at a template we FAILED to
    // generate is a dangling step that would break at send time. Never present that
    // as "ready" — mark it "incomplete" with a reason so it isn't activated blind.
    const danglingChannels = new Set<string>();
    for (const n of enrichedNodes as Array<{ type: string; config: Record<string, unknown> }>) {
      if (n.type === "send_email" && !templateIds.includes(String(n.config.templateId ?? ""))) danglingChannels.add("email");
      if (n.type === "send_sms" && !smsTemplateIds.includes(String(n.config.smsTemplateId ?? ""))) danglingChannels.add("SMS");
      if (n.type === "send_whatsapp" && !whatsappTemplateIds.includes(String(n.config.whatsappTemplateId ?? ""))) danglingChannels.add("WhatsApp");
      if (n.type === "send_rcs" && !rcsTemplateIds.includes(String(n.config.rcsTemplateId ?? ""))) danglingChannels.add("RCS");
    }
    const incomplete = danglingChannels.size > 0;
    const reason = incomplete ? `couldn't generate ${[...danglingChannels].join(", ")} content` : "";
    if (incomplete) {
      console.error(`[automation-generator] ${automation.name} INCOMPLETE — ${reason}; marking not-ready (no dangling activation).`);
    }

    await prisma.automation.update({
      where: { id: automationId },
      data: {
        status: incomplete ? "incomplete" : "ready",
        ...(incomplete && !(automation.description ?? "").startsWith("⚠")
          ? { description: `⚠ Incomplete — ${reason}. ${automation.description ?? ""}`.trim() }
          : {}),
        templateIds,
        smsTemplateIds,
        whatsappTemplateIds,
        rcsTemplateIds,
        triggerType: workflowDef.triggerType,
        triggerConfig: workflowDef.triggerConfig as any,
        nodes: enrichedNodes as any,
      },
    });

    console.log(
      `[automation-generator] ${automation.name} generated ${templateIds.length} emails, ` +
      `${smsTemplateIds.length} SMS, ${whatsappTemplateIds.length} WhatsApp, ` +
      `${rcsTemplateIds.length} RCS + workflow nodes`
    );
    return { templateIds, smsTemplateIds, whatsappTemplateIds, rcsTemplateIds };
  },
  {
    connection: redisConnection,
    concurrency: 1, // Process one at a time to avoid API rate limits
    settings: {
      backoffStrategy: (attemptsMade: number) => Math.min(attemptsMade * 30000, 120000), // 30s, 60s, 120s backoff
    },
  }
);

automationGeneratorWorker.on("completed", (job) => {
  console.log(`[automation-generator] Job ${job.id} completed`);
});

automationGeneratorWorker.on("failed", async (job, err) => {
  console.error(`[automation-generator] Job ${job?.id} failed:`, err.message);
  // Never leave the automation stuck in "generating" forever. The generation body
  // (esp. the email-gen LLM call) can throw uncaught — typically OpenAI at quota —
  // and the status was set to "generating" before it ran. Once retries are
  // exhausted, mark it "failed" so the app stops waiting on it. This also lets
  // activation resolve (a failed automation has generating=0, so isActivating /
  // the setup view no longer hang). Root-cause fix (route generation to Claude /
  // handle quota with fallback) lives in the AI gateway — tracked separately.
  const automationId = job?.data?.automationId as string | undefined;
  const exhausted = !job || job.attemptsMade >= (job.opts?.attempts ?? 1);
  if (automationId && exhausted) {
    try {
      await prisma.automation.update({
        where: { id: automationId },
        data: { status: "failed" },
      });
      console.error(
        `[automation-generator] marked automation ${automationId} as failed (was stuck generating)`,
      );
    } catch (e) {
      console.error(
        `[automation-generator] could not mark ${automationId} failed:`,
        (e as Error).message,
      );
    }
  }
});
