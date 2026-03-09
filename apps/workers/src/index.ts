import "dotenv/config";

// Use Google DNS to bypass stale system DNS cache.
// The system's DNS cache resolves Shopify domains to a wrong IP.
// We override globalThis.fetch with undici's fetch that uses a custom DNS resolver.
import { fetch as undiciFetch, Agent, setGlobalDispatcher } from "undici";
import dns from "node:dns";
import { Queue } from "bullmq";
import { redisConnection, QUEUE_NAMES } from "./config";

const resolver = new dns.Resolver();
resolver.setServers(["8.8.8.8", "1.1.1.1"]);

const agent = new Agent({
  connect: {
    lookup: (
      hostname: string,
      options: { all?: boolean },
      cb: (...args: any[]) => void
    ) => {
      // Use system DNS for localhost and private hostnames
      if (
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname.endsWith(".local")
      ) {
        dns.lookup(hostname, options as any, cb as any);
        return;
      }

      resolver.resolve4(hostname, (err, addresses) => {
        if (err) return cb(err);
        if (options?.all) {
          cb(null, addresses.map((addr) => ({ address: addr, family: 4 })));
        } else {
          cb(null, addresses[0], 4);
        }
      });
    },
  },
});

setGlobalDispatcher(agent);
(globalThis as any).fetch = undiciFetch;

import { syncWorker } from "./workers/sync.worker";
import { rfmWorker } from "./workers/rfm.worker";
import { sendWorker } from "./workers/send.worker";
import { shopifyWebhookWorker } from "./workers/shopify-webhook.worker";
import { brandAnalysisWorker } from "./workers/brand-analysis.worker";
import { automationGeneratorWorker } from "./workers/automation-generator.worker";
import { agentPipelineWorker } from "./workers/agent-pipeline.worker";
import { automationRunnerWorker } from "./workers/automation-runner.worker";
import { triggerListenerWorker } from "./workers/trigger-listener.worker";
import { embeddingWorker } from "./workers/embedding.worker";
import { agentObserveWorker } from "./workers/agent-observe.worker";
import { conversationProcessWorker } from "./workers/conversation-process.worker";
import { abandonedCartWorker } from "./workers/abandoned-cart.worker";
import { segmentChangeWorker } from "./workers/segment-change.worker";
import { customerStateUpdaterWorker } from "./workers/customer-state-updater.worker";
import { guardrailValidatorWorker } from "./workers/guardrail-validator.worker";
import { brandKitExtractorWorker } from "./workers/brand-kit-extractor.worker";
import { productImageProcessorWorker } from "./workers/product-image-processor.worker";
import { creativeGeneratorWorker } from "./workers/creative-generator.worker";
import { opportunityScannerWorker } from "./workers/opportunity-scanner.worker";
import { campaignFactoryWorker } from "./workers/campaign-factory.worker";
import { productCycleAnalyzerWorker } from "./workers/product-cycle-analyzer.worker";
import { briefingGeneratorWorker } from "./workers/briefing-generator.worker";
import { baselineCaptureWorker } from "./workers/baseline-capture.worker";
import { weeklyReportWorker } from "./workers/weekly-report.worker";
import { journeyStepperWorker } from "./workers/journey-stepper.worker";
import { abTestEvaluatorWorker } from "./workers/ab-test-evaluator.worker";
import { sendTimeOptimizerWorker } from "./workers/send-time-optimizer.worker";
import { revenueForecastWorker } from "./workers/revenue-forecaster.worker";

