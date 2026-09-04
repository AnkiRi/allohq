import type { WidgetConfig, WidgetEvent } from "./types";
import { DEFAULT_API_URL, submitEvent } from "./api";
import { ChatWidget } from "./chat/widget";
import { PopupWidget } from "./popup/widget";
import { VisitorSession } from "./visitor-session";

let config: WidgetConfig | null = null;
let chatWidget: ChatWidget | null = null;
let popupWidget: PopupWidget | null = null;
let visitorSession: VisitorSession | null = null;

/** Initialize the AlloHQ widget */
export function init(options: WidgetConfig): void {
  config = options;
  if (config.debug) {
    console.log("[AlloHQ] Widget initialized", { apiUrl: config.apiUrl });
  }

  const apiUrl = options.apiUrl ?? DEFAULT_API_URL;
  visitorSession = new VisitorSession(options.apiKey, apiUrl);

  // Auto-mount chat if enabled (default: true)
  if (options.chat !== false) {
    chatWidget = new ChatWidget({
      apiKey: options.apiKey,
      apiUrl,
      storeName: options.storeName,
      storeDomain: options.storeDomain,
      debug: options.debug,
      visitorSession,
    });

    // Mount when DOM is ready
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => chatWidget!.mount());
    } else {
      chatWidget.mount();
    }
  }

  // Auto-mount popups if enabled (default: true when apiKey available)
  if (options.popups !== false && options.apiKey) {
    popupWidget = new PopupWidget({
      apiKey: options.apiKey,
      apiUrl,
      popupIds: options.popupIds ?? [],
      debug: options.debug,
      visitorSession,
    });

    const initPopups = () => popupWidget!.init();
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initPopups);
    } else {
      initPopups();
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

  if (!visitorSession) return;
  submitEvent(config.apiKey, visitorSession, event, config.apiUrl).catch((err) => {
    if (config?.debug) {
      console.error("[AlloHQ] Failed to submit event:", err);
    }
  });
}

export type { WidgetConfig, WidgetEvent } from "./types";
