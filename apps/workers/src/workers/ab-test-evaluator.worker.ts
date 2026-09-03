import { Worker } from "bullmq";
import { prisma } from "@allohq/database";
import {
  evaluateTest,
  listAllRunningTests,
  createFollowUpTest,
} from "@allohq/campaign-engine";
import { logActivity } from "@allohq/agent-core";
import { redisConnection, QUEUE_NAMES } from "../config";
import { isV1ReleaseMode } from "@allohq/release-gate";

interface ABTestJobData {
  storeId?: string;
  type?: string;
}

/**
 * A/B Test Evaluator Worker
 * Evaluates all running A/B tests (or per-store if storeId is given),
 * auto-concludes when statistical significance is reached,
 * applies winners and creates follow-up tests based on autonomy config.
 */
export const abTestEvaluatorWorker = new Worker<ABTestJobData>(
  QUEUE_NAMES.AB_TEST,
  async (job) => {
    const { storeId } = job.data;

    console.log(
      storeId
        ? `Evaluating A/B tests for store ${storeId}`
        : "Evaluating all running A/B tests (cron)",
    );

    // Fetch all running tests — filter by store if given
    const allTests = await listAllRunningTests();
    const runningTests = storeId
      ? allTests.filter((t) => t.storeId === storeId)
      : allTests;

    if (runningTests.length === 0) {
      console.log("No running A/B tests to evaluate");
      return { evaluated: 0, concluded: 0, followUps: 0 };
    }

    let evaluated = 0;
    let concluded = 0;
    let followUps = 0;

    for (const test of runningTests) {
      try {
        const evaluation = await evaluateTest(test.id);
        evaluated++;

        if (evaluation.autoConcluded) {
          concluded++;
          console.log(
            `A/B test ${test.id} (${test.name}) auto-concluded: winner=${evaluation.winner}, confidence=${(evaluation.confidence * 100).toFixed(1)}%`,
          );

          // Evaluation may conclude a test, but v1 never mutates approved
          // content automatically. The merchant applies a winner explicitly.

          // Check autonomy config for follow-up test creation
          try {
            const concludedTest = await prisma.aBTest.findUnique({
              where: { id: test.id },
              select: { automationId: true, storeId: true },
            });

            if (concludedTest) {
              // Determine autonomy tier for this automation's category
              let tier = "copilot"; // default
              if (concludedTest.automationId) {
                const automation = await prisma.automation.findUnique({
                  where: { id: concludedTest.automationId },
                  select: { category: true },
                });

                if (automation?.category) {
                  const autonomyConfig = await prisma.autonomyConfig.findUnique({
                    where: {
                      storeId_category: {
                        storeId: concludedTest.storeId,
                        category: automation.category,
                      },
                    },
                    select: { tier: true },
                  });
                  tier = autonomyConfig?.tier ?? "copilot";
                }
              }

              if (!isV1ReleaseMode() && tier === "autopilot") {
                // Auto-start the next test
                const followUp = await createFollowUpTest(
                  test.id,
                  concludedTest.storeId,
                  true,
                );
                followUps++;

                await logActivity({
                  storeId: concludedTest.storeId,
                  activityType: "ab_test_concluded",
                  summary: `A/B test "${test.name}" concluded (winner: ${evaluation.winner}). Auto-applied winner and started follow-up test: "${followUp.name}"`,
                  category: "ab_testing",
                  tier: "autopilot",
                  actionTaken: "auto_evolved",
                  entityId: test.id,
                  entityType: "ab_test",
                  metadata: {
                    winner: evaluation.winner,
                    confidence: evaluation.confidence,
                    followUpTestId: followUp.id,
                    followUpVariable: followUp.variable,
                  },
                });
              } else {
                // Copilot/advisor: create test in draft and queue for review
                const followUp = await createFollowUpTest(
                  test.id,
                  concludedTest.storeId,
                  false,
                );
                followUps++;

                // Create ActionQueue entry for merchant review
                await prisma.actionQueue.create({
                  data: {
                    storeId: concludedTest.storeId,
                    type: "automation",
                    status: "pending",
                    category: "ab_testing",
                    urgencyScore: 40,
                    confidenceScore: evaluation.confidence * 100,
                    reasoning: `A/B test "${test.name}" concluded with winner "${evaluation.winner}" (${(evaluation.confidence * 100).toFixed(1)}% confidence). A follow-up test "${followUp.name}" (testing ${followUp.variable}) has been drafted for your review.`,
                    payload: {
                      type: "ab_test_follow_up",
                      concludedTestId: test.id,
                      followUpTestId: followUp.id,
                      winner: evaluation.winner,
                      confidence: evaluation.confidence,
                      variable: followUp.variable,
                    } as any,
                  },
                });

                await logActivity({
                  storeId: concludedTest.storeId,
                  activityType: "ab_test_concluded",
                  summary: `A/B test "${test.name}" concluded (winner: ${evaluation.winner}). Winner awaits approval; follow-up test "${followUp.name}" was drafted for review.`,
                  category: "ab_testing",
                  tier,
                  actionTaken: "queued_for_review",
                  entityId: test.id,
                  entityType: "ab_test",
                  metadata: {
                    winner: evaluation.winner,
                    confidence: evaluation.confidence,
                    followUpTestId: followUp.id,
                    followUpVariable: followUp.variable,
                  },
                });
              }
            }
          } catch (err: any) {
            console.error(`Failed to create follow-up for test ${test.id}:`, err.message);
          }
        } else if (evaluation.significanceReached && !evaluation.winner) {
          console.log(
            `A/B test ${test.id} (${test.name}) has enough data but no clear winner (confidence=${(evaluation.confidence * 100).toFixed(1)}%)`,
          );
        } else if (!evaluation.sampleSizeMet) {
          const totalSent = evaluation.variantA.sent + evaluation.variantB.sent;
          console.log(
            `A/B test ${test.id} (${test.name}) needs more data: ${totalSent}/${test.minSampleSize} samples`,
          );
        } else {
          console.log(
            `A/B test ${test.id} (${test.name}) evaluated: confidence=${(evaluation.confidence * 100).toFixed(1)}% (below 95% threshold)`,
          );
        }
      } catch (err: any) {
        console.error(`Failed to evaluate A/B test ${test.id}:`, err.message);
      }
    }

    console.log(
      `A/B test evaluation complete: ${evaluated} evaluated, ${concluded} auto-concluded, ${followUps} follow-ups created`,
    );
    return { evaluated, concluded, followUps };
  },
  { connection: redisConnection },
);

abTestEvaluatorWorker.on("completed", (job) => {
  console.log(`A/B test evaluation job ${job.id} completed`);
});

abTestEvaluatorWorker.on("failed", (job, err) => {
  console.error(`A/B test evaluation job ${job?.id} failed:`, err.message);
});
