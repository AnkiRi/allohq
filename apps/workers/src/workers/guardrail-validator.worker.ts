import { Worker } from "bullmq";
import { prisma } from "@allohq/database";
import { redisConnection, QUEUE_NAMES } from "../config";

interface GuardrailCheckJobData {
  storeId: string;
  actionType: string;
  payload: Record<string, unknown>;
}

/**
 * Pre-send validation worker: checks a proposed message/action
 * against all active Guardrail rules for the store.
 */
export const guardrailValidatorWorker = new Worker<GuardrailCheckJobData>(
  QUEUE_NAMES.GUARDRAIL_CHECK,
  async (job) => {
    const { storeId, actionType, payload } = job.data;

    console.log(`[guardrail-validator] Checking ${actionType} for store ${storeId}`);

    const guardrails = await prisma.guardrail.findMany({
      where: { storeId, isActive: true },
    });

    const violations: Array<{ ruleType: string; message: string }> = [];

    for (const rule of guardrails) {
      const ruleValue = rule.ruleValue as Record<string, unknown>;

      switch (rule.ruleType) {
        case "max_discount": {
          const maxDiscount = ruleValue.maxPercent as number;
          const actionDiscount = payload.discountPercent as number | undefined;
          if (actionDiscount && actionDiscount > maxDiscount) {
            violations.push({
              ruleType: rule.ruleType,
              message: `Discount ${actionDiscount}% exceeds max ${maxDiscount}%`,
            });
          }
          break;
        }

        case "blocked_words": {
          const blockedWords = ruleValue.words as string[];
          const content = payload.content as string | undefined;
          if (content && blockedWords) {
            const found = blockedWords.filter((w) =>
              content.toLowerCase().includes(w.toLowerCase()),
            );
            if (found.length > 0) {
              violations.push({
                ruleType: rule.ruleType,
                message: `Content contains blocked words: ${found.join(", ")}`,
              });
            }
          }
          break;
        }

        case "spending_cap": {
          const maxSpend = ruleValue.maxMonthly as number;
          const estimatedCost = payload.estimatedCost as number | undefined;
          if (estimatedCost && estimatedCost > maxSpend) {
            violations.push({
              ruleType: rule.ruleType,
              message: `Estimated cost $${estimatedCost} exceeds monthly cap $${maxSpend}`,
            });
          }
          break;
        }
      }
    }

    const result = {
      valid: violations.length === 0,
      violations,
      rulesChecked: guardrails.length,
    };

    if (!result.valid) {
      console.log(`[guardrail-validator] ${violations.length} violations found for ${actionType}`);
    }

    return result;
  },
  { connection: redisConnection },
);

guardrailValidatorWorker.on("completed", (job) => {
  console.log(`[guardrail-validator] Job ${job.id} completed`);
});

guardrailValidatorWorker.on("failed", (job, err) => {
  console.error(`[guardrail-validator] Job ${job?.id} failed:`, err.message);
});
