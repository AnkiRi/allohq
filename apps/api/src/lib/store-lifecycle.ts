import { Queue, type ConnectionOptions } from "bullmq";

export const STORE_SCOPED_QUEUE_NAMES = [
  "sync", "rfm", "ltv", "email-send", "brand-analysis", "automation-generate",
  "agent-pipeline", "automation-trigger", "trigger-check", "embedding", "agent-observe",
  "conversation-process", "abandoned-cart-check", "segment-change", "customer-state",
  "timing-profile", "guardrail-check", "brand-kit", "product-image", "creative-gen",
  "opportunity-scan", "campaign-factory", "product-cycles", "merchant-briefing",
  "baseline", "weekly-report", "journey-step", "ab-test", "revenue-forecast",
  "product-recommendation", "shipping-update", "restock-alert", "price-drop",
  "repurchase-reminder", "inventory-monitor", "store-activation", "outcome-attribution",
  "churn-intervention", "benchmark-aggregate", "customer-voice", "memory-writer",
  "daily-revenue-email", "overnight-ops", "event-react", "browse-abandonment",
  "copy-learner", "basket-analysis", "product-segments",
] as const;

type QueueLike = Pick<Queue, "getJobs" | "close">;

export type StoreQueueCleanup = {
  inspected: number;
  removed: number;
  active: number;
  failed: number;
};

export type StoreJobScope = {
  storeId: string;
  campaignIds?: ReadonlySet<string>;
  automationIds?: ReadonlySet<string>;
};

export function jobBelongsToStore(data: unknown, scope: StoreJobScope): boolean {
  if (!data || typeof data !== "object") return false;
  const record = data as Record<string, unknown>;
  return record.storeId === scope.storeId ||
    (typeof record.store === "object" && record.store !== null &&
      (record.store as Record<string, unknown>).id === scope.storeId) ||
    (typeof record.campaignId === "string" && Boolean(scope.campaignIds?.has(record.campaignId))) ||
    (typeof record.automationId === "string" && Boolean(scope.automationIds?.has(record.automationId)));
}

/** Best-effort cleanup. Database active-store checks remain the safety boundary. */
export async function removeStoreJobs(
  scope: StoreJobScope,
  connection: ConnectionOptions,
  createQueue: (name: string) => QueueLike = (name) => new Queue(name, { connection })
): Promise<StoreQueueCleanup> {
  const result: StoreQueueCleanup = { inspected: 0, removed: 0, active: 0, failed: 0 };
  for (const name of STORE_SCOPED_QUEUE_NAMES) {
    const queue = createQueue(name);
    try {
      const jobs = await queue.getJobs(["waiting", "delayed", "prioritized", "active", "failed"]);
      for (const job of jobs) {
        if (!jobBelongsToStore(job.data, scope)) continue;
        result.inspected += 1;
        if (await job.getState() === "active") {
          result.active += 1;
          continue;
        }
        try {
          await job.remove();
          result.removed += 1;
        } catch {
          result.failed += 1;
        }
      }
    } catch {
      result.failed += 1;
    } finally {
      await queue.close().catch(() => undefined);
    }
  }
  return result;
}
