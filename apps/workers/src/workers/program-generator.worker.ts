import { Worker } from "bullmq";
import { prisma } from "@allohq/database";
import { activateProgram } from "@allohq/customer-intelligence";
import { redisConnection, QUEUE_NAMES } from "../config";

interface ProgramGenerateJobData {
  programId: string;
  storeId: string;
  model?: string;
}

export const programGeneratorWorker = new Worker<ProgramGenerateJobData>(
  QUEUE_NAMES.PROGRAM_GENERATE,
  async (job) => {
    const { programId, storeId } = job.data;

    console.log(`Generating content for program ${programId}`);

    // Fetch program
    const program = await prisma.emailProgram.findUnique({
      where: { id: programId },
    });

    if (!program) {
      throw new Error(`Program ${programId} not found`);
    }

    // Fetch brand profile
    const brandProfile = await prisma.brandProfile.findFirst({
      where: { storeId },
    });

    // Fetch products
    const products = await prisma.product.findMany({
      where: { storeId, status: "active" },
      take: 15,
      orderBy: { updatedAt: "desc" },
    });

    // Fetch store for URL
    const store = await prisma.store.findUnique({ where: { id: storeId } });
    const storeUrl = store ? `https://${store.shopDomain}` : undefined;

    // Resolve model: job data > workspace default > undefined
    let resolvedModel = job.data.model as any;
    if (!resolvedModel) {
      const workspace = await prisma.workspace.findUnique({
        where: { id: program.workspaceId },
        select: { defaultModel: true },
      });
      resolvedModel = workspace?.defaultModel || undefined;
    }

    // Generate all emails for this program
    const results = await activateProgram({
      programType: program.programType,
      storeId,
      storeUrl,
      model: resolvedModel,
      brandProfile: brandProfile
        ? {
            brandName: brandProfile.brandName,
            brandDescription: brandProfile.brandDescription,
            toneAttributes: brandProfile.toneAttributes as Record<string, string>,
            vocabulary: brandProfile.vocabulary as Record<string, string[]>,
            visualStyle: brandProfile.visualStyle as Record<string, string>,
            sampleCopy: brandProfile.sampleCopy as string[],
          }
        : undefined,
      products: products.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description ?? undefined,
        imageUrl: p.imageUrl ?? undefined,
        price: p.price,
        handle: p.handle,
      })),
    });

    // Create templates from generated content
    const templateIds: string[] = [];
    for (const result of results) {
      const template = await prisma.emailTemplate.create({
        data: {
          workspaceId: program.workspaceId,
          name: `${program.name} — ${result.subject}`,
          subject: result.subject,
          previewText: result.previewText,
          blocks: result.blocks as any,
          category: "ai_generated",
        },
      });
      templateIds.push(template.id);

      // Save audit trail
      await prisma.generatedContent.create({
        data: {
          workspaceId: program.workspaceId,
          templateId: template.id,
          prompt: result.promptUsed,
          response: JSON.stringify(result),
          model: result.model,
          intent: program.programType,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        },
      });

      // Record token usage
      await prisma.tokenUsage.create({
        data: {
          workspaceId: program.workspaceId,
          model: result.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          purpose: "generate_email",
        },
      });
    }

    // Update program with generated template IDs and status
    await prisma.emailProgram.update({
      where: { id: programId },
      data: {
        templateIds,
        status: "ready",
      },
    });

    console.log(`[program-generator] ${program.name} generated ${templateIds.length} templates`);
    return { templateIds };
  },
  {
    connection: redisConnection,
    settings: {
      backoffStrategy: (attemptsMade: number) => Math.min(attemptsMade * 5000, 30000),
    },
  }
);

programGeneratorWorker.on("completed", (job) => {
  console.log(`Program generator job ${job.id} completed`);
});

programGeneratorWorker.on("failed", (job, err) => {
  console.error(`Program generator job ${job?.id} failed:`, err.message);
});
