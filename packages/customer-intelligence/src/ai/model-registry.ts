import { geminiImageAdapter } from "../images/adapters/gemini-image";
import { openAiImageAdapter } from "../images/adapters/openai-image";
import type { VisualAdapter } from "../images/adapters/types";
import { getProvider, type AIProvider } from "./providers";

/**
 * Models Joon can actually run.
 *
 * The standard this file exists to enforce: **a registry entry is not an
 * implementation**. Nothing appears here — and therefore nothing can be
 * offered, selected, routed to, or fallen back on — unless a real adapter
 * sends a documented request and converts the response into Joon's common
 * result shape.
 *
 * An earlier version listed Gemini and others with no adapter behind them.
 * That is false availability: a merchant could choose a model that could never
 * run, and routing could "succeed" into nothing.
 */

export const TEXT_WORKLOADS = [
  "strategy",
  "email_structure",
  "short_copy",
  "long_content",
  "brand_refinement",
  "analysis",
  "classification",
  "evaluation",
  "merchant_agent_orchestration",
] as const;

export const VISUAL_WORKLOADS = [
  "campaign_art",
  "product_reference_edit",
  "product_safe_composition",
  "image_analysis",
] as const;

export type TextWorkload = (typeof TEXT_WORKLOADS)[number];
export type VisualWorkload = (typeof VISUAL_WORKLOADS)[number];
export type HarnessWorkload = TextWorkload | VisualWorkload;

export type ModelCapability =
  | "text"
  | "image_generation"
  /** Takes the real image as INPUT. Not "can be told about an image". */
  | "image_reference_input"
  | "image_analysis";

export type CostClass = "economy" | "standard" | "premium";
export type ModelTier = "recommended" | "fast" | "premium" | "legacy";

export type ModelEntry = {
  id: string;
  provider: "openai" | "anthropic" | "google";
  /** Exactly what is sent to the API. Never a marketing name. */
  apiModelId: string;
  label: string;
  capabilities: ModelCapability[];
  inputModes: Array<"text" | "image_reference" | "multiple_references">;
  outputModes: Array<"text" | "image">;
  /**
   * A class, not a price. Providers change pricing and bill by tokens or
   * tiers, so a flat "$0.04 per image" printed in the UI would be a number
   * Joon invented. Real spend is recorded from provider usage when returned.
   */
  costClass: CostClass;
  tier: ModelTier;
  credentialEnvVar: string;
  /** A credential alone never enables a model. */
  enableEnvVar: string | null;
  /** The adapter that runs it. Its presence is what makes this entry real. */
  adapter: { kind: "visual"; impl: VisualAdapter } | { kind: "text"; provider: AIProvider };
  qualityOptions?: string[];
  note?: string;
};

/**
 * Anthropic is absent from every image capability because the API returns no
 * images. Flux/Replicate was removed rather than left declared: its generation
 * path predates this contract and does not implement `VisualAdapter`, so
 * listing it would be exactly the false availability this file forbids.
 */
