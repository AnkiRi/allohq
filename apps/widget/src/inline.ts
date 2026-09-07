import { VisitorSession } from "./visitor-session";
import { mountInlineForms } from "./inline-form";

export function init(options: { apiKey: string; apiUrl: string }): void {
  const session = new VisitorSession(options.apiKey, options.apiUrl);
  void mountInlineForms(options.apiKey, options.apiUrl, session);
}
