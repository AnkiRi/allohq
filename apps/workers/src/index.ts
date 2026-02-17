import { syncWorker } from "./workers/sync.worker";
import { rfmWorker } from "./workers/rfm.worker";
import { sendWorker } from "./workers/send.worker";

console.log("Starting AlloHQ workers...");
console.log(`  - sync worker: ${syncWorker.name}`);
console.log(`  - rfm worker: ${rfmWorker.name}`);
console.log(`  - send worker: ${sendWorker.name}`);

// Graceful shutdown
const shutdown = async () => {
  console.log("Shutting down workers...");
  await Promise.all([syncWorker.close(), rfmWorker.close(), sendWorker.close()]);
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
