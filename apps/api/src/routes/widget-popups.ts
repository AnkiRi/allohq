import type { IncomingMessage, ServerResponse } from "http";
import { prisma } from "@allohq/database";
import { Queue } from "bullmq";
import {
  renderFormHtml,
  captureSubmission,
  deliverIncentive,
} from "@allohq/forms-and-popups";
import type { FormField, FormStyling, IncentiveConfig, PopupTriggerConfig, PopupStyling } from "@allohq/forms-and-popups";
import {
  authenticateWidgetStore,
  isAllowedWidgetOrigin,
} from "./widget-api";
import { checkRateLimit } from "../middleware/rate-limit";
import {
  bearerToken,
  verifyWidgetVisitorToken,
} from "../security/widget-visitor-token";

const redisConnection = {
  host: process.env["REDIS_HOST"] ?? "localhost",
  port: Number(process.env["REDIS_PORT"] ?? 6379),
  password: process.env["REDIS_PASSWORD"],
};

const customerStateQueue = new Queue("customer-state", { connection: redisConnection });

/** Parse JSON body from request */
function parseBody(
  req: IncomingMessage,
  maxBytes = 32 * 1024,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let data = "";
    let bytes = 0;
    req.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      data += chunk.toString();
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

/** Send JSON response */
function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json",
  });
  res.end(JSON.stringify(data));
}

/**
 * Widget popup API routes.
 *
 * GET  /widget/popups                   — Fetch active popup configs for a store
 * POST /widget/submit                    — Submit a form from a popup
 */
