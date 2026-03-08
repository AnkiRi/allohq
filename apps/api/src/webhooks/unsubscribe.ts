import type { IncomingMessage, ServerResponse } from "http";
import { prisma } from "@allohq/database";

/**
 * Handle unsubscribe requests.
 * GET /unsubscribe?token=<base64url-encoded-customerId>
 *
 * Decodes the token, validates the customer exists, and sets acceptsMarketing=false.
 * Idempotent — safe to call multiple times.
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

    let customerId: string;
    try {
      customerId = Buffer.from(token, "base64url").toString("utf-8");
    } catch {
      res.writeHead(400, { "Content-Type": "text/html" });
      res.end(renderPage("Invalid Request", "Invalid unsubscribe token."));
      return;
    }

    if (!customerId) {
      res.writeHead(400, { "Content-Type": "text/html" });
      res.end(renderPage("Invalid Request", "Invalid unsubscribe token."));
      return;
    }

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, acceptsMarketing: true },
    });

    if (!customer) {
      res.writeHead(404, { "Content-Type": "text/html" });
      res.end(renderPage("Not Found", "We couldn't find your subscription."));
      return;
    }

    if (!customer.acceptsMarketing) {
      // Already unsubscribed — idempotent
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(renderPage("Already Unsubscribed", "You've already been unsubscribed from our emails."));
      return;
    }

    await prisma.customer.update({
      where: { id: customerId },
      data: { acceptsMarketing: false },
    });

    console.log(`[unsubscribe] Customer ${customerId} unsubscribed`);

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(renderPage("Unsubscribed", "You've been successfully unsubscribed. You will no longer receive marketing emails from us."));
  } catch (err) {
    console.error("[unsubscribe] Error:", err);
    res.writeHead(500, { "Content-Type": "text/html" });
    res.end(renderPage("Error", "Something went wrong. Please try again later."));
  }
}

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => (body += chunk.toString()));
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