console.log("Starting AlloHQ workers...");
console.log(`  - sync worker: ${syncWorker.name}`);
console.log(`  - rfm worker: ${rfmWorker.name}`);
console.log(`  - send worker: ${sendWorker.name}`);
console.log(`  - shopify-webhook worker: ${shopifyWebhookWorker.name}`);
console.log(`  - brand-analysis worker: ${brandAnalysisWorker.name}`);
console.log(`  - automation-generator worker: ${automationGeneratorWorker.name}`);
console.log(`  - agent-pipeline worker: ${agentPipelineWorker.name}`);
console.log(`  - automation-runner worker: ${automationRunnerWorker.name}`);
console.log(`  - trigger-listener worker: ${triggerListenerWorker.name}`);
console.log(`  - embedding worker: ${embeddingWorker.name}`);
console.log(`  - agent-observe worker: ${agentObserveWorker.name}`);
console.log(`  - conversation-process worker: ${conversationProcessWorker.name}`);
console.log(`  - abandoned-cart worker: ${abandonedCartWorker.name}`);
console.log(`  - segment-change worker: ${segmentChangeWorker.name}`);
console.log(`  - customer-state-updater worker: ${customerStateUpdaterWorker.name}`);
console.log(`  - guardrail-validator worker: ${guardrailValidatorWorker.name}`);
console.log(`  - brand-kit-extractor worker: ${brandKitExtractorWorker.name}`);
console.log(`  - product-image-processor worker: ${productImageProcessorWorker.name}`);
console.log(`  - creative-generator worker: ${creativeGeneratorWorker.name}`);
console.log(`  - opportunity-scanner worker: ${opportunityScannerWorker.name}`);
console.log(`  - campaign-factory worker: ${campaignFactoryWorker.name}`);
console.log(`  - product-cycle-analyzer worker: ${productCycleAnalyzerWorker.name}`);
console.log(`  - briefing-generator worker: ${briefingGeneratorWorker.name}`);
console.log(`  - baseline-capture worker: ${baselineCaptureWorker.name}`);
console.log(`  - weekly-report worker: ${weeklyReportWorker.name}`);
console.log(`  - journey-stepper worker: ${journeyStepperWorker.name}`);
console.log(`  - ab-test-evaluator worker: ${abTestEvaluatorWorker.name}`);
console.log(`  - send-time-optimizer worker: ${sendTimeOptimizerWorker.name}`);
console.log(`  - revenue-forecaster worker: ${revenueForecastWorker.name}`);

// Schedule periodic trigger checks (every 5 minutes)
const triggerCheckQueue = new Queue(QUEUE_NAMES.TRIGGER_CHECK, { connection: redisConnection });
triggerCheckQueue.upsertJobScheduler(
  "trigger-check-schedule",
  { every: 5 * 60 * 1000 },
  { name: "trigger-check", data: { type: "cron" } }
).catch((err) => {
  console.error("Failed to set up trigger check schedule:", err.message);
});

// Schedule agent observation checks (every 6 hours)
const agentObserveQueue = new Queue(QUEUE_NAMES.AGENT_OBSERVE, { connection: redisConnection });
agentObserveQueue.upsertJobScheduler(
  "agent-observe-schedule",
  { every: 6 * 60 * 60 * 1000 },
  { name: "agent-observe", data: { type: "cron" } }
).catch((err) => {
  console.error("Failed to set up agent observe schedule:", err.message);
});

// Schedule abandoned cart checks (every 5 minutes)
const abandonedCartQueue = new Queue(QUEUE_NAMES.ABANDONED_CART_CHECK, { connection: redisConnection });
abandonedCartQueue.upsertJobScheduler(
  "abandoned-cart-check-schedule",
  { every: 5 * 60 * 1000 },
  { name: "abandoned-cart-check", data: { type: "cron" } }
).catch((err) => {
  console.error("Failed to set up abandoned cart check schedule:", err.message);
});

// Schedule opportunity scanning (every 2 hours)
const opportunityScanQueue = new Queue(QUEUE_NAMES.OPPORTUNITY_SCAN, { connection: redisConnection });
opportunityScanQueue.upsertJobScheduler(
  "opportunity-scan-schedule",
  { every: 2 * 60 * 60 * 1000 },
  { name: "opportunity-scan", data: { type: "cron" } }
).catch((err) => {
  console.error("Failed to set up opportunity scan schedule:", err.message);
});

