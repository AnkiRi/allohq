import { Worker, Queue } from "bullmq";
import { prisma } from "@allohq/database";
// Autonomy tiers — mirrors @allohq/autonomy-engine enum values
const AutonomyTier = {
  AUTOPILOT: "autopilot",
  COPILOT: "copilot",
  ADVISOR: "advisor",
} as const;
import { scanOpportunities } from "@allohq/campaign-engine";
import { generateDailyBriefing } from "@allohq/merchant-copilot";
import { logAgentActivity } from "@allohq/agent-core";
import { redisConnection, QUEUE_NAMES } from "../config";

const automationGenerateQueue = new Queue(QUEUE_NAMES.AUTOMATION_GENERATE, {
  connection: redisConnection,
});
const campaignFactoryQueue = new Queue(QUEUE_NAMES.CAMPAIGN_FACTORY, {
  connection: redisConnection,
});

interface StoreActivationJobData {
  storeId: string;
}

interface ActivationStep {
  key: string;
  label: string;
  status: "pending" | "running" | "done" | "error";
  detail?: string;
  completedAt?: string;
}

interface ActivationLog {
  steps: ActivationStep[];
  startedAt: string;
  completedAt?: string;
}

/** Maps autonomy ActionCategory values to automation program types */
const CATEGORY_TO_PROGRAM_TYPE: Record<string, string> = {
  cart_recovery: "cart_abandonment",
  win_back: "win_back",
  post_purchase: "post_purchase",
  welcome: "welcome_series",
  vip: "vip_reward",
  cross_sell: "cross_sell",
  promotional: "promotional",
};

/** Friendly labels for automation program types */
const PROGRAM_LABELS: Record<string, string> = {
  cart_abandonment: "Cart Recovery",
  win_back: "Win-Back",
  post_purchase: "Post-Purchase Follow-Up",
  welcome_series: "Welcome Series",
  vip_reward: "VIP Rewards",
  cross_sell: "Cross-Sell",
  promotional: "Promotional",
};

/** Keyword-based heuristic for classifying a store into a category */
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  fashion: [
    "dress", "shirt", "pants", "jeans", "jacket", "coat", "sweater", "hoodie",
    "skirt", "blouse", "shoes", "sneakers", "boots", "sandals", "heels",
    "handbag", "wallet", "belt", "scarf", "hat", "apparel", "clothing",
    "fashion", "wear", "outfit", "denim", "leather", "silk", "cotton",
    "t-shirt", "polo", "blazer", "suit", "lingerie", "underwear", "socks",
  ],
  beauty: [
    "skincare", "makeup", "lipstick", "foundation", "mascara", "serum",
    "moisturizer", "cleanser", "toner", "sunscreen", "primer", "concealer",
    "blush", "eyeshadow", "perfume", "fragrance", "cologne", "nail polish",
    "shampoo", "conditioner", "hair care", "body lotion", "face cream",
    "beauty", "cosmetic", "anti-aging", "retinol", "vitamin c", "exfoliant",
  ],
  food: [
    "chocolate", "coffee", "tea", "snack", "spice", "sauce", "honey",
    "protein", "supplement", "organic", "vegan", "gluten-free", "granola",
    "candy", "cookie", "cake", "gourmet", "olive oil", "vinegar", "jam",
    "food", "edible", "drink", "beverage", "juice", "smoothie", "meal",
  ],
  electronics: [
    "phone", "laptop", "tablet", "headphone", "earbuds", "speaker", "camera",
    "charger", "cable", "adapter", "keyboard", "mouse", "monitor", "usb",
    "bluetooth", "wireless", "smart watch", "fitness tracker", "drone",
    "electronics", "gadget", "tech", "device", "battery", "power bank",
  ],
  home: [
    "candle", "pillow", "blanket", "rug", "curtain", "lamp", "vase",
    "furniture", "shelf", "table", "chair", "sofa", "bed", "mattress",
    "kitchen", "cookware", "dinnerware", "towel", "storage", "organizer",
    "home decor", "garden", "plant", "pot", "frame", "mirror", "clock",
  ],
  health: [
    "vitamin", "supplement", "probiotic", "omega", "magnesium", "collagen",
    "protein powder", "fitness", "yoga", "workout", "exercise", "wellness",
    "essential oil", "aromatherapy", "cbd", "hemp", "herbal", "natural",
    "health", "medical", "therapeutic", "recovery", "sleep", "meditation",
  ],
};

/**
 * Classify a store into a category based on its product titles and types.
 * Returns null if no category can be confidently determined.
 */
