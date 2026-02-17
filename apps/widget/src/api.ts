import type { WidgetEvent } from "./types";

const DEFAULT_API_URL = "https://api.allohq.com";

/** Submit tracked events to the AlloHQ API */
export async function submitEvent(
  apiKey: string,
  event: WidgetEvent,
  apiUrl = DEFAULT_API_URL
): Promise<void> {
  await fetch(`${apiUrl}/v1/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify(event),
  });
}
