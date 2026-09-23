/**
 * The provider layer for email visuals.
 *
 * Two things vary between image providers and both matter to what Joon is
 * allowed to claim:
 *
 *   1. whether the provider is CONFIGURED (has credentials), and
 *   2. whether it accepts a REFERENCE IMAGE — the real Shopify product photo
 *      as an input, rather than a description of it.
 *
 * Only (2) makes "your actual product, in this scene" a truthful claim. Without
 * it the model has never seen the product and anything product-shaped in the
 * output is invented, however good the prompt.
 *
 * Consumer web products (ChatGPT's site, Google Flow, and the like) are
 * deliberately NOT providers here. They are not APIs, driving them would mean
 * automating a browser session against someone's personal account, and nothing
 * about that is operable or auditable in a send path.
 */

export type VisualProviderId = "flux" | "flux-kontext" | "openai-image" | "dalle";

export type VisualProviderCapabilities = {
  /** Accepts the real product image as an input/reference. */
  referenceImages: boolean;
  /** How many reference images one request may carry. */
  maxReferenceImages: number;
};

export type VisualGenerationRequest = {
  prompt: string;
  width: number;
  height: number;
  /**
   * Publicly reachable URLs of reference images. Only honoured by providers
   * whose capabilities declare `referenceImages`; passing them to one that
   * does not is a programming error, not a silent downgrade.
   */
  referenceImageUrls?: string[];
};

export type VisualProvider = {
  id: VisualProviderId;
  label: string;
  /** Approximate USD per image, for spend accounting. */
  costUsd: number;
  capabilities: VisualProviderCapabilities;
  /** The environment variable that switches this provider on. */
  credentialEnvVar: string;
  isConfigured: () => boolean;
  generate: (request: VisualGenerationRequest) => Promise<string | null>;
};

const TEXT_ONLY: VisualProviderCapabilities = { referenceImages: false, maxReferenceImages: 0 };
const WITH_REFERENCE: VisualProviderCapabilities = { referenceImages: true, maxReferenceImages: 1 };

function configured(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

/**
 * The registry, in preference order.
 *
 * Reference-capable providers come first so that when one IS configured, a
 * product-safe request uses it rather than falling back to compositing.
 */
export function visualProviders(): VisualProvider[] {
  return [
    {
      id: "flux-kontext",
      label: "Flux Kontext (Replicate)",
      costUsd: 0.06,
      capabilities: WITH_REFERENCE,
      credentialEnvVar: "REPLICATE_API_TOKEN",
      // Kontext is a distinct model, not merely a token: enabling it is an
      // explicit opt-in so an existing Replicate token does not silently
      // change which model a merchant's spend goes to.
      isConfigured: () =>
        configured("REPLICATE_API_TOKEN") && configured("JOON_FLUX_KONTEXT_ENABLED"),
      generate: async (request) => {
        const { generateWithFluxKontext } = await import("./providers/flux-kontext");
        return generateWithFluxKontext(request);
      },
    },
    {
      id: "openai-image",
      label: "OpenAI gpt-image-1",
      costUsd: 0.07,
      capabilities: WITH_REFERENCE,
      credentialEnvVar: "OPENAI_API_KEY",
      isConfigured: () =>
        configured("OPENAI_API_KEY") && configured("JOON_OPENAI_IMAGE_REFERENCE_ENABLED"),
      generate: async (request) => {
        const { generateWithOpenAiImage } = await import("./providers/openai-image");
        return generateWithOpenAiImage(request);
      },
    },
    {
      id: "flux",
      label: "Flux 1.1 Pro (Replicate)",
      costUsd: 0.05,
      capabilities: TEXT_ONLY,
      credentialEnvVar: "REPLICATE_API_TOKEN",
      isConfigured: () => configured("REPLICATE_API_TOKEN"),
      generate: async (request) => {
        const { generateWithFlux } = await import("./providers/flux");
        return generateWithFlux({ prompt: request.prompt, width: request.width, height: request.height });
      },
    },
    {
      id: "dalle",
      label: "DALL·E 3 (OpenAI)",
      costUsd: 0.04,
      capabilities: TEXT_ONLY,
      credentialEnvVar: "OPENAI_API_KEY",
      isConfigured: () => configured("OPENAI_API_KEY"),
      generate: async (request) => {
        const { generateWithDalle } = await import("./providers/dalle");
        return generateWithDalle({ prompt: request.prompt, width: request.width, height: request.height });
      },
    },
  ];
}

export type ProviderSelection =
  | { ok: true; provider: VisualProvider; usesReference: boolean }
  | { ok: false; reason: string; missing: string[] };

/**
 * Choose a provider for one request.
 *
 * `preferReference` asks for a reference-capable provider. When none is
 * configured the caller still gets a text-only provider, because Joon's
 * product-safe path composites the real product pixels afterwards and is
 * faithful either way — what changes is only whether the product is generated
 * in-scene or placed into it.
 *
 * With NOTHING configured this fails closed, naming the variables to set
 * rather than quietly substituting stock imagery.
 */
export function selectVisualProvider(options: { preferReference?: boolean } = {}): ProviderSelection {
  const providers = visualProviders();
  const available = providers.filter((provider) => provider.isConfigured());

  if (!available.length) {
    const missing = [...new Set(providers.map((provider) => provider.credentialEnvVar))];
    return {
      ok: false,
      reason:
        "No image provider is configured, so Joon cannot generate visuals. Set one of the image provider credentials, then try again.",
      missing,
    };
  }

  if (options.preferReference) {
    const withReference = available.find((provider) => provider.capabilities.referenceImages);
    if (withReference) return { ok: true, provider: withReference, usesReference: true };
  }

  return { ok: true, provider: available[0]!, usesReference: false };
}

/** True when any configured provider can take the real product image as input. */
export function referenceGenerationAvailable(): boolean {
  return visualProviders().some(
    (provider) => provider.capabilities.referenceImages && provider.isConfigured(),
  );
}

/** What an operator must set to switch reference-grounded generation on. */
export function referenceProviderSetupHint(): { provider: string; variables: string[] }[] {
  return visualProviders()
    .filter((provider) => provider.capabilities.referenceImages)
    .map((provider) => ({
      provider: provider.label,
      variables:
        provider.id === "flux-kontext"
          ? ["REPLICATE_API_TOKEN", "JOON_FLUX_KONTEXT_ENABLED=true"]
          : ["OPENAI_API_KEY", "JOON_OPENAI_IMAGE_REFERENCE_ENABLED=true"],
    }));
}
