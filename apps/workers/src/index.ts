import { syncWorker } from "./workers/sync.worker";
import { rfmWorker } from "./workers/rfm.worker";
import { sendWorker } from "./workers/send.worker";
import { shopifyWebhookWorker } from "./workers/shopify-webhook.worker";

console.log("Starting AlloHQ workers...");
console.log(`  - sync worker: ${syncWorker.name}`);
console.log(`  - rfm worker: ${rfmWorker.name}`);
console.log(`  - send worker: ${sendWorker.name}`);
console.log(`  - shopify-webhook worker: ${shopifyWebhookWorker.name}`);

// Graceful shutdown
const shutdown = async () => {
  console.log("Shutting down workers...");
  await Promise.all([
    syncWorker.close(),
    rfmWorker.close(),
    sendWorker.close(),
    shopifyWebhookWorker.close(),
  ]);
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
