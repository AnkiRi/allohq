import {
  VisualAdapterError,
  routeModel,
  type ModelEntry,
  type ReferenceImage,
  type StudioPreference,
} from "@allohq/customer-intelligence";
import { assetStorageStatus } from "./asset-storage-status";

/**
 * One generation, end to end, with nothing invented along the way.
 *
 * The order of the checks is the point. Storage first, because paying for an
 * image that cannot be saved is worse than not generating; then the model,
 * because a capability that is not configured must fail before spend; then the
 * reference bytes, because "product-faithful" is a lie unless the real product
 * actually reaches the model.
 */

export type GenerationRefusal = {
  /** Safe to render. Names no variable, bucket, model or provider internal. */
  merchantMessage: string;
  /** For the operator log only. */
  operatorDetail: string;
  stage: "storage" | "model" | "reference" | "provider";
};

export type GenerationPlan = {
  model: ModelEntry;
  /** True only when real product bytes will be sent as input. */
  referenceGrounded: boolean;
};

/**
 * Decide whether a generation may proceed, before anything is spent.
 *
 * `wantsReference` is the merchant asking for their own product. If no
 * configured model can take a reference, this REFUSES rather than quietly
 * producing an invented product — the substitution is the failure mode worth
 * preventing above all others here.
 */
export function planGeneration(input: {
  workload: "campaign_art" | "product_reference_edit" | "product_safe_composition";
  prefer?: StudioPreference;
  preferredModelId?: string;
  wantsReference: boolean;
  hasReferenceBytes: boolean;
}): { ok: true; plan: GenerationPlan } | { ok: false; refusal: GenerationRefusal } {
  const storage = assetStorageStatus();
  if (!storage.configured) {
    return {
      ok: false,
      refusal: {
        merchantMessage: storage.merchantMessage!,
        operatorDetail: `asset storage unavailable; missing ${storage.missing.join(", ")}`,
        stage: "storage",
      },
    };
  }

  if (input.wantsReference && !input.hasReferenceBytes) {
    return {
      ok: false,
      refusal: {
        merchantMessage:
          "This product has no image in your store, so Joon cannot keep it faithful. Pick a product with a photo, or ask for an illustrative concept instead.",
        operatorDetail: "reference requested but no product image bytes available",
        stage: "reference",
      },
    };
  }

  const decision = routeModel({
    workload: input.workload,
    prefer: input.prefer,
    preferredModelId: input.preferredModelId,
    hasReference: input.wantsReference,
  });

  if (!decision.ok) {
    return {
      ok: false,
      refusal: {
        merchantMessage: input.wantsReference
          ? "No image model that can work from your product photo is switched on for this workspace yet."
          : "Image generation is not available for this workspace yet.",
        operatorDetail: `${decision.reason} missing: ${decision.missing.join(", ")}`,
        stage: "model",
      },
    };
  }

  // Belt and braces over routing: if a reference was asked for, the chosen
  // model must actually accept one. Producing an invented product here and
  // presenting it as the merchant's would be the worst outcome available.
  if (input.wantsReference && !decision.model.capabilities.includes("image_reference_input")) {
    return {
      ok: false,
      refusal: {
        merchantMessage:
          "No image model that can work from your product photo is switched on for this workspace yet.",
        operatorDetail: `routing chose ${decision.model.id}, which cannot take a reference`,
        stage: "model",
      },
    };
  }

  return {
    ok: true,
    plan: { model: decision.model, referenceGrounded: input.wantsReference },
  };
}

/** Download the real product image so its BYTES can be sent to the model. */
export async function fetchReferenceBytes(url: string): Promise<ReferenceImage | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) return null;
    const mimeType = response.headers.get("content-type")?.split(";")[0] ?? "image/png";
    if (!/^image\/(png|jpeg|webp|gif)$/.test(mimeType)) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.byteLength || bytes.byteLength > 12 * 1024 * 1024) return null;
    return { bytes, mimeType };
  } catch {
    return null;
  }
}

/** Turn any adapter failure into something a merchant can read. */
export function refusalFromAdapterError(error: unknown): GenerationRefusal {
  if (error instanceof VisualAdapterError) {
    return { merchantMessage: error.merchantMessage, operatorDetail: error.message, stage: "provider" };
  }
  const detail = error instanceof Error ? error.message : String(error);
  return {
    merchantMessage: "Joon could not create an image just now. Your email is unchanged.",
    operatorDetail: detail,
    stage: "provider",
  };
}
