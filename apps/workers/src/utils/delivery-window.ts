import { nextLocalHour } from "@allohq/communication-governor";
import { DELIVERY_WINDOWS, type DeliveryWindow } from "@allohq/customer-intelligence";

function localHour(now: Date, timezone: string): number {
  try {
    return (
      Number(
        new Intl.DateTimeFormat("en-US", {
          timeZone: timezone,
          hour: "numeric",
          hour12: false,
        }).format(now)
      ) % 24
    );
  } catch {
    return now.getUTCHours();
  }
}

function stableThirtyMinuteOffset(customerId: string): number {
  let hash = 0;
  for (let index = 0; index < customerId.length; index++) {
    hash = (hash * 31 + customerId.charCodeAt(index)) >>> 0;
  }
  return (hash % 4) * 30 * 60 * 1000;
}

export function deliveryWindowDelay(input: {
  customerId: string;
  window: DeliveryWindow;
  timezone: string;
  now: Date;
  isDemo: boolean;
}): number {
  const { customerId, window, timezone, now, isDemo } = input;
  if (isDemo) return 8_000;
  const definition = DELIVERY_WINDOWS[window];
  const hour = localHour(now, timezone);
  if (hour >= definition.startHour && hour < definition.endHour) return 0;
  const start = nextLocalHour(now, definition.startHour, timezone);
  return Math.max(0, start.getTime() - now.getTime() + stableThirtyMinuteOffset(customerId));
}