export async function handleWidgetPopups(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    const preflightOrigin =
      typeof req.headers.origin === "string" ? req.headers.origin : undefined;
    res.writeHead(204, {
      ...(preflightOrigin
        ? { "Access-Control-Allow-Origin": preflightOrigin, Vary: "Origin" }
        : {}),
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Joon-Publishable-Key",
    });
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const store = await authenticateWidgetStore(req);
  if (!store) {
    json(res, 401, { error: "Invalid or missing API key" });
    return;
  }

  const origin =
    typeof req.headers.origin === "string" ? req.headers.origin : undefined;
  if (!isAllowedWidgetOrigin(origin, store)) {
    json(res, 403, { error: "Origin is not allowed for this store" });
    return;
  }
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, X-Joon-Publishable-Key",
  );
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  const token = bearerToken(req.headers.authorization);
  const visitor = token && origin
    ? verifyWidgetVisitorToken(token, { storeId: store.id, origin })
    : null;
  if (!visitor) {
    json(res, 401, { error: "Missing or invalid visitor token" });
    return;
  }

  const forwarded = req.headers["x-forwarded-for"];
  const ip =
    typeof forwarded === "string"
      ? forwarded.split(",")[0]?.trim() ?? "unknown"
      : req.socket.remoteAddress ?? "unknown";
  const rateLimit = checkRateLimit(`widget-popup:${store.id}:${ip}`, {
    maxRequests: 60,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    res.setHeader(
      "Retry-After",
      String(Math.max(1, Math.ceil(rateLimit.resetMs / 1_000))),
    );
    json(res, 429, { error: "Too many requests" });
    return;
  }

  // GET /widget/popups
  if (url.pathname === "/widget/popups" && req.method === "GET") {
    const popups = await prisma.popup.findMany({
      where: { storeId: store.id, status: "active" },
      include: { form: true },
    });

    // Load brand tokens for popup styling
    const brandVisualProfile = await prisma.brandVisualProfile.findUnique({
      where: { storeId: store.id },
      select: { brandDesignTokens: true },
    });
    const brandTokens = brandVisualProfile?.brandDesignTokens as Record<string, string> | null;

    const configs = popups.map((popup) => {
      const fields = (popup.form.fields as unknown as FormField[]) ?? [];
      const formStyling = (popup.form.styling as unknown as FormStyling) ?? {};

      // Merge brand tokens into form styling if available
      if (brandTokens) {
        formStyling.backgroundColor = formStyling.backgroundColor ?? brandTokens["primaryBackground"];
        formStyling.textColor = formStyling.textColor ?? brandTokens["textPrimary"];
        formStyling.buttonColor = formStyling.buttonColor ?? brandTokens["ctaBackground"];
        formStyling.buttonTextColor = formStyling.buttonTextColor ?? brandTokens["ctaTextColor"];
        formStyling.fontFamily = formStyling.fontFamily ?? brandTokens["bodyFont"];
      }

      const rendered = renderFormHtml(fields, formStyling);

      return {
        popupId: popup.id,
        formHtml: rendered.html,
        formCss: rendered.css,
        trigger: popup.trigger,
        triggerConfig: (popup.triggerConfig as unknown as PopupTriggerConfig) ?? {},
        styling: (popup.styling as unknown as PopupStyling) ?? {
          position: "center",
          overlayColor: "rgba(0,0,0,0.5)",
          width: "420px",
          animation: "fade",
        },
      };
    });

    json(res, 200, configs);
    return;
  }

  // POST /widget/submit
  if (url.pathname === "/widget/submit" && req.method === "POST") {
    try {
      const body = await parseBody(req);
      const popupId = body["popupId"] as string;
      const data = body["data"] as Record<string, unknown>;
      const source = (body["source"] as string) ?? "popup";

      if (!data || typeof data !== "object" || Array.isArray(data)) {
        json(res, 400, { error: "data required" });
        return;
      }

      // Find the popup's form
      let formId: string | null = null;
      if (popupId) {
        const popup = await prisma.popup.findUnique({
          where: { id: popupId },
          select: { formId: true, storeId: true, status: true },
        });
        formId =
          popup?.storeId === store.id && popup.status === "active"
            ? popup.formId
            : null;
      }

      if (!formId) {
        // Try to find form from storeId
        const form = await prisma.form.findFirst({
          where: { storeId: store.id, status: "active" },
          select: { id: true },
        });
        formId = form?.id ?? null;
      }

      if (!formId) {
        json(res, 404, { error: "No active form found" });
        return;
      }

      // Extract consent from form data (checkboxes named consent_email, consent_sms, consent_whatsapp)
      const consent: { email?: boolean; sms?: boolean; whatsapp?: boolean } = {};
      if (data["consent_email"] !== undefined) {
        consent.email = data["consent_email"] === "true" || data["consent_email"] === "on" || data["consent_email"] === true;
      }
      if (data["consent_sms"] !== undefined) {
        consent.sms = data["consent_sms"] === "true" || data["consent_sms"] === "on" || data["consent_sms"] === true;
      }
      if (data["consent_whatsapp"] !== undefined) {
        consent.whatsapp = data["consent_whatsapp"] === "true" || data["consent_whatsapp"] === "on" || data["consent_whatsapp"] === true;
      }

      // Capture submission
      const result = await captureSubmission({
        formId,
        storeId: store.id,
        data,
        source,
        consent,
      });

      // Check for incentive
      const form = await prisma.form.findUnique({
        where: { id: formId },
        select: { incentiveConfig: true },
      });

      let discountCode: string | null = null;
      const incentiveConfig = form?.incentiveConfig as unknown as IncentiveConfig | null;
      if (incentiveConfig) {
        const incentiveResult = await deliverIncentive(store.id, incentiveConfig);
        discountCode = incentiveResult?.code ?? null;
      }

      // Queue CustomerState update for consent/channel preferences
      if (result.customerId) {
        await customerStateQueue.add("form-submission", {
          type: "form_submitted",
          customerId: result.customerId,
          storeId: store.id,
          data: { consent },
          timestamp: new Date().toISOString(),
        });
      }

      json(res, 200, {
        success: true,
        submissionId: result.submissionId,
        customerId: result.customerId,
        discountCode,
      });
    } catch (err) {
      console.error("[Widget Popup] Submit error:", err);
      json(res, 500, { error: "Internal server error" });
    }
    return;
  }

  json(res, 404, { error: "Not found" });
}
