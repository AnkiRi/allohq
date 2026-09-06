import { PopupWidget } from "./popup/widget";
import { VisitorSession } from "./visitor-session";

export function init(options: { apiKey: string; apiUrl: string }): void {
  const session = new VisitorSession(options.apiKey, options.apiUrl);
  const popup = new PopupWidget({
    apiKey: options.apiKey,
    apiUrl: options.apiUrl,
    popupIds: [],
    visitorSession: session,
  });
  void popup.init();
}