export const MODEL_REGISTRY: readonly ModelEntry[] = [
  // --- text ---------------------------------------------------------------
  {
    id: "claude-sonnet",
    provider: "anthropic",
    apiModelId: "claude-sonnet-4-6",
    label: "Claude Sonnet",
    capabilities: ["text"],
    inputModes: ["text"],
    outputModes: ["text"],
    costClass: "standard",
    tier: "recommended",
    credentialEnvVar: "ANTHROPIC_API_KEY",
    enableEnvVar: null,
    adapter: { kind: "text", provider: "anthropic" },
  },
  {
    id: "gpt-text",
    provider: "openai",
    apiModelId: "gpt-4o",
    label: "GPT-4o",
    capabilities: ["text"],
    inputModes: ["text"],
    outputModes: ["text"],
    costClass: "standard",
    tier: "recommended",
    credentialEnvVar: "OPENAI_API_KEY",
    enableEnvVar: null,
    adapter: { kind: "text", provider: "openai" },
  },
  {
    id: "gemini-text",
    provider: "google",
    apiModelId: "gemini-2.5-flash",
    label: "Gemini Flash",
    capabilities: ["text"],
    inputModes: ["text"],
    outputModes: ["text"],
    costClass: "economy",
    tier: "fast",
    credentialEnvVar: "GOOGLE_API_KEY",
    enableEnvVar: "JOON_GEMINI_TEXT_ENABLED",
    adapter: { kind: "text", provider: "google" },
  },

  // --- images: OpenAI GPT Image 2.5 ---------------------------------------
  {
    id: "gpt-image-flare",
    provider: "openai",
    apiModelId: "gpt-image-2.5-flare",
    label: "GPT Image 2.5 Flare",
    capabilities: ["image_generation", "image_reference_input"],
    inputModes: ["text", "image_reference"],
    outputModes: ["image"],
    costClass: "standard",
    tier: "fast",
    credentialEnvVar: "OPENAI_API_KEY",
    enableEnvVar: "JOON_OPENAI_IMAGE_ENABLED",
    adapter: { kind: "visual", impl: openAiImageAdapter },
    qualityOptions: ["standard", "high"],
    note: "Everyday campaign visuals.",
  },
  {
    id: "gpt-image-sunburst",
    provider: "openai",
    apiModelId: "gpt-image-2.5-sunburst",
    label: "GPT Image 2.5 Sunburst",
    capabilities: ["image_generation", "image_reference_input"],
    inputModes: ["text", "image_reference", "multiple_references"],
    outputModes: ["image"],
    costClass: "premium",
    tier: "premium",
    credentialEnvVar: "OPENAI_API_KEY",
    enableEnvVar: "JOON_OPENAI_IMAGE_ENABLED",
    adapter: { kind: "visual", impl: openAiImageAdapter },
    qualityOptions: ["standard", "high"],
    note: "Precise generation and reference editing.",
  },

  // --- images: Google Gemini ----------------------------------------------
  {
    id: "nano-banana-2",
    provider: "google",
    apiModelId: "gemini-3.1-flash-image",
    label: "Nano Banana 2",
    capabilities: ["image_generation", "image_reference_input"],
    inputModes: ["text", "image_reference", "multiple_references"],
    outputModes: ["image"],
    costClass: "standard",
    tier: "recommended",
    credentialEnvVar: "GOOGLE_API_KEY",
    enableEnvVar: "JOON_NANO_BANANA_ENABLED",
    adapter: { kind: "visual", impl: geminiImageAdapter },
    note: "Default for work that must keep the real product.",
  },
  {
    id: "nano-banana-pro",
    provider: "google",
    apiModelId: "gemini-3-pro-image",
    label: "Nano Banana Pro",
    capabilities: ["image_generation", "image_reference_input"],
    inputModes: ["text", "image_reference", "multiple_references"],
    outputModes: ["image"],
    costClass: "premium",
    tier: "premium",
    credentialEnvVar: "GOOGLE_API_KEY",
    enableEnvVar: "JOON_NANO_BANANA_PRO_ENABLED",
    adapter: { kind: "visual", impl: geminiImageAdapter },
    qualityOptions: ["standard", "high"],
    note: "Final campaign assets.",
  },

  // --- images: legacy, explicitly labelled ---------------------------------
  {
    id: "gpt-image-1-legacy",
    provider: "openai",
    apiModelId: "gpt-image-1",
    label: "GPT Image 1 (legacy)",
    capabilities: ["image_generation", "image_reference_input"],
    inputModes: ["text", "image_reference"],
    outputModes: ["image"],
    costClass: "economy",
    tier: "legacy",
    credentialEnvVar: "OPENAI_API_KEY",
    enableEnvVar: "JOON_OPENAI_IMAGE_LEGACY_ENABLED",
    adapter: { kind: "visual", impl: openAiImageAdapter },
    note: "Older model. Only where an account cannot reach GPT Image 2.5.",
  },
];

/** The capability a workload cannot be served without. */
export const WORKLOAD_CAPABILITY: Record<HarnessWorkload, ModelCapability> = {
  strategy: "text",
  email_structure: "text",
  short_copy: "text",
  long_content: "text",
  brand_refinement: "text",
  analysis: "text",
  classification: "text",
  evaluation: "text",
  merchant_agent_orchestration: "text",
  campaign_art: "image_generation",
  product_safe_composition: "image_generation",
  /** The whole point: the real product must reach the model. */
  product_reference_edit: "image_reference_input",
  image_analysis: "image_analysis",
};

function switchedOn(name: string | null): boolean {
  return name ? Boolean(process.env[name]?.trim()) : true;
}

