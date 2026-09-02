import type { WidgetEvent } from "./types";
import type { VisitorSession } from "./visitor-session";

const DEFAULT_API_URL = "https://api.allohq.com";

/** Submit tracked events to the AlloHQ API */
export async function submitEvent(
  apiKey: string,
  session: VisitorSession,
  event: WidgetEvent,
  apiUrl = DEFAULT_API_URL
): Promise<void> {
  await fetch(`${apiUrl}/v1/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Joon-Publishable-Key": apiKey,
      Authorization: await session.authorization(),
    },
    body: JSON.stringify({
      ...event,
      data: { ...event.data, visitorId: session.visitorId },
    }),
  });
}
