import {
  VisualAdapterError,
  type VisualAdapter,
  type VisualAdapterRequest,
  type VisualAdapterResult,
} from "./types";

/**
 * Google Gemini image generation — Nano Banana 2 and Nano Banana Pro.
 *
 * This is the product-reference path: the merchant's real Shopify product
 * image is sent to the model as INLINE IMAGE DATA, not described in the
 * prompt. Describing a product and hoping is what produces a convincing
 * picture of something the merchant does not sell.
 *
 * Uses `generateContent` over plain fetch rather than an SDK, so the outgoing
 * request shape is visible and can be asserted in tests without a live call.
 */

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; inlineData?: { mimeType?: string; data?: string } }> };
    finishReason?: string;
  }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string };
};

export function buildGeminiImageRequest(request: VisualAdapterRequest): {
  url: string;
  body: { contents: Array<{ role: "user"; parts: GeminiPart[] }>; generationConfig: Record<string, unknown> };
} {
  const parts: GeminiPart[] = [{ text: request.prompt }];
  // Every reference goes in as real bytes. The order matters to the model, so
  // the prompt leads and the images follow it.
  for (const reference of request.references ?? []) {
    parts.push({
      inline_data: { mime_type: reference.mimeType, data: reference.bytes.toString("base64") },
    });
  }
  return {
    url: `${ENDPOINT}/${request.apiModelId}:generateContent`,
    body: {
      contents: [{ role: "user", parts }],
      generationConfig: { responseModalities: ["IMAGE"] },
    },
  };
}

function firstImage(response: GeminiResponse): { data: string; mimeType: string } | null {
  for (const candidate of response.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      if (part.inlineData?.data) {
        return { data: part.inlineData.data, mimeType: part.inlineData.mimeType ?? "image/png" };
      }
    }
  }
  return null;
}

export const geminiImageAdapter: VisualAdapter = {
  id: "gemini-image",
  credentialEnvVar: "GOOGLE_API_KEY",
  isConfigured: () => Boolean(process.env["GOOGLE_API_KEY"]?.trim()),

  async generate(request: VisualAdapterRequest): Promise<VisualAdapterResult> {
    const apiKey = process.env["GOOGLE_API_KEY"]?.trim();
    if (!apiKey) {
      throw new VisualAdapterError(
        "Image generation is not available for this workspace yet.",
        "GOOGLE_API_KEY is not set",
        "unavailable",
      );
    }

    const { url, body } = buildGeminiImageRequest(request);
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });
    } catch (error) {
      throw new VisualAdapterError(
        "Joon could not reach the image service. Your email is unchanged.",
        `gemini fetch failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const payload = (await response.json().catch(() => ({}))) as GeminiResponse;

    if (!response.ok) {
      const detail = payload.error?.message ?? `HTTP ${response.status}`;
      // 403/404 on a model is an account-access answer, not a transient fault.
      const kind = response.status === 403 || response.status === 404 ? "not_permitted" : "failed";
      throw new VisualAdapterError(
        kind === "not_permitted"
          ? "This workspace's image model is not enabled on the connected account."
          : "Joon could not create an image just now. Your email is unchanged.",
        `gemini ${request.apiModelId}: ${detail}`,
        kind,
      );
    }

    if (payload.promptFeedback?.blockReason) {
      throw new VisualAdapterError(
        "That request was declined by the image service. Try describing the scene differently.",
        `gemini blocked: ${payload.promptFeedback.blockReason}`,
        "rejected",
      );
    }

    const image = firstImage(payload);
    if (!image) {
      throw new VisualAdapterError(
        "Joon could not create an image just now. Your email is unchanged.",
        `gemini ${request.apiModelId} returned no image part`,
      );
    }

    return {
      imageBase64: image.data,
      mimeType: image.mimeType,
      usage: payload.usageMetadata
        ? { tokens: payload.usageMetadata.totalTokenCount, raw: payload.usageMetadata }
        : undefined,
    };
  },
};
