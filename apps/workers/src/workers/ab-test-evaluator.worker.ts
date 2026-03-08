import { Worker } from "bullmq";
import {
  evaluateTest,
  concludeTest,
  listRunningTests,
} from "@allohq/journey-orchestrator";
import { redisConnection, QUEUE_NAMES } from "../config";

interface ABTestJobData {
  storeId: string;
}

/**
 * A/B Test Evaluator Worker
 * Evaluates all running A/B tests for a store, declares winners
 * when statistical significance is reached.
 */
export const abTestEvaluatorWorker = new Worker<ABTestJobData>(
  QUEUE_NAMES.AB_TEST,
  async (job) => {
    const { storeId } = job.data;

    console.log(`Evaluating A/B tests for store ${storeId}`);

    const runningTests = await listRunningTests(storeId);

    if (runningTests.length === 0) {
      console.log(`No running A/B tests for store ${storeId}`);
      return { evaluated: 0, concluded: 0 };
    }

    let evaluated = 0;
    let concluded = 0;

    for (const test of runningTests) {
      try {
        const evaluation = await evaluateTest(test.id);
        evaluated++;

        if (evaluation.ready && evaluation.winner) {
          await concludeTest(test.id, evaluation.winner, evaluation.confidence);
          concluded++;
          console.log(
            `A/B test ${test.id} (${test.name}) concluded: winner=${evaluation.winner}, confidence=${(evaluation.confidence * 100).toFixed(1)}%`,
          );
        } else if (evaluation.ready && !evaluation.winner) {
          console.log(
            `A/B test ${test.id} (${test.name}) has enough data but no clear winner (confidence=${(evaluation.confidence * 100).toFixed(1)}%)`,
          );
        } else {
          const totalSent = evaluation.aResults.sent + evaluation.bResults.sent;
          console.log(
            `A/B test ${test.id} (${test.name}) needs more data: ${totalSent}/${test.minSampleSize} samples`,
          );
        }
      } catch (err: any) {
        console.error(`Failed to evaluate A/B test ${test.id}:`, err.message);
      }
    }

    console.log(`A/B test evaluation complete for store ${storeId}: ${evaluated} evaluated, ${concluded} concluded`);
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
