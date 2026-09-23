/**
 * What each model can actually do, and whether it is switched on here.
 *
 * The text harness routes by workload but assumes every model is
 * interchangeable. That is false the moment images are involved: a model that
 * cannot take a reference image cannot do product-faithful work, and falling
 * back to one that cannot would quietly turn "your product, in this scene"
 * into an invention.
 *
 * So capability is declared, availability is earned (a credential AND an
 * explicit switch), and fallback is only allowed within the capability that
 * was asked for.
 */

export const TEXT_WORKLOADS = [
  "strategy",
  "email_structure",
  "short_copy",
  "long_copy",
  "brand_refinement",
  "analysis",
  "classification",
  "agent",
] as const;

export const VISUAL_WORKLOADS = [
  "campaign_art",
  "product_safe_composition",
  "reference_grounded_edit",
  "image_analysis",
] as const;

export type TextWorkload = (typeof TEXT_WORKLOADS)[number];
export type VisualWorkload = (typeof VISUAL_WORKLOADS)[number];
export type HarnessWorkload = TextWorkload | VisualWorkload;

export type ModelCapability =
  | "text"
  | "image_generation"
  /** Accepts a reference image as an INPUT, not a description of one. */
  | "image_reference_input"
  | "image_analysis";

export type CostClass = "economy" | "standard" | "premium";

export type ModelEntry = {
  /** Stable internal id. */
  id: string;
  provider: "openai" | "anthropic" | "google" | "replicate";
  /** The id sent to the API. Never a marketing name. */
  apiModelId: string;
  /** What a merchant sees. */
  label: string;
  capabilities: ModelCapability[];
  inputModes: Array<"text" | "image_reference" | "multiple_references">;
  outputModes: Array<"text" | "image">;
  /** Approximate USD per call/image. Null where it varies too much to state. */
  costUsd: number | null;
  costClass: CostClass;
  /** Credential required. */
  credentialEnvVar: string;
  /**
   * Explicit switch. A credential alone never enables a model: an existing
   * OpenAI key should not silently start spending on a different, dearer model
   * because someone added it to the registry.
   */
  enableEnvVar: string | null;
  /** Quality/resolution options the Studio may offer. */
  qualityOptions?: string[];
};

/**
 * Claude is absent from every image capability on purpose: the Anthropic API
 * does not return images. Listing it as an image option would be a promise the
 * API cannot keep.
 */
export const MODEL_REGISTRY: readonly ModelEntry[] = [
  // --- text ---------------------------------------------------------------
  {
    id: "claude-sonnet",
    provider: "anthropic",
    apiModelId: "claude-sonnet-4-6",
    label: "Claude Sonnet",
    capabilities: ["text", "image_analysis"],
    inputModes: ["text", "image_reference"],
    outputModes: ["text"],
    costUsd: null,
    costClass: "standard",
    credentialEnvVar: "ANTHROPIC_API_KEY",
    enableEnvVar: null,
  },
  {
    id: "gpt-text",
    provider: "openai",
    apiModelId: "gpt-4o",
    label: "GPT-4o",
    capabilities: ["text", "image_analysis"],
    inputModes: ["text", "image_reference"],
    outputModes: ["text"],
    costUsd: null,
    costClass: "standard",
    credentialEnvVar: "OPENAI_API_KEY",
    enableEnvVar: null,
  },
  {
    id: "gemini-text",
    provider: "google",
    apiModelId: "gemini-2.5-flash",
    label: "Gemini Flash",
    capabilities: ["text", "image_analysis"],
    inputModes: ["text", "image_reference"],
    outputModes: ["text"],
    costUsd: null,
    costClass: "economy",
    credentialEnvVar: "GOOGLE_API_KEY",
    enableEnvVar: "JOON_GEMINI_TEXT_ENABLED",
  },

  // --- images: text to image ----------------------------------------------
  {
    id: "openai-gpt-image",
    provider: "openai",
    apiModelId: "gpt-image-1",
    label: "GPT Image",
    capabilities: ["image_generation", "image_reference_input"],
    inputModes: ["text", "image_reference"],
    outputModes: ["image"],
    costUsd: 0.07,
    costClass: "standard",
    credentialEnvVar: "OPENAI_API_KEY",
    enableEnvVar: null,
    qualityOptions: ["standard", "high"],
  },
  {
    id: "openai-dalle3",
    provider: "openai",
    apiModelId: "dall-e-3",
    label: "DALL·E 3",
    capabilities: ["image_generation"],
    inputModes: ["text"],
    outputModes: ["image"],
    costUsd: 0.04,
    costClass: "economy",
    credentialEnvVar: "OPENAI_API_KEY",
    enableEnvVar: null,
  },

  // --- images: reference-grounded -----------------------------------------
  {
    id: "nano-banana-2",
    provider: "google",
    apiModelId: "gemini-3.1-flash-image",
    label: "Nano Banana 2",
    capabilities: ["image_generation", "image_reference_input"],
    inputModes: ["text", "image_reference", "multiple_references"],
    outputModes: ["image"],
    costUsd: 0.04,
    costClass: "standard",
    credentialEnvVar: "GOOGLE_API_KEY",
    enableEnvVar: "JOON_NANO_BANANA_ENABLED",
    qualityOptions: ["standard"],
  },
  {
    id: "nano-banana-pro",
    provider: "google",
    apiModelId: "gemini-3-pro-image",
    label: "Nano Banana Pro",
    capabilities: ["image_generation", "image_reference_input"],
    inputModes: ["text", "image_reference", "multiple_references"],
    outputModes: ["image"],
    costUsd: 0.14,
    costClass: "premium",
    credentialEnvVar: "GOOGLE_API_KEY",
    enableEnvVar: "JOON_NANO_BANANA_PRO_ENABLED",
    qualityOptions: ["standard", "high"],
  },
  {
    id: "flux-kontext",
    provider: "replicate",
    apiModelId: "black-forest-labs/flux-kontext-pro",
    label: "Flux Kontext",
    capabilities: ["image_generation", "image_reference_input"],
    inputModes: ["text", "image_reference"],
    outputModes: ["image"],
    costUsd: 0.06,
    costClass: "standard",
    credentialEnvVar: "REPLICATE_API_TOKEN",
    enableEnvVar: "JOON_FLUX_KONTEXT_ENABLED",
  },
  {
    id: "flux-pro",
    provider: "replicate",
    apiModelId: "black-forest-labs/flux-1.1-pro",
    label: "Flux 1.1 Pro",
    capabilities: ["image_generation"],
    inputModes: ["text"],
    outputModes: ["image"],
    costUsd: 0.05,
    costClass: "standard",
    credentialEnvVar: "REPLICATE_API_TOKEN",
    enableEnvVar: null,
  },
];

