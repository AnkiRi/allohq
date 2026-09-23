/**
 * WCAG contrast, for the cases where an email actually states both colours.
 *
 * Most email text inherits its colour from the brand kit and sits on a
 * background the renderer chooses, so there is nothing to measure. Where a
 * block names BOTH a text colour and a background — heroes and buttons — the
 * ratio is computable, and a merchant setting pale grey on cream deserves to
 * be told before they send it rather than after.
 *
 * Only `#rgb` and `#rrggbb` are understood. Anything else returns null, and a
 * null is reported as "not measurable" rather than guessed at.
 */

export function parseHexColor(value: string | undefined | null): [number, number, number] | null {
  if (typeof value !== "string") return null;
  const hex = value.trim().replace(/^#/, "");
  if (!/^[0-9a-f]{3}$/i.test(hex) && !/^[0-9a-f]{6}$/i.test(hex)) return null;
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function channelLuminance(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map(channelLuminance) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.1 contrast ratio, 1 to 21. Null when either colour is unreadable. */
export function contrastRatio(
  foreground: string | undefined | null,
  background: string | undefined | null,
): number | null {
  const fg = parseHexColor(foreground);
  const bg = parseHexColor(background);
  if (!fg || !bg) return null;
  const lighter = Math.max(relativeLuminance(fg), relativeLuminance(bg));
  const darker = Math.min(relativeLuminance(fg), relativeLuminance(bg));
  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG AA for body-sized text. */
export const MIN_BODY_CONTRAST = 4.5;
/** WCAG AA for large text — headings, and button labels at typical email sizes. */
export const MIN_LARGE_CONTRAST = 3;
