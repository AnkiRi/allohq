/**
 * Phone and email validation utilities for messaging.
 */

const E164_REGEX = /^\+[1-9]\d{1,14}$/;

/** Check if a phone number is in valid E.164 format */
export function isValidE164(phone: string): boolean {
  return E164_REGEX.test(phone);
}

/** Normalize a phone number to E.164 format (best effort) */
export function normalizePhone(phone: string): string {
  // Strip all non-digit chars except leading +
  let cleaned = phone.replace(/[^\d+]/g, "");

  // If it starts with 00, replace with +
  if (cleaned.startsWith("00")) {
    cleaned = "+" + cleaned.slice(2);
  }

  // If no + prefix and looks like a US number (10 digits), add +1
  if (!cleaned.startsWith("+")) {
    if (cleaned.length === 10) {
      cleaned = "+1" + cleaned;
    } else if (cleaned.length === 11 && cleaned.startsWith("1")) {
      cleaned = "+" + cleaned;
    } else {
      cleaned = "+" + cleaned;
    }
  }

  return cleaned;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Check if an email address is valid (basic format check) */
export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email) && email.length <= 254;
}
