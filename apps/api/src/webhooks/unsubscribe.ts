import type { IncomingMessage, ServerResponse } from "http";
import { prisma } from "@allohq/database";
import { verifyUnsubscribeToken } from "@allohq/messaging";

/**
 * Handle unsubscribe requests.
 * GET /unsubscribe?token=<signed-channel-scoped-token>
 *
 * Verifies the token, records channel-specific consent evidence and a permanent
 * suppression. Idempotent — safe to call multiple times.
 */
export async function handleUnsubscribe(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "text/plain" });
    res.end("Method Not Allowed");
    return;
  }

  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    let token = url.searchParams.get("token");

    // RFC 8058: one-click unsubscribe via POST
    if (req.method === "POST" && !token) {
      const body = await readRequestBody(req);
      const params = new URLSearchParams(body);
      token = params.get("token");
    }

    if (!token) {
      res.writeHead(400, { "Content-Type": "text/html" });
      res.end(renderPage("Invalid Request", "Missing unsubscribe token."));
      return;
    }

    const claims = verifyUnsubscribeToken(token);
    if (!claims) {
      res.writeHead(400, { "Content-Type": "text/html" });
      res.end(renderPage("Invalid Request", "This unsubscribe link is invalid or has expired."));
      return;
    }
    const { customerId, channel } = claims;

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, storeId: true, acceptsMarketing: true },
    });

    if (!customer) {
      res.writeHead(404, { "Content-Type": "text/html" });
      res.end(renderPage("Not Found", "We couldn't find your subscription."));
      return;
    }

    const now = new Date();
    await prisma.$transaction([
      prisma.contactConsent.upsert({
        where: { customerId_channel: { customerId, channel } },
        create: {
          storeId: customer.storeId,
          customerId,
          channel,
          status: "opted_out",
          source: "unsubscribe",
          evidence: { tokenVersion: 1, method: req.method },
          revokedAt: now,
        },
        update: {
          status: "opted_out",
          source: "unsubscribe",
          evidence: { tokenVersion: 1, method: req.method },
          revokedAt: now,
        },
      }),
      prisma.contactSuppression.upsert({
        where: { customerId_channel: { customerId, channel } },
        create: {
          storeId: customer.storeId,
          customerId,
          channel,
          reason: "unsubscribe",
          source: "joon",
        },
        update: {
          reason: "unsubscribe",
          source: "joon",
          expiresAt: null,
        },
      }),
      ...(channel === "email"
        ? [
            prisma.customer.update({
              where: { id: customerId },
              data: { acceptsMarketing: false },
            }),
          ]
        : []),
    ]);

    await prisma.messageLog.updateMany({
      where: { customerId, channel, outcome: null },
      data: { outcome: "unsubscribed", outcomeTimestamp: now },
    });

    console.log(`[unsubscribe] Customer ${customerId} unsubscribed from ${channel}`);

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(renderPage("Unsubscribed", `You've been unsubscribed from ${channel} marketing messages.`));
  } catch (err) {
    console.error("[unsubscribe] Error:", err);
    res.writeHead(500, { "Content-Type": "text/html" });
    res.end(renderPage("Error", "Something went wrong. Please try again later."));
  }
}

function readRequestBody(req: IncomingMessage, maxBytes = 8 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    let bytes = 0;
    req.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      body += chunk.toString();
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function renderPage(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f5f5; color: #333; }
    .card { background: white; padding: 48px; border-radius: 12px; text-align: center; max-width: 480px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    h1 { font-size: 24px; margin: 0 0 16px; }
    p { font-size: 16px; color: #666; margin: 0; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}
