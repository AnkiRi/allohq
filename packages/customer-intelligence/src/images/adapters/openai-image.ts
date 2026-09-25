import {
  VisualAdapterError,
  type VisualAdapter,
  type VisualAdapterRequest,
  type VisualAdapterResult,
} from "./types";

/**
 * OpenAI image generation — the GPT Image 2.5 family.
 *
 * Two endpoints, chosen by whether the merchant supplied a reference:
 *
 *   - no reference → `/v1/images/generations`
 *   - reference    → `/v1/images/edits`, multipart, with the real image bytes
 *
 * Plain fetch rather than the SDK so the outgoing shape is assertable in tests
 * without a live call, and so multipart reference upload is explicit.
 *
 * `gpt-image-1` and `dall-e-3` are NOT the default path. They remain reachable
 * only as explicitly labelled legacy options, because `dall-e-3` in particular
 * is unavailable on many accounts — which is how image generation came to be
 * configured and dead in production.
 */

const BASE = "https://api.openai.com/v1";

type OpenAiImageResponse = {
  data?: Array<{ b64_json?: string; url?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
  error?: { message?: string; code?: string; type?: string };
};

/** Sizes the image endpoints accept. */
export function openAiSize(width: number, height: number): "1024x1024" | "1536x1024" | "1024x1536" {
  const ratio = width / height;
  if (ratio > 1.3) return "1536x1024";
  if (ratio < 0.77) return "1024x1536";
  return "1024x1024";
}

/**
 * Account-level refusals, which no retry will fix.
 *
 * Organisation verification is the common one for the newer image models, and
 * a merchant should be told their workspace needs attention rather than shown
 * an API code.
 */
function accountProblem(message: string): boolean {
  return /verif|not have access|does not exist|unsupported_model|unknown model|permission|not allowed/i.test(
    message,
  );
}

export const openAiImageAdapter: VisualAdapter = {
  id: "openai-image",
  credentialEnvVar: "OPENAI_API_KEY",
  isConfigured: () => Boolean(process.env["OPENAI_API_KEY"]?.trim()),

  async generate(request: VisualAdapterRequest): Promise<VisualAdapterResult> {
    const apiKey = process.env["OPENAI_API_KEY"]?.trim();
    if (!apiKey) {
      throw new VisualAdapterError(
        "Image generation is not available for this workspace yet.",
        "OPENAI_API_KEY is not set",
        "unavailable",
      );
    }

    const size = openAiSize(request.width, request.height);
    const reference = request.references?.[0];

    let response: Response;
    try {
      if (reference) {
        // Editing FROM the real product image. The bytes are uploaded; the
        // product is not described and re-imagined.
        const form = new FormData();
        form.append("model", request.apiModelId);
        form.append("prompt", request.prompt);
        form.append("size", size);
        if (request.quality) form.append("quality", request.quality);
        for (const [index, item] of (request.references ?? []).entries()) {
          form.append(
            "image[]",
            new Blob([new Uint8Array(item.bytes)], { type: item.mimeType }),
            `reference-${index}.png`,
          );
        }
        response = await fetch(`${BASE}/images/edits`, {
          method: "POST",
          headers: { authorization: `Bearer ${apiKey}` },
          body: form,
          signal: AbortSignal.timeout(120_000),
        });
      } else {
        response = await fetch(`${BASE}/images/generations`, {
          method: "POST",
          headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({
            model: request.apiModelId,
            prompt: request.prompt,
            size,
            n: 1,
            ...(request.quality ? { quality: request.quality } : {}),
          }),
          signal: AbortSignal.timeout(120_000),
        });
      }
    } catch (error) {
      throw new VisualAdapterError(
        "Joon could not reach the image service. Your email is unchanged.",
        `openai fetch failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const payload = (await response.json().catch(() => ({}))) as OpenAiImageResponse;

    if (!response.ok) {
      const detail = payload.error?.message ?? `HTTP ${response.status}`;
      if (accountProblem(detail)) {
        throw new VisualAdapterError(
          "This workspace's image model is not enabled on the connected account.",
          `openai ${request.apiModelId}: ${detail}`,
          "not_permitted",
        );
      }
      throw new VisualAdapterError(
        "Joon could not create an image just now. Your email is unchanged.",
        `openai ${request.apiModelId}: ${detail}`,
      );
    }

    const first = payload.data?.[0];
    if (first?.b64_json) {
      return {
        imageBase64: first.b64_json,
        mimeType: "image/png",
        usage: payload.usage ? { tokens: payload.usage.total_tokens, raw: payload.usage } : undefined,
      };
    }

    // Older models hand back a URL. Fetch it so every adapter returns bytes.
    if (first?.url) {
      const image = await fetch(first.url, { signal: AbortSignal.timeout(60_000) });
      if (!image.ok) {
        throw new VisualAdapterError(
          "Joon could not create an image just now. Your email is unchanged.",
          `openai image download failed: HTTP ${image.status}`,
        );
      }
      const bytes = Buffer.from(await image.arrayBuffer());
      return {
        imageBase64: bytes.toString("base64"),
        mimeType: image.headers.get("content-type") ?? "image/png",
        usage: payload.usage ? { tokens: payload.usage.total_tokens, raw: payload.usage } : undefined,
      };
    }

    throw new VisualAdapterError(
      "Joon could not create an image just now. Your email is unchanged.",
      `openai ${request.apiModelId} returned no image`,
    );
  },
};