/**
 * Available means: credential present, switch on, AND the adapter itself
 * reports it can run. The last condition is what a declaration cannot fake.
 */
export function isModelAvailable(model: ModelEntry): boolean {
  if (!process.env[model.credentialEnvVar]?.trim()) return false;
  if (!switchedOn(model.enableEnvVar)) return false;
  return model.adapter.kind === "visual"
    ? model.adapter.impl.isConfigured()
    : getProvider(model.adapter.provider).isAvailable();
}

export function availableModels(): ModelEntry[] {
  return MODEL_REGISTRY.filter(isModelAvailable);
}

/** Only ids that exist here are acceptable; a browser cannot invent one. */
export function modelById(id: string): ModelEntry | undefined {
  return MODEL_REGISTRY.find((model) => model.id === id);
}

export function isKnownModelId(id: string): boolean {
  return MODEL_REGISTRY.some((model) => model.id === id);
}

export type StudioPreference = "recommended" | "fast" | "premium" | "product_faithful";

export type RoutingRequest = {
  workload: HarnessWorkload;
  preferredModelId?: string;
  prefer?: StudioPreference;
  /** True when the merchant's own product image will be supplied. */
  hasReference?: boolean;
};

export type RoutingDecision =
  | { ok: true; model: ModelEntry; fellBack: boolean; capability: ModelCapability }
  | { ok: false; reason: string; capability: ModelCapability; missing: string[] };

const TIER_ORDER: Record<StudioPreference, ModelTier[]> = {
  recommended: ["recommended", "fast", "premium", "legacy"],
  fast: ["fast", "recommended", "premium", "legacy"],
  premium: ["premium", "recommended", "fast", "legacy"],
  product_faithful: ["recommended", "premium", "fast", "legacy"],
};

/**
 * Choose a model for one job.
 *
 * Fallback may only move WITHIN the requested capability. A
 * `product_reference_edit` that fell back to a text-only image model would
 * return an invented product while the merchant believed they were looking at
 * their own — the single most damaging outcome this system can produce.
 */
export function routeModel(request: RoutingRequest): RoutingDecision {
  const capability = WORKLOAD_CAPABILITY[request.workload];
  // Product-faithful work needs reference input regardless of the workload's
  // nominal capability, so the preference tightens the requirement.
  const required: ModelCapability =
    request.prefer === "product_faithful" || request.hasReference
      ? "image_reference_input"
      : capability;
  const effective = capability === "text" ? capability : required;

  const capable = MODEL_REGISTRY.filter((model) => model.capabilities.includes(effective));
  const usable = capable.filter(isModelAvailable);

  if (request.preferredModelId) {
    const preferred = modelById(request.preferredModelId);
    if (!preferred) {
      return { ok: false, capability: effective, reason: `Unknown model "${request.preferredModelId}".`, missing: [] };
    }
    if (!preferred.capabilities.includes(effective)) {
      return {
        ok: false,
        capability: effective,
        reason: `${preferred.label} cannot do this job.`,
        missing: [],
      };
    }
    if (isModelAvailable(preferred)) return { ok: true, model: preferred, fellBack: false, capability: effective };
  }

  if (!usable.length) {
    const missing = [
      ...new Set(
        capable.flatMap((model) => [model.credentialEnvVar, model.enableEnvVar].filter(Boolean) as string[]),
      ),
    ];
    return {
      ok: false,
      capability: effective,
      reason: `No configured model can do ${request.workload.replace(/_/g, " ")}.`,
      missing,
    };
  }

  const order = TIER_ORDER[request.prefer ?? "recommended"];
  const chosen = [...usable].sort((a, b) => order.indexOf(a.tier) - order.indexOf(b.tier))[0]!;
  return { ok: true, model: chosen, fellBack: Boolean(request.preferredModelId), capability: effective };
}

/** What a merchant chooses between. No provider or model names. */
export const STUDIO_PREFERENCES: Array<{ id: StudioPreference; label: string; detail: string }> = [
  { id: "recommended", label: "Recommended", detail: "Joon picks the right model for the job." },
  { id: "fast", label: "Fast", detail: "Quicker and cheaper. Good for trying ideas." },
  { id: "premium", label: "Premium", detail: "The strongest configured model. For final assets." },
  {
    id: "product_faithful",
    label: "Product-faithful",
    detail: "Sends your real product image to the model, so the product stays itself.",
  },
];
