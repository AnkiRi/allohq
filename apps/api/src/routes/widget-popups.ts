import type { IncomingMessage, ServerResponse } from "http";
import { prisma } from "@allohq/database";
import { Queue } from "bullmq";
import {
  renderFormHtml,
  captureSubmission,
  deliverIncentive,
} from "@allohq/forms-and-popups";
import type { FormField, FormStyling, IncentiveConfig, PopupTriggerConfig, PopupStyling } from "@allohq/forms-and-popups";

const redisConnection = {
  host: process.env["REDIS_HOST"] ?? "localhost",
  port: Number(process.env["REDIS_PORT"] ?? 6379),
  password: process.env["REDIS_PASSWORD"],
};

const customerStateQueue = new Queue("customer-state", { connection: redisConnection });

/** Parse JSON body from request */
function parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: string) => (data += chunk));
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
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Store-Id, X-API-Key",
  });
  res.end(JSON.stringify(data));
}

/**
 * Widget popup API routes.
 *
 * GET  /widget/popups?storeId=xxx       — Fetch active popup configs for a store
 * POST /widget/submit                    — Submit a form from a popup
 */
export async function handleWidgetPopups(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Store-Id, X-API-Key",
    });
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  // GET /widget/popups?storeId=xxx
  if (url.pathname === "/widget/popups" && req.method === "GET") {
    const storeId = url.searchParams.get("storeId");
    if (!storeId) {
      json(res, 400, { error: "storeId required" });
      return;
    }

    const popups = await prisma.popup.findMany({
      where: { storeId, status: "active" },
      include: { form: true },
    });

    // Load brand tokens for popup styling
    const brandVisualProfile = await prisma.brandVisualProfile.findUnique({
      where: { storeId },
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
      const storeId = body["storeId"] as string;
      const popupId = body["popupId"] as string;
      const data = body["data"] as Record<string, unknown>;
      const source = (body["source"] as string) ?? "popup";

      if (!storeId || !data) {
        json(res, 400, { error: "storeId and data required" });
        return;
      }

      // Find the popup's form
      let formId: string | null = null;
      if (popupId) {
        const popup = await prisma.popup.findUnique({
          where: { id: popupId },
          select: { formId: true },
        });
        formId = popup?.formId ?? null;
      }

      if (!formId) {
        // Try to find form from storeId
        const form = await prisma.form.findFirst({
          where: { storeId, status: "active" },
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
      } else if (data["email"]) {
        // Default: if they submitted an email without explicit consent checkbox, treat as opt-in
        consent.email = true;
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
        storeId,
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
        const incentiveResult = await deliverIncentive(storeId, incentiveConfig);
        discountCode = incentiveResult?.code ?? null;
      }

      // Queue CustomerState update for consent/channel preferences
      if (result.customerId) {
        await customerStateQueue.add("form-submission", {
          type: "form_submitted",
          customerId: result.customerId,
          storeId,
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
