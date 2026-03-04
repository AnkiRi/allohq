import type { WidgetConfig, WidgetEvent } from "./types";
import { submitEvent } from "./api";
import { ChatWidget } from "./chat/widget";

let config: WidgetConfig | null = null;
let chatWidget: ChatWidget | null = null;

/** Initialize the AlloHQ widget */
export function init(options: WidgetConfig): void {
  config = options;
  if (config.debug) {
    console.log("[AlloHQ] Widget initialized", { apiUrl: config.apiUrl });
  }

  // Auto-mount chat if enabled (default: true)
  if (options.chat !== false) {
    chatWidget = new ChatWidget({
      apiKey: options.apiKey,
      apiUrl: options.apiUrl ?? "https://api.allohq.com",
      storeName: options.storeName,
      storeDomain: options.storeDomain,
      debug: options.debug,
    });

    // Mount when DOM is ready
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => chatWidget!.mount());
    } else {
      chatWidget.mount();
    }
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