async function classifyStoreCategory(storeId: string): Promise<string | null> {
  const products = await prisma.product.findMany({
    where: { storeId },
    select: { title: true, productType: true },
    take: 100,
  });

  if (products.length === 0) return null;

  // Build a combined text corpus from product titles and types
  const corpus = products
    .map((p) => `${p.title} ${p.productType ?? ""}`.toLowerCase())
    .join(" ");

  // Score each category
  const scores: Record<string, number> = {};
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      // Count occurrences (word boundary-ish matching)
      const regex = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      const matches = corpus.match(regex);
      if (matches) score += matches.length;
    }
    scores[category] = score;
  }

  // Find the top category
  let bestCategory: string | null = null;
  let bestScore = 0;
  for (const [category, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  // Require at least a minimum signal (3 keyword matches)
  if (bestScore < 3) return null;

  return bestCategory;
}

/**
 * Persist the activation log on the store record.
 */
async function updateActivationLog(
  storeId: string,
  log: ActivationLog,
): Promise<void> {
  await prisma.store.update({
    where: { id: storeId },
    data: { activationLog: log as any },
  });
}

/**
 * Update a single step in the activation log and persist it.
 */
async function updateStep(
  storeId: string,
  log: ActivationLog,
  stepKey: string,
  update: Partial<ActivationStep>,
): Promise<void> {
  const step = log.steps.find((s) => s.key === stepKey);
  if (step) {
    Object.assign(step, update);
  }
  await updateActivationLog(storeId, log);
}

/**
 * Store activation worker.
 *
 * Runs ONCE per store after onboarding completes. Creates automations
 * based on autonomy config, scans for campaign opportunities, generates
 * the first merchant briefing, and records activation progress.
 */
export const storeActivationWorker = new Worker<StoreActivationJobData>(
  "store-activation",
  async (job) => {
    const { storeId } = job.data;

    console.log(`[store-activation] Starting activation for store ${storeId}`);

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      include: { workspace: true },
    });

    if (!store) {
      throw new Error(`Store ${storeId} not found`);
    }

    // Only run after onboarding is fully complete
    if (store.onboardingStep < 8) {
      console.log(`[store-activation] Skipping — store ${storeId} onboarding not complete (step ${store.onboardingStep})`);
      return { storeId, automationsCreated: 0, automationsQueued: 0, opportunitiesFound: 0 };
    }

    const workspaceId = store.workspaceId;

    // ── Step 0: Classify store category (for cross-store benchmarks) ──────
    if (!store.storeCategory) {
      try {
        const category = await classifyStoreCategory(storeId);
        if (category) {
          await prisma.store.update({
            where: { id: storeId },
            data: { storeCategory: category },
          });
          console.log(`[store-activation] Classified store ${storeId} as "${category}"`);
        } else {
          console.log(`[store-activation] Could not classify store ${storeId} — insufficient signal`);
        }
      } catch (err) {
        console.error(`[store-activation] Store classification failed:`, (err as Error).message);
      }
    }

    // Initialize activation log
    const activationLog: ActivationLog = {
      startedAt: new Date().toISOString(),
      steps: [
        { key: "classify_category", label: "Classify store category", status: "done" },
        { key: "create_automations", label: "Create automations from autonomy config", status: "pending" },
        { key: "scan_opportunities", label: "Scan for campaign opportunities", status: "pending" },
        { key: "generate_briefing", label: "Generate first merchant briefing", status: "pending" },
        { key: "finalize", label: "Finalize activation", status: "pending" },
      ],
    };

    await updateActivationLog(storeId, activationLog);

    // ── Step 1: Auto-create automations based on autonomy config ──────────

    let automationsCreated = 0;
    let automationsQueued = 0;

    try {
      await updateStep(storeId, activationLog, "create_automations", { status: "running" });

      const allConfigs = await prisma.autonomyConfig.findMany({
        where: { storeId },
      });

      // Filter to categories that map to automation program types
      const automationConfigs = allConfigs.filter(
        (c) => CATEGORY_TO_PROGRAM_TYPE[c.category] !== undefined,
      );

      for (const config of automationConfigs) {
        const programType = CATEGORY_TO_PROGRAM_TYPE[config.category]!;
        const label = PROGRAM_LABELS[programType] ?? programType;
        const isAutopilot = config.tier === AutonomyTier.AUTOPILOT;

        try {
          // Create the automation record
          const automation = await prisma.automation.create({
            data: {
              name: `${label} Automation`,
              description: `Auto-generated ${label.toLowerCase()} automation (${config.tier})`,
              workspaceId,
              storeId,
              category: programType,
              status: isAutopilot ? "active" : "draft",
              triggerType: "event",
              triggerConfig: {},
              nodes: [],
              templateIds: [],
            },
          });

          automationsCreated++;

          // For COPILOT / ADVISOR categories, add to ActionQueue for merchant approval
          // Deduplicate: skip if identical pending entry already exists
          if (!isAutopilot) {
            const existing = await prisma.actionQueue.findFirst({
              where: { storeId, type: "automation_draft", status: "pending", category: config.category },
            });
            if (!existing) {
              await prisma.actionQueue.create({
                data: {
                  storeId,
                  type: "automation_draft",
                  status: "pending",
                  category: config.category,
                  urgencyScore: 50,
                  confidenceScore: 80,
                  reasoning: `${label} automation created as draft. Review and approve to activate.`,
                  payload: {
                    automationId: automation.id,
                    programType,
                    tier: config.tier,
                  },
                },
              });
            }
          }

          // Queue content generation for every automation
          // Stagger Claude jobs by 15s to avoid API overload; GPT handles concurrency fine
          const isClaudeModel = ((store as any).workspace?.defaultModel || "").includes("claude");
          const staggerDelay = isClaudeModel ? automationsQueued * 15000 : 0;
          await automationGenerateQueue.add(
            `activation-${programType}`,
            { automationId: automation.id, storeId },
            { attempts: 3, delay: staggerDelay },
          );
          automationsQueued++;

          console.log(
            `[store-activation] Created ${label} automation (${config.tier}) → ${automation.id}`,
          );

          // Log activity to AI chat
          await logAgentActivity(storeId,
            `✓ Created **${label}** automation — ${isAutopilot ? "now active on autopilot" : "draft ready for your review"}`,
            { type: "automation_created", entityId: automation.id, entityType: "automation" },
          ).catch(() => {});
        } catch (err) {
          console.error(
            `[store-activation] Failed to create ${label} automation:`,
            (err as Error).message,
          );
        }
      }

      await updateStep(storeId, activationLog, "create_automations", {
        status: "done",
        detail: `Created ${automationsCreated} automations, queued ${automationsQueued} for content generation`,
        completedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error(`[store-activation] Step 1 (create automations) failed:`, (err as Error).message);
      await updateStep(storeId, activationLog, "create_automations", {
        status: "error",
        detail: (err as Error).message,
        completedAt: new Date().toISOString(),
      });
    }

    // ── Step 2: Scan for opportunities and queue campaign drafts ──────────

    let opportunitiesFound = 0;

    try {
      await updateStep(storeId, activationLog, "scan_opportunities", { status: "running" });

      const opportunities = await scanOpportunities(storeId);
      opportunitiesFound = opportunities.length;

      for (const opp of opportunities) {
        await campaignFactoryQueue.add("generate-draft", {
          opportunity: opp,
        });
      }

      console.log(
        `[store-activation] Found ${opportunitiesFound} opportunities for store ${storeId}`,
      );

      await updateStep(storeId, activationLog, "scan_opportunities", {
        status: "done",
        detail: `Found ${opportunitiesFound} opportunities, queued to campaign factory`,
        completedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error(`[store-activation] Step 2 (scan opportunities) failed:`, (err as Error).message);
      await updateStep(storeId, activationLog, "scan_opportunities", {
        status: "error",
        detail: (err as Error).message,
        completedAt: new Date().toISOString(),
      });
    }

    // ── Step 3: Generate first briefing ──────────────────────────────────

    try {
      await updateStep(storeId, activationLog, "generate_briefing", { status: "running" });

      await generateDailyBriefing(storeId);

      console.log(`[store-activation] Generated first briefing for store ${storeId}`);

      await updateStep(storeId, activationLog, "generate_briefing", {
        status: "done",
        detail: "First merchant briefing generated successfully",
        completedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error(`[store-activation] Step 3 (generate briefing) failed:`, (err as Error).message);
      await updateStep(storeId, activationLog, "generate_briefing", {
        status: "error",
        detail: (err as Error).message,
        completedAt: new Date().toISOString(),
      });
    }

    // ── Step 4: Finalize activation ──────────────────────────────────────

    try {
      await updateStep(storeId, activationLog, "finalize", { status: "running" });

      // Activation completion is tracked via store.activatedAt — not as an ActionQueue entry.
      // ActionQueue should only contain merchant-approvable items.

      // Set activatedAt timestamp on the store
      const now = new Date();
      activationLog.completedAt = now.toISOString();

      await updateStep(storeId, activationLog, "finalize", {
        status: "done",
        detail: "Activation complete",
        completedAt: now.toISOString(),
      });

      await prisma.store.update({
        where: { id: storeId },
        data: {
          activatedAt: now,
          activationLog: activationLog as any,
        },
      });

      console.log(
        `[store-activation] Store ${storeId} activated: ` +
          `${automationsCreated} automations, ${opportunitiesFound} opportunities`,
      );

      // Log activation complete to AI chat
      await logAgentActivity(storeId,
        `Your AI retention system is set up! **${automationsCreated} automations** created${opportunitiesFound > 0 ? `, **${opportunitiesFound} campaign opportunities** identified` : ""}. Check your pending actions to review and approve.`,
        { type: "activation_complete" },
      ).catch(() => {});
    } catch (err) {
      console.error(`[store-activation] Step 4 (finalize) failed:`, (err as Error).message);
      await updateStep(storeId, activationLog, "finalize", {
        status: "error",
        detail: (err as Error).message,
        completedAt: new Date().toISOString(),
      });
    }

    return {
      storeId,
      automationsCreated,
      automationsQueued,
      opportunitiesFound,
    };
  },
  {
    connection: redisConnection,
    concurrency: 2,
    settings: {
      backoffStrategy: (attemptsMade: number) =>
        Math.min(attemptsMade * 5000, 30000),
    },
  },
);

storeActivationWorker.on("completed", (job) => {
  console.log(`[store-activation] Job ${job.id} completed`);
});

storeActivationWorker.on("failed", (job, err) => {
  console.error(`[store-activation] Job ${job?.id} failed:`, err.message);
});
