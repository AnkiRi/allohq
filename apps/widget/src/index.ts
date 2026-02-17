import type { WidgetConfig, WidgetEvent } from "./types";
import { submitEvent } from "./api";

let config: WidgetConfig | null = null;

/** Initialize the AlloHQ widget */
export function init(options: WidgetConfig): void {
  config = options;
  if (config.debug) {
    console.log("[AlloHQ] Widget initialized", { apiUrl: config.apiUrl });
  }
}

/** Track an event */
export function track(type: WidgetEvent["type"], data: Record<string, unknown> = {}): void {
  if (!config) {
    console.warn("[AlloHQ] Widget not initialized. Call AlloHQ.init() first.");
    return;
  }

  const event: WidgetEvent = { type, data, timestamp: Date.now() };

  if (config.debug) {
    console.log("[AlloHQ] Event tracked:", event);
  }

  submitEvent(config.apiKey, event, config.apiUrl).catch((err) => {
    if (config?.debug) {
      console.error("[AlloHQ] Failed to submit event:", err);
    }
  });
}

export type { WidgetConfig, WidgetEvent } from "./types";
