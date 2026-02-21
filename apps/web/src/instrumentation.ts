/**
 * Next.js instrumentation hook — runs once on server startup.
 * Overrides global fetch to use Google DNS, bypassing the stale system DNS cache
 * that resolves Shopify domains to a wrong IP.
 * Falls back to system DNS for localhost and private hostnames.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { fetch: undiciFetch, Agent, setGlobalDispatcher } = await import(
      "undici"
    );
    const dns = await import("node:dns");

    const googleResolver = new dns.Resolver();
    googleResolver.setServers(["8.8.8.8", "1.1.1.1"]);

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

          googleResolver.resolve4(hostname, (err, addresses) => {
            if (err) return cb(err);
            if (options?.all) {
              cb(
                null,
                addresses.map((addr) => ({ address: addr, family: 4 }))
              );
            } else {
              cb(null, addresses[0], 4);
            }
          });
        },
      },
    });

    setGlobalDispatcher(agent);
    (globalThis as any).fetch = undiciFetch;
  }
}
