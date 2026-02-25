import { Worker } from "bullmq";
import { prisma } from "@allohq/database";
import {
  recommendPrograms,
  activateProgram,
  generateWhatsApp,
  generateSms,
  generateRcs,
  generateWorkflow,
} from "@allohq/customer-intelligence";
import type { AIModelId } from "@allohq/customer-intelligence";
import { redisConnection, QUEUE_NAMES } from "../config";

/** Max programs the agent will generate in a single run */
const MAX_PROGRAMS = 4;

interface AgentPipelineJobData {
  pipelineRunId: string;
  storeId: string;
  workspaceId: string;
  model?: string;
}

/** Maps program types to their target RFM segments */
const SEGMENT_TARGETS: Record<string, string[]> = {
  win_back: ["At Risk", "Lost", "Hibernating"],
  vip_reward: ["Champions", "Loyal Customers"],
  re_engagement: ["Hibernating", "Can't Lose Them"],
};

type Phase =
  | "recommend"
  | "generate_email"
  | "generate_sms"
  | "generate_whatsapp"
  | "generate_rcs"
  | "create_workflow"
  | "activate"
  | "done";

async function updatePipeline(
  runId: string,
  phase: Phase,
  progress: Record<string, unknown>,
  extra?: Record<string, unknown>
) {
  await prisma.agentPipelineRun.update({
    where: { id: runId },
    data: {
      phase,
      progress: progress as any,
      ...extra,
    },
  });
}

