/**
 * Neumorphic and Glassmorphic Shadow Tokens
 */

export const shadows = {
  // Neumorphic shadows (soft, multi-layered)
  neuro: {
    default: "8px 8px 16px #d1d9e6, -8px -8px 16px #ffffff",
    inset: "inset 8px 8px 16px #d1d9e6, inset -8px -8px 16px #ffffff",
    sm: "4px 4px 8px #d1d9e6, -4px -4px 8px #ffffff",
    lg: "12px 12px 24px #d1d9e6, -12px -12px 24px #ffffff",
  },

  // Glassmorphic shadows (with transparency)
  glass: {
    sm: "0 4px 16px 0 rgba(31, 38, 135, 0.15)",
    default: "0 8px 32px 0 rgba(31, 38, 135, 0.37)",
    lg: "0 12px 48px 0 rgba(31, 38, 135, 0.5)",
    xl: "0 16px 64px 0 rgba(31, 38, 135, 0.6)",
  },

  // Elevation shadows (for layering)
  elevation: {
    low: "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)",
    medium: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
    high: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
    highest: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
  },
} as const;

export type Shadows = typeof shadows;
