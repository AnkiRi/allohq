import "dotenv/config";

// Use Google DNS to bypass stale system DNS cache.
// The system's DNS cache resolves Shopify domains to a wrong IP.
// We override globalThis.fetch with undici's fetch that uses a custom DNS resolver.
import { fetch as undiciFetch, Agent, setGlobalDispatcher } from "undici";
import dns from "node:dns";
import { Queue } from "bullmq";
import { redisConnection, QUEUE_NAMES } from "./config";
import { isScheduleAllowed, isV1ReleaseMode } from "@allohq/release-gate";
import { assertDataEncryptionConfigured } from "@allohq/database";
import { assertEmailDeliveryConfigured, assertUnsubscribeSigningConfigured } from "@allohq/messaging";

if (process.env.NODE_ENV === "production") {
  assertDataEncryptionConfigured();
  assertUnsubscribeSigningConfigured();
  assertEmailDeliveryConfigured();
}

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
import { revenueForecastWorker } from "./workers/revenue-forecaster.worker";
import { productRecommendationWorker } from "./workers/product-recommendation.worker";
import { shippingUpdateWorker } from "./workers/shipping-update.worker";
import { restockAlertWorker } from "./workers/restock-alert.worker";
import { priceDropWorker } from "./workers/price-drop.worker";
import { repurchaseReminderWorker } from "./workers/repurchase-reminder.worker";
import { inventoryMonitorWorker } from "./workers/inventory-monitor.worker";
import { storeActivationWorker } from "./workers/store-activation.worker";
import { outcomeAttributionWorker } from "./workers/outcome-attribution.worker";
import { churnInterventionWorker } from "./workers/churn-intervention.worker";
import { benchmarkAggregatorWorker } from "./workers/benchmark-aggregator.worker";
import { customerVoiceWorker } from "./workers/customer-voice.worker";
import { memoryWriterWorker } from "./workers/memory-writer.worker";
import { dailyRevenueEmailWorker } from "./workers/daily-revenue-email.worker";
import { overnightOpsWorker } from "./workers/overnight-ops.worker";
import { eventReactorWorker } from "./workers/event-reactor.worker";
import { browseAbandonmentWorker } from "./workers/browse-abandonment.worker";
import { copyLearnerWorker } from "./workers/copy-learner.worker";
import { basketAnalysisWorker } from "./workers/basket-analysis.worker";
import { productSegmentsWorker } from "./workers/product-segments.worker";
import { privacyRetentionWorker } from "./workers/privacy-retention.worker";

// Clean up stale Redis connections from previous ungraceful shutdowns.
// When workers are force-killed (SIGKILL/kill -9), their blocking BullMQ
// connections stay open in Redis until TCP keepalive timeout (~5 min).
// During that time, new workers can't pick up queued jobs because BullMQ
// thinks the dead worker is still active. This is the root cause of the
// "stuck at syncing" issue after restarts.
import Redis from "ioredis";
(async () => {
  try {
    const cleanupRedis = new Redis({
      host: (redisConnection as any).host as string,
      port: (redisConnection as any).port as number,
      password: (redisConnection as any).password,
      maxRetriesPerRequest: 1,
    });
    // Kill idle connections from previous workers (idle > 30 seconds, not the current one)
    const clients = await cleanupRedis.client("LIST") as string;
    let cleaned = 0;
    for (const line of clients.split("\n")) {
      const idleMatch = line.match(/idle=(\d+)/);
      const idStr = line.match(/id=(\d+)/);
      if (idleMatch && idStr) {
        const idle = parseInt(idleMatch[1]!);
        if (idle > 30 && line.includes("name=")) {
          try {
            await cleanupRedis.client("KILL", "ID", idStr[1]!);
            cleaned++;
          } catch { /* skip */ }
        }
      }
    }
    if (cleaned > 0) {
      console.log(`[startup] Cleaned ${cleaned} stale Redis connections from previous workers`);
    }
    await cleanupRedis.quit();
  } catch (err) {
    console.warn("[startup] Redis cleanup skipped:", (err as Error).message);
  }
})();

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
console.log(`  - revenue-forecaster worker: ${revenueForecastWorker.name}`);
console.log(`  - product-recommendation worker: ${productRecommendationWorker.name}`);
console.log(`  - shipping-update worker: ${shippingUpdateWorker.name}`);
console.log(`  - restock-alert worker: ${restockAlertWorker.name}`);
console.log(`  - price-drop worker: ${priceDropWorker.name}`);
console.log(`  - repurchase-reminder worker: ${repurchaseReminderWorker.name}`);
console.log(`  - inventory-monitor worker: ${inventoryMonitorWorker.name}`);
console.log(`  - store-activation worker: ${storeActivationWorker.name}`);
console.log(`  - outcome-attribution worker: ${outcomeAttributionWorker.name}`);
console.log(`  - churn-intervention worker: ${churnInterventionWorker.name}`);
console.log(`  - benchmark-aggregator worker: ${benchmarkAggregatorWorker.name}`);
console.log(`  - customer-voice worker: ${customerVoiceWorker.name}`);
console.log(`  - memory-writer worker: ${memoryWriterWorker.name}`);
console.log(`  - daily-revenue-email worker: ${dailyRevenueEmailWorker.name}`);
console.log(`  - overnight-ops worker: ${overnightOpsWorker.name}`);
console.log(`  - event-reactor worker: ${eventReactorWorker.name}`);
console.log(`  - browse-abandonment worker: ${browseAbandonmentWorker.name}`);
console.log(`  - copy-learner worker: ${copyLearnerWorker.name}`);
console.log(`  - basket-analysis worker: ${basketAnalysisWorker.name}`);
console.log(`  - product-segments worker: ${productSegmentsWorker.name}`);
console.log(`  - privacy-retention worker: ${privacyRetentionWorker.name}`);

