/**
 * One email worker process for the queue proof (email-queue.load.integration.ts).
 * Test-only: never imported by the service.
 *
 * It runs the production `sendWorker`, exactly as the workers service does,
 * with one difference: the email provider is the test's local fake. Requests
 * to api.resend.com go to FAKE_RESEND_URL, and every other host is refused and
 * reported, so this process cannot reach anything real.
 *
 * Running it as its own process is what lets the test kill it mid-campaign
 * (SIGKILL, like a crashed container) or stop it gracefully (SIGTERM, like a
 * deploy) and start another.
 */
const fake = process.env["FAKE_RESEND_URL"];
if (!fake) throw new Error("FAKE_RESEND_URL is required");

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname !== "api.resend.com") {
    process.send?.({ blocked: url.hostname });
    throw new Error(`network disabled in this test: ${url.hostname}`);
  }
  return realFetch(new URL(`${url.pathname}${url.search}`, fake), init);
}) as typeof fetch;

void (async () => {
  const { sendWorker } = await import("./send.worker");
  // Production runs this worker at concurrency 1; so does the proof.
  sendWorker.concurrency = Number(process.env["QUEUE_CONCURRENCY"] ?? 1);
  const stop = async () => {
    await sendWorker.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => void stop());
  console.log(`[queue-worker] pid ${process.pid} ready, concurrency ${sendWorker.concurrency}`);
  process.send?.({ ready: true });
})();
