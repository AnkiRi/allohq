/**
 * A merchant's explicit validity window starts when the Shopify code is
 * created for delivery, not when the draft was prepared or edited.
 * Older drafts without a duration retain the established 30-day default.
 */
export function discountEndsAt(durationHours: unknown, now = new Date()): Date {
  if (durationHours == null) return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  if (typeof durationHours !== "number" || !Number.isInteger(durationHours) ||
      durationHours < 1 || durationHours > 720) {
    throw new Error("Campaign discount validity is invalid; review the draft before sending.");
  }
  return new Date(now.getTime() + durationHours * 60 * 60 * 1000);
}