// Daily/weekly jobs are CLOCK-ALIGNED via cron patterns in the brand's timezone
// (allo's market is Indian D2C — ₹/IST — so this makes "drafts before sunrise,
// approvals over coffee" literally true). Overnight work is staggered so the
// briefing (05:30) runs after the forecast/segments/affinity it summarizes, and
// the revenue email lands at 07:00 = over coffee. Sub-daily jobs stay interval-
// based. upsertJobScheduler with a stable id is idempotent across restarts, so
// Railway redeploys re-assert the same schedule instead of drifting/accumulating.
// (Per-store tz via store.timezone is a documented follow-up — the scheduler is
// global; the worker already iterates all active stores.)
const BRIEFING_TZ = "Asia/Kolkata";

/**
 * Register a repeatable schedule only if the v1 release boundary permits it.
 *
 * upsertJobScheduler persists the schedule in Redis under a stable id, so a
 * schedule written by an earlier release keeps firing even when this process
 * declines to register it. Blocked ids are therefore actively REMOVED, not
 * merely skipped. Returns a promise so existing .catch() handlers still apply.
 */
function gatedSchedule(
  queue: Queue,
  id: string,
  repeat: Parameters<Queue["upsertJobScheduler"]>[1],
  job: Parameters<Queue["upsertJobScheduler"]>[2],
): Promise<unknown> {
  if (isScheduleAllowed(id)) return queue.upsertJobScheduler(id, repeat, job);
  return queue.removeJobScheduler(id).then((removed) => {
    if (removed) console.log(`[v1-gate] removed out-of-scope schedule: ${id}`);
    return removed;
  });
}

// Schedule periodic trigger checks (every 5 minutes)
const triggerCheckQueue = new Queue(QUEUE_NAMES.TRIGGER_CHECK, { connection: redisConnection });
gatedSchedule(triggerCheckQueue,
  "trigger-check-schedule",
  { every: 5 * 60 * 1000 },
  { name: "trigger-check", data: { type: "cron" } }
).catch((err) => {
  console.error("Failed to set up trigger check schedule:", err.message);
});

// Schedule agent observation checks (every 6 hours)
const agentObserveQueue = new Queue(QUEUE_NAMES.AGENT_OBSERVE, { connection: redisConnection });
gatedSchedule(agentObserveQueue,
  "agent-observe-schedule",
  { every: 6 * 60 * 60 * 1000 },
  { name: "agent-observe", data: { type: "cron" } }
).catch((err) => {
  console.error("Failed to set up agent observe schedule:", err.message);
});

