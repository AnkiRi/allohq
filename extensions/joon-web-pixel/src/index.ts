import { register } from "@shopify/web-pixels-extension";

register(({ analytics, settings, init }) => {
  const endpoint = typeof settings.endpoint === "string" ? settings.endpoint : "";
  const publishableKey = typeof settings.publishableKey === "string" ? settings.publishableKey : "";
  if (!endpoint.startsWith("https://") || !publishableKey) return;

  analytics.subscribe("all_standard_events", (event) => {
    void fetch(`${endpoint.replace(/\/$/, "")}/v1/shopify-pixel/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Joon-Publishable-Key": publishableKey },
      body: JSON.stringify({
        id: event.id,
        name: event.name,
        clientId: event.clientId,
        timestamp: event.timestamp,
        customerExternalId: init.data.customer?.id ?? null,
        data: event.data,
      }),
      keepalive: true,
    }).catch(() => undefined);
  });
});
