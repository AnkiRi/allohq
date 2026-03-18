import { Worker } from "bullmq";
import {
  evaluateTest,
  listAllRunningTests,
} from "@allohq/campaign-engine";
import { redisConnection, QUEUE_NAMES } from "../config";

interface ABTestJobData {
  storeId?: string;
  type?: string;
}

/**
 * A/B Test Evaluator Worker
 * Evaluates all running A/B tests (or per-store if storeId is given),
 * auto-concludes when statistical significance is reached.
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
      return { evaluated: 0, concluded: 0 };
    }

    let evaluated = 0;
    let concluded = 0;

    for (const test of runningTests) {
      try {
        const evaluation = await evaluateTest(test.id);
        evaluated++;

        if (evaluation.autoConcluded) {
          concluded++;
          console.log(
            `A/B test ${test.id} (${test.name}) auto-concluded: winner=${evaluation.winner}, confidence=${(evaluation.confidence * 100).toFixed(1)}%`,
          );
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
      `A/B test evaluation complete: ${evaluated} evaluated, ${concluded} auto-concluded`,
    );
    return { evaluated, concluded };
  },
  { connection: redisConnection },
);

abTestEvaluatorWorker.on("completed", (job) => {
  console.log(`A/B test evaluation job ${job.id} completed`);
});

abTestEvaluatorWorker.on("failed", (job, err) => {
  console.error(`A/B test evaluation job ${job?.id} failed:`, err.message);
});