// Schedule abandoned cart checks (every 5 minutes)
const abandonedCartQueue = new Queue(QUEUE_NAMES.ABANDONED_CART_CHECK, { connection: redisConnection });
gatedSchedule(abandonedCartQueue,
  "abandoned-cart-check-schedule",
  { every: 5 * 60 * 1000 },
  { name: "abandoned-cart-check", data: { type: "cron" } }
).catch((err) => {
  console.error("Failed to set up abandoned cart check schedule:", err.message);
});

// Schedule opportunity scanning (every 2 hours)
const opportunityScanQueue = new Queue(QUEUE_NAMES.OPPORTUNITY_SCAN, { connection: redisConnection });
gatedSchedule(opportunityScanQueue,
  "opportunity-scan-schedule",
  { every: 2 * 60 * 60 * 1000 },
  { name: "opportunity-scan", data: { type: "cron" } }
).catch((err) => {
  console.error("Failed to set up opportunity scan schedule:", err.message);
});

// Schedule product cycle analysis (daily)
const productCyclesQueue = new Queue(QUEUE_NAMES.PRODUCT_CYCLES, { connection: redisConnection });
gatedSchedule(productCyclesQueue,
  "product-cycles-schedule",
  { pattern: "0 3 * * *", tz: BRIEFING_TZ },
  { name: "product-cycles", data: { type: "cron" } }
).catch((err) => {
  console.error("Failed to set up product cycles schedule:", err.message);
});

// Schedule daily briefings (every 24 hours)
const briefingQueue = new Queue(QUEUE_NAMES.MERCHANT_BRIEFING, { connection: redisConnection });
gatedSchedule(briefingQueue,
  "daily-briefing-schedule",
  { pattern: "30 5 * * *", tz: BRIEFING_TZ },
  { name: "daily-briefing", data: { type: "cron" } }
).catch((err) => {
  console.error("Failed to set up daily briefing schedule:", err.message);
});

// Schedule weekly reports (every 7 days)
const weeklyReportQueue = new Queue(QUEUE_NAMES.WEEKLY_REPORT, { connection: redisConnection });
gatedSchedule(weeklyReportQueue,
  "weekly-report-schedule",
  { pattern: "0 6 * * 1", tz: BRIEFING_TZ },
  { name: "weekly-report", data: { type: "cron" } }
).catch((err) => {
  console.error("Failed to set up weekly report schedule:", err.message);
});

// Schedule A/B test evaluation (every 6 hours)
const abTestQueue = new Queue(QUEUE_NAMES.AB_TEST, { connection: redisConnection });
gatedSchedule(abTestQueue,
  "ab-test-evaluation-schedule",
  { every: 6 * 60 * 60 * 1000 },
  { name: "ab-test-evaluation", data: { type: "cron" } }
).catch((err) => {
  console.error("Failed to set up A/B test evaluation schedule:", err.message);
});

// Schedule revenue forecast (daily)
const revenueForecastQueue = new Queue(QUEUE_NAMES.REVENUE_FORECAST, { connection: redisConnection });
gatedSchedule(revenueForecastQueue,
  "revenue-forecast-schedule",
  { pattern: "0 4 * * *", tz: BRIEFING_TZ },
  { name: "revenue-forecast", data: { type: "cron" } }
).catch((err) => {
  console.error("Failed to set up revenue forecast schedule:", err.message);
});

// Schedule product recommendation affinity build (daily)
const productRecommendationQueue = new Queue(QUEUE_NAMES.PRODUCT_RECOMMENDATION, { connection: redisConnection });
gatedSchedule(productRecommendationQueue,
  "product-recommendation-affinity-schedule",
  { pattern: "30 3 * * *", tz: BRIEFING_TZ },
  { name: "build-affinity", data: { type: "cron" } }
).catch((err) => {
  console.error("Failed to set up product recommendation schedule:", err.message);
});

// Schedule repurchase reminders (every 6 hours)
const repurchaseReminderQueue = new Queue(QUEUE_NAMES.REPURCHASE_REMINDER, { connection: redisConnection });
gatedSchedule(repurchaseReminderQueue,
  "repurchase-reminder-schedule",
  { every: 6 * 60 * 60 * 1000 },
  { name: "repurchase-reminder", data: { type: "cron" } }
).catch((err) => {
  console.error("Failed to set up repurchase reminder schedule:", err.message);
});