export const agentPipelineWorker = new Worker<AgentPipelineJobData>(
  QUEUE_NAMES.AGENT_PIPELINE,
  async (job) => {
    const { pipelineRunId, storeId, workspaceId, model } = job.data;

    // Resolve model: job data > workspace default > undefined (AI client default)
    let resolvedModel = (model as AIModelId) || undefined;
    if (!resolvedModel) {
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { defaultModel: true },
      });
      resolvedModel = (workspace?.defaultModel as AIModelId) || undefined;
    }
    const aiModel = resolvedModel;

    console.log(`[agent-pipeline] Starting pipeline ${pipelineRunId}`);

    await prisma.agentPipelineRun.update({
      where: { id: pipelineRunId },
      data: { status: "running", startedAt: new Date(), jobId: job.id },
    });

    try {
      // ---------------------------------------------------------------
      // 1. RECOMMEND
      // ---------------------------------------------------------------
      await updatePipeline(pipelineRunId, "recommend", {
        message: "Analyzing store data and recommending programs...",
      });

      const segments = await prisma.customerSegment.findMany({
        where: { storeId },
      });
      const productCount = await prisma.product.count({
        where: { storeId },
      });
      const customerCount = await prisma.customer.count({
        where: { storeId },
      });

      const recommendations = recommendPrograms({
        segments: segments.map((s) => ({
          name: s.name,
          customerCount: s.customerCount,
        })),
        productCount,
        customerCount,
      });

      // Upsert programs — all recommendations, but only process top N
      const allProgramIds: string[] = [];
      for (const rec of recommendations) {
        const existing = await prisma.emailProgram.findFirst({
          where: { workspaceId, storeId, programType: rec.programType },
        });

        if (existing) {
          if (existing.status !== "recommended") {
            continue;
          }
          allProgramIds.push(existing.id);
        } else {
          const program = await prisma.emailProgram.create({
            data: {
              workspaceId,
              storeId,
              programType: rec.programType,
              name: rec.name,
              description: rec.description,
              status: "recommended",
              templateIds: [],
              whatsappTemplateIds: [],
              smsTemplateIds: [],
              rcsTemplateIds: [],
              triggerConfig: rec.triggerConfig as any,
            },
          });
          allProgramIds.push(program.id);
        }
      }

      // Only process the top MAX_PROGRAMS (highest priority first, already sorted)
      const programIds = allProgramIds.slice(0, MAX_PROGRAMS);
      const totalPrograms = programIds.length;

      await updatePipeline(
        pipelineRunId,
        "recommend",
        {
          message: `Recommended ${allProgramIds.length} programs, generating content for top ${totalPrograms}`,
        },
        { programsCount: totalPrograms }
      );

      // Fetch shared data
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

      const brandInput = brandProfile
        ? {
            brandName: brandProfile.brandName,
            brandDescription: brandProfile.brandDescription,
            toneAttributes: brandProfile.toneAttributes as Record<
              string,
              string
            >,
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

      let done = 0;

      // ---------------------------------------------------------------
      // 2. FOR EACH PROGRAM (limited to MAX_PROGRAMS)
      // ---------------------------------------------------------------
      for (const programId of programIds) {
        const program = await prisma.emailProgram.findUnique({
          where: { id: programId },
        });
        if (!program || program.status !== "recommended") {
          done++;
          continue;
        }

        try {
          // -- 2a. GENERATE EMAILS --
          await updatePipeline(pipelineRunId, "generate_email", {
            message: `Generating emails for ${program.name} (${done + 1}/${totalPrograms})...`,
            currentProgram: program.name,
            programsDone: done,
            programsTotal: totalPrograms,
          });

          // Look up target segment
          const targetSegmentNames =
            SEGMENT_TARGETS[program.programType] ?? [];
          let segment: { name: string; description: string } | undefined;
          if (targetSegmentNames.length > 0) {
            const seg = await prisma.customerSegment.findFirst({
              where: {
                storeId,
                name: { in: targetSegmentNames },
              },
            });
            if (seg) {
              segment = {
                name: seg.name,
                description: seg.description ?? seg.name,
              };
            }
          }

          await prisma.emailProgram.update({
            where: { id: programId },
            data: { status: "generating" },
          });

          const emailResults = await activateProgram({
            programType: program.programType,
            storeId,
            storeUrl,
            model: aiModel,
            brandProfile: brandInput,
            segment,
            products: productInput,
          });

          // Create email templates and record token usage
          const templateIds: string[] = [];
          for (const result of emailResults) {
            const template = await prisma.emailTemplate.create({
              data: {
                workspaceId,
                name: `${program.name} — ${result.subject}`,
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
                intent: program.programType,
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

          await prisma.emailProgram.update({
            where: { id: programId },
            data: { templateIds },
          });

          // -- 2b. GENERATE SMS (for ALL programs) --
          const smsTemplateIds: string[] = [];
          await updatePipeline(pipelineRunId, "generate_sms", {
            message: `Generating SMS for ${program.name} (${done + 1}/${totalPrograms})...`,
            currentProgram: program.name,
            programsDone: done,
            programsTotal: totalPrograms,
          });

          try {
            const smsResult = await generateSms({
              brandProfile: brandInput,
              intent: program.programType,
              segment,
              programType: program.programType,
              model: aiModel,
            });

            const smsTemplate = await prisma.smsTemplate.create({
              data: {
                workspaceId,
                programId: programId,
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

            await prisma.emailProgram.update({
              where: { id: programId },
              data: { smsTemplateIds },
            });
          } catch (smsErr) {
            console.error(
              `[agent-pipeline] SMS generation failed for ${program.name}:`,
              smsErr
            );
          }

          // -- 2c. GENERATE WHATSAPP (for ALL programs) --
          const whatsappTemplateIds: string[] = [];
          await updatePipeline(pipelineRunId, "generate_whatsapp", {
            message: `Generating WhatsApp message for ${program.name} (${done + 1}/${totalPrograms})...`,
            currentProgram: program.name,
            programsDone: done,
            programsTotal: totalPrograms,
          });

          try {
            const waResult = await generateWhatsApp({
              brandProfile: brandInput,
              intent: program.programType,
              segment,
              programType: program.programType,
              model: aiModel,
            });

            const waTemplate = await prisma.whatsAppTemplate.create({
              data: {
                workspaceId,
                programId: programId,
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

            await prisma.emailProgram.update({
              where: { id: programId },
              data: { whatsappTemplateIds },
            });
          } catch (waErr) {
            console.error(
              `[agent-pipeline] WhatsApp generation failed for ${program.name}:`,
              waErr
            );
          }

          // -- 2d. GENERATE RCS (for ALL programs) --
          const rcsTemplateIds: string[] = [];
          await updatePipeline(pipelineRunId, "generate_rcs", {
            message: `Generating RCS message for ${program.name} (${done + 1}/${totalPrograms})...`,
            currentProgram: program.name,
            programsDone: done,
            programsTotal: totalPrograms,
          });

          try {
            const rcsResult = await generateRcs({
              brandProfile: brandInput,
              intent: program.programType,
              segment,
              programType: program.programType,
              model: aiModel,
            });

            const rcsTemplate = await prisma.rcsTemplate.create({
              data: {
                workspaceId,
                programId: programId,
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

            await prisma.emailProgram.update({
              where: { id: programId },
              data: { rcsTemplateIds },
            });
          } catch (rcsErr) {
            console.error(
              `[agent-pipeline] RCS generation failed for ${program.name}:`,
              rcsErr
            );
          }

          // -- 2e. CREATE WORKFLOW (multi-channel) --
          await updatePipeline(pipelineRunId, "create_workflow", {
            message: `Creating multi-channel workflow for ${program.name} (${done + 1}/${totalPrograms})...`,
            currentProgram: program.name,
            programsDone: done,
            programsTotal: totalPrograms,
          });

          // Build name maps for node enrichment
          const allTemplates = await prisma.emailTemplate.findMany({
            where: { id: { in: templateIds } },
            select: { id: true, name: true, subject: true },
          });
          const templateNameMap = new Map(
            allTemplates.map((t) => [t.id, t.subject || t.name])
          );

          const waTemplates =
            whatsappTemplateIds.length > 0
              ? await prisma.whatsAppTemplate.findMany({
                  where: { id: { in: whatsappTemplateIds } },
                  select: { id: true, name: true },
                })
              : [];
          const waNameMap = new Map(waTemplates.map((t) => [t.id, t.name]));

          const smsTemplates =
            smsTemplateIds.length > 0
              ? await prisma.smsTemplate.findMany({
                  where: { id: { in: smsTemplateIds } },
                  select: { id: true, name: true },
                })
              : [];
          const smsNameMap = new Map(smsTemplates.map((t) => [t.id, t.name]));

          const rcsTemplatesForMap =
            rcsTemplateIds.length > 0
              ? await prisma.rcsTemplate.findMany({
                  where: { id: { in: rcsTemplateIds } },
                  select: { id: true, name: true },
                })
              : [];
          const rcsNameMap = new Map(rcsTemplatesForMap.map((t) => [t.id, t.name]));

          const workflowDef = generateWorkflow({
            programType: program.programType,
            templateIds,
            whatsappTemplateIds,
            smsTemplateIds,
            rcsTemplateIds,
            triggerConfig: program.triggerConfig as Record<string, unknown>,
          });

          // Enrich workflow nodes with human-readable names
          const enrichedNodes = workflowDef.nodes.map((node) => {
            if (
              node.type === "send_email" &&
              node.config.templateId &&
              typeof node.config.templateId === "string"
            ) {
              return {
                ...node,
                config: {
                  ...node.config,
                  templateName:
                    templateNameMap.get(node.config.templateId) ?? "Email",
                },
              };
            }
            if (
              node.type === "send_whatsapp" &&
              node.config.whatsappTemplateId &&
              typeof node.config.whatsappTemplateId === "string"
            ) {
              return {
                ...node,
                config: {
                  ...node.config,
                  templateName:
                    waNameMap.get(node.config.whatsappTemplateId) ?? "WhatsApp",
                },
              };
            }
            if (
              node.type === "send_sms" &&
              node.config.smsTemplateId &&
              typeof node.config.smsTemplateId === "string"
            ) {
              return {
                ...node,
                config: {
                  ...node.config,
                  templateName:
                    smsNameMap.get(node.config.smsTemplateId) ?? "SMS",
                },
              };
            }
            if (
              node.type === "send_rcs" &&
              node.config.rcsTemplateId &&
              typeof node.config.rcsTemplateId === "string"
            ) {
              return {
                ...node,
                config: {
                  ...node.config,
                  templateName:
                    rcsNameMap.get(node.config.rcsTemplateId) ?? "RCS",
                },
              };
            }
            return node;
          });

          const workflow = await prisma.workflow.create({
            data: {
              workspaceId,
              storeId,
              name: `${program.name} — Automation`,
              description: `Auto-generated multi-channel workflow for ${program.name}`,
              status: "draft",
              triggerType: workflowDef.triggerType,
              triggerConfig: workflowDef.triggerConfig as any,
              nodes: enrichedNodes as any,
            },
          });

          // -- 2f. MARK READY (human reviews before activating) --
          await prisma.emailProgram.update({
            where: { id: programId },
            data: { status: "ready", workflowId: workflow.id },
          });

          done++;
          await updatePipeline(
            pipelineRunId,
            "create_workflow",
            {
              message: `${program.name} ready for review (${done}/${totalPrograms})`,
              currentProgram: program.name,
              programsDone: done,
              programsTotal: totalPrograms,
            },
            { programsDone: done }
          );
        } catch (progErr) {
          console.error(
            `[agent-pipeline] Failed for program ${program.name}:`,
            progErr
          );
          await prisma.emailProgram.update({
            where: { id: programId },
            data: { status: "recommended" },
          });
          done++;
          await prisma.agentPipelineRun.update({
            where: { id: pipelineRunId },
            data: { programsDone: done },
          });
        }
      }

      // ---------------------------------------------------------------
      // 3. DONE
      // ---------------------------------------------------------------
      await prisma.agentPipelineRun.update({
        where: { id: pipelineRunId },
        data: {
          status: "completed",
          phase: "done",
          progress: {
            message: `${done} program${done !== 1 ? "s" : ""} ready for review!`,
            programsDone: done,
            programsTotal: totalPrograms,
          } as any,
          programsDone: done,
          completedAt: new Date(),
        },
      });

      console.log(
        `[agent-pipeline] Pipeline ${pipelineRunId} completed: ${done}/${totalPrograms} programs ready`
      );
      return { done, total: totalPrograms };
    } catch (err) {
      console.error(`[agent-pipeline] Pipeline ${pipelineRunId} failed:`, err);
      await prisma.agentPipelineRun.update({
        where: { id: pipelineRunId },
        data: {
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
          completedAt: new Date(),
        },
      });
      throw err;
    }
  },
  {
    connection: redisConnection,
    concurrency: 1,
    settings: {
      backoffStrategy: (attemptsMade: number) =>
        Math.min(attemptsMade * 10000, 60000),
    },
  }
);

agentPipelineWorker.on("completed", (job) => {
  console.log(`[agent-pipeline] Job ${job.id} completed`);
});

agentPipelineWorker.on("failed", (job, err) => {
  console.error(`[agent-pipeline] Job ${job?.id} failed:`, err.message);
});
