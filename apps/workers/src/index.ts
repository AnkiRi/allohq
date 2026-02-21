// Use Google DNS to bypass stale system DNS cache.
// The system's DNS cache resolves Shopify domains to a wrong IP.
// We override globalThis.fetch with undici's fetch that uses a custom DNS resolver.
import { fetch as undiciFetch, Agent, setGlobalDispatcher } from "undici";
import dns from "node:dns";

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