// Schedule inventory monitor (every 2 hours)
const inventoryMonitorQueue = new Queue(QUEUE_NAMES.INVENTORY_MONITOR, { connection: redisConnection });
gatedSchedule(inventoryMonitorQueue,
  "inventory-monitor-schedule",
  { every: 2 * 60 * 60 * 1000 },
  { name: "inventory-monitor", data: { type: "cron" } }
).catch((err) => {
  console.error("Failed to set up inventory monitor schedule:", err.message);
});

// Schedule outcome attribution (hourly)
const outcomeAttributionQueue = new Queue(QUEUE_NAMES.OUTCOME_ATTRIBUTION, { connection: redisConnection });
gatedSchedule(outcomeAttributionQueue,
  "outcome-attribution-schedule",
  { every: 60 * 60 * 1000 },
  { name: "outcome-attribution", data: { type: "hourly" } }
).catch((err) => {
  console.error("Failed to set up outcome attribution schedule:", err.message);
});

// Schedule daily revenue summary (every 24 hours)
gatedSchedule(outcomeAttributionQueue,
  "daily-revenue-summary-schedule",
  { pattern: "0 6 * * *", tz: BRIEFING_TZ },
  { name: "daily-revenue-summary", data: { type: "daily-summary" } }
).catch((err) => {
  console.error("Failed to set up daily revenue summary schedule:", err.message);
});

// Schedule churn intervention scan (every 6 hours — increased from daily for faster detection)
const churnInterventionQueue = new Queue(QUEUE_NAMES.CHURN_INTERVENTION, { connection: redisConnection });
gatedSchedule(churnInterventionQueue,
  "churn-intervention-schedule",
  { every: 6 * 60 * 60 * 1000 },
  { name: "churn-intervention", data: { type: "cron" } }
).catch((err) => {
  console.error("Failed to set up churn intervention schedule:", err.message);
});

// Schedule benchmark aggregation (weekly)
const benchmarkQueue = new Queue(QUEUE_NAMES.BENCHMARK_AGGREGATE, { connection: redisConnection });
gatedSchedule(benchmarkQueue,
  "benchmark-aggregate-schedule",
  { pattern: "0 23 * * 0", tz: BRIEFING_TZ },
  { name: "benchmark-aggregate", data: { type: "weekly" } }
).catch((err) => {
  console.error("Failed to set up benchmark aggregate schedule:", err.message);
});

// Schedule customer voice synthesis (weekly — every Monday)
const customerVoiceQueue = new Queue(QUEUE_NAMES.CUSTOMER_VOICE, { connection: redisConnection });
gatedSchedule(customerVoiceQueue,
  "customer-voice-schedule",
  { pattern: "0 4 * * 1", tz: BRIEFING_TZ },
  { name: "customer-voice", data: { type: "weekly" } }
).catch((err) => {
  console.error("Failed to set up customer voice schedule:", err.message);
});

// Schedule daily revenue email (daily at ~8am — runs every 24 hours)
const dailyRevenueEmailQueue = new Queue(QUEUE_NAMES.DAILY_REVENUE_EMAIL, { connection: redisConnection });
gatedSchedule(dailyRevenueEmailQueue,
  "daily-revenue-email-schedule",
  { pattern: "0 7 * * *", tz: BRIEFING_TZ },
  { name: "daily-revenue-email", data: { type: "cron" } }
).catch((err) => {
  console.error("Failed to set up daily revenue email schedule:", err.message);
});

// Schedule customer state decay (daily — recomputes stale lifecycle stages)
const customerStateDecayQueue = new Queue(QUEUE_NAMES.CUSTOMER_STATE, { connection: redisConnection });
gatedSchedule(customerStateDecayQueue,
  "state-decay-schedule",
  { pattern: "30 2 * * *", tz: BRIEFING_TZ },
  { name: "state-decay", data: { type: "state_decay", customerId: "", storeId: "" } }
).catch((err) => {
  console.error("Failed to set up state decay schedule:", err.message);
});