// Schedule product cycle analysis (daily)
const productCyclesQueue = new Queue(QUEUE_NAMES.PRODUCT_CYCLES, { connection: redisConnection });
productCyclesQueue.upsertJobScheduler(
  "product-cycles-schedule",
  { every: 24 * 60 * 60 * 1000 },
  { name: "product-cycles", data: { type: "cron" } }
).catch((err) => {
  console.error("Failed to set up product cycles schedule:", err.message);
});

// Schedule daily briefings (every 24 hours)
const briefingQueue = new Queue(QUEUE_NAMES.MERCHANT_BRIEFING, { connection: redisConnection });
briefingQueue.upsertJobScheduler(
  "daily-briefing-schedule",
  { every: 24 * 60 * 60 * 1000 },
  { name: "daily-briefing", data: { type: "cron" } }
).catch((err) => {
  console.error("Failed to set up daily briefing schedule:", err.message);
});

// Schedule weekly reports (every 7 days)
const weeklyReportQueue = new Queue(QUEUE_NAMES.WEEKLY_REPORT, { connection: redisConnection });
weeklyReportQueue.upsertJobScheduler(
  "weekly-report-schedule",
  { every: 7 * 24 * 60 * 60 * 1000 },
  { name: "weekly-report", data: { type: "cron" } }
).catch((err) => {
  console.error("Failed to set up weekly report schedule:", err.message);
});

// Schedule A/B test evaluation (every 6 hours)
const abTestQueue = new Queue(QUEUE_NAMES.AB_TEST, { connection: redisConnection });
abTestQueue.upsertJobScheduler(
  "ab-test-evaluation-schedule",
  { every: 6 * 60 * 60 * 1000 },
  { name: "ab-test-evaluation", data: { type: "cron" } }
).catch((err) => {
  console.error("Failed to set up A/B test evaluation schedule:", err.message);
});

// Schedule send time optimization (nightly)
const sendTimeQueue = new Queue(QUEUE_NAMES.SEND_TIME, { connection: redisConnection });
sendTimeQueue.upsertJobScheduler(
  "send-time-optimization-schedule",
  { every: 24 * 60 * 60 * 1000 },
  { name: "send-time-optimization", data: { type: "cron" } }
).catch((err) => {
  console.error("Failed to set up send time optimization schedule:", err.message);
});

// Schedule revenue forecast (daily)
const revenueForecastQueue = new Queue(QUEUE_NAMES.REVENUE_FORECAST, { connection: redisConnection });
revenueForecastQueue.upsertJobScheduler(
  "revenue-forecast-schedule",
  { every: 24 * 60 * 60 * 1000 },
  { name: "revenue-forecast", data: { type: "cron" } }
).catch((err) => {
  console.error("Failed to set up revenue forecast schedule:", err.message);
});

// Graceful shutdown
const shutdown = async () => {
  console.log("Shutting down workers...");
  await Promise.all([
    syncWorker.close(),
    rfmWorker.close(),
    sendWorker.close(),
    shopifyWebhookWorker.close(),
    brandAnalysisWorker.close(),
    automationGeneratorWorker.close(),
    agentPipelineWorker.close(),
    automationRunnerWorker.close(),
    triggerListenerWorker.close(),
    embeddingWorker.close(),
    agentObserveWorker.close(),
    conversationProcessWorker.close(),
    abandonedCartWorker.close(),
    segmentChangeWorker.close(),
    customerStateUpdaterWorker.close(),
    guardrailValidatorWorker.close(),
    brandKitExtractorWorker.close(),
    productImageProcessorWorker.close(),
    creativeGeneratorWorker.close(),
    opportunityScannerWorker.close(),
    campaignFactoryWorker.close(),
    productCycleAnalyzerWorker.close(),
    briefingGeneratorWorker.close(),
    baselineCaptureWorker.close(),
    weeklyReportWorker.close(),
    journeyStepperWorker.close(),
    abTestEvaluatorWorker.close(),
    sendTimeOptimizerWorker.close(),
    revenueForecastWorker.close(),
  ]);
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
process.on("SIGHUP", shutdown);
