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
const automationTriggerQueue = new Queue("automation-trigger", { connection: redisConnection });

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

  // The publishable key is intentionally public. Resolve it only when the
  // requesting storefront Origin matches the claimed shop, so theme app
  // embeds can bootstrap without asking a merchant to paste credentials.
  if (url.pathname === "/widget/bootstrap" && req.method === "GET") {
    const shop = url.searchParams.get("shop")?.trim().toLowerCase();
    const origin = typeof req.headers.origin === "string" ? req.headers.origin : undefined;
    if (!shop || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
      json(res, 400, { error: "Valid shop domain required" });
      return;
    }
    const bootstrapStore = await prisma.store.findFirst({
      where: { shopDomain: shop, isActive: true },
      select: { widgetPublicKey: true, shopDomain: true, widgetAllowedOrigins: true },
    });
    if (!bootstrapStore?.widgetPublicKey || !isAllowedWidgetOrigin(origin, bootstrapStore)) {
      json(res, 403, { error: "Storefront origin is not allowed" });
      return;
    }
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Cache-Control", "no-store");
    json(res, 200, { publishableKey: bootstrapStore.widgetPublicKey });
    return;
  }

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
    await prisma.storefrontEvent.upsert({
      where: {
        storeId_source_externalEventId: {
          storeId: store.id,
          source: "joon_signup_embed",
          externalEventId: `embed-${store.id}`,
        },
      },
      create: {
          storeId: store.id,
          source: "joon_signup_embed",
          externalEventId: `embed-${store.id}`,
          type: "signup_embed_loaded",
          visitorId: visitor.visitorId,
          sessionId: visitor.visitorId,
          data: {},
          occurredAt: new Date(),
      },
      update: {},
    });
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
      formStyling.privacyPolicyUrl =
        formStyling.privacyPolicyUrl ?? `https://${store.shopDomain}/policies/privacy-policy`;

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

      // A submission must resolve to the exact active popup and active form.
      // Never fall back to another form in the store.
      const popup = popupId
        ? await prisma.popup.findFirst({
            where: { id: popupId, storeId: store.id, status: "active", form: { status: "active" } },
            include: { form: true },
          })
        : null;
      if (!popup) {
        json(res, 404, { error: "Active signup form not found" });
        return;
      }

      const configuredFields = (popup.form.fields as unknown as FormField[]) ?? [];
      const formStyling = (popup.form.styling as unknown as FormStyling) ?? {};
      const sanitizedData: Record<string, unknown> = {};
      for (const field of configuredFields) {
        const value = data[field.name];
        if (field.type === "checkbox") {
          sanitizedData[field.name] = value === "true" || value === "on" || value === true;
        } else if (typeof value === "string") {
          sanitizedData[field.name] = value.trim().slice(0, field.type === "email" ? 320 : 500);
        }
      }
      const rawPhone = sanitizedData["phone"];
      if (rawPhone !== undefined) {
        const normalizedPhone = typeof rawPhone === "string" ? rawPhone.replace(/[\s().-]/g, "") : "";
        if (!/^\+[1-9]\d{7,14}$/.test(normalizedPhone)) {
          json(res, 400, { error: "Use an international phone number such as +14155552671" });
          return;
        }
        sanitizedData["phone"] = normalizedPhone;
      }
      const email = sanitizedData["email"];
      if (typeof email !== "string" || !/^\S+@\S+\.\S+$/.test(email)) {
        json(res, 400, { error: "A valid email address is required" });
        return;
      }
      const emailConsentField = configuredFields.some(
        (field) => field.name === "consent_email" && field.type === "checkbox" && field.required,
      );
      if (!emailConsentField || sanitizedData["consent_email"] !== true) {
        json(res, 400, { error: "Explicit email consent is required" });
        return;
      }

      const normalizedEmail = email.trim().toLowerCase();
      const existingCustomer = await prisma.customer.findFirst({
        where: { storeId: store.id, email: normalizedEmail },
        select: {
          id: true,
          contactConsents: {
            where: { channel: "email" },
            select: { status: true },
            take: 1,
          },
        },
      });
      const isNewEmailSubscriber =
        !existingCustomer || existingCustomer.contactConsents[0]?.status !== "opted_in";

      // Extract consent from form data (checkboxes named consent_email, consent_sms, consent_whatsapp)
      const consent: { email?: boolean; sms?: boolean; whatsapp?: boolean } = {};
      consent.email = true;
      const hasSmsConsent = configuredFields.some(
        (field) => field.name === "consent_sms" && field.type === "checkbox",
      );
      consent.sms = hasSmsConsent && sanitizedData["phone"]
        ? sanitizedData["consent_sms"] === true
        : undefined;
      if (sanitizedData["phone"] && consent.sms !== true) {
        json(res, 400, { error: "SMS consent is required to submit a phone number" });
        return;
      }

      // Capture submission
      const result = await captureSubmission({
        formId: popup.formId,
        storeId: store.id,
        data: sanitizedData,
        source,
        consent,
        consentEvidence: {
          disclosureVersion: formStyling.consentVersion ?? "global-v1",
          market: formStyling.market ?? "global",
          privacyPolicyUrl: formStyling.privacyPolicyUrl,
          locale: req.headers["accept-language"]?.split(",")[0]?.slice(0, 16) ?? "unknown",
          capturedAt: new Date().toISOString(),
          popupId,
        },
      });

      // Check for incentive
      let discountCode: string | null = null;
      const incentiveConfig = popup.form.incentiveConfig as unknown as IncentiveConfig | null;
      if (incentiveConfig && isNewEmailSubscriber) {
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
        const welcomeAutomations = isNewEmailSubscriber ? await prisma.automation.findMany({
          where: {
            storeId: store.id,
            status: "active",
            category: "welcome_series",
            triggerType: "event",
          },
          select: { id: true },
        }) : [];
        for (const automation of welcomeAutomations) {
          await automationTriggerQueue.add(
            "automation-trigger",
            {
              automationId: automation.id,
              customerId: result.customerId,
              triggeredBy: "form_submitted",
              eventInstanceId: result.submissionId,
            },
            { jobId: `${automation.id}-${result.customerId}-${result.submissionId}` },
          );
        }
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
