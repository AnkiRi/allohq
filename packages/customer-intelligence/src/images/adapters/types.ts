/**
 * The contract every image provider is held to.
 *
 * A registry entry is not an implementation. Nothing may be offered to a
 * merchant, routed to, or used as a fallback unless there is an adapter here
 * that really sends a documented request and really converts the response into
 * this common shape.
 */

export type ReferenceImage = {
  /** The real bytes. A description of the product is not a reference. */
  bytes: Buffer;
  mimeType: string;
};

export type VisualAdapterRequest = {
  /** The id sent to the provider's API. */
  apiModelId: string;
  prompt: string;
  width: number;
  height: number;
  /**
   * Reference images passed as INPUT to the model. Only adapters whose
   * capability declares reference support may receive these; passing them to
   * one that cannot use them is a programming error, not a silent downgrade.
   */
  references?: ReferenceImage[];
  quality?: "standard" | "high";
};

export type VisualAdapterResult = {
  /** Always base64, whatever the provider returned, so callers are uniform. */
  imageBase64: string;
  mimeType: string;
  /** Provider-reported usage where it returns any. Never invented. */
  usage?: {
    /** Real cost when the provider reports it; otherwise absent. */
    costUsd?: number;
    tokens?: number;
    raw?: unknown;
  };
};

/** Something the merchant can be told, separated from the operator detail. */
export class VisualAdapterError extends Error {
  constructor(
    /** Safe to render in the Studio. */
    readonly merchantMessage: string,
    /** Logged, never rendered. */
    operatorDetail: string,
    readonly kind: "unavailable" | "not_permitted" | "rejected" | "failed" = "failed",
  ) {
    super(operatorDetail);
    this.name = "VisualAdapterError";
  }
}

export interface VisualAdapter {
  readonly id: string;
  /** Credential required for this adapter to work at all. */
  readonly credentialEnvVar: string;
  isConfigured(): boolean;
  generate(request: VisualAdapterRequest): Promise<VisualAdapterResult>;
}