// Minimize privacy-request payloads and expire webhook deduplication records.
const privacyRetentionQueue = new Queue(QUEUE_NAMES.PRIVACY_RETENTION, { connection: redisConnection });
gatedSchedule(privacyRetentionQueue,
  "privacy-retention-schedule",
  { pattern: "0 3 * * *", tz: BRIEFING_TZ },
  { name: "privacy-retention", data: { type: "daily" } }
).catch((err) => {
  console.error("Failed to set up privacy retention schedule:", err.message);
});

// Schedule overnight ops (every 2 hours)
const overnightOpsQueue = new Queue(QUEUE_NAMES.OVERNIGHT_OPS, { connection: redisConnection });
gatedSchedule(overnightOpsQueue,
  "overnight-ops-schedule",
  { every: 2 * 60 * 60 * 1000 },
  { name: "overnight-scan", data: { type: "cron" } }
).catch((err) => {
  console.error("Failed to set up overnight ops schedule:", err.message);
});

// Schedule browse abandonment scan (every 30 minutes)
const browseAbandonmentQueue = new Queue(QUEUE_NAMES.BROWSE_ABANDONMENT, { connection: redisConnection });
gatedSchedule(browseAbandonmentQueue,
  "browse-abandonment-schedule",
  { every: 30 * 60 * 1000 },
  { name: "browse-abandonment", data: { type: "cron" } }
).catch((err) => {
  console.error("Failed to set up browse abandonment schedule:", err.message);
});

// Schedule copy learner (weekly)
const copyLearnerQueue = new Queue(QUEUE_NAMES.COPY_LEARNER, { connection: redisConnection });
gatedSchedule(copyLearnerQueue,
  "copy-learner-schedule",
  { pattern: "0 22 * * 0", tz: BRIEFING_TZ },
  { name: "copy-learner", data: { type: "weekly" } }
).catch((err) => {
  console.error("Failed to set up copy learner schedule:", err.message);
});

// Schedule basket analysis (daily)
const basketAnalysisQueue = new Queue(QUEUE_NAMES.BASKET_ANALYSIS, { connection: redisConnection });
gatedSchedule(basketAnalysisQueue,
  "basket-analysis-schedule",
  { pattern: "15 3 * * *", tz: BRIEFING_TZ },
  { name: "basket-analysis", data: { type: "cron" } }
).catch((err) => {
  console.error("Failed to set up basket analysis schedule:", err.message);
});

// Schedule product segments analysis (daily)
const productSegmentsQueue = new Queue(QUEUE_NAMES.PRODUCT_SEGMENTS, { connection: redisConnection });
gatedSchedule(productSegmentsQueue,
  "product-segments-schedule",
  { pattern: "45 3 * * *", tz: BRIEFING_TZ },
  { name: "product-segments", data: { type: "cron" } }
).catch((err) => {
  console.error("Failed to set up product segments schedule:", err.message);
});

console.log(
  isV1ReleaseMode()
    ? "[v1-gate] v1 release boundary ACTIVE — email-only, no autopilot/proactive schedules"
    : "[v1-gate] v1 release boundary DISABLED (V1_RELEASE_MODE=false)",
);

// Graceful shutdown with timeout — if workers don't close in 5s, force exit.
// This prevents zombie processes that hold Redis connections and block queues.
const shutdown = async () => {
  console.log("Shutting down workers...");
  const forceExitTimer = setTimeout(() => {
    console.error("Shutdown timed out after 5s — forcing exit");
    process.exit(1);
  }, 5000);
  try {
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
      revenueForecastWorker.close(),
      productRecommendationWorker.close(),
      shippingUpdateWorker.close(),
      restockAlertWorker.close(),
      priceDropWorker.close(),
      repurchaseReminderWorker.close(),
      inventoryMonitorWorker.close(),
      storeActivationWorker.close(),
      outcomeAttributionWorker.close(),
      churnInterventionWorker.close(),
      benchmarkAggregatorWorker.close(),
      customerVoiceWorker.close(),
      memoryWriterWorker.close(),
      dailyRevenueEmailWorker.close(),
      overnightOpsWorker.close(),
      eventReactorWorker.close(),
      browseAbandonmentWorker.close(),
      copyLearnerWorker.close(),
      basketAnalysisWorker.close(),
      productSegmentsWorker.close(),
    ]);
  } catch (err) {
    console.error("Error during shutdown:", (err as Error).message);
  }
  clearTimeout(forceExitTimer);
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
process.on("SIGHUP", shutdown);