/** The capability a workload cannot be served without. */
export const WORKLOAD_CAPABILITY: Record<HarnessWorkload, ModelCapability> = {
  strategy: "text",
  email_structure: "text",
  short_copy: "text",
  long_copy: "text",
  brand_refinement: "text",
  analysis: "text",
  classification: "text",
  agent: "text",
  campaign_art: "image_generation",
  product_safe_composition: "image_generation",
  // The whole point of this workload: the real product must reach the model.
  reference_grounded_edit: "image_reference_input",
  image_analysis: "image_analysis",
};

function env(name: string | null): boolean {
  if (!name) return true;
  return Boolean(process.env[name]?.trim());
}

/** A model is available only with BOTH its credential and its switch. */
export function isModelAvailable(model: ModelEntry): boolean {
  return Boolean(process.env[model.credentialEnvVar]?.trim()) && env(model.enableEnvVar);
}

export function availableModels(): ModelEntry[] {
  return MODEL_REGISTRY.filter(isModelAvailable);
}

export function modelById(id: string): ModelEntry | undefined {
  return MODEL_REGISTRY.find((model) => model.id === id);
}

export type RoutingRequest = {
  workload: HarnessWorkload;
  /** A specific model the merchant or admin asked for. */
  preferredModelId?: string;
  /** Prefer the cheapest capable model over the best one. */
  prefer?: "fast" | "quality" | "product_faithful";
};

export type RoutingDecision =
  | {
      ok: true;
      model: ModelEntry;
      /** True when the chosen model was not the one asked for. */
      fellBack: boolean;
      capability: ModelCapability;
    }
  | { ok: false; reason: string; capability: ModelCapability; missing: string[] };

const PREFERENCE_ORDER: Record<NonNullable<RoutingRequest["prefer"]>, CostClass[]> = {
  fast: ["economy", "standard", "premium"],
  quality: ["premium", "standard", "economy"],
  product_faithful: ["standard", "premium", "economy"],
};

/**
 * Choose a model for one job.
 *
 * Fallback may only move WITHIN the requested capability. A
 * `reference_grounded_edit` that quietly fell back to a text-to-image model
 * would return an invented product while the merchant believed they were
 * looking at their own — the single most damaging thing this system could do.
 */
export function routeModel(request: RoutingRequest): RoutingDecision {
  const capability = WORKLOAD_CAPABILITY[request.workload];
  const capable = MODEL_REGISTRY.filter((model) => model.capabilities.includes(capability));
  const usable = capable.filter(isModelAvailable);

  if (request.preferredModelId) {
    const preferred = modelById(request.preferredModelId);
    if (!preferred) {
      return {
        ok: false,
        capability,
        reason: `Unknown model "${request.preferredModelId}".`,
        missing: [],
      };
    }
    if (!preferred.capabilities.includes(capability)) {
      return {
        ok: false,
        capability,
        reason: `${preferred.label} cannot do ${request.workload.replace(/_/g, " ")}.`,
        missing: [],
      };
    }
    if (isModelAvailable(preferred)) {
      return { ok: true, model: preferred, fellBack: false, capability };
    }
    // Asked-for model is not configured. Fall back only within capability.
  }

  if (!usable.length) {
    const missing = [
      ...new Set(
        capable.flatMap((model) =>
          [model.credentialEnvVar, model.enableEnvVar].filter(Boolean) as string[],
        ),
      ),
    ];
    return {
      ok: false,
      capability,
      reason: `No configured model can do ${request.workload.replace(/_/g, " ")}.`,
      missing,
    };
  }

  const order = PREFERENCE_ORDER[request.prefer ?? "quality"];
  const chosen = [...usable].sort(
    (a, b) => order.indexOf(a.costClass) - order.indexOf(b.costClass),
  )[0]!;

  return { ok: true, model: chosen, fellBack: Boolean(request.preferredModelId), capability };
}

/** What a merchant picks from, without provider or model names. */
export const STUDIO_PREFERENCES = [
  { id: "fast", label: "Fast", detail: "Quickest and cheapest. Good for trying ideas." },
  { id: "quality", label: "Best quality", detail: "The strongest model configured for this job." },
  {
    id: "product_faithful",
    label: "Product-faithful",
    detail: "Keeps your real product exactly as it is. Needs a model that accepts your product image.",
  },
] as const;
